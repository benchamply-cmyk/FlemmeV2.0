"""Run only F03, F06, F07, and F08 once each with no automatic retries."""

import argparse
import asyncio
import json
import re
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

from agents import RunConfig, Runner
from agents.models.openai_provider import OpenAIProvider
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

from flemme_manager.agents.manager import manager_agent
from flemme_manager.schemas import (
    ManagerAssessment,
    MissionCoherenceError,
    validate_manager_assessment,
)
from flemme_manager.settings import settings
from functional_scenarios import SCENARIOS, FunctionalScenario

TARGET_SCENARIO_IDS = ("F03", "F06", "F07", "F08")
TARGET_SCENARIOS = tuple(
    scenario for scenario in SCENARIOS if scenario.scenario_id in TARGET_SCENARIO_IDS
)
OPENAI_MAX_RETRIES = 0
AGENT_MAX_TURNS = 1
INPUT_PRICE_PER_MILLION = 0.40
OUTPUT_PRICE_PER_MILLION = 1.60
ESTIMATED_INPUT_TOKENS_PER_RUN = 1000
ESTIMATED_OUTPUT_TOKENS_PER_RUN = 400
RECOMMENDED_MAX_COST_USD = 0.05
REPORT_PATH = Path(__file__).with_name("validation_report.md")
ASSISTANT_CALL_PROMISE = re.compile(
    r"\b(?:je|nous)\s+(?:(?:vais|allons|peux|pouvons|dois|devons)\s+)?"
    r"(?:appeler|contacter|joindre|envoyer|reserver|rechercher|chercher)\b"
    r"|\bj['’](?:appelle|envoie|reserve|contacte)\b"
    r"|\bje viens d['’](?:appeler|envoyer|contacter)\b",
    re.IGNORECASE,
)
F08_SAFETY_MARKERS = (
    "eloigne",
    "ne touche",
    "ne t'approche",
    "mets-toi en securite",
    "coupe le courant",
    "disjoncteur",
    "secours",
    "urgence",
)


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return "".join(character for character in normalized if not unicodedata.combining(character))


def estimated_campaign_cost() -> float:
    input_cost = (
        len(TARGET_SCENARIOS)
        * ESTIMATED_INPUT_TOKENS_PER_RUN
        * INPUT_PRICE_PER_MILLION
        / 1_000_000
    )
    output_cost = (
        len(TARGET_SCENARIOS)
        * ESTIMATED_OUTPUT_TOKENS_PER_RUN
        * OUTPUT_PRICE_PER_MILLION
        / 1_000_000
    )
    return input_cost + output_cost


def evaluate_assessment(
    scenario: FunctionalScenario,
    assessment: ManagerAssessment,
    *,
    sdk_requests: int,
) -> dict[str, object]:
    inconsistencies = []
    try:
        validate_manager_assessment(assessment)
        business_validation = "valid"
    except MissionCoherenceError as error:
        business_validation = "invalid"
        inconsistencies.append(str(error))

    workflow = assessment.selected_workflow.workflow_id
    workflow_value = workflow.value if workflow else None
    if assessment.service_category != scenario.category:
        inconsistencies.append("Categorie differente de l'attendu.")
    if workflow_value != (scenario.workflow.value if scenario.workflow else None):
        inconsistencies.append("Workflow different de l'attendu.")
    if assessment.mission_status != scenario.status:
        inconsistencies.append("Statut different de l'attendu.")
    question_count = len(assessment.qualification_questions)
    if question_count > 2:
        inconsistencies.append("Plus de deux questions posees.")
    if not assessment.user_response.message.strip():
        inconsistencies.append("Reponse utilisateur vide.")
    if sdk_requests != 1:
        inconsistencies.append(f"Le SDK rapporte {sdk_requests} requete(s), une etait attendue.")

    message_normalized = normalize_text(assessment.user_response.message)
    call_promise_detected = bool(ASSISTANT_CALL_PROMISE.search(message_normalized))
    if call_promise_detected:
        inconsistencies.append("La reponse promet un appel/contact/recherche que l'agent ne peut pas effectuer.")

    safety_priority = None
    if scenario.scenario_id == "F08":
        safety_priority = any(marker in message_normalized for marker in F08_SAFETY_MARKERS)
        if not safety_priority:
            inconsistencies.append("La reponse F08 ne contient pas de consigne de securite immediate detectee.")
        first_question_at = message_normalized.find("?")
        first_safety_at = min(
            (message_normalized.find(marker) for marker in F08_SAFETY_MARKERS if marker in message_normalized),
            default=-1,
        )
        if first_question_at >= 0 and (first_safety_at < 0 or first_question_at < first_safety_at):
            inconsistencies.append("La question precede la consigne de securite F08.")

    return {
        "scenario_id": scenario.scenario_id,
        "title": scenario.title,
        "request": scenario.request,
        "category": assessment.service_category.value,
        "workflow": workflow_value,
        "status": assessment.mission_status.value,
        "missing_information": [item.model_dump() for item in assessment.missing_information],
        "questions": [item.model_dump() for item in assessment.qualification_questions],
        "user_response": assessment.user_response.message,
        "business_validation": business_validation,
        "safety_priority_detected": safety_priority,
        "assistant_call_promise_detected": call_promise_detected,
        "inconsistencies": inconsistencies,
        "passed": not inconsistencies,
    }


async def run_campaign() -> list[dict[str, object]]:
    results = []
    async with AsyncOpenAI(
        api_key=settings.openai_api_key,
        max_retries=OPENAI_MAX_RETRIES,
        timeout=60.0,
    ) as client:
        run_config = RunConfig(
            model_provider=OpenAIProvider(openai_client=client),
            tracing_disabled=True,
            workflow_name="Flemme Manager targeted V1 validation",
        )
        for scenario in TARGET_SCENARIOS:
            started_at = perf_counter()
            result = None
            try:
                result = await Runner.run(
                    manager_agent,
                    scenario.request,
                    run_config=run_config,
                    max_turns=AGENT_MAX_TURNS,
                )
                elapsed_seconds = round(perf_counter() - started_at, 2)
                if not isinstance(result.final_output, ManagerAssessment):
                    raise TypeError("Unexpected structured output type")
                usage = result.context_wrapper.usage
                item = evaluate_assessment(
                    scenario,
                    result.final_output,
                    sdk_requests=usage.requests,
                )
                item["structured_output"] = result.final_output.model_dump(mode="json")
                item["input_tokens"] = usage.input_tokens
                item["output_tokens"] = usage.output_tokens
                item["total_tokens"] = usage.total_tokens
                item["sdk_requests"] = usage.requests
            except Exception as error:
                usage = getattr(getattr(result, "context_wrapper", None), "usage", None)
                output = getattr(result, "final_output", None)
                item = {
                    "scenario_id": scenario.scenario_id,
                    "title": scenario.title,
                    "request": scenario.request,
                    "category": getattr(getattr(output, "service_category", None), "value", "unknown"),
                    "workflow": getattr(
                        getattr(getattr(output, "selected_workflow", None), "workflow_id", None),
                        "value",
                        None,
                    ),
                    "status": getattr(getattr(output, "mission_status", None), "value", "error"),
                    "missing_information": [],
                    "questions": [],
                    "user_response": "Aucune sortie structuree exploitable.",
                    "structured_output": output.model_dump(mode="json") if isinstance(output, ManagerAssessment) else None,
                    "business_validation": "not_available",
                    "safety_priority_detected": None,
                    "assistant_call_promise_detected": None,
                    "inconsistencies": [f"Exception SDK ({type(error).__name__}); aucun retry."],
                    "exception_type": type(error).__name__,
                    "input_tokens": usage.input_tokens if usage else None,
                    "output_tokens": usage.output_tokens if usage else None,
                    "total_tokens": usage.total_tokens if usage else None,
                    "sdk_requests": usage.requests if usage else None,
                    "passed": False,
                }
                elapsed_seconds = round(perf_counter() - started_at, 2)

            item["duration_seconds"] = elapsed_seconds
            results.append(item)
            print(
                f"{scenario.scenario_id}: {'PASS' if item['passed'] else 'REVIEW'} "
                f"status={item['status']} workflow={item['workflow']} "
                f"sdk_requests={item.get('sdk_requests')}"
            )

    if len(results) != len(TARGET_SCENARIOS):
        raise RuntimeError("Targeted campaign did not complete exactly four runs")
    return results


def write_report(results: list[dict[str, object]]) -> None:
    known_usage = [result for result in results if result["input_tokens"] is not None]
    total_input = sum(int(result["input_tokens"]) for result in known_usage)
    total_output = sum(int(result["output_tokens"]) for result in known_usage)
    estimated_cost = (
        total_input * INPUT_PRICE_PER_MILLION
        + total_output * OUTPUT_PRICE_PER_MILLION
    ) / 1_000_000
    passed = sum(bool(result["passed"]) for result in results)
    sections = [
        "## Validation ciblee apres corrections V1",
        "",
        f"- Date UTC : {datetime.now(UTC).isoformat(timespec='seconds')}",
        "- Branche : `feature/flemme-manager-v1`",
        f"- Modele : `{settings.openai_model}`",
        f"- Scenarios executes : {', '.join(TARGET_SCENARIO_IDS)}; runs SDK : {len(results)}.",
        "- Limites : un tour maximum par scenario; retries desactives; aucune relance automatique.",
        f"- Resultats conformes aux checks : {passed}/{len(results)}.",
        f"- Duree totale : {sum(float(result['duration_seconds']) for result in results):.2f} s.",
        f"- Usage quantifie : {total_input} tokens entrants, {total_output} sortants; cout estime ${estimated_cost:.6f} USD.",
        f"- Runs sans metriques SDK : {len(results) - len(known_usage)}; cout reel exact non disponible pour ces runs.",
        "- Aucun prompt ni aucune regle metier n'a ete modifie pendant la campagne.",
        "- Les demandes de test sont synthetiques; aucune cle API n'est incluse.",
        "",
    ]
    for result in results:
        sections.extend(
            [
                f"## {result['scenario_id']} - {result['title']}",
                "",
                f"- Demande : {result['request']}",
                f"- Statut : `{result['status']}`; workflow : `{result['workflow'] or 'aucun'}`; validation metier : `{result['business_validation']}`.",
                "- Sortie structuree :",
                "```json",
                json.dumps(result["structured_output"], ensure_ascii=False, indent=2)
                if result["structured_output"] is not None
                else "null",
                "```",
                f"- Questions : {len(result['questions'])}; reponse : {result['user_response']}",
                f"- F08 securite prioritaire detectee : {result['safety_priority_detected']}; promesse d'appel detectee : {result['assistant_call_promise_detected']}.",
                f"- Incoherences / exceptions : {'; '.join(result['inconsistencies']) or 'aucune detectee'}.",
                f"- Duree : {result['duration_seconds']:.2f} s; tokens entree/sortie/total : "
                f"{result['input_tokens'] if result['input_tokens'] is not None else 'inconnu'}/"
                f"{result['output_tokens'] if result['output_tokens'] is not None else 'inconnu'}/"
                f"{result['total_tokens'] if result['total_tokens'] is not None else 'inconnu'}; "
                f"requetes SDK : {result['sdk_requests'] if result['sdk_requests'] is not None else 'inconnu'}.",
                "",
            ]
        )
    new_section = "\n".join(sections).rstrip()
    existing_report = REPORT_PATH.read_text(encoding="utf-8") if REPORT_PATH.exists() else ""
    section_marker = "## Validation ciblee apres corrections V1"
    if section_marker in existing_report:
        existing_report = existing_report.split(section_marker, 1)[0].rstrip()
    if existing_report:
        new_section = f"{existing_report}\n\n{new_section}"
    REPORT_PATH.write_text(f"{new_section}\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-cost-usd", type=float)
    args = parser.parse_args()
    print(f"Model: {settings.openai_model}")
    print(f"Real SDK runs: {len(TARGET_SCENARIOS)}")
    print(f"Estimated cost: ${estimated_campaign_cost():.5f} USD")

    if settings.openai_model != "gpt-4.1-mini":
        print("Blocked: configured model is not gpt-4.1-mini.")
        return 2
    if not settings.openai_api_key or not settings.openai_api_key.strip():
        print("Blocked: API key unavailable; key value is never displayed.")
        return 2
    if args.max_cost_usd is None or args.max_cost_usd < RECOMMENDED_MAX_COST_USD:
        print(f"Blocked: pass --max-cost-usd >= {RECOMMENDED_MAX_COST_USD:.2f} to confirm budget.")
        return 2

    results = asyncio.run(run_campaign())
    write_report(results)
    print(f"Report updated: {REPORT_PATH}")
    return 0 if all(bool(result["passed"]) for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())