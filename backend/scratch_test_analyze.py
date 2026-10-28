import urllib.request
from pathlib import Path

file_path = Path("../ml/dataset/test/leaf_healthy/leaf_healthy_IMG_02_0.jpg")
with open(file_path, "rb") as f:
    content = f.read()

boundary = "----TestBoundary12345"
parts = [
    f"--{boundary}\r\n".encode("utf-8"),
    b'Content-Disposition: form-data; name="file"; filename="test_healthy.jpg"\r\n',
    b"Content-Type: image/jpeg\r\n\r\n",
    content,
    f"\r\n--{boundary}--\r\n".encode("utf-8")
]
body = b"".join(parts)

req = urllib.request.Request("http://127.0.0.1:8000/api/analyze?save=true", data=body, method="POST")
req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

with urllib.request.urlopen(req) as resp:
    print(resp.read().decode("utf-8"))
