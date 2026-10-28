"""
MQTT Camera Client for Agri-Rover ESP32-CAM Node:
Subscribes to camera image topic, triggers captures over cam/cmd,
reassembles multi-part chunks, and tracks rover/camera status.
"""

import json
import logging
import os
import ssl
import sys
import threading
import time
import uuid
from typing import Any, Dict, Optional

import paho.mqtt.client as mqtt

from app.config import (
    MQTT_BROKER,
    MQTT_PORT,
    MQTT_USER,
    MQTT_PASS,
    ROVER_ID,
)

logger = logging.getLogger("agrirover.mqtt_camera")


class CameraClientError(Exception):
    """Base exception for camera communication failures."""
    pass


class CameraTimeoutError(CameraClientError):
    """Raised when camera capture times out."""
    pass


class CameraConnectionError(CameraClientError):
    """Raised when connection to MQTT broker fails."""
    pass


class MqttCameraClient:
    """MQTT Camera client managing request-response capture via EMQX."""

    def __init__(
        self,
        broker: str = MQTT_BROKER,
        port: int = MQTT_PORT,
        user: str = MQTT_USER,
        password: str = MQTT_PASS,
        rover_id: str = ROVER_ID,
        auto_start: bool = True
    ):
        self.broker = broker
        self.port = port
        self.user = user
        self.password = password
        self.rover_id = rover_id

        # Topics
        self.topic_prefix = f"agrirover/{self.rover_id}/"
        self.cam_cmd_topic = f"{self.topic_prefix}cam/cmd"
        self.cam_status_topic = f"{self.topic_prefix}cam/status"
        self.rover_status_topic = f"{self.topic_prefix}status"

        # Connection & online statuses
        self.is_broker_connected = False
        self.is_rover_online = False
        self.is_camera_online = False

        # In-flight capture request tracking: {rid: {"event": Event, "chunks": {}, "total": None, "raw": None}}
        self._pending_captures: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

        # Initialize Paho MQTT client
        client_id = f"agrirover_backend_{uuid.uuid4().hex[:6]}"
        try:
            # Paho MQTT v2 API
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=client_id,
                clean_session=True
            )
        except (AttributeError, TypeError):
            # Fallback for Paho MQTT v1
            self.client = mqtt.Client(
                client_id=client_id,
                clean_session=True
            )

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        # TLS configuration
        if self.port in (8883, 8083, 8084):
            context = ssl.create_default_context()
            self.client.tls_set_context(context)

        if self.user:
            self.client.username_pw_set(self.user, self.password)

        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

        is_testing = os.getenv("TESTING") == "1" or "pytest" in sys.modules
        if auto_start and not is_testing:
            self.start()

    def start(self):
        """Start background MQTT network loop in a non-blocking daemon thread."""
        def _connect_worker():
            try:
                logger.info(f"Connecting to MQTT Broker {self.broker}:{self.port} as '{self.user}'...")
                self.client.connect(self.broker, self.port, keepalive=15)
                self.client.loop_start()
            except Exception as e:
                logger.warning(f"Could not connect to MQTT broker ({e}). Will retry automatically in background.")

        t = threading.Thread(target=_connect_worker, daemon=True)
        t.start()

    def stop(self):
        """Disconnect and stop background loop."""
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception as e:
            logger.warning(f"Error stopping MQTT client: {e}")

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        rc_code = rc if isinstance(rc, int) else getattr(rc, "value", rc)
        if rc_code == 0:
            self.is_broker_connected = True
            logger.info(f"[MQTT] Connected successfully to {self.broker}:{self.port}")
            # Subscribe to status topics
            client.subscribe(self.rover_status_topic, qos=1)
            client.subscribe(self.cam_status_topic, qos=1)
        else:
            self.is_broker_connected = False
            logger.error(f"[MQTT] Connect failed with code {rc_code}")

    def _on_disconnect(self, client, userdata, rc=None, *args, **kwargs):
        self.is_broker_connected = False
        logger.warning(f"[MQTT] Disconnected from broker (rc={rc}). Reconnecting in background...")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload

        # 1. Rover status topic
        if topic == self.rover_status_topic:
            try:
                data = json.loads(payload.decode("utf-8"))
                self.is_rover_online = bool(data.get("online", False))
                logger.info(f"[MQTT] Rover status updated: online={self.is_rover_online}")
            except Exception as e:
                logger.debug(f"Error parsing rover status: {e}")
            return

        # 2. Camera status topic
        if topic == self.cam_status_topic:
            try:
                data = json.loads(payload.decode("utf-8"))
                self.is_camera_online = bool(data.get("online", False))
                logger.info(f"[MQTT] Camera status updated: online={self.is_camera_online}")
            except Exception as e:
                logger.debug(f"Error parsing camera status: {e}")
            return

        # 3. Camera image capture topic: agrirover/{id}/cam/img/{rid}
        img_topic_prefix = f"{self.topic_prefix}cam/img/"
        if topic.startswith(img_topic_prefix):
            rid = topic[len(img_topic_prefix):]
            self._handle_image_payload(rid, payload)

    def _handle_image_payload(self, rid: str, payload: bytes):
        with self._lock:
            if rid not in self._pending_captures:
                return
            req = self._pending_captures[rid]

            # Check if chunked: CHUNK|<rid>|<index>|<total>|\n<bytes>
            if payload.startswith(b"CHUNK|"):
                try:
                    newline_pos = payload.find(b"\n")
                    if newline_pos != -1:
                        header_str = payload[:newline_pos].decode("utf-8")
                        parts = header_str.split("|")
                        if len(parts) >= 4 and parts[0] == "CHUNK":
                            chunk_index = int(parts[2])
                            total_chunks = int(parts[3])
                            chunk_data = payload[newline_pos + 1:]

                            req["chunks"][chunk_index] = chunk_data
                            req["total"] = total_chunks

                            # Check if all chunks received
                            if len(req["chunks"]) == total_chunks:
                                req["event"].set()
                            return
                except Exception as e:
                    logger.warning(f"Error parsing chunk header: {e}")

            # Single unchunked payload
            req["raw"] = payload
            req["event"].set()

    def capture(self, led: bool = False, timeout: float = 5.0) -> bytes:
        """
        Trigger single photo capture over MQTT and wait for JPEG bytes.
        Supports single-message streaming publish and multi-part 16 KB chunks.
        """
        if not self.is_broker_connected:
            raise CameraConnectionError("Backend MQTT client is not connected to broker.")

        rid = f"req_{uuid.uuid4().hex[:8]}"
        img_topic = f"{self.topic_prefix}cam/img/{rid}"
        event = threading.Event()

        with self._lock:
            self._pending_captures[rid] = {
                "event": event,
                "chunks": {},
                "total": None,
                "raw": None
            }

        # Subscribe to expected photo topic
        self.client.subscribe(img_topic, qos=0)

        try:
            # Optional flash LED trigger
            if led:
                self.client.publish(self.cam_cmd_topic, json.dumps({"cmd": "led", "on": True}), qos=0)
                time.sleep(0.15)

            # Publish capture command
            cmd_payload = json.dumps({"cmd": "capture", "rid": rid})
            self.client.publish(self.cam_cmd_topic, cmd_payload, qos=0)

            # Wait for reception
            completed = event.wait(timeout=timeout)

            # Turn off LED if it was turned on
            if led:
                self.client.publish(self.cam_cmd_topic, json.dumps({"cmd": "led", "on": False}), qos=0)

            if not completed:
                raise CameraTimeoutError(
                    f"Timeout ({timeout}s) waiting for camera image on topic '{img_topic}'"
                )

            with self._lock:
                req = self._pending_captures.get(rid, {})

            # Reassemble data
            if req.get("raw") is not None:
                return req["raw"]

            chunks = req.get("chunks", {})
            total = req.get("total")
            if total is not None and len(chunks) == total:
                # Concatenate chunks strictly in index order
                ordered = [chunks[i] for i in range(total)]
                return b"".join(ordered)

            raise CameraClientError(f"Incomplete chunks received for request {rid}")

        finally:
            self.client.unsubscribe(img_topic)
            with self._lock:
                self._pending_captures.pop(rid, None)

    def set_led(self, on: bool) -> Dict[str, Any]:
        """Toggle flash illumination LED via MQTT."""
        payload = json.dumps({"cmd": "led", "on": bool(on)})
        self.client.publish(self.cam_cmd_topic, payload, qos=0)
        return {"ok": True, "led": 1 if on else 0}


# Global singleton instance
mqtt_camera = MqttCameraClient()

