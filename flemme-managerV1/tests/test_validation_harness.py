import asyncio
from types import SimpleNamespace

import pytest

from flemme_manager.schemas import (
    ExpectedResult,
    ManagerAssessment,
    MissionStatus,
    MissingInformation,
    QualificationQuestion,
    SelectedWorkflow,
    ServiceCategory,
    UserFacingResponse,
    WorkflowId,
)
from functional_scenarios import SCENARIOS
import run_remaining_functional_validation as runner
import run_targeted_v1_validation as targeted_runner
from run_remaining_functional_validation import (
    AGENT_MAX_TURNS,
    OPENAI_MAX_RETRIES,
    REMAINING_SCENARIO_IDS,
    REMAINING_SCENARIOS,
    estimated_campaign_cost,
    evaluate_result,
    question_count_matches,
)


def test_validation_campaign_has_ten_unique_scenarios():
    assert len(SCENARIOS) == 10
    assert len({scenario.scenario_id for scenario in SCENARIOS}) == 10
    assert any("Fuite d'eau urgente" in scenario.title for scenario in SCENARIOS)


def test_f01_allows_missing_quote_details_and_f10_is_outside_catalog():
    scenario_by_id = {scenario.scenario_id: scenario for scenario in SCENARIOS}

    assert scenario_by_id["F01"].status == MissionStatus.NEEDS_INFORMATION
    assert scenario_by_id["F01"].questions == "one_or_two"
    assert scenario_by_id["F10"].category == ServiceCategory.OTHER
    assert scenario_by_id["F10"].workflow is None


def test_question_count_expectations_never_allow_more_than_two():
    assert question_count_matches("none", 0)
    assert question_count_matches("one_or_two", 2)
    assert question_count_matches("at_most_two", 0)
    assert not question_count_matches("at_most_two", 3)


def test_remaining_campaign_has_exactly_nine_calls_and_skips_f04():
    assert tuple(scenario.scenario_id for scenario in REMAINING_SCENARIOS) == REMAINING_SCENARIO_IDS
    assert len(REMAINING_SCENARIOS) == 9
    assert "F04" not in REMAINING_SCENARIO_IDS


def test_campaign_estimate_matches_nine_call_token_assumptions():
    assert estimated_campaign_cost() == pytest.approx(0.00936)


def test_campaign_prevents_automatic_retries_and_additional_agent_turns():
    assert OPENAI_MAX_RETRIES == 0
    assert AGENT_MAX_TURNS == 1


def test_evaluator_reads_token_usage_from_sdk_result_not_mission_schema():
    assessment = ManagerAssessment(
        service_category=ServiceCategory.SERVICE_PROVIDER,
        expected_result=ExpectedResult(description="Comparer les deux devis."),
        selected_workflow=SelectedWorkflow(
            workflow_id=WorkflowId.TROUVER_PRESTATAIRE,
            reason="Le besoin correspond au catalogue.",
        ),
        missing_information=[],
        qualification_questions=[],
        mission_status=MissionStatus.READY,
        human_intervention_required=False,
        user_response=UserFacingResponse(message="Je peux comparer les éléments fournis."),
    )

    result = evaluate_result(SCENARIOS[2], assessment, sdk_requests=1)

    assert result["passed"] is True
    assert result["workflow"] == "trouver_prestataire"


def test_campaign_loop_postprocesses_nine_fake_sdk_results(monkeypatch):
    calls = []

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            assert kwargs["max_retries"] == 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class FakeOpenAIProvider:
        def __init__(self, *, openai_client):
            self.client = openai_client

    async def fake_run(_agent, request_text, *, run_config, max_turns):
        assert max_turns == 1
        scenario = runner.REMAINING_SCENARIOS[len(calls)]
        calls.append(request_text)
        assessment = ManagerAssessment(
            service_category=scenario.category,
            expected_result=ExpectedResult(description="Resultat attendu."),
            selected_workflow=SelectedWorkflow(
                workflow_id=scenario.workflow,
                reason="Workflow du scenario.",
            ),
            missing_information=(
                [MissingInformation(name="detail", reason="Precision requise.")]
                if scenario.status == MissionStatus.NEEDS_INFORMATION
                else []
            ),
            qualification_questions=(
                [
                    QualificationQuestion(
                        question="Quelle precision manque ?",
                        why_needed="Completer la demande.",
                        priority=1,
                    )
                ]
                if scenario.status == MissionStatus.NEEDS_INFORMATION
                else []
            ),
            mission_status=scenario.status,
            human_intervention_required=(
                scenario.status == MissionStatus.HUMAN_INTERVENTION_REQUIRED
            ),
            user_response=UserFacingResponse(message="Je peux t'aider à clarifier la demande."),
        )
        usage = SimpleNamespace(
            requests=1,
            input_tokens=10,
            output_tokens=5,
            total_tokens=15,
        )
        return SimpleNamespace(
            final_output=assessment,
            context_wrapper=SimpleNamespace(usage=usage),
        )

    monkeypatch.setattr(runner, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setattr(runner, "OpenAIProvider", FakeOpenAIProvider)
    monkeypatch.setattr(runner.Runner, "run", fake_run)
    monkeypatch.setattr(runner.settings, "openai_api_key", "offline-test-key")

    results = asyncio.run(runner.run_campaign())

    assert len(calls) == 9
    assert len(results) == 9
    assert all(result["passed"] for result in results)
    assert all(result["sdk_requests"] == 1 for result in results)
    assert all(result["input_tokens"] == 10 for result in results)


def test_targeted_campaign_is_exactly_four_requested_scenarios():
    assert targeted_runner.TARGET_SCENARIO_IDS == ("F03", "F06", "F07", "F08")
    assert tuple(scenario.scenario_id for scenario in targeted_runner.TARGET_SCENARIOS) == (
        "F03",
        "F06",
        "F07",
        "F08",
    )
    assert targeted_runner.OPENAI_MAX_RETRIES == 0
    assert targeted_runner.AGENT_MAX_TURNS == 1
    assert targeted_runner.estimated_campaign_cost() == pytest.approx(0.00416)


def test_f08_safety_response_passes_and_call_promise_fails():
    scenario = next(
        scenario for scenario in SCENARIOS if scenario.scenario_id == "F08"
    )
    safe_assessment = ManagerAssessment(
        service_category=ServiceCategory.SERVICE_PROVIDER,
        expected_result=ExpectedResult(description="Rester en securite."),
        selected_workflow=SelectedWorkflow(
            workflow_id=WorkflowId.TROUVER_PRESTATAIRE,
            reason="Une intervention professionnelle est necessaire.",
        ),
        missing_information=[],
        qualification_questions=[],
        mission_status=MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        human_intervention_required=True,
        user_response=UserFacingResponse(
            message="Eloigne-toi de l'eau et ne touche pas la prise. Contacte toi-même les secours locaux."
        ),
    )
    safe_result = targeted_runner.evaluate_assessment(
        scenario,
        safe_assessment,
        sdk_requests=1,
    )

    assert safe_result["passed"] is True
    assert safe_result["safety_priority_detected"] is True
    assert safe_result["assistant_call_promise_detected"] is False

    promised_assessment = safe_assessment.model_copy(
        update={
            "user_response": UserFacingResponse(
                message="Je vais appeler un plombier pour toi."
            )
        }
    )
    promised_result = targeted_runner.evaluate_assessment(
        scenario,
        promised_assessment,
        sdk_requests=1,
    )

    assert promised_result["passed"] is False
    assert promised_result["assistant_call_promise_detected"] is True