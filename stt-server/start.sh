#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ ! -d ".venv" ]; then
  echo "创建虚拟环境..."
  uv venv
fi

echo "安装依赖..."
uv pip install -e .

echo "启动 STT 服务 (端口: ${STT_PORT:-8002})..."
.venv/bin/uvicorn stt_server.main:app --host "${STT_HOST:-127.0.0.1}" --port "${STT_PORT:-7000}"
