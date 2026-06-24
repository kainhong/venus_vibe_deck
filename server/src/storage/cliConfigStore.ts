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
}

/**
 * 首次启动默认配置:固定 id(未保存前也稳定)。Claude 为默认。
 * 与 server 启动的 ensureDefault() bash 会话无关 —— 那是 PTY 层兜底,这是配置层默认。
 */
function defaultConfig(): ConfigDoc {
  return {
    cliConfigs: [
      { id: 'claude-default', name: 'Claude', command: 'claude', args: [], resumeArg: '-c', isDefault: true },
      { id: 'bash-default', name: 'Bash', command: 'bash', args: [], resumeArg: '', isDefault: false },
    ],
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
  return doc;
}

export async function loadConfig(): Promise<ConfigDoc> {
  const doc = await readJson<ConfigDoc | null>(CONFIG_FILE, null);
  if (!doc || !Array.isArray(doc.cliConfigs)) return defaultConfig();
  return doc;
}

export async function saveConfig(doc: ConfigDoc): Promise<void> {
  await writeJson(CONFIG_FILE, normalize(doc));
}
