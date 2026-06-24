/**
 * 运行时配置 — 全部来自环境变量,带合理默认值。
 * PTY_COMMAND 可切换挂载的进程(默认 bash,可设为 claude)。
 */
export const config = {
  /** HTTP/WS 监听端口 */
  port: Number(process.env.PORT ?? 8001),
  /** 监听地址,0.0.0.0 暴露到局域网 */
  host: process.env.HOST ?? '0.0.0.0',
  /** PTY 默认挂载的命令:显式 PTY_COMMAND 优先,否则 bash(对齐 spec) */
  defaultCommand: process.env.PTY_COMMAND ?? 'bash',
  /** 默认命令参数 */
  defaultArgs: process.env.PTY_ARGS ? process.env.PTY_ARGS.split(/\s+/).filter(Boolean) : [],
  /** 单会话滚动缓冲上限(字节),供断线重连回放 */
  scrollbackBytes: Number(process.env.SCROLLBACK_BYTES ?? 51200),
  /** 默认终端尺寸 */
  cols: Number(process.env.PTY_COLS ?? 80),
  rows: Number(process.env.PTY_ROWS ?? 24),
} as const;
