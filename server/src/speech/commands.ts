import type { SpeechCommand, SpeechResult } from './types.js';
import { DEFAULT_VOICE_COMMAND_ALIASES, loadConfig } from '../storage/cliConfigStore.js';

const COMMANDS: SpeechCommand[] = ['submit', 'escape', 'interrupt', 'up', 'down', 'space'];

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
  const aliases = config.voiceSettings?.commandAliases ?? DEFAULT_VOICE_COMMAND_ALIASES;
  for (const command of COMMANDS) {
    const commandAliases = aliases[command] ?? DEFAULT_VOICE_COMMAND_ALIASES[command];
    const matched = commandAliases.find((alias) => aliasMatches(alias, normalized));
    if (matched) {
      return {
        type: 'command',
        command,
        message: matched,
        provider: 'server-regex',
      };
    }
  }
  return null;
}
