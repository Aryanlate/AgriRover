#!/usr/bin/env python3
"""
Agri-Rover CLI Capture Utility:
Captures images from ESP32-CAM over MQTT (EMQX Cloud TLS) and saves
them directly to raw/rover/inbox/<class>/.
Menu options: 1) leaf_healthy, 2) leaf_diseased. (Two classes only, no background).
"""

import argparse
from datetime import datetime
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.mqtt_camera import mqtt_camera, CameraClientError

ML_DIR = REPO_ROOT / "ml"
ROVER_INBOX = ML_DIR / "dataset" / "raw" / "rover" / "inbox"

CLASSES = [
    "leaf_healthy",
    "leaf_diseased"
]


def capture_from_camera(target_class: str, plant_id: str = "T01", led: bool = False):
    print("Capturing frame from ESP32-CAM via MQTT (TLS port 8883)...")
    try:
        data = mqtt_camera.capture(led=led, timeout=5.0)
    except CameraClientError as e:
        print(f"[ERROR] Failed to fetch frame from ESP32-CAM over MQTT: {e}")
        return False

    dest_dir = ROVER_INBOX / target_class
    dest_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"rover_crop_{target_class}_{plant_id}_{timestamp}.jpg"
    dest_path = dest_dir / filename

    with open(dest_path, "wb") as f:
        f.write(data)

    print(f"[SUCCESS] Captured and saved ({len(data)} bytes) -> {dest_path}")
    return True


def main():
    parser = argparse.ArgumentParser(description="CLI Camera Capture for Agri-Rover via MQTT")
    parser.add_argument("--plant-id", default="P01", help="Plant ID identifier")
    parser.add_argument("--led", action="store_true", help="Enable illumination flash LED during capture")
    args = parser.parse_args()

    print("=" * 50)
    print("AGRI-ROVER CLI CAPTURE (MQTT - TWO-CLASS ONLY)")
    print("=" * 50)
    print("Select target class:")
    for idx, cls in enumerate(CLASSES, 1):
        print(f"  {idx}. {cls}")
    print("  q. Quit")
    print("=" * 50)

    choice = input("Enter choice (1/2/q): ").strip()
    if choice == "1":
        selected_class = "leaf_healthy"
    elif choice == "2":
        selected_class = "leaf_diseased"
    else:
        print("Exiting.")
        return

    capture_from_camera(selected_class, args.plant_id, led=args.led)


if __name__ == "__main__":
    main()
