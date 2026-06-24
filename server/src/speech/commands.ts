import type { SpeechResult } from './types.js';
import { loadConfig } from '../storage/cliConfigStore.js';

export function normalizeSpeechText(text: string): string {
  return text
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasMatches(alias: string, normalizedText: string): boolean {
  return normalizeSpeechText(alias).toLowerCase() === normalizedText.toLowerCase();
}

export async function parseSpeechCommand(text: string): Promise<SpeechResult | null> {
  const normalized = normalizeSpeechText(text);
  const config = await loadConfig();
  const commands = config.voiceSettings?.commands ?? [];
  for (const command of commands) {
    const matched = command.aliases.find((alias) => aliasMatches(alias, normalized));
    if (matched) {
      return {
        type: 'command',
        command: command.id,
        message: command.label || matched,
        provider: 'server-regex',
      };
    }
  }
  return null;
}
