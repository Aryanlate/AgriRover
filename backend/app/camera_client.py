import httpx
from typing import Optional, Dict, Any

class CameraClientError(Exception):
    """Base exception for camera communication failures."""
    pass

class CameraTimeoutError(CameraClientError):
    """Raised when ESP32-CAM request times out."""
    pass

class CameraConnectionError(CameraClientError):
    """Raised when connection to ESP32-CAM fails."""
    pass

class CameraClient:
    """Client for interacting with the Agri-Rover ESP32-CAM node."""

    def __init__(self, default_ip: str = "192.168.4.1", default_timeout: float = 5.0):
        self.default_ip = default_ip
        self.default_timeout = default_timeout

    def _get_base_url(self, ip: Optional[str] = None) -> str:
        clean_ip = (ip or self.default_ip).strip()
        if not clean_ip.startswith("http://") and not clean_ip.startswith("https://"):
            return f"http://{clean_ip}"
        return clean_ip

    def capture_image(self, ip: Optional[str] = None, timeout: Optional[float] = None) -> bytes:
        """Fetch a JPEG frame via GET /capture."""
        base_url = self._get_base_url(ip)
        url = f"{base_url}/capture"
        t = timeout or self.default_timeout

        try:
            with httpx.Client(timeout=t) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    content = resp.content
                    if not content or len(content) < 100:
                        raise CameraClientError(f"Received empty or truncated frame ({len(content)} bytes) from {url}")
                    return content
                raise CameraClientError(f"Camera returned HTTP {resp.status_code}: {resp.text[:200]}")
        except httpx.TimeoutException as e:
            raise CameraTimeoutError(f"Timeout ({t}s) connecting to ESP32-CAM at {url}") from e
        except httpx.ConnectError as e:
            raise CameraConnectionError(f"Cannot connect to ESP32-CAM at {url}. Verify Wi-Fi and IP.") from e
        except Exception as e:
            if isinstance(e, CameraClientError):
                raise
            raise CameraClientError(f"Unexpected camera error: {str(e)}") from e

    def set_led(self, on: bool, ip: Optional[str] = None, timeout: float = 3.0) -> Dict[str, Any]:
        """Turn the illumination LED on or off via GET /led?on=1 or 0."""
        base_url = self._get_base_url(ip)
        param = "1" if on else "0"
        url = f"{base_url}/led?on={param}"

        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    try:
                        return resp.json()
                    except Exception:
                        return {"ok": True, "led": 1 if on else 0}
                raise CameraClientError(f"Camera LED endpoint returned HTTP {resp.status_code}")
        except httpx.TimeoutException as e:
            raise CameraTimeoutError(f"Timeout setting LED on ESP32-CAM at {url}") from e
        except httpx.ConnectError as e:
            raise CameraConnectionError(f"Cannot connect to ESP32-CAM at {url}") from e
        except Exception as e:
            if isinstance(e, CameraClientError):
                raise
            raise CameraClientError(f"LED control failed: {str(e)}") from e

    def get_status(self, ip: Optional[str] = None, timeout: float = 3.0) -> Dict[str, Any]:
        """Query camera status via GET /status."""
        base_url = self._get_base_url(ip)
        url = f"{base_url}/status"

        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    return resp.json()
                raise CameraClientError(f"Status returned HTTP {resp.status_code}")
        except Exception as e:
            raise CameraClientError(f"Status check failed: {str(e)}") from e

camera_client = CameraClient()
