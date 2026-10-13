"""Opt-in bounded live campaign; preserve previous reports and never log secrets."""
import argparse
import asyncio
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env.local')
os.environ['OPENAI_AGENTS_DISABLE_TRACING'] = '1'

from agents import ModelSettings, RunConfig, Runner
from agents.models.openai_provider import OpenAIProvider
from openai import AsyncOpenAI
from flemme_manager.agents.manager import manager_agent
from flemme_manager.schemas import UserRequest
from flemme_manager.services.qualification_policy import qualify_locally
from flemme_manager.settings import settings
from functional_scenarios import SCENARIOS
from run_targeted_v1_validation import evaluate_assessment
from run_remaining_functional_validation import question_count_matches


def evaluate(scenario, assessment):
    # Reuse business validation; no text promise heuristic falsely matches negation.
    result = evaluate_assessment(scenario, assessment, sdk_requests=1)
    if not question_count_matches(scenario.questions, len(assessment.qualification_questions)):
        result['inconsistencies'].append('Nombre de questions incompatible avec le scénario.')
    result['passed'] = not result['inconsistencies']
    result['structured_output'] = assessment.model_dump(mode='json')
    return result


async def run(output):
    rows = []
    metadata = {
        'date_paris': datetime.now(ZoneInfo('Europe/Paris')).isoformat(),
        'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'model': settings.openai_model, 'max_api_calls': 10,
        'max_output_tokens_per_call': 1000, 'max_turns': 1, 'transport_retries': 0,
        'tracing': False, 'mode': 'Direct model probe plus effective local routing comparison',
        'results': rows,
    }
    # Exclusive create: never overwrite historical evidence.
    with output.open('x', encoding='utf-8') as log:
        async with AsyncOpenAI(api_key=settings.openai_api_key, max_retries=0, timeout=30) as client:
            config = RunConfig(model_provider=OpenAIProvider(openai_client=client),
                model_settings=ModelSettings(max_tokens=1000), tracing_disabled=True)
            for scenario in SCENARIOS:
                row = {'scenario_id': scenario.scenario_id, 'request': scenario.request,
                    'expected': {'category': scenario.category.value,
                    'workflow': scenario.workflow.value if scenario.workflow else None,
                    'status': scenario.status.value}}
                try:
                    result = await Runner.run(manager_agent, scenario.request, run_config=config, max_turns=1)
                    row['model_probe'] = evaluate(scenario, result.final_output)
                    usage = result.context_wrapper.usage
                    row['usage'] = {'requests': usage.requests, 'input_tokens': usage.input_tokens,
                        'output_tokens': usage.output_tokens, 'total_tokens': usage.total_tokens}
                except Exception as error:
                    # Do not serialize provider errors, headers or request objects.
                    row['model_probe'] = {'passed': False, 'error_type': type(error).__name__,
                        'http_status': getattr(error, 'status_code', None)}
                    row['usage'] = None
                local = qualify_locally(UserRequest(request=scenario.request))
                row['effective_routing'] = {
                    'path': 'local' if local is not None else 'model',
                    'evaluation': evaluate(scenario, local) if local is not None else row['model_probe'],
                    'note': 'Local decision without extra API call' if local is not None
                        else 'Actual model response evaluated by production business invariants',
                }
                rows.append(row)
                print(scenario.scenario_id, 'model=' + str(row['model_probe']['passed']),
                    'routing=' + row['effective_routing']['path'],
                    'effective=' + str(row['effective_routing']['evaluation']['passed']), flush=True)
                # Persist each result even if the campaign is interrupted.
                log.write(json.dumps({'scenario_result': row}, ensure_ascii=False) + '\n')
                log.flush()
                if row['model_probe'].get('http_status') in (401, 403, 429):
                    metadata['stopped_reason'] = 'Credential/access/quota failure; no retries'
                    break
        log.write(json.dumps({'campaign_metadata': {k:v for k,v in metadata.items() if k != 'results'}}, ensure_ascii=False) + '\n')
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-live', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not args.execute_live or not settings.openai_api_key:
        raise SystemExit('Explicit live execution and configured key required')
    asyncio.run(run(args.output))
