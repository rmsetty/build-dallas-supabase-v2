from app.core.config import settings
from fastapi.testclient import TestClient


def test_root_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == settings.SERVICE_NAME


def test_versioned_health(client: TestClient) -> None:
    response = client.get(f"{settings.API_V1_STR}/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == settings.SERVICE_NAME
