"""Optional single-request live smoke test; consumes API credits."""

import argparse
import asyncio
import re
from time import perf_counter

from agents import RunConfig, Runner
from agents.models.openai_provider import OpenAIProvider
from openai import AsyncOpenAI

from flemme_manager.agents.manager import manager_agent
from flemme_manager.schemas import ManagerAssessment, WorkflowId
from flemme_manager.settings import settings

ACTION_CLAIM_PATTERN = re.compile(
    r"\b(?:j['’]ai|je viens de|nous avons)\s+(?:déjà\s+)?"
    r"(?:recherché|cherché|comparé|trouvé|contacté|appelé|réservé|envoyé)\b"
    r"|\b(?:c['’]est fait|c['’]est réservé|commande confirmée)\b",
    re.IGNORECASE,
)
WORKFLOW_IDS = {workflow.value for workflow in WorkflowId}


async def run_once(request_text: str):
    async with AsyncOpenAI(
        api_key=settings.openai_api_key,
        max_retries=0,
        timeout=60.0,
    ) as client:
        config = RunConfig(
            model_provider=OpenAIProvider(openai_client=client),
            tracing_disabled=True,
            workflow_name="Flemme Manager single live test",
        )
        return await Runner.run(
            manager_agent,
            request_text,
            run_config=config,
            max_turns=1,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "request",
        nargs="?",
        default="Je cherche un plombier à Nantes pour une fuite.",
        help="Synthetic request to send to the configured model.",
    )
    args = parser.parse_args()

    print("Configured model:", settings.openai_model)
    print("API key available:", bool(settings.openai_api_key and settings.openai_api_key.strip()))
    if not settings.openai_api_key or not settings.openai_api_key.strip():
        print("Configure OPENAI_API_KEY in .env before running this check.")
        return 2

    started_at = perf_counter()
    try:
        result = asyncio.run(run_once(args.request))
    except Exception as error:
        print("Live request failed:", type(error).__name__)
        return 1
    elapsed_seconds = perf_counter() - started_at

    if not isinstance(result.final_output, ManagerAssessment):
        print("Live request returned no valid structured mission.")
        return 1

    assessment = result.final_output
    workflow_id = (
        assessment.selected_workflow.workflow_id.value
        if assessment.selected_workflow.workflow_id
        else None
    )
    question_count = len(assessment.qualification_questions)
    action_claim_detected = bool(
        ACTION_CLAIM_PATTERN.search(assessment.user_response.message)
    )

    print("\nStructured response:")
    print(assessment.model_dump_json(indent=2))
    print("\nValidation:")
    print("Workflow belongs to catalog:", workflow_id in WORKFLOW_IDS)
    print("Qualification questions:", question_count)
    print("At most two questions:", question_count <= 2)
    print("Explicit completed-action claim detected:", action_claim_detected)
    print(f"Processing duration: {elapsed_seconds:.2f}s")

    usage = result.context_wrapper.usage
    if usage.total_tokens:
        print(
            "Token usage:",
            f"input={usage.input_tokens}, output={usage.output_tokens}, total={usage.total_tokens}",
        )
    else:
        print("Token usage: unavailable")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())