#!/usr/bin/env python3
"""Compare local stt-server and Aliyun realtime ASR with the same wav file.

Run from stt-server:
  .venv/bin/python test/test_asr.py
  .venv/bin/python test/test_asr.py data/voice/2026-06-27T12-09-13.wav
  .venv/bin/python test/test_asr.py --expected "打开设置"

Cloud ASR config is read from test/.env.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import websockets


ROOT = Path(__file__).resolve().parents[1]
TEST_ENV_FILE = ROOT / "test" / ".env"
DEFAULT_VOICE_DIR = ROOT / "data" / "voice"
DEFAULT_LOCAL_URL = "http://127.0.0.1:7000/transcribe"


@dataclass
class AsrResult:
    name: str
    text: str
    elapsed_ms: int
    detail: str = ""


def main() -> int:
    load_env_file(TEST_ENV_FILE)
    args = parse_args()
    audio_path = resolve_audio_path(args.audio)
    pcm, sample_rate, duration = read_wav_pcm(audio_path)

    print(f"Audio: {audio_path}")
    print(f"Sample rate: {sample_rate} Hz")
    print(f"Duration: {duration:.3f}s")
    print()

    results: list[AsrResult] = []

    if not args.skip_local:
        results.append(run_local_asr(pcm, sample_rate, args.language, args.local_url, args.timeout))

    if not args.skip_cloud:
        results.append(asyncio.run(run_cloud_asr(pcm, sample_rate, args.language, args.timeout)))

    for result in results:
        print_result(result, args.expected)

    if len(results) >= 2:
        print_comparison(results[0], results[1])

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare stt-server and Aliyun ASR with a wav file.")
    parser.add_argument(
        "audio",
        nargs="?",
        help="Wav file path. Defaults to the latest .wav under data/voice.",
    )
    parser.add_argument("--local-url", default=os.getenv("STT_TEST_LOCAL_URL", DEFAULT_LOCAL_URL))
    parser.add_argument("--language", default=os.getenv("STT_TEST_LANGUAGE", "zh"))
    parser.add_argument("--timeout", type=float, default=float(os.getenv("STT_TEST_TIMEOUT", "120")))
    parser.add_argument("--expected", default=os.getenv("STT_TEST_EXPECTED", ""))
    parser.add_argument("--skip-local", action="store_true", help="Only run Aliyun ASR.")
    parser.add_argument("--skip-cloud", action="store_true", help="Only run local stt-server.")
    return parser.parse_args()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text("utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def resolve_audio_path(value: str | None) -> Path:
    if value:
        path = Path(value)
        if not path.is_absolute():
            path = ROOT / path
        if not path.exists():
            raise SystemExit(f"Audio file not found: {path}")
        return path

    files = sorted(DEFAULT_VOICE_DIR.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise SystemExit(f"No wav files found under {DEFAULT_VOICE_DIR}")
    return files[0]


def read_wav_pcm(path: Path) -> tuple[bytes, int, float]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        frames = wav.getnframes()
        pcm = wav.readframes(frames)

    if channels != 1:
        raise SystemExit(f"Only mono wav is supported, got channels={channels}")
    if sample_width != 2:
        raise SystemExit(f"Only 16-bit PCM wav is supported, got sample_width={sample_width}")

    return pcm, sample_rate, frames / sample_rate


def run_local_asr(pcm: bytes, sample_rate: int, language: str, url: str, timeout: float) -> AsrResult:
    started = time.time()
    payload = {
        "audio": base64.b64encode(pcm).decode("ascii"),
        "sample_rate": sample_rate,
        "language": language,
    }
    try:
        data = post_json(url, payload, timeout)
        elapsed_ms = round((time.time() - started) * 1000)
        return AsrResult(
            name="local-stt-server",
            text=str(data.get("text", "")).strip(),
            elapsed_ms=elapsed_ms,
            detail=f"url={url}, server_duration={data.get('duration_ms')}ms",
        )
    except Exception as exc:
        elapsed_ms = round((time.time() - started) * 1000)
        return AsrResult("local-stt-server", "", elapsed_ms, f"failed: {exc}")


def post_json(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code}: {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(str(err)) from err


async def run_cloud_asr(pcm: bytes, sample_rate: int, language: str, timeout: float) -> AsrResult:
    started = time.time()
    try:
        text = await asyncio.wait_for(transcribe_cloud(pcm, sample_rate, language), timeout=timeout)
        elapsed_ms = round((time.time() - started) * 1000)
        return AsrResult(
            name="aliyun-realtime-asr",
            text=text,
            elapsed_ms=elapsed_ms,
            detail=f"model={get_env('VOICE_ASR_MODEL', 'ALIYUN_ASR_MODEL', default='qwen3-asr-flash-realtime')}",
        )
    except Exception as exc:
        elapsed_ms = round((time.time() - started) * 1000)
        return AsrResult("aliyun-realtime-asr", "", elapsed_ms, f"failed: {exc}")


async def transcribe_cloud(pcm: bytes, sample_rate: int, language: str) -> str:
    base_url = get_env("VOICE_ASR_BASE_URL", "ALIYUN_ASR_BASE_URL", default="")
    api_key = get_env("VOICE_ASR_API_KEY", "ALIYUN_ASR_API_KEY", default="")
    model = get_env("VOICE_ASR_MODEL", "ALIYUN_ASR_MODEL", default="qwen3-asr-flash-realtime")
    chunk_bytes = int(get_env("VOICE_ASR_CHUNK_BYTES", "ALIYUN_ASR_CHUNK_BYTES", default="3200"))
    chunk_interval_ms = int(get_env("VOICE_ASR_CHUNK_INTERVAL_MS", "ALIYUN_ASR_CHUNK_INTERVAL_MS", default="40"))

    if not base_url:
        raise RuntimeError("VOICE_ASR_BASE_URL or ALIYUN_ASR_BASE_URL is required in test/.env")
    if not api_key:
        raise RuntimeError("VOICE_ASR_API_KEY or ALIYUN_ASR_API_KEY is required in test/.env")

    url = append_model_query(base_url, model)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1",
    }
    candidates: list[str] = []

    async with websockets.connect(url, additional_headers=headers) as ws:
        await send_event(ws, {
            "event_id": event_id(),
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "input_audio_format": "pcm",
                "sample_rate": sample_rate,
                "input_audio_transcription": {
                    "language": language,
                },
                "turn_detection": None,
            },
        })

        audio_started = False
        async for raw in ws:
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type", "")
            if event_type == "error":
                raise RuntimeError(json.dumps(event, ensure_ascii=False))

            candidates.extend(collect_transcripts(event))

            if not audio_started and event_type in ("session.updated", "session.created"):
                audio_started = True
                await stream_audio(ws, pcm, chunk_bytes, chunk_interval_ms)

            if is_final_transcript_event(event):
                transcript = longest(collect_transcripts(event))
                if transcript:
                    return transcript

    transcript = longest(candidates)
    if not transcript:
        raise RuntimeError("ASR returned empty transcript")
    return transcript


async def stream_audio(ws: Any, pcm: bytes, chunk_bytes: int, chunk_interval_ms: int) -> None:
    chunk_bytes = max(320, chunk_bytes)
    for offset in range(0, len(pcm), chunk_bytes):
        await send_event(ws, {
            "event_id": event_id(),
            "type": "input_audio_buffer.append",
            "audio": base64.b64encode(pcm[offset:offset + chunk_bytes]).decode("ascii"),
        })
        if chunk_interval_ms > 0:
            await asyncio.sleep(chunk_interval_ms / 1000)
    await send_event(ws, {
        "event_id": event_id(),
        "type": "input_audio_buffer.commit",
    })


async def send_event(ws: Any, event: dict[str, object]) -> None:
    await ws.send(json.dumps(event, ensure_ascii=False))


def append_model_query(base_url: str, model: str) -> str:
    parts = urllib.parse.urlsplit(base_url)
    query = dict(urllib.parse.parse_qsl(parts.query))
    query["model"] = model
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment))


def collect_transcripts(value: object, into: list[str] | None = None) -> list[str]:
    if into is None:
        into = []
    if not isinstance(value, dict):
        return into
    for key, child in value.items():
        if key in ("transcript", "text") and isinstance(child, str) and child.strip():
            into.append(child.strip())
        elif isinstance(child, dict):
            collect_transcripts(child, into)
        elif isinstance(child, list):
            for item in child:
                collect_transcripts(item, into)
    return into


def is_final_transcript_event(event: dict[str, object]) -> bool:
    event_type = event.get("type")
    return isinstance(event_type, str) and re.search(r"transcription.*(completed|done)|transcript.*done|completed$", event_type) is not None


def longest(values: list[str]) -> str:
    return max((value.strip() for value in values if value.strip()), key=len, default="")


def event_id() -> str:
    return f"event_{int(time.time() * 1000)}_{os.urandom(4).hex()}"


def get_env(*keys: str, default: str) -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return default


def print_result(result: AsrResult, expected: str) -> None:
    print(f"== {result.name} ==")
    print(f"Elapsed: {result.elapsed_ms}ms")
    if result.detail:
        print(f"Detail: {result.detail}")
    print("Transcript:")
    print(result.text or "<empty>")
    if expected and result.text:
        print_quality(expected, result.text)
    print()


def print_comparison(left: AsrResult, right: AsrResult) -> None:
    similarity = SequenceMatcher(None, normalize_text(left.text), normalize_text(right.text)).ratio()
    distance = levenshtein(normalize_text(left.text), normalize_text(right.text))
    print("== comparison ==")
    print(f"{left.name} vs {right.name}")
    print(f"Similarity: {similarity:.2%}")
    print(f"Edit distance: {distance}")


def print_quality(expected: str, actual: str) -> None:
    expected_norm = normalize_text(expected)
    actual_norm = normalize_text(actual)
    distance = levenshtein(expected_norm, actual_norm)
    cer = distance / max(1, len(expected_norm))
    similarity = SequenceMatcher(None, expected_norm, actual_norm).ratio()
    print("Quality:")
    print(f"Expected: {expected}")
    print(f"CER: {cer:.2%}")
    print(f"Similarity: {similarity:.2%}")


def normalize_text(value: str) -> str:
    return "".join(ch for ch in value.strip().lower() if not ch.isspace())


def levenshtein(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for i, char_left in enumerate(left, 1):
        current = [i]
        for j, char_right in enumerate(right, 1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (char_left != char_right),
                )
            )
        previous = current
    return previous[-1]


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(130)
