"""Run the nine remaining live scenarios once each, with SDK retries disabled."""

import argparse
import asyncio
import re
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

from agents import RunConfig, Runner
from agents.models.openai_provider import OpenAIProvider
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

from flemme_manager.agents.manager import manager_agent
from flemme_manager.schemas import ManagerAssessment, UserRequest, WorkflowId
from flemme_manager.settings import settings
from functional_scenarios import SCENARIOS, FunctionalScenario

REMAINING_SCENARIO_IDS = ("F01", "F02", "F03", "F05", "F06", "F07", "F08", "F09", "F10")
REMAINING_SCENARIOS = tuple(
    scenario for scenario in SCENARIOS if scenario.scenario_id in REMAINING_SCENARIO_IDS
)
WORKFLOW_CATALOG = {workflow.value for workflow in WorkflowId}
INPUT_PRICE_PER_MILLION = 0.40
OUTPUT_PRICE_PER_MILLION = 1.60
ESTIMATED_INPUT_TOKENS_PER_CALL = 1000
ESTIMATED_OUTPUT_TOKENS_PER_CALL = 400
RECOMMENDED_MAX_COST_USD = 0.05
OPENAI_MAX_RETRIES = 0
AGENT_MAX_TURNS = 1
REPORT_PATH = Path(__file__).with_name("validation_report.md")
ACTION_CLAIM_PATTERN = re.compile(
    r"\b(?:j['’]ai|je l['’]ai|nous avons|je viens de|nous venons de)\s+"
    r"(?:(?:bien|déjà|effectivement)\s+)?"
    r"(?:recherché|cherché|comparé|trouvé|réservé|acheté|appelé|contacté|"
    r"envoyé|confirmé|commandé|effectué|sélectionné)\b"
    r"|\b(?:réservation|commande)\s+(?:est|a été)\s+(?:confirmée|passée)\b",
    re.IGNORECASE,
)


def estimated_campaign_cost() -> float:
    input_cost = (
        len(REMAINING_SCENARIOS)
        * ESTIMATED_INPUT_TOKENS_PER_CALL
        * INPUT_PRICE_PER_MILLION
        / 1_000_000
    )
    output_cost = (
        len(REMAINING_SCENARIOS)
        * ESTIMATED_OUTPUT_TOKENS_PER_CALL
        * OUTPUT_PRICE_PER_MILLION
        / 1_000_000
    )
    return input_cost + output_cost


def question_count_matches(expectation: str, count: int) -> bool:
    if count > 2:
        return False
    if expectation == "none":
        return count == 0
    if expectation == "one_or_two":
        return 1 <= count <= 2
    return expectation == "at_most_two"


