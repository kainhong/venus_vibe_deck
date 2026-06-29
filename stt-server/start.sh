#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ ! -d ".venv" ]; then
  echo "创建虚拟环境..."
  uv venv
fi

echo "安装依赖..."
if [ "$(uname -s)" = "Linux" ]; then
  uv pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu torchaudio==2.5.1+cpu
else
  uv pip install torch torchaudio
fi
uv pip install -e .

echo "启动 STT 服务 (${STT_HOST:-127.0.0.1}:${STT_PORT:-7000})..."
.venv/bin/uvicorn stt_server.main:app --host "${STT_HOST:-127.0.0.1}" --port "${STT_PORT:-7000}"
