import numpy as np
import re
from funasr import AutoModel

from .base import STTProvider
from ..config import MODEL_ID, DEVICE


class SenseVoiceProvider(STTProvider):
    def __init__(self) -> None:
        self._model = None

    async def load(self) -> None:
        self._model = AutoModel(
            model=MODEL_ID,
            trust_remote_code=True,
            device=DEVICE,
            disable_update=True,
        )

    async def transcribe(self, audio: bytes, sample_rate: int, language: str) -> str:
        if self._model is None:
            raise RuntimeError("model not loaded")
        audio_np = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
        result = self._model.generate(
            input=audio_np,
            cache={},
            language=language,
            use_itn=True,
        )
        if not result or not result[0]:
            return ""
        text = result[0].get("text", "")
        return clean_sensevoice_text(text)


def clean_sensevoice_text(text: str) -> str:
    return re.sub(r"<\|[^|]+?\|>", "", text).strip()
