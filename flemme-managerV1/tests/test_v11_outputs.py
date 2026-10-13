import pytest
from flemme_manager.schemas import MissionCoherenceError, validate_manager_assessment
from test_manager import make_assessment


@pytest.mark.parametrize("message", [
    "Je vais chercher un plombier.", "J’ai réservé le vol.",
    "Le message a été envoyé.", "Je peux appeler le prestataire.",
])
def test_unsupported_model_action_is_rejected(message):
    assessment = make_assessment(category="travel", workflow_id="organiser_voyage", status="ready")
    assessment.user_response.message = message
    with pytest.raises(MissionCoherenceError, match="external execution"):
        validate_manager_assessment(assessment)


@pytest.mark.parametrize("message", [
    "Je ne peux pas réserver. Aucun billet n'a été réservé.",
    "Ton projet est qualifié ; je peux préparer un brief.",
])
def test_honest_limits_and_qualification_remain_valid(message):
    assessment = make_assessment(category="travel", workflow_id="organiser_voyage", status="ready")
    assessment.user_response.message = message
    assert validate_manager_assessment(assessment) is assessment


def test_duplicate_question_priorities_are_rejected():
    assessment = make_assessment(category="travel", workflow_id="organiser_voyage", status="needs_information",
        missing=[{"name": "dates", "reason": "Période nécessaire"}],
        questions=[{"question": "Quelles dates ?", "why_needed": "Période", "priority": 1},
                   {"question": "Quel budget ?", "why_needed": "Budget", "priority": 1}])
    with pytest.raises(MissionCoherenceError, match="priorities"):
        validate_manager_assessment(assessment)


def test_invalid_model_output_returns_502_once_without_retry(monkeypatch):
    from fastapi.testclient import TestClient
    from flemme_manager.agents import manager
    from flemme_manager.main import app
    calls = []
    async def fake_run(text):
        calls.append(text)
        result = make_assessment(category="travel", workflow_id="organiser_voyage", status="ready")
        result.user_response.message = "Je vais réserver le billet."
        return result
    monkeypatch.setattr(manager.settings, "openai_api_key", "fake-offline-key")
    monkeypatch.setattr(manager, "_run_agent", fake_run)
    response = TestClient(app).post("/api/manager/analyze", json={"request": "Prépare mon voyage à Rome."})
    assert response.status_code == 502
    assert len(calls) == 1
    assert "external execution" not in response.text


def test_claim_of_no_risk_does_not_override_water_electricity_safety():
    from flemme_manager.schemas import UserRequest
    from flemme_manager.services.qualification_policy import qualify_locally
    assessment = qualify_locally(UserRequest(request="L'eau coule près de la prise, sans danger selon moi."))
    assert assessment.mission_status == "human_intervention_required"
    assert assessment.user_response.message.startswith("Éloigne-toi")


def test_human_intervention_cannot_collect_contract_or_booking_details():
    assessment = make_assessment(category="travel", workflow_id="organiser_voyage",
        status="human_intervention_required", human_required=True,
        missing=[{"name": "paiement", "reason": "Réservation"}],
        questions=[{"question": "Quel paiement ?", "why_needed": "Réservation", "priority": 1}])
    with pytest.raises(MissionCoherenceError, match="must not be delayed"):
        validate_manager_assessment(assessment)


@pytest.mark.parametrize("category,workflow", [
    ("quote_comparison", "comparer_devis"), ("service_provider", "trouver_prestataire"),
    ("product_research", "rechercher_produit"), ("travel", "organiser_voyage"),
])
def test_all_catalog_routes_keep_ready_as_qualification(category, workflow):
    assessment = make_assessment(category=category, workflow_id=workflow, status="ready")
    assert validate_manager_assessment(assessment) is assessment
