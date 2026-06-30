import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


def test_cors_allows_localhost_and_127_0_0_1_origins():
    client = TestClient(app)

    for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        response = client.options(
            "/debug",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
