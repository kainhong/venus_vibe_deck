import { getRuntimeSettings } from './runtimeSettings.js';

const runtime = getRuntimeSettings();

/**
 * 运行时配置。
 * - 常见非敏感项来自 server/config/settings.json 的 runtime 分区。
 * - 环境变量优先级最高,用于密钥/密码和部署时临时覆盖。
 */
export const config = {
  /** Server log level: debug, info, warn, error, silent */
  logLevel: readString('LOG_LEVEL', runtime.server?.logLevel, 'info'),
  /** HTTP/WS 监听端口 */
  port: readNumber('PORT', runtime.server?.port, 8001),
  /** 监听地址,0.0.0.0 暴露到局域网 */
  host: readString('HOST', runtime.server?.host, '0.0.0.0'),
  /** PTY 默认挂载的命令:显式 PTY_COMMAND 优先,否则 bash(对齐 spec) */
  defaultCommand: readString('PTY_COMMAND', runtime.terminal?.defaultCommand, 'bash'),
  /** 默认命令参数 */
  defaultArgs: process.env.PTY_ARGS ? process.env.PTY_ARGS.split(/\s+/).filter(Boolean) : runtime.terminal?.defaultArgs ?? [],
  /** 单会话滚动缓冲上限(字节),供断线重连回放 */
  scrollbackBytes: readNumber('SCROLLBACK_BYTES', runtime.terminal?.scrollbackBytes, 51200),
  /** 默认终端尺寸 */
  cols: readNumber('PTY_COLS', runtime.terminal?.cols, 80),
  rows: readNumber('PTY_ROWS', runtime.terminal?.rows, 24),
  auth: {
    enabled: readBoolean('AUTH_ENABLED', runtime.auth?.enabled, false),
    password: process.env.AUTH_PASSWORD ?? '',
    ttlDays: readNumber('AUTH_TTL_DAYS', runtime.auth?.ttlDays, 7),
    tokenSecret: process.env.AUTH_TOKEN_SECRET ?? process.env.AUTH_PASSWORD ?? 'venus-vibe-deck-auth',
  },
  voice: {
    useServerVoice: readBoolean('VOICE_USE_SERVER', runtime.voice?.useServerVoice, false),
    asrProvider: readString('VOICE_ASR_PROVIDER', runtime.voice?.asrProvider, 'cloud') as 'cloud' | 'local',
    localAsrUrl: readString('VOICE_LOCAL_ASR_URL', runtime.voice?.localAsrUrl, 'http://127.0.0.1:7000'),
    asrBaseUrl: readString('VOICE_ASR_BASE_URL', runtime.voice?.asrBaseUrl, 'wss://dashscope.aliyuncs.com/compatible-mode/v1/realtime'),
    asrApiKey: process.env.VOICE_ASR_API_KEY ?? '',
    asrModel: readString('VOICE_ASR_MODEL', runtime.voice?.asrModel, 'qwen3-asr-flash-realtime'),
    asrSampleRate: readNumber('VOICE_ASR_SAMPLE_RATE', runtime.voice?.asrSampleRate, 16000),
    asrChunkBytes: readNumber('VOICE_ASR_CHUNK_BYTES', runtime.voice?.asrChunkBytes, 3200),
    asrChunkIntervalMs: readNumber('VOICE_ASR_CHUNK_INTERVAL_MS', runtime.voice?.asrChunkIntervalMs, 40),
    asrTimeoutMs: readNumber('VOICE_ASR_TIMEOUT_MS', runtime.voice?.asrTimeoutMs, 30000),
    llmBaseUrl: readString('VOICE_LLM_BASE_URL', runtime.voice?.llmBaseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
    llmApiKey: process.env.VOICE_LLM_API_KEY ?? '',
    llmModel: readString('VOICE_LLM_MODEL', runtime.voice?.llmModel, 'qwen-plus'),
    llmTimeoutMs: readNumber('VOICE_LLM_TIMEOUT_MS', runtime.voice?.llmTimeoutMs, 30000),
    ttsEnabled: readBoolean('VOICE_TTS_ENABLED', runtime.voice?.ttsEnabled, false),
    ttsProvider: readString('VOICE_TTS_PROVIDER', runtime.voice?.ttsProvider, 'edge') as 'edge' | 'bailian',
    ttsApiKey: process.env.VOICE_TTS_API_KEY ?? '',
    ttsBaseUrl: readString('VOICE_TTS_BASE_URL', runtime.voice?.ttsBaseUrl, 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'),
    ttsModel: readString('VOICE_TTS_MODEL', runtime.voice?.ttsModel, 'cosyvoice-v3.5-plus'),
    ttsVoice: readString('VOICE_TTS_VOICE', runtime.voice?.ttsVoice, 'zh-CN-XiaoxiaoNeural'),
    ttsFormat: readString('VOICE_TTS_FORMAT', runtime.voice?.ttsFormat, 'mp3'),
    ttsSampleRate: readNumber('VOICE_TTS_SAMPLE_RATE', runtime.voice?.ttsSampleRate, 24000),
    ttsRate: readString('VOICE_TTS_RATE', runtime.voice?.ttsRate, '+0%'),
    ttsVolume: readString('VOICE_TTS_VOLUME', runtime.voice?.ttsVolume, '+0%'),
    ttsPitch: readString('VOICE_TTS_PITCH', runtime.voice?.ttsPitch, '+0Hz'),
    timbres: runtime.voice?.timbres ?? [],
  },
  webPush: {
    publicKey: readString('WEB_PUSH_PUBLIC_KEY', runtime.webPush?.publicKey, ''),
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY ?? '',
    subject: readString('WEB_PUSH_SUBJECT', runtime.webPush?.subject, 'mailto:admin@example.com'),
  },
  hooks: {
    summaryMaxChars: readNumber('HOOK_SUMMARY_MAX_CHARS', runtime.hooks?.summaryMaxChars, 240),
  },
} as const;

function readString(envName: string, configured: string | undefined, fallback: string): string {
  return process.env[envName] ?? configured ?? fallback;
}

function readNumber(envName: string, configured: number | undefined, fallback: number): number {
  const raw = process.env[envName];
  if (raw !== undefined) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return typeof configured === 'number' && Number.isFinite(configured) ? configured : fallback;
}

function readBoolean(envName: string, configured: boolean | undefined, fallback: boolean): boolean {
  const value = process.env[envName];
  if (value === undefined) return configured ?? fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}