def evaluate_result(
    scenario: FunctionalScenario,
    assessment: ManagerAssessment,
    *,
    sdk_requests: int,
) -> dict[str, object]:
    workflow_id = assessment.selected_workflow.workflow_id
    workflow_value = workflow_id.value if workflow_id else None
    message = assessment.user_response.message
    question_count = len(assessment.qualification_questions)
    inconsistencies = []

    if assessment.service_category != scenario.category:
        inconsistencies.append("Categorie differente de l'attendu.")
    if workflow_value != (scenario.workflow.value if scenario.workflow else None):
        inconsistencies.append("Workflow different de l'attendu.")
    if workflow_value is not None and workflow_value not in WORKFLOW_CATALOG:
        inconsistencies.append("Workflow absent du catalogue ferme.")
    if assessment.mission_status != scenario.status:
        inconsistencies.append("Statut different de l'attendu.")
    if not question_count_matches(scenario.questions, question_count):
        inconsistencies.append("Nombre de questions different de l'attendu ou superieur a deux.")
    if not message.strip():
        inconsistencies.append("La reponse utilisateur est vide.")
    action_claim = bool(ACTION_CLAIM_PATTERN.search(message))
    if action_claim:
        inconsistencies.append("La reponse semble pretendre qu'une action a deja ete effectuee.")
    if sdk_requests != 1:
        inconsistencies.append(f"Le SDK rapporte {sdk_requests} requete(s), une etait attendue.")

    return {
        "scenario_id": scenario.scenario_id,
        "title": scenario.title,
        "request": scenario.request,
        "expected_category": scenario.category.value,
        "expected_workflow": scenario.workflow.value if scenario.workflow else None,
        "expected_status": scenario.status.value,
        "manual_focus": scenario.manual_focus,
        "category": assessment.service_category.value,
        "workflow": workflow_value,
        "status": assessment.mission_status.value,
        "missing_information": [item.model_dump() for item in assessment.missing_information],
        "questions": [item.model_dump() for item in assessment.qualification_questions],
        "user_response": message,
        "action_claim_detected": action_claim,
        "inconsistencies": inconsistencies,
        "sdk_requests": sdk_requests,
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
            workflow_name="Flemme Manager nine-scenario validation",
        )
        for scenario in REMAINING_SCENARIOS:
            started_at = perf_counter()
            result = None
            try:
                result = await Runner.run(
                    manager_agent,
                    UserRequest(request=scenario.request).request,
                    run_config=run_config,
                    max_turns=AGENT_MAX_TURNS,
                )
                elapsed_seconds = round(perf_counter() - started_at, 2)
                if not isinstance(result.final_output, ManagerAssessment):
                    raise TypeError("Unexpected structured output type")
                item = evaluate_result(
                    scenario,
                    result.final_output,
                    sdk_requests=result.context_wrapper.usage.requests,
                )
                item["duration_seconds"] = elapsed_seconds
                item["input_tokens"] = result.context_wrapper.usage.input_tokens
                item["output_tokens"] = result.context_wrapper.usage.output_tokens
                item["total_tokens"] = result.context_wrapper.usage.total_tokens
            except Exception as error:
                usage = getattr(
                    getattr(result, "context_wrapper", None),
                    "usage",
                    None,
                )
                structured_output = getattr(result, "final_output", None)
                has_structured_output = isinstance(
                    structured_output,
                    ManagerAssessment,
                )
                item = {
                    "scenario_id": scenario.scenario_id,
                    "title": scenario.title,
                    "request": scenario.request,
                    "expected_category": scenario.category.value,
                    "expected_workflow": scenario.workflow.value if scenario.workflow else None,
                    "expected_status": scenario.status.value,
                    "manual_focus": scenario.manual_focus,
                    "category": (
                        structured_output.service_category.value
                        if has_structured_output
                        else "error"
                    ),
                    "workflow": (
                        structured_output.selected_workflow.workflow_id.value
                        if has_structured_output
                        and structured_output.selected_workflow.workflow_id
                        else None
                    ),
                    "status": (
                        structured_output.mission_status.value
                        if has_structured_output
                        else "error"
                    ),
                    "missing_information": (
                        [item.model_dump() for item in structured_output.missing_information]
                        if has_structured_output
                        else []
                    ),
                    "questions": (
                        [item.model_dump() for item in structured_output.qualification_questions]
                        if has_structured_output
                        else []
                    ),
                    "user_response": (
                        structured_output.user_response.message
                        if has_structured_output
                        else "Aucune reponse structuree."
                    ),
                    "action_claim_detected": False,
                    "inconsistencies": [f"Echec d'execution ({type(error).__name__}); aucun retry."],
                    "duration_seconds": round(perf_counter() - started_at, 2),
                    "structured_output_received": has_structured_output,
                    "input_tokens": usage.input_tokens if usage else None,
                    "output_tokens": usage.output_tokens if usage else None,
                    "total_tokens": usage.total_tokens if usage else None,
                    "sdk_requests": usage.requests if usage else None,
                    "passed": False,
                }
            results.append(item)
            print(
                f"{scenario.scenario_id}: {'PASS' if item['passed'] else 'REVIEW'} "
                f"category={item['category']} workflow={item['workflow']} "
                f"status={item['status']} questions={len(item['questions'])} "
                f"sdk_requests={item['sdk_requests']}"
            )

    if len(results) != len(REMAINING_SCENARIOS):
        raise RuntimeError("Campaign did not finish all selected scenarios")
    return results


