import base64
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .config import HOST, PORT
from .providers.sensevoice import SenseVoiceProvider

provider = SenseVoiceProvider()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await provider.load()
    yield


app = FastAPI(title="STT Server", lifespan=lifespan)


class TranscribeRequest(BaseModel):
    audio: str
    sample_rate: int = 16000
    language: str = "zh"


class TranscribeResponse(BaseModel):
    text: str
    duration_ms: int


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest):
    try:
        audio_bytes = base64.b64decode(req.audio)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid base64 audio")

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="audio is empty")

    start = time.time()
    text = await provider.transcribe(audio_bytes, req.sample_rate, req.language)
    duration_ms = int((time.time() - start) * 1000)
    return TranscribeResponse(text=text, duration_ms=duration_ms)


def main():
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
