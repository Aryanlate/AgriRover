#!/usr/bin/env python3
"""
Agri-Rover CLI Capture Utility:
Captures images from ESP32-CAM and saves them directly to raw/rover/inbox/<class>/.
Menu options: 1) leaf_healthy, 2) leaf_diseased. (Two classes only, no background).
"""

import argparse
from datetime import datetime
from pathlib import Path
import sys
import urllib.request

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
ROVER_INBOX = ML_DIR / "dataset" / "raw" / "rover" / "inbox"

CLASSES = [
    "leaf_healthy",
    "leaf_diseased"
]


def capture_from_camera(camera_ip: str, target_class: str, plant_id: str = "T01"):
    url = f"http://{camera_ip}/capture"
    print(f"Connecting to ESP32-CAM at {url}...")
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = response.read()
    except Exception as e:
        print(f"[ERROR] Failed to fetch frame from ESP32-CAM: {e}")
        return False

    dest_dir = ROVER_INBOX / target_class
    dest_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"rover_crop_{target_class}_{plant_id}_{timestamp}.jpg"
    dest_path = dest_dir / filename

    with open(dest_path, "wb") as f:
        f.write(data)

    print(f"[SUCCESS] Captured and saved -> {dest_path}")
    return True


def main():
    parser = argparse.ArgumentParser(description="CLI Camera Capture for Agri-Rover")
    parser.add_argument("--ip", default="192.168.4.1", help="ESP32-CAM IP address")
    parser.add_argument("--plant-id", default="P01", help="Plant ID identifier")
    args = parser.parse_args()

    print("=" * 50)
    print("AGRI-ROVER CLI CAPTURE (TWO-CLASS ONLY)")
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

    capture_from_camera(args.ip, selected_class, args.plant_id)


if __name__ == "__main__":
    main()
