#!/usr/bin/env bash
#
# Venus Terminal 服务启停脚本
# 用法:
#   ./start.sh        启动服务(后台运行)
#   ./start.sh stop   停止服务
#   ./start.sh status 查看运行状态
#   ./start.sh log    查看日志

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.venus.pid"
LOG_FILE="$DIR/.venus.log"

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "服务已在运行 (PID: $(cat "$PID_FILE"))"
    return 0
  fi

  echo "正在构建..."
  cd "$DIR" && npm run build > /dev/null 2>&1

  echo "正在启动 Venus Terminal..."
  cd "$DIR" && nohup node server/dist/index.js > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 1

  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "启动成功 (PID: $(cat "$PID_FILE"))"
    echo "日志: $LOG_FILE"
  else
    echo "启动失败，请查看日志: $LOG_FILE"
    rm -f "$PID_FILE"
    return 1
  fi
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "服务未在运行"
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")

  if kill -0 "$pid" 2>/dev/null; then
    echo "正在停止服务 (PID: $pid)..."
    kill "$pid"
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid"
    fi
    echo "已停止"
  else
    echo "进程已不存在"
  fi

  rm -f "$PID_FILE"
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "运行中 (PID: $(cat "$PID_FILE"))"
  else
    echo "未运行"
    rm -f "$PID_FILE" 2>/dev/null
  fi
}

log() {
  if [ -f "$LOG_FILE" ]; then
    tail -f "$LOG_FILE"
  else
    echo "暂无日志"
  fi
}

case "${1:-start}" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  log)    log ;;
  *)      echo "用法: $0 {start|stop|status|log}" ;;
esac
