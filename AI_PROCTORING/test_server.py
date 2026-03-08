import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-proctoring"
    assert "sessions_active" in data

def test_process_frame_missing_image():
    # Test with no image data to trigger error
    response = client.post("/process_frame", json={
        "image": "",
        "session_id": "test_session_1",
        "exam_id": "test_exam_1"
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "No image data"

def test_process_frame_invalid_image():
    # Test with invalid base64 image
    response = client.post("/process_frame", json={
        "image": "not_a_valid_image_string",
        "session_id": "test_session_2"
    })
    assert response.status_code == 500 or response.status_code == 400

def test_process_frame():
    # Create a 1x1 black pixel base64 string
    # "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" is a 1x1 png
    dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    
    response = client.post("/process_frame", json={
        "image": dummy_b64,
        "session_id": "test_session_3",
        "exam_id": "test_exam_3"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "face_count" in data
    assert "suspicion_score" in data
    assert "risk_level" in data
