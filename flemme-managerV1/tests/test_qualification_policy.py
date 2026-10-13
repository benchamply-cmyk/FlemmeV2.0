import pytest
from fastapi.testclient import TestClient

from flemme_manager.agents import manager
from flemme_manager.main import app
from flemme_manager.schemas import UserRequest
from flemme_manager.services.qualification_policy import qualify_locally
from functional_scenarios import SCENARIOS


@pytest.mark.parametrize("scenario", [s for s in SCENARIOS if s.scenario_id in
                                       ("F03", "F06", "F07", "F08", "F09", "F10")],
                         ids=lambda s: s.scenario_id)
def test_regressions_use_real_policy_without_model(scenario, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("The model must not be called for deterministic scenarios")

    monkeypatch.setattr(manager, "_run_agent", forbidden)
    monkeypatch.setattr(manager.settings, "openai_api_key", None)
    response = TestClient(app).post("/api/manager/analyze", json={"request": scenario.request})
    assert response.status_code == 200
    body = response.json()
    assert body["service_category"] == scenario.category
    assert body["selected_workflow"]["workflow_id"] == scenario.workflow
    assert body["mission_status"] == scenario.status
    assert body["qualification_questions"] == []
    assert body["missing_information"] == []
    if scenario.scenario_id == "F08":
        assert body["user_response"]["message"].startswith("Éloigne-toi")
        assert "Contacte toi-même" in body["user_response"]["message"]
    if scenario.scenario_id == "F07":
        assert "professionnel du droit" in body["user_response"]["message"]


@pytest.mark.parametrize("text", [
    "Je cherche un plombier.",
    "Je cherche un plombier à Nantes, cette semaine, pour une fuite.",
    "Je cherche un plombier à Nantes, cette semaine, budget 150 euros, urgence fuite.",
    "Aucune eau près d'une prise, je cherche un plombier.",
    "Compare ces deux devis de plomberie.",
])
def test_partial_or_unrecognised_requests_still_use_model(text):
    assert qualify_locally(UserRequest(request=text)) is None


def test_accents_case_and_safety_override_other_intents():
    request = UserRequest(request="ÉCRIS une chanson : L'EAU coule près d'une PRISE !")
    result = qualify_locally(request)
    assert result.mission_status == "human_intervention_required"
    assert result.qualification_questions == []


def test_network_is_blocked():
    import socket
    with pytest.raises(AssertionError, match="Network access forbidden"):
        socket.create_connection(("example.com", 443))


@pytest.mark.parametrize("text", [
    "Réserve ce vol avec ma carte bancaire.",
    "Réservez un hôtel à Rome.",
    "Envoie un SMS au plombier.",
    "Appelle un plombier demain.",
])
def test_external_execution_never_collects_data_or_calls_model(text, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("No model or external action is allowed")
    monkeypatch.setattr(manager, "_run_agent", forbidden)
    monkeypatch.setattr(manager.settings, "openai_api_key", None)
    response = TestClient(app).post("/api/manager/analyze", json={"request": text})
    assert response.status_code == 200
    body = response.json()
    assert body["mission_status"] == "human_intervention_required"
    assert body["human_intervention_required"] is True
    assert body["qualification_questions"] == []
    assert body["missing_information"] == []
    assert "je ne peux pas" in body["user_response"]["message"].lower()


@pytest.mark.parametrize("text", [
    "Prépare un message à envoyer au plombier.",
    "Compare les conditions de réservation de ces hôtels.",
    "Ne réserve pas de billet pour Rome.",
    "N'envoie pas de message au plombier.",
])
def test_mentions_drafts_and_negations_do_not_trigger_execution_rules(text):
    assert qualify_locally(UserRequest(request=text)) is None


def test_local_output_round_trip_and_long_input():
    from flemme_manager.schemas import ManagerAssessment, validate_manager_assessment
    result = qualify_locally(UserRequest(request="Envoie un message au plombier. " + "x" * 4500))
    parsed = ManagerAssessment.model_validate_json(result.model_dump_json())
    assert validate_manager_assessment(parsed) == result
