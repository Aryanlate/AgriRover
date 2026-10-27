"""
Startup script for Agri-Rover FastAPI backend.
Runs Uvicorn server on port 8000 with auto-reload.
"""

import sys
import uvicorn

if __name__ == "__main__":
    print("=" * 60)
    print(" Starting Agri-Rover Backend Server")
    print(" URL: http://localhost:8000")
    print(" API Docs: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
