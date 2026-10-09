"""Preparation agents intentionally have no external action tools."""
import asyncio
import json
from importlib.resources import files
from agents import Agent, ModelSettings, Runner, RunConfig

def build_executor(name):
    if name not in {"search", "compare", "quality", "writer"}:
        raise ValueError("Unknown agent")
    from flemme_manager.settings import settings
    return Agent(name="Flemme " + name, model=settings.openai_model,
                 instructions=files("flemme_manager").joinpath("prompts/" + name + ".txt").read_text(),
                 model_settings=ModelSettings(max_tokens=1800,store=False), tools=[])

async def prepare(name, mission):
    result = await asyncio.wait_for(Runner.run(build_executor(name), json.dumps(mission, ensure_ascii=False),
        max_turns=3, run_config=RunConfig(tracing_disabled=True)), timeout=60)
    if not isinstance(result.final_output, str) or not result.final_output.strip():
        raise ValueError("Empty preparation")
    # The completion endpoint caps results so they can be passed to subsequent agents.
    if len(result.final_output) > 8000:
        raise ValueError("Preparation exceeds storage limit")
    return result.final_output
