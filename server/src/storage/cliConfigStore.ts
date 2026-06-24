import { existsSync } from 'fs';
import { config } from '../config.js';
import { readJson, writeJson } from './jsonStore.js';
import { CONFIG_FILE } from './paths.js';

export interface CliConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  /** 继续会话参数,如 claude 的 -c */
  resumeArg: string;
  /** 是否默认(新建 session 时预选),全局唯一 */
  isDefault: boolean;
}

export interface ConfigDoc {
  cliConfigs: CliConfig[];
  voiceSettings?: {
    /** Runtime value from .env VOICE_USE_SERVER; settings.json is not the source of truth. */
    useServerVoice: boolean;
    commands: VoiceCommandConfig[];
  };
}

export interface VoiceCommandConfig {
  id: string;
  label: string;
  /** Readable key directive resolved by the client, e.g. enter, esc, ctrl+c, arrowUp, tab, space. */
  input: string;
  /** Exact terminal input sequence sent by the client. JSON escapes are supported, e.g. "\r", "\u001b", "\u0003". */
  keyboard: string;
  aliases: string[];
}

export const DEFAULT_VOICE_COMMANDS: VoiceCommandConfig[] = [
  { id: 'submit', label: '回车', input: 'enter', keyboard: '\r', aliases: ['回车', '提交', '发送', '确认', '执行', 'enter'] },
  { id: 'escape', label: 'Esc', input: 'esc', keyboard: '\x1b', aliases: ['取消', '退出', '返回', 'esc', 'escape'] },
  { id: 'interrupt', label: '中断', input: 'ctrl+c', keyboard: '\x03', aliases: ['中断', '停止', '停止执行', '打断', 'ctrl c', 'control c'] },
  { id: 'up', label: '上', input: 'arrowUp', keyboard: '\x1b[A', aliases: ['上', '向上', '上一个', '上一条', '上一项'] },
  { id: 'down', label: '下', input: 'arrowDown', keyboard: '\x1b[B', aliases: ['下', '向下', '下一个', '下一条', '下一项'] },
  { id: 'space', label: '空格', input: 'space', keyboard: ' ', aliases: ['空格', '选择', '确定', 'space'] },
];

/**
 * 首次启动默认配置:固定 id(未保存前也稳定)。Claude 为默认。
 * 与 server 启动的 ensureDefault() bash 会话无关 —— 那是 PTY 层兜底,这是配置层默认。
 */
function defaultConfig(): ConfigDoc {
  return {
    cliConfigs: [
      { id: 'claude-default', name: 'Claude', command: 'claude', args: [], resumeArg: '-c', isDefault: true },
      { id: 'codex-default', name: 'Codex', command: 'codex', args: [], resumeArg: '', isDefault: false },
      { id: 'opencode-default', name: 'OpenCode', command: 'opencode', args: [], resumeArg: '', isDefault: false },
    ],
    voiceSettings: {
      useServerVoice: config.voice.useServerVoice,
      commands: DEFAULT_VOICE_COMMANDS,
    },
  };
}

/** 归一化:isDefault 全局唯一,多于 1 个时只保留第一个(防客户端并发写脏) */
function normalize(doc: ConfigDoc): ConfigDoc {
  let seen = false;
  doc.cliConfigs = doc.cliConfigs.map((c) => {
    if (c.isDefault && !seen) {
      seen = true;
      return c;
    }
    return { ...c, isDefault: false };
  });
  return {
    ...doc,
    voiceSettings: {
      useServerVoice: config.voice.useServerVoice,
      commands: normalizeVoiceCommands(doc.voiceSettings?.commands),
    },
  };
}

function normalizeVoiceCommands(commands?: VoiceCommandConfig[]): VoiceCommandConfig[] {
  if (!Array.isArray(commands)) return DEFAULT_VOICE_COMMANDS;
  const cleaned = commands
    .map((item) => ({
      id: item.id?.trim(),
      label: item.label?.trim(),
      input: item.input?.trim(),
      keyboard: typeof item.keyboard === 'string' ? item.keyboard : '',
      aliases: Array.isArray(item.aliases) ? item.aliases.map((v) => v.trim()).filter(Boolean) : [],
    }))
    .filter((item): item is VoiceCommandConfig => Boolean(item.id && item.label && item.input && item.keyboard && item.aliases.length));
  return cleaned.length > 0 ? cleaned : DEFAULT_VOICE_COMMANDS;
}

export async function loadConfig(): Promise<ConfigDoc> {
  if (!existsSync(CONFIG_FILE)) {
    const doc = defaultConfig();
    await writeJson(CONFIG_FILE, doc);
    return doc;
  }
  const doc = await readJson<ConfigDoc | null>(CONFIG_FILE, null);
  if (!doc || !Array.isArray(doc.cliConfigs)) {
    const fallback = defaultConfig();
    await writeJson(CONFIG_FILE, fallback);
    return fallback;
  }
  return normalize(doc);
}

export async function saveConfig(doc: ConfigDoc): Promise<void> {
  await writeJson(CONFIG_FILE, normalize(doc));
}
