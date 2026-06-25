import os

HOST = os.getenv("STT_HOST", "0.0.0.0")
PORT = int(os.getenv("STT_PORT", "8002"))
MODEL_ID = os.getenv("STT_MODEL", "iic/SenseVoiceSmall")
DEVICE = os.getenv("STT_DEVICE", "cpu")
