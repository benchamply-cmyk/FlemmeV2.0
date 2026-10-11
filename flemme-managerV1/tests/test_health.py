from fastapi.testclient import TestClient

from flemme_manager.main import app


def test_health_route_returns_ok():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}