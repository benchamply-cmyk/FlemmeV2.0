"""Run the opt-in, ten-call live functional campaign and write a sanitized report."""

import argparse
import asyncio
import re
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from flemme_manager.agents.manager import analyze_request
from flemme_manager.schemas import UserRequest
from flemme_manager.settings import settings
from functional_scenarios import SCENARIOS, FunctionalScenario

INPUT_PRICE_PER_MILLION = 0.40
OUTPUT_PRICE_PER_MILLION = 1.60
ESTIMATED_INPUT_TOKENS_PER_CALL = 1000
ESTIMATED_OUTPUT_TOKENS_PER_CALL = 400
RECOMMENDED_MAX_COST_USD = 0.05
REPORT_PATH = Path(__file__).with_name("validation_report.md")
ACTION_CLAIM_PATTERN = re.compile(
    r"\b(?:j['’]ai|je l['’]ai|nous avons|je viens de|nous venons de)\s+"
    r"(?:(?:bien|déjà|effectivement)\s+)?"
    r"(?:réservé|acheté|appelé|contacté|envoyé|confirmé|commandé|effectué|"
    r"trouvé|sélectionné)\b"
    r"|\b(?:réservation|commande)\s+(?:est|a été)\s+(?:confirmée|passée)\b",
    re.IGNORECASE,
)


def estimated_campaign_cost() -> float:
    input_cost = (
        len(SCENARIOS)
        * ESTIMATED_INPUT_TOKENS_PER_CALL
        * INPUT_PRICE_PER_MILLION
        / 1_000_000
    )
    output_cost = (
        len(SCENARIOS)
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


def evaluate_result(scenario: FunctionalScenario, assessment) -> dict[str, object]:
    message = assessment.user_response.message
    description = assessment.expected_result.description
    questions = assessment.qualification_questions
    action_claim = bool(ACTION_CLAIM_PATTERN.search(f"{message} {description}"))
    checks = {
        "category": assessment.service_category == scenario.category,
        "workflow": assessment.selected_workflow.workflow_id == scenario.workflow,
        "status": assessment.mission_status == scenario.status,
        "question_count": question_count_matches(scenario.questions, len(questions)),
        "response_present": bool(message.strip()),
        "no_detected_action_claim": not action_claim,
    }
    return {
        "category": assessment.service_category.value,
        "workflow": (
            assessment.selected_workflow.workflow_id.value
            if assessment.selected_workflow.workflow_id
            else "none"
        ),
        "status": assessment.mission_status.value,
        "question_count": len(questions),
        "action_claim_detected": action_claim,
        "checks": checks,
        "passed": all(checks.values()),
    }


async def run_campaign() -> list[dict[str, object]]:
    results = []
    for scenario in SCENARIOS:
        try:
            assessment = await analyze_request(UserRequest(request=scenario.request))
            result = evaluate_result(scenario, assessment)
        except Exception as error:
            result = {
                "category": "error",
                "workflow": "error",
                "status": "error",
                "question_count": 0,
                "action_claim_detected": False,
                "checks": {},
                "passed": False,
                "error_type": type(error).__name__,
            }
        results.append({"scenario": scenario, **result})
        print(
            f"{scenario.scenario_id}: "
            f"{'PASS' if result['passed'] else 'REVIEW'} "
            f"category={result['category']} workflow={result['workflow']} "
            f"status={result['status']} questions={result['question_count']}"
        )
    return results


def write_report(results: list[dict[str, object]]) -> None:
    passed = sum(bool(result["passed"]) for result in results)
    rows = [
        "| ID | Scenario | Attendu (categorie / workflow / statut) | Observe | Questions | Scan d'action | Auto-check |",
        "|---|---|---|---|---:|---|---|",
    ]
    for result in results:
        scenario = result["scenario"]
        assert isinstance(scenario, FunctionalScenario)
        expected = (
            f"{scenario.category.value} / "
            f"{scenario.workflow.value if scenario.workflow else 'none'} / "
            f"{scenario.status.value}"
        )
        observed = (
            f"{result['category']} / {result['workflow']} / {result['status']}"
        )
        action_scan = (
            "claim detected"
            if result["action_claim_detected"]
            else "no explicit claim detected"
        )
        rows.append(
            f"| {scenario.scenario_id} | {scenario.title} | {expected} | "
            f"{observed} | {result['question_count']} | {action_scan} | "
            f"{'PASS' if result['passed'] else 'REVIEW'} |"
        )

    errors = [
        f"- {result['scenario'].scenario_id}: {result['error_type']}"
        for result in results
        if result.get("error_type")
    ]
    report = [
        "# Rapport de validation fonctionnelle Flemme Manager",
        "",
        f"- Date UTC : {datetime.now(UTC).isoformat(timespec='seconds')}",
        f"- Branche : feature/flemme-manager-v1",
        f"- Modele : {settings.openai_model}",
        f"- Cle API disponible : {'oui' if bool(settings.openai_api_key) else 'non'} (valeur non journalisee)",
        f"- Appels logiques : {len(results)}; reussis automatiquement : {passed}/{len(results)}",
        f"- Cout estime de campagne : ${estimated_campaign_cost():.4f} USD; cout reel non expose par ce rapport.",
        "- Les textes des demandes et des reponses ne sont pas enregistres.",
        "- Revue humaine du ton, de la pertinence et du scenario urgent requise avant validation finale.",
        "",
        "## Resultats",
        "",
        *rows,
        "",
        "## Anomalies",
        "",
        *(errors or ["- Aucune erreur d'execution."]),
        "",
        "Un resultat `REVIEW` indique un ecart aux attentes ou une affirmation d'action detectee; examiner le cas sans exposer de donnees personnelles.",
        "Le scan d'action est heuristique et ne remplace pas une revue humaine.",
        "",
        "## Suite recommandee",
        "",
        "Verifier manuellement les reponses du scenario F08 (fuite d'eau urgente), puis ajuster les attentes ou ouvrir une anomalie. Ne modifier le prompt qu'apres cette revue.",
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-cost-usd",
        type=float,
        help="Opt-in explicite avec le plafond de cout accepte (au moins 0.05 USD).",
    )
    args = parser.parse_args()
    estimate = estimated_campaign_cost()

    print(f"Modele configure: {settings.openai_model}")
    print(f"Scenarios/appels logiques prevus: {len(SCENARIOS)}")
    print(f"Cout indicatif estime: ${estimate:.4f} USD")
    print(f"Plafond recommande: ${RECOMMENDED_MAX_COST_USD:.2f} USD")

    if not settings.openai_api_key or not settings.openai_api_key.strip():
        print("OPENAI_API_KEY absent: aucun appel effectue.")
        return 2
    if args.max_cost_usd is None or args.max_cost_usd < RECOMMENDED_MAX_COST_USD:
        print("Appels bloques: fournir un plafond accepte via --max-cost-usd.")
        return 2

    results = asyncio.run(run_campaign())
    write_report(results)
    print(f"Rapport ecrit: {REPORT_PATH}")
    return 0 if all(bool(result["passed"]) for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())