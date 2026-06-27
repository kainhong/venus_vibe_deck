import os
from pathlib import Path

_PROJECT_ROOT = str(Path(__file__).resolve().parents[2])
os.environ.setdefault("MODELSCOPE_CACHE", _PROJECT_ROOT)

HOST = os.getenv("STT_HOST", "0.0.0.0")
PORT = int(os.getenv("STT_PORT", "8002"))
MODEL_ID = os.getenv("STT_MODEL", "iic/SenseVoiceSmall")
DEVICE = os.getenv("STT_DEVICE", "cpu")
