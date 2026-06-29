#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

LOCK_DIR="$DIR/.lock"
LOG_DIR="$DIR/logs"
PID_FILE="$LOCK_DIR/stt-server.pid"
LOG_FILE="$LOG_DIR/stt-server.log"

HOST="${STT_HOST:-127.0.0.1}"
PORT="${STT_PORT:-7000}"

cmd="${1:-start}"

ensure_deps() {
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
}

is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_server() {
  if is_running; then
    echo "STT 服务已运行: pid=$(cat "$PID_FILE"), ${HOST}:${PORT}"
    return 0
  fi

  mkdir -p "$LOCK_DIR" "$LOG_DIR"
  ensure_deps

  echo "启动 STT 服务 (${HOST}:${PORT})..."
  nohup .venv/bin/uvicorn stt_server.main:app --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
  echo "已后台启动: pid=$(cat "$PID_FILE")"
  echo "日志: $LOG_FILE"
}

stop_server() {
  if ! is_running; then
    rm -f "$PID_FILE"
    echo "STT 服务未运行"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  echo "停止 STT 服务: pid=$pid"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "已停止"
      return 0
    fi
    sleep 0.2
  done
  echo "进程未及时退出,强制停止"
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
}

status_server() {
  if is_running; then
    echo "STT 服务运行中: pid=$(cat "$PID_FILE"), ${HOST}:${PORT}"
  else
    rm -f "$PID_FILE"
    echo "STT 服务未运行"
  fi
}

case "$cmd" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server
    start_server
    ;;
  status)
    status_server
    ;;
  log|logs)
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"
    tail -f "$LOG_FILE"
    ;;
  foreground|fg)
    ensure_deps
    echo "前台启动 STT 服务 (${HOST}:${PORT})..."
    .venv/bin/uvicorn stt_server.main:app --host "$HOST" --port "$PORT"
    ;;
  *)
    echo "用法: $0 [start|stop|restart|status|log|foreground]"
    exit 1
    ;;
esac
