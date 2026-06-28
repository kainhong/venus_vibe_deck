import { config } from '../config.js';
import { readJson, writeJson } from './jsonStore.js';
import { CONFIG_FILE } from './paths.js';

export interface CliConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  resumeArg: string;
  isDefault: boolean;
}

export interface ConfigDoc {
  cliConfigs: CliConfig[];
  voiceSettings?: {
    useServerVoice: boolean;
    asrProvider: 'cloud' | 'local';
    commands: VoiceCommandConfig[];
  };
}

export interface VoiceCommandConfig {
  id: string;
  label: string;
  input: string;
  keyboard: string;
  aliases: string[];
}

/** 归一化:isDefault 全局唯一,多于 1 个时只保留第一个 */
function normalize(doc: ConfigDoc): ConfigDoc {
  let seen = false;
  doc.cliConfigs = doc.cliConfigs.map((c) => {
    if (c.isDefault && !seen) {
      seen = true;
      return c;
    }
    return { ...c, isDefault: false };
  });
  if (doc.voiceSettings) {
    doc.voiceSettings.useServerVoice = config.voice.useServerVoice;
    doc.voiceSettings.asrProvider = config.voice.asrProvider;
  }
  return doc;
}

export async function loadConfig(): Promise<ConfigDoc> {
  const doc = await readJson<ConfigDoc | null>(CONFIG_FILE, null);
  if (!doc || !Array.isArray(doc.cliConfigs)) {
    throw new Error(`配置文件缺失或格式错误: ${CONFIG_FILE}`);
  }
  return normalize(doc);
}

export async function saveConfig(doc: ConfigDoc): Promise<void> {
  await writeJson(CONFIG_FILE, normalize(doc));
}
