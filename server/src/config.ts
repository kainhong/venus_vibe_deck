/**
 * 运行时配置 — 全部来自环境变量,带合理默认值。
 * PTY_COMMAND 可切换挂载的进程(默认 bash,可设为 claude)。
 */
export const config = {
  /** Server log level: debug, info, warn, error, silent */
  logLevel: process.env.LOG_LEVEL ?? 'info',
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
  voice: {
    useServerVoice: parseBoolean(process.env.VOICE_USE_SERVER, false),
    asrProvider: (process.env.VOICE_ASR_PROVIDER ?? 'cloud') as 'cloud' | 'local',
    localAsrUrl: process.env.VOICE_LOCAL_ASR_URL ?? 'http://127.0.0.1:7000',
    asrBaseUrl: process.env.VOICE_ASR_BASE_URL ?? 'wss://a1.tstech.top/v1/realtime',
    asrApiKey: process.env.VOICE_ASR_API_KEY ?? '',
    asrModel: process.env.VOICE_ASR_MODEL ?? 'qwen3-asr-flash-realtime',
    asrSampleRate: Number(process.env.VOICE_ASR_SAMPLE_RATE ?? 16000),
    asrChunkBytes: Number(process.env.VOICE_ASR_CHUNK_BYTES ?? 3200),
    asrChunkIntervalMs: Number(process.env.VOICE_ASR_CHUNK_INTERVAL_MS ?? 40),
    asrTimeoutMs: Number(process.env.VOICE_ASR_TIMEOUT_MS ?? 30000),
    llmBaseUrl: process.env.VOICE_LLM_BASE_URL ?? 'https://api.openai.com/v1',
    llmApiKey: process.env.VOICE_LLM_API_KEY ?? '',
    llmModel: process.env.VOICE_LLM_MODEL ?? 'gpt-4.1-mini',
    llmTimeoutMs: Number(process.env.VOICE_LLM_TIMEOUT_MS ?? 30000),
    ttsEnabled: parseBoolean(process.env.VOICE_TTS_ENABLED, false),
    ttsVoice: process.env.VOICE_TTS_VOICE ?? 'zh-CN-XiaoxiaoNeural',
    ttsRate: process.env.VOICE_TTS_RATE ?? '+0%',
    ttsVolume: process.env.VOICE_TTS_VOLUME ?? '+0%',
  },
  webPush: {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? '',
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY ?? '',
    subject: process.env.WEB_PUSH_SUBJECT ?? 'mailto:admin@example.com',
  },
} as const;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}
