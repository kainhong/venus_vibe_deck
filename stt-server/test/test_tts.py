#!/usr/bin/env python3
"""Test Bailian/DashScope TTS and save the synthesized audio.

Run from stt-server:
  .venv/bin/python test/test_tts.py
  .venv/bin/python test/test_tts.py "这是一段语音合成测试。"
  .venv/bin/python test/test_tts.py --output data/tts/demo.mp3

Config is read from test/.env.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
TEST_ENV_FILE = ROOT / "test" / ".env"
APP_SETTINGS_FILE = REPO_ROOT / "server" / "config" / "settings.json"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "output"
DEFAULT_TTS_BASE_URL = # "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"
DEFAULT_TTS_MODEL = "cosyvoice-v3.5-plus"
DEFAULT_TTS_TEXT = "当地时间6月24日傍晚，委内瑞拉北部在40秒内接连遭遇7.2级与7.5级两次强震。这是该国1900年以来最强地震，也是全球首次监测到同一断裂带一分钟内连发两次七级以上地震。本次地震已造成920人遇难、3360人受伤、超5万人失联，数百栋房屋损毁，7名中国公民不幸罹难。灾害损失最高或将占到委内瑞拉GDP的10%，灾后重建与经济修复的双重压力，或将定义委内瑞拉未来的发展轨迹。"


@dataclass
class TtsResult:
    elapsed_ms: int
    output_path: Path
    bytes_written: int
    request_id: str = ""
    detail: str = ""


def main() -> int:
    load_env_file(TEST_ENV_FILE)
    runtime_voice = load_runtime_voice_settings()
    args = parse_args()
    apply_runtime_voice_defaults(args, runtime_voice)
    result = run_tts(args)
    print_result(result, args)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test Bailian/DashScope TTS and save audio.")
    parser.add_argument("text", nargs="?", default=os.getenv("VOICE_TTS_TEXT", DEFAULT_TTS_TEXT))
    parser.add_argument("--base-url", default=os.getenv("VOICE_TTS_BASE_URL", ""))
    parser.add_argument("--api-key", default=get_env("VOICE_TTS_API_KEY", "DASHSCOPE_API_KEY", "VOICE_ASR_API_KEY", default=""))
    parser.add_argument("--model", default=os.getenv("VOICE_TTS_MODEL", ""))
    parser.add_argument("--voice", default=os.getenv("VOICE_TTS_VOICE", ""))
    parser.add_argument("--format", default=os.getenv("VOICE_TTS_FORMAT", ""))
    parser.add_argument("--sample-rate", type=int, default=parse_optional_int(os.getenv("VOICE_TTS_SAMPLE_RATE")))
    parser.add_argument("--rate", default=os.getenv("VOICE_TTS_RATE", ""))
    parser.add_argument("--volume", default=os.getenv("VOICE_TTS_VOLUME", ""))
    parser.add_argument("--pitch", default=os.getenv("VOICE_TTS_PITCH", ""))
    parser.add_argument("--timeout", type=float, default=float(os.getenv("VOICE_TTS_TIMEOUT", "120")))
    parser.add_argument("--output", default=os.getenv("VOICE_TTS_OUTPUT", ""))
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


def load_runtime_voice_settings() -> dict[str, Any]:
    try:
        settings = json.loads(APP_SETTINGS_FILE.read_text("utf-8"))
    except Exception:
        return {}
    runtime = settings.get("runtime")
    if not isinstance(runtime, dict):
        return {}
    voice = runtime.get("voice")
    return voice if isinstance(voice, dict) else {}


def apply_runtime_voice_defaults(args: argparse.Namespace, voice: dict[str, Any]) -> None:
    args.base_url = args.base_url or str(voice.get("ttsBaseUrl") or DEFAULT_TTS_BASE_URL)
    args.model = args.model or str(voice.get("ttsModel") or DEFAULT_TTS_MODEL)
    args.voice = args.voice or str(voice.get("ttsVoice") or "")
    args.format = args.format or str(voice.get("ttsFormat") or "mp3")
    args.sample_rate = args.sample_rate or int(voice.get("ttsSampleRate") or 24000)
    args.rate = args.rate or str(voice.get("ttsRate") or "+0%")
    args.volume = args.volume or str(voice.get("ttsVolume") or "+0%")
    args.pitch = args.pitch or str(voice.get("ttsPitch") or "+0Hz")


def parse_optional_int(value: str | None) -> int | None:
    if not value:
        return None
    return int(value)


def run_tts(args: argparse.Namespace) -> TtsResult:
    if not args.api_key:
        raise SystemExit("VOICE_TTS_API_KEY or DASHSCOPE_API_KEY is required in test/.env")
    if not args.voice:
        raise SystemExit("VOICE_TTS_VOICE is required in test/.env")

    output_path = resolve_output_path(args.output, args.format)
    payload = build_payload(args)
    started = time.time()
    content_type, data = post_json_bytes(args.base_url, payload, args.api_key, args.timeout)
    elapsed_ms = round((time.time() - started) * 1000)

    audio, request_id, detail = extract_audio(content_type, data, args.timeout)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(audio)
    return TtsResult(
        elapsed_ms=elapsed_ms,
        output_path=output_path,
        bytes_written=len(audio),
        request_id=request_id,
        detail=detail,
    )


def build_payload(args: argparse.Namespace) -> dict[str, object]:
    parameters = compact({
        "voice": args.voice,
        "format": args.format,
        "sample_rate": args.sample_rate,
        "rate": args.rate,
        "volume": args.volume,
        "pitch": args.pitch,
    })
    return {
        "model": args.model,
        "input": {
            "text": args.text,
        },
        "parameters": parameters,
    }


def post_json_bytes(url: str, payload: dict[str, object], api_key: str, timeout: float) -> tuple[str, bytes]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "audio/mpeg, audio/wav, application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            content_type = res.headers.get("Content-Type", "")
            return content_type, res.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code}: {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(str(err)) from err


def extract_audio(content_type: str, data: bytes, timeout: float) -> tuple[bytes, str, str]:
    if content_type.startswith("audio/"):
        return data, "", f"content_type={content_type}"

    try:
        body = json.loads(data.decode("utf-8"))
    except json.JSONDecodeError as exc:
        preview = data[:200].decode("utf-8", errors="replace")
        raise RuntimeError(f"Expected audio or JSON response, got content_type={content_type}, body={preview!r}") from exc

    request_id = str(body.get("request_id", ""))
    output = body.get("output")
    if not isinstance(output, dict):
        raise RuntimeError(f"TTS response has no output object: {json.dumps(body, ensure_ascii=False)}")

    audio = find_audio_bytes(output)
    if audio:
        return audio, request_id, "json_audio=base64"

    url = find_audio_url(output)
    if url:
        audio_data = download_bytes(url, timeout)
        return audio_data, request_id, "json_audio=url"

    raise RuntimeError(f"TTS response has no audio payload: {json.dumps(body, ensure_ascii=False)}")


def find_audio_url(value: object) -> str:
    if isinstance(value, dict):
        for key in ("url", "audio_url", "demo_audio"):
            child = value.get(key)
            if isinstance(child, str) and child.startswith(("http://", "https://")):
                return child
        for child in value.values():
            found = find_audio_url(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = find_audio_url(child)
            if found:
                return found
    return ""


def find_audio_bytes(value: object) -> bytes:
    if isinstance(value, dict):
        for key in ("data", "audio", "content"):
            child = value.get(key)
            if isinstance(child, str):
                decoded = decode_audio_data(child)
                if decoded:
                    return decoded
        for child in value.values():
            decoded = find_audio_bytes(child)
            if decoded:
                return decoded
    if isinstance(value, list):
        for child in value:
            decoded = find_audio_bytes(child)
            if decoded:
                return decoded
    return b""


def decode_audio_data(value: str) -> bytes:
    raw = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    try:
        decoded = base64.b64decode(raw, validate=True)
    except Exception:
        return b""
    return decoded if decoded.startswith((b"ID3", b"RIFF", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")) else b""


def download_bytes(url: str, timeout: float) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as res:
        return res.read()


def resolve_output_path(value: str, audio_format: str) -> Path:
    if value:
        path = Path(value)
        return path if path.is_absolute() else ROOT / path
    stamp = time.strftime("%Y-%m-%dT%H-%M-%S")
    suffix = audio_format.lstrip(".") or "mp3"
    return DEFAULT_OUTPUT_DIR / f"bailian-tts-{stamp}.{suffix}"


def compact(value: dict[str, object]) -> dict[str, object]:
    return {key: item for key, item in value.items() if item not in ("", None)}


def get_env(*keys: str, default: str) -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return default


def print_result(result: TtsResult, args: argparse.Namespace) -> None:
    print("== bailian-tts ==")
    print(f"Model: {args.model}")
    print(f"Voice: {args.voice}")
    print(f"Elapsed: {result.elapsed_ms}ms")
    print(f"Output: {result.output_path}")
    print(f"Bytes: {result.bytes_written}")
    if result.request_id:
        print(f"Request ID: {result.request_id}")
    if result.detail:
        print(f"Detail: {result.detail}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(130)
