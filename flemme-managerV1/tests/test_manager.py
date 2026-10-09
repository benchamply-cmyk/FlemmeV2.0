import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from flemme_manager.agents import manager
from flemme_manager.main import app
from flemme_manager.schemas import (
    ExpectedResult,
    ManagerAssessment,
    MissionCoherenceError,
    MissionStatus,
    MissingInformation,
    QualificationQuestion,
    SelectedWorkflow,
    ServiceCategory,
    UserFacingResponse,
    WorkflowId,
    validate_manager_assessment,
)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(manager.settings, "service_key", "test-service")
    monkeypatch.setattr(manager.settings, "openai_api_key", "test-key")
    return TestClient(app, headers={"X-Flemme-Service-Key": "test-service"})


@pytest.fixture
def stub_agent(monkeypatch):
    monkeypatch.setattr(manager.settings, "openai_api_key", "test-key")
    calls = []

    def return_assessment(assessment):
        async def fake_run(request_text):
            calls.append(request_text)
            return assessment

        monkeypatch.setattr(manager, "_run_agent", fake_run)

    return return_assessment, calls


def make_assessment(
    *,
    category,
    workflow_id,
    status,
    missing=(),
    questions=(),
    human_required=False,
):
    return ManagerAssessment(
        service_category=category,
        expected_result=ExpectedResult(description="Un résultat concret demandé."),
        selected_workflow=SelectedWorkflow(
            workflow_id=workflow_id,
            reason="Le workflow correspond à la demande.",
        ),
        missing_information=list(missing),
        qualification_questions=list(questions),
        mission_status=status,
        human_intervention_required=human_required,
        user_response=UserFacingResponse(message="Je m'en occupe après ces précisions."),
    )


def test_manager_returns_ready_mission_for_precise_request(client, stub_agent):
    assessment = make_assessment(
        category=ServiceCategory.QUOTE_COMPARISON,
        workflow_id=WorkflowId.COMPARER_DEVIS,
        status=MissionStatus.READY,
    )
    set_result, calls = stub_agent
    set_result(assessment)

    response = client.post(
        "/api/manager/analyze",
        json={"request": "Compare ces deux devis de déménagement."},
    )

    assert response.status_code == 200
    assert response.json()["mission_status"] == "ready"
    assert response.json()["selected_workflow"]["workflow_id"] == "comparer_devis"
    assert calls == ["Compare ces deux devis de déménagement."]


def test_manager_asks_for_missing_information(client, stub_agent):
    assessment = make_assessment(
        category=ServiceCategory.SERVICE_PROVIDER,
        workflow_id=WorkflowId.TROUVER_PRESTATAIRE,
        status=MissionStatus.NEEDS_INFORMATION,
        missing=[
            MissingInformation(name="location", reason="Délimiter la recherche."),
            MissingInformation(name="budget", reason="Filtrer les options adaptées."),
        ],
        questions=[
            QualificationQuestion(
                question="Dans quelle ville cherches-tu ?",
                why_needed="La recherche est locale.",
                priority=1,
            ),
            QualificationQuestion(
                question="Quel budget souhaites-tu respecter ?",
                why_needed="Le budget filtre les prestataires.",
                priority=2,
            ),
        ],
    )
    set_result, _ = stub_agent
    set_result(assessment)

    response = client.post(
        "/api/manager/analyze",
        json={"request": "Je cherche un plombier."},
    )

    assert response.status_code == 200
    assert response.json()["mission_status"] == "needs_information"
    assert len(response.json()["qualification_questions"]) == 2


def test_manager_marks_request_outside_catalog(client, stub_agent):
    assessment = make_assessment(
        category=ServiceCategory.OTHER,
        workflow_id=None,
        status=MissionStatus.OUT_OF_CATALOG,
    )
    set_result, _ = stub_agent
    set_result(assessment)

    response = client.post(
        "/api/manager/analyze",
        json={"request": "Compose une chanson originale."},
    )

    assert response.status_code == 200
    assert response.json()["mission_status"] == "out_of_catalog"
    assert response.json()["selected_workflow"]["workflow_id"] is None


def test_manager_flags_human_intervention(client, stub_agent):
    assessment = make_assessment(
        category=ServiceCategory.OTHER,
        workflow_id=None,
        status=MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        human_required=True,
    )
    set_result, _ = stub_agent
    set_result(assessment)

    response = client.post(
        "/api/manager/analyze",
        json={"request": "Réserve ce vol avec ma carte bancaire."},
    )

    assert response.status_code == 200
    assert response.json()["mission_status"] == "human_intervention_required"
    assert response.json()["human_intervention_required"] is True