def write_report(results: list[dict[str, object]]) -> None:
    input_tokens = sum(
        int(result["input_tokens"])
        for result in results
        if result["input_tokens"] is not None
    )
    output_tokens = sum(
        int(result["output_tokens"])
        for result in results
        if result["output_tokens"] is not None
    )
    known_sdk_requests = [
        int(result["sdk_requests"])
        for result in results
        if result["sdk_requests"] is not None
    ]
    sdk_requests = sum(known_sdk_requests)
    unknown_usage_runs = len(results) - len(known_sdk_requests)
    actual_estimate = (
        input_tokens * INPUT_PRICE_PER_MILLION
        + output_tokens * OUTPUT_PRICE_PER_MILLION
    ) / 1_000_000
    passed = sum(bool(result["passed"]) for result in results)
    sections = [
        "# Rapport de validation fonctionnelle Flemme Manager",
        "",
        f"- Date UTC : {datetime.now(UTC).isoformat(timespec='seconds')}",
        "- Branche : `feature/flemme-manager-v1`",
        f"- Modele : `{settings.openai_model}`",
        "- Les demandes sont des scenarios synthetiques; elles ne contiennent pas de donnees personnelles reelles.",
        f"- Scenarios executes : {len(results)}; conformes aux attentes automatiques : {passed}/{len(results)}.",
        f"- Runs SDK lances : {len(results)} (un tour maximum, retries desactives). Requetes SDK quantifiees : {sdk_requests}; runs sans metriques : {unknown_usage_runs}.",
        f"- Duree totale : {sum(float(result['duration_seconds']) for result in results):.2f} s.",
        f"- Tokens : {input_tokens} entrants, {output_tokens} sortants, {input_tokens + output_tokens} au total.",
        f"- Cout estime selon les tokens quantifies : ${actual_estimate:.6f} USD; {unknown_usage_runs} run(s) sans usage, cout total exact inconnu.",
        "- Le premier test voiture hybride est un smoke test distinct, similaire a F04 mais pas le meme cas. F04 n'a pas ete rejoue pour rester a neuf nouveaux scenarios.",
        "- Aucune regle metier ni aucun prompt n'a ete modifie pendant les tests.",
        "",
    ]

    for result in results:
        sections.extend(
            [
                f"## {result['scenario_id']} - {result['title']}",
                "",
                f"- Demande : {result['request']}",
                f"- Categorie : attendue `{result['expected_category']}`, observee `{result['category']}`.",
                f"- Workflow : attendu `{result['expected_workflow'] or 'aucun'}`, observe `{result['workflow'] or 'aucun'}`.",
                f"- Statut : attendu `{result['expected_status']}`, observe `{result['status']}`.",
                "- Informations manquantes :",
            ]
        )
        missing = result["missing_information"]
        sections.extend(
            [f"  - {item['name']} : {item['reason']}" for item in missing]
            or ["  - Aucune."]
        )
        sections.append("- Questions posees :")
        questions = result["questions"]
        sections.extend(
            [
                f"  - Priorite {item['priority']}: {item['question']} (raison: {item['why_needed']})"
                for item in questions
            ]
            or ["  - Aucune."]
        )
        sections.extend(
            [
                f"- Reponse utilisateur : {result['user_response']}",
                f"- Focus de revue : {result['manual_focus']}",
                "- Incoherences : "
                + ("; ".join(result["inconsistencies"]) or "aucune detectee automatiquement"),
                f"- Scan heuristique de fausse action : {'affirmation suspecte detectee' if result['action_claim_detected'] else 'aucune affirmation explicite detectee'}.",
                f"- Duree : {result['duration_seconds']:.2f} s; tokens entree/sortie/total : "
                f"{result['input_tokens'] if result['input_tokens'] is not None else 'inconnu'}/"
                f"{result['output_tokens'] if result['output_tokens'] is not None else 'inconnu'}/"
                f"{result['total_tokens'] if result['total_tokens'] is not None else 'inconnu'}; "
                f"requetes SDK : {result['sdk_requests'] if result['sdk_requests'] is not None else 'inconnu'}.",
                "",
            ]
        )

    sections.extend(
        [
            "## Revue humaine et limites",
            "",
            "Le scan des affirmations d'action est heuristique et ne prouve pas l'absence de toute formulation trompeuse. Les incoherences de statut et de questions doivent etre examinees avec les reponses completes ci-dessus.",
            "Pour F08 (fuite d'eau pres d'une prise), verifier la priorite a la securite immediate et le renvoi vers les secours ou un professionnel adequat, sans pretendre qu'un appel a ete effectue.",
            "",
        ]
    )
    REPORT_PATH.write_text("\n".join(sections), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-cost-usd",
        type=float,
        help="Budget accepte pour la campagne (au moins 0.05 USD).",
    )
    args = parser.parse_args()
    estimate = estimated_campaign_cost()

    print(f"Modele configure: {settings.openai_model}")
    print(f"Scenarios/appels logiques prevus: {len(REMAINING_SCENARIOS)}")
    print(f"Cout indicatif estime: ${estimate:.5f} USD")
    print(f"Budget accepte requis: au moins ${RECOMMENDED_MAX_COST_USD:.2f} USD")

    if not settings.openai_api_key or not settings.openai_api_key.strip():
        print("OPENAI_API_KEY absent: aucun appel effectue.")
        return 2
    if args.max_cost_usd is None or args.max_cost_usd < RECOMMENDED_MAX_COST_USD:
        print("Appels bloques: confirmer le budget via --max-cost-usd.")
        return 2

    results = asyncio.run(run_campaign())
    write_report(results)
    print(f"Rapport ecrit: {REPORT_PATH}")
    return 0 if all(bool(result["passed"]) for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())