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
    commandAliases?: Partial<Record<'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space', string[]>>;
  };
}

export const DEFAULT_VOICE_COMMAND_ALIASES: Record<'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space', string[]> = {
  submit: ['回车', '确定', '确认', '提交', '发送', '执行', 'enter'],
  escape: ['取消', '退出', '返回', 'esc', 'escape'],
  interrupt: ['中断', '停止', '停止执行', '打断', 'ctrl c', 'control c'],
  up: ['上', '向上', '上一个', '上一条', '上一项'],
  down: ['下', '向下', '下一个', '下一条', '下一项'],
  space: ['空格', 'space'],
};

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
      commandAliases: DEFAULT_VOICE_COMMAND_ALIASES,
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
      commandAliases: normalizeCommandAliases(doc.voiceSettings?.commandAliases),
    },
  };
}

function normalizeCommandAliases(
  aliases?: Partial<Record<'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space', string[]>>,
): Record<'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space', string[]> {
  const result = { ...DEFAULT_VOICE_COMMAND_ALIASES };
  if (!aliases || typeof aliases !== 'object') return result;
  for (const command of Object.keys(result) as Array<keyof typeof result>) {
    const values = aliases[command];
    if (!Array.isArray(values)) continue;
    const cleaned = values.map((v) => v.trim()).filter(Boolean);
    if (cleaned.length > 0) result[command] = cleaned;
  }
  return result;
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