@pytest.mark.parametrize("request_text", ["   ", "x" * 5001])
def test_manager_rejects_empty_or_overlong_input(client, stub_agent, request_text):
    _, calls = stub_agent
    response = client.post("/api/manager/analyze", json={"request": request_text})

    assert response.status_code == 422
    assert calls == []


def test_manager_hides_openai_error_details(client, stub_agent, monkeypatch):
    monkeypatch.setattr(manager.settings, "openai_api_key", "test-key")

    async def fail_with_provider_error(_request_text):
        raise RuntimeError("secret provider diagnostics")

    monkeypatch.setattr(manager, "_run_agent", fail_with_provider_error)
    response = client.post(
        "/api/manager/analyze",
        json={"request": "Aide-moi à trouver un hôtel à Lyon."},
    )

    assert response.status_code == 502
    assert "secret provider diagnostics" not in response.text
    assert "OPENAI_API_KEY" not in response.text


def test_manager_requires_api_key_without_exposing_configuration(client, monkeypatch):
    monkeypatch.setattr(manager.settings, "openai_api_key", "")
    response = client.post(
        "/api/manager/analyze",
        json={"request": "Compare ces deux devis."},
    )

    assert response.status_code == 503
    assert "OPENAI_API_KEY" not in response.text


def test_agent_uses_structured_output_and_has_no_tools():
    assert manager.manager_agent.output_type is ManagerAssessment
    assert manager.manager_agent.tools == []
    assert manager.manager_agent.model == manager.settings.openai_model
    assert "assistant principal de Flemme.org" in manager.manager_agent.instructions
    assert "aucun outil ne permet réellement cette action" in manager.manager_agent.instructions
    assert "la sécurité passe avant la qualification" in manager.manager_agent.instructions


def test_workflow_id_is_limited_to_catalog():
    with pytest.raises(ValidationError):
        SelectedWorkflow(workflow_id="unknown_workflow", reason="Pas au catalogue.")


def test_sdk_runner_accepts_structured_output_without_network(monkeypatch):
    assessment = make_assessment(
        category=ServiceCategory.QUOTE_COMPARISON,
        workflow_id=WorkflowId.COMPARER_DEVIS,
        status=MissionStatus.READY,
    )

    async def fake_runner(_runner, agent, request_text, **kwargs):
        assert agent is manager.manager_agent
        assert request_text == "Compare ces devis."
        return SimpleNamespace(final_output=assessment)

    monkeypatch.setattr(manager.Runner, "run", classmethod(fake_runner))

    result = asyncio.run(manager._run_agent("Compare ces devis."))

    assert result == assessment


@pytest.mark.parametrize(
    ("category", "workflow_id", "status", "human_required"),
    [
        (
            ServiceCategory.OTHER,
            None,
            MissionStatus.OUT_OF_CATALOG,
            False,
        ),
        (
            ServiceCategory.OTHER,
            None,
            MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            True,
        ),
        (
            ServiceCategory.SERVICE_PROVIDER,
            WorkflowId.TROUVER_PRESTATAIRE,
            MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            True,
        ),
    ],
)
def test_out_of_catalog_human_and_urgent_shapes_are_coherent(
    category,
    workflow_id,
    status,
    human_required,
):
    assessment = make_assessment(
        category=category,
        workflow_id=workflow_id,
        status=status,
        human_required=human_required,
    )

    serialized = assessment.model_dump_json()
    parsed = ManagerAssessment.model_validate_json(serialized)

    assert parsed == assessment
    assert validate_manager_assessment(parsed) is parsed


def test_incoherent_category_workflow_pair_is_rejected_not_corrected():
    assessment = make_assessment(
        category=ServiceCategory.SERVICE_PROVIDER,
        workflow_id=WorkflowId.ORGANISER_VOYAGE,
        status=MissionStatus.READY,
    )

    with pytest.raises(MissionCoherenceError, match="requires workflow"):
        validate_manager_assessment(assessment)


def test_api_signals_incoherent_model_output_as_invalid(client, monkeypatch):
    invalid_assessment = make_assessment(
        category=ServiceCategory.SERVICE_PROVIDER,
        workflow_id=WorkflowId.ORGANISER_VOYAGE,
        status=MissionStatus.READY,
    )

    async def return_invalid_output(_request_text):
        return invalid_assessment

    monkeypatch.setattr(manager, "_run_agent", return_invalid_output)
    response = client.post(
        "/api/manager/analyze",
        json={"request": "Trouve un plombier."},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "La demande n'a pas pu être analysée. Réessaie plus tard."