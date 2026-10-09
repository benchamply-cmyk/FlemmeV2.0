"""Flemme Manager agent powered by the OpenAI Agents SDK."""

from importlib.resources import files

from agents import Agent, ModelSettings, Runner, RunConfig

from flemme_manager.schemas import (
	ManagerAssessment,
	UserRequest,
	validate_manager_assessment,
)
from flemme_manager.settings import settings

MANAGER_INSTRUCTIONS = (
	files("flemme_manager")
	.joinpath("prompts/manager.txt")
	.read_text(encoding="utf-8")
)

manager_agent = Agent(
	name="Flemme Manager",
	instructions=MANAGER_INSTRUCTIONS,
	model=settings.openai_model,
	output_type=ManagerAssessment,
	tools=[],
	model_settings=ModelSettings(max_tokens=2000,store=False),
)


class ManagerConfigurationError(Exception):
	"""Raised when the required OpenAI configuration is unavailable."""


class ManagerExecutionError(Exception):
	"""Raised when an agent run fails or returns invalid structured output."""


async def _run_agent(request_text: str) -> ManagerAssessment:
	result = await Runner.run(manager_agent, request_text, max_turns=3, run_config=RunConfig(tracing_disabled=True))
	if not isinstance(result.final_output, ManagerAssessment):
		raise ManagerExecutionError("Manager returned an unexpected result")
	return result.final_output


async def analyze_request(request: UserRequest) -> ManagerAssessment:
	if not settings.openai_api_key or not settings.openai_api_key.strip():
		raise ManagerConfigurationError("OpenAI is not configured")

	try:
		assessment = await _run_agent(request.request)
		return validate_manager_assessment(assessment)
	except Exception as error:
		raise ManagerExecutionError("Manager analysis failed") from error