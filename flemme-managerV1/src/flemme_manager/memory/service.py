"""Preserve incoming messages and failures; resume from the full saved dialogue."""
from agents import Runner, RunConfig

from flemme_manager.agents import manager
from flemme_manager.schemas import ManagerAssessment, UserRequest, validate_manager_assessment
from flemme_manager.services.qualification_policy import qualify_locally
from flemme_manager.memory.supabase import StorageError


async def analyze_history(snapshot, request_text):
    # Safety/current-request rules take priority. Ordinary follow-ups use saved context.
    local = qualify_locally(UserRequest(request=request_text))
    if local is not None:
        return local
    messages = [{"role": m["role"], "content": m["content"]}
                for m in snapshot["messages"]]
    if len(messages) > 40 or sum(len(m["content"]) for m in messages) > 50000:
        raise StorageError(409)  # Nothing compacted or deleted; history stays readable.
    if not manager.settings.openai_api_key or not manager.settings.openai_api_key.strip():
        raise manager.ManagerConfigurationError("OpenAI unavailable")
    try:
        result = await Runner.run(manager.manager_agent, messages, max_turns=1,
                                  run_config=RunConfig(tracing_disabled=True))
        if not isinstance(result.final_output, ManagerAssessment):
            raise ValueError("Invalid output")
        return validate_manager_assessment(result.final_output)
    except Exception as error:
        raise manager.ManagerExecutionError("Conversation analysis failed") from error


async def submit_turn(memory, conversation_id, request_id, request_text, revision):
    snapshot = await memory.command("user", conversation_id, request_id, revision,
                                    {"content": request_text})
    if snapshot.get("replayed"):
        if snapshot.get("pending_request_id") == request_id:
            raise StorageError(409)
        return snapshot
    try:
        assessment = validate_manager_assessment(await analyze_history(snapshot, request_text))
    except (manager.ManagerConfigurationError, manager.ManagerExecutionError, StorageError) as error:
        # Generic failure only: no provider diagnostics or secret in the permanent journal.
        await memory.command("failure", conversation_id, request_id,
                             payload={"note": "Analyse non aboutie ; message conservé."})
        raise error
    except Exception as error:
        await memory.command("failure", conversation_id, request_id,
                             payload={"note": "Analyse non aboutie ; message conservé."})
        raise manager.ManagerExecutionError("Conversation analysis failed") from error
    return await memory.command("assessment", conversation_id, request_id,
                                payload=assessment.model_dump(mode="json"))
