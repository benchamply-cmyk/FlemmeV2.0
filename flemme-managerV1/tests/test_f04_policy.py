import pytest
from fastapi.testclient import TestClient
from flemme_manager.agents import manager
from flemme_manager.main import app


@pytest.mark.parametrize("request_text,status", [
    ("Aide-moi a comparer des lave-linge de 60 cm, moins de 600 euros, silencieux et economes en energie.", "ready"),
    ("Compare des lave-linge de 60 cm pour 600 € sans marque préférée.", "ready"),
    ("Compare des lave-linge de 60 cm silencieux et économes.", "needs_information"),
])
def test_f04_qualification_without_api(request_text, status, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("API must not be called")
    monkeypatch.setattr(manager, "_run_agent", forbidden)
    monkeypatch.setattr(manager.settings, "openai_api_key", None)
    response = TestClient(app).post("/api/manager/analyze", json={"request": request_text})
    assert response.status_code == 200
    body = response.json()
    assert body["service_category"] == "product_research"
    assert body["selected_workflow"]["workflow_id"] == "rechercher_produit"
    assert body["mission_status"] == status
    assert body["human_intervention_required"] is False
    assert "Aucun modèle ni prix n'a été vérifié" in body["user_response"]["message"]
    if status == "ready":
        assert body["qualification_questions"] == []
        assert body["missing_information"] == []
    else:
        assert [item["name"] for item in body["missing_information"]] == ["budget"]
        assert len(body["qualification_questions"]) == 1
        assert "budget" in body["qualification_questions"][0]["question"]
