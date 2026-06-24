import { config } from '../config.js';
import { parseSpeechCommand } from './commands.js';
import { loadConfig } from '../storage/cliConfigStore.js';
import type { SpeechResult } from './types.js';

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function validateSpeechResult(value: unknown, commandIds: string[]): SpeechResult | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.type === 'text' && typeof item.message === 'string' && item.message.trim()) {
    return { type: 'text', message: item.message.trim(), provider: 'server-llm' };
  }
  if (
    item.type === 'command' &&
    typeof item.message === 'string' &&
    typeof item.command === 'string' &&
    commandIds.includes(item.command)
  ) {
    return {
      type: 'command',
      message: item.message.trim() || item.command,
      command: item.command,
      provider: 'server-llm',
    };
  }
  return null;
}

function fallbackText(transcript: string): SpeechResult {
  return {
    type: 'text',
    message: transcript.replace(/\b(嗯|啊|呃|那个|就是)\b/g, '').replace(/\s+/g, ' ').trim(),
    provider: 'server-asr',
  };
}

export async function refineTranscriptWithLlm(transcript: string): Promise<SpeechResult> {
  const directCommand = await parseSpeechCommand(transcript);
  if (directCommand) return directCommand;
  if (!config.voice.llmApiKey) return fallbackText(transcript);
  const commandIds = (await loadConfig()).voiceSettings?.commands.map((item) => item.id) ?? [];
  const commandPrompt = (await loadConfig()).voiceSettings?.commands
    .map((item) => `${item.id}: ${item.label}, aliases=${item.aliases.join('/')}`)
    .join('\n') ?? '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.voice.llmTimeoutMs);
  try {
    const baseUrl = config.voice.llmBaseUrl.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.voice.llmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.voice.llmModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You convert short Chinese voice transcripts into a JSON SpeechResult for a terminal control panel.',
              'Return only JSON.',
              'For normal user intent, return {"type":"text","message":"cleaned text"}.',
              'For control commands, return {"type":"command","message":"spoken label","command":"one of configured command ids"}.',
              'Remove filler words, repeated fragments, and obvious noise.',
              'Preserve technical terms, code identifiers, paths, commands, and model names.',
              `Configured commands:\n${commandPrompt}`,
            ].join('\n'),
          },
          {
            role: 'user',
            content: `Transcript:\n${transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) return fallbackText(transcript);
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallbackText(transcript);
    const parsed = JSON.parse(stripJsonFence(content)) as unknown;
    return validateSpeechResult(parsed, commandIds) ?? fallbackText(transcript);
  } catch {
    return fallbackText(transcript);
  } finally {
    clearTimeout(timeout);
  }
}
