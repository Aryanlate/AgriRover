"""
Unit and Integration Tests for MQTT Camera Client and Health Check:
- Success single message capture
- Chunk reassembly (including out-of-order chunks)
- Timeout error handling
- GET /api/health endpoint
"""

import threading
import time
from unittest.mock import MagicMock, patch

import pytest
from app.main import health
from app.mqtt_camera import MqttCameraClient, CameraTimeoutError, CameraConnectionError


def test_mqtt_camera_single_message_success():
    """Test successful capture of single unchunked JPEG message."""
    client = MqttCameraClient(auto_start=False)
    client.is_broker_connected = True

    fake_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200 + b"\xff\xd9"

    def fake_publish(topic, payload, qos=0):
        # When cam/cmd is published with capture, simulate camera response on img topic
        import json
        data = json.loads(payload)
        if data.get("cmd") == "capture":
            rid = data.get("rid")
            img_topic = f"{client.topic_prefix}cam/img/{rid}"

            msg = MagicMock()
            msg.topic = img_topic
            msg.payload = fake_jpeg

            # Simulate message arrival on background thread
            threading.Thread(target=client._on_message, args=(client.client, None, msg)).start()

    client.client.publish = MagicMock(side_effect=fake_publish)
    client.client.subscribe = MagicMock()
    client.client.unsubscribe = MagicMock()

    result_bytes = client.capture(led=False, timeout=1.0)
    assert result_bytes == fake_jpeg


def test_mqtt_camera_chunk_reassembly():
    """Test reassembly of multi-part 16 KB chunks, including out-of-order delivery."""
    client = MqttCameraClient(auto_start=False)
    client.is_broker_connected = True

    chunk0_data = b"AAAA" * 100
    chunk1_data = b"BBBB" * 100
    chunk2_data = b"CCCC" * 100
    expected_full = chunk0_data + chunk1_data + chunk2_data

    def fake_publish(topic, payload, qos=0):
        import json
        data = json.loads(payload)
        if data.get("cmd") == "capture":
            rid = data.get("rid")
            img_topic = f"{client.topic_prefix}cam/img/{rid}"

            # Prepare 3 chunks
            c0 = f"CHUNK|{rid}|0|3|\n".encode("utf-8") + chunk0_data
            c1 = f"CHUNK|{rid}|1|3|\n".encode("utf-8") + chunk1_data
            c2 = f"CHUNK|{rid}|2|3|\n".encode("utf-8") + chunk2_data

            # Simulate delivery out of order: chunk 1, then chunk 2, then chunk 0
            for chunk_payload in [c1, c2, c0]:
                msg = MagicMock()
                msg.topic = img_topic
                msg.payload = chunk_payload
                client._on_message(client.client, None, msg)

    client.client.publish = MagicMock(side_effect=fake_publish)
    client.client.subscribe = MagicMock()
    client.client.unsubscribe = MagicMock()

    result_bytes = client.capture(led=False, timeout=1.0)
    assert result_bytes == expected_full


def test_mqtt_camera_timeout():
    """Test that capture raises CameraTimeoutError when camera does not respond."""
    client = MqttCameraClient(auto_start=False)
    client.is_broker_connected = True

    # No message simulated on publish
    client.client.publish = MagicMock()
    client.client.subscribe = MagicMock()
    client.client.unsubscribe = MagicMock()

    with pytest.raises(CameraTimeoutError) as exc_info:
        client.capture(led=False, timeout=0.2)

    assert "Timeout" in str(exc_info.value)


def test_mqtt_camera_not_connected():
    """Test that capture raises CameraConnectionError if broker is not connected."""
    client = MqttCameraClient(auto_start=False)
    client.is_broker_connected = False

    with pytest.raises(CameraConnectionError):
        client.capture(led=False, timeout=0.5)


def test_api_health_endpoint():
    """Test GET /api/health endpoint structure and fields."""
    data = health()

    assert "broker_connected" in data
    assert "rover_online" in data
    assert "camera_online" in data
    assert "model_mode" in data
    assert data["model_mode"] in ("mock", "real")
