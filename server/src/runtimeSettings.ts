import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, '..');
const SETTINGS_FILE = join(SERVER_ROOT, 'config', 'settings.json');

export interface RuntimeSettings {
  server?: {
    host?: string;
    port?: number;
    logLevel?: string;
  };
  storage?: {
    dataDir?: string;
    dirRoots?: string[];
  };
  terminal?: {
    defaultCommand?: string;
    defaultArgs?: string[];
    cols?: number;
    rows?: number;
    scrollbackBytes?: number;
  };
  auth?: {
    enabled?: boolean;
    ttlDays?: number;
  };
  voice?: {
    useServerVoice?: boolean;
    asrProvider?: 'cloud' | 'local';
    localAsrUrl?: string;
    asrBaseUrl?: string;
    asrModel?: string;
    asrSampleRate?: number;
    asrChunkBytes?: number;
    asrChunkIntervalMs?: number;
    asrTimeoutMs?: number;
    llmBaseUrl?: string;
    llmModel?: string;
    llmTimeoutMs?: number;
    ttsEnabled?: boolean;
    ttsProvider?: 'edge' | 'bailian';
    ttsBaseUrl?: string;
    ttsModel?: string;
    ttsVoice?: string;
    ttsFormat?: string;
    ttsSampleRate?: number;
    ttsRate?: string;
    ttsVolume?: string;
    ttsPitch?: string;
    timbres?: VoiceTimbre[];
  };
  webPush?: {
    publicKey?: string;
    subject?: string;
  };
  hooks?: {
    summaryMaxChars?: number;
  };
}

export interface VoiceTimbre {
  name: string;
  label: string;
}

interface SettingsDoc {
  runtime?: RuntimeSettings;
}

let cached: RuntimeSettings | undefined;

export function getRuntimeSettings(): RuntimeSettings {
  cached ??= readRuntimeSettings();
  return cached;
}

function readRuntimeSettings(): RuntimeSettings {
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SettingsDoc;
    return parsed && typeof parsed === 'object' && parsed.runtime ? parsed.runtime : {};
  } catch {
    return {};
  }
}
