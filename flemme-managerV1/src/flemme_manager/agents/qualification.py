"""Reuse Manager V1 instructions, model and coherence validation with conversation facts."""
import asyncio
import json
from importlib.resources import files
from agents import Agent, ModelSettings, Runner, RunConfig
from flemme_manager.agents.manager import MANAGER_INSTRUCTIONS, ManagerConfigurationError, ManagerExecutionError
from flemme_manager.qualification_models import QualificationAssessment
from flemme_manager.schemas import validate_manager_assessment
from flemme_manager.settings import settings

qualification_agent = Agent(
    name="Flemme qualification",
    instructions=MANAGER_INSTRUCTIONS + "\n" + files("flemme_manager").joinpath("prompts/qualification.txt").read_text(),
    model=settings.openai_model, output_type=QualificationAssessment,
    model_settings=ModelSettings(max_tokens=2500,store=False), tools=[],
)

async def analyze_conversation(history, previous):
    if not settings.openai_api_key:
        raise ManagerConfigurationError("OpenAI unavailable")
    try:
        result = await asyncio.wait_for(Runner.run(
            qualification_agent,
            json.dumps({"conversation": history, "previous_facts": previous}, ensure_ascii=False),
            max_turns=3, run_config=RunConfig(tracing_disabled=True),
        ), timeout=40)
        assessment = result.final_output
        if not isinstance(assessment, QualificationAssessment):
            raise ValueError("Unexpected output")
        return validate_manager_assessment(assessment)
    except Exception as error:
        raise ManagerExecutionError("Qualification failed") from error
