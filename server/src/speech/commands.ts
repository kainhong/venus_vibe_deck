import type { SpeechResult } from './types.js';
import { loadConfig } from '../storage/cliConfigStore.js';

const FILLER_PATTERN = /^(嗯|啊|呃|那个|就是|好的|帮我|请|你|给我)+|[一下吧呢啊哈]+$/g;

export function normalizeSpeechText(text: string): string {
  return text
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFillers(text: string): string {
  let result = text;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(FILLER_PATTERN, '').trim();
  }
  return result;
}

function aliasMatches(alias: string, normalizedText: string): boolean {
  return normalizeSpeechText(alias).toLowerCase() === normalizedText.toLowerCase();
}

export function matchSpeechCommand(text: string, commands: Array<{ id: string; label: string; aliases: string[] }>): SpeechResult | null {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return null;
  for (const command of commands) {
    const matched = command.aliases.find((alias) => aliasMatches(alias, normalized));
    if (matched) {
      return { type: 'command', command: command.id, message: command.label || matched, provider: 'server-regex' };
    }
  }
  const stripped = stripFillers(normalized);
  if (stripped && stripped !== normalized) {
    for (const command of commands) {
      const matched = command.aliases.find((alias) => aliasMatches(alias, stripped));
      if (matched) {
        return { type: 'command', command: command.id, message: command.label || matched, provider: 'server-regex' };
      }
    }
  }
  return null;
}

export async function parseSpeechCommand(text: string): Promise<SpeechResult | null> {
  const config = await loadConfig();
  return matchSpeechCommand(text, config.voiceSettings?.commands ?? []);
}
