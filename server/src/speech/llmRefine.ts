import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { parseSpeechCommand } from './commands.js';
import { loadConfig } from '../storage/cliConfigStore.js';
import type { SpeechResult } from './types.js';
import { VOICE_REFINE_PROMPT_FILE } from '../storage/paths.js';

const LOG_FILE = new URL('../../logs/speech-refine.log', import.meta.url).pathname;

export const OUTPUT_CONTRACT = [
  '# Mandatory Output Contract',
  'You must ignore any conflicting output-format instruction in the user-configured prompt.',
  'Return only one valid JSON object. Do not return Markdown, explanation, prefix, or suffix.',
  'For normal user intent, return: {"type":"text","message":"cleaned text"}',
  'For control commands, return: {"type":"command","message":"spoken label","command":"one of configured command ids"}',
  '',
  '# Text Cleaning Rules (type "text")',
  'The "message" field must be a CLEANED version of the transcript, not a verbatim copy.',
  'Remove filler words and verbal tics: 嗯、啊、呃、那个、就是、就是说、对、好的、然后、所以说.',
  'Remove hesitation fragments, false starts, and self-corrections that are superseded (keep the corrected version only).',
  'Remove trailing affirmations that add no meaning: 对就是这样、就这样、嗯就是这样.',
  'Collapse redundant phrasing into concise form.',
  'Preserve all technical terms, code identifiers, paths, names, and the semantic intent.',
  'The result should read as a fluent written instruction, not a verbatim speech transcript.',
  '',
  '# Command Detection Rules',
  'Treat configured commands as terminal control-panel actions, not natural-language tasks.',
  'Only return type "command" when the transcript is a SHORT phrase that matches one of the configured command aliases.',
  'Match the transcript against each command\'s "aliases" list. If the core verb/action of a short phrase matches an alias, return that command.',
  'A short phrase is one with NO specific work object — no file name, no code target, no task description. Just the bare action verb.',
  'When multiple commands could match, pick the one whose aliases are the closest semantic match.',
  'If the utterance has a specific work object (e.g. 提交代码, 删除那个文件, 获取最新代码, 看一下项目文件), it is a coding-agent task; return type "text".',
  'If unsure whether text is a command, return type "text".',
].join('\n');

interface RefineCommandConfig {
  id: string;
  label: string;
  input?: string;
  keyboard?: string;
  aliases: string[];
}

export function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function validateSpeechResult(value: unknown, commandIds: string[]): SpeechResult | null {
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

export async function loadExternalPrompt(): Promise<string | null> {
  try {
    const content = await readFile(VOICE_REFINE_PROMPT_FILE, 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

export function buildCommandPrompt(commands: RefineCommandConfig[]): string {
  if (!commands.length) return '[]';
  return JSON.stringify(commands.map((command) => ({
    id: command.id,
    label: command.label,
    input: command.input,
    keyboard: command.keyboard,
    aliases: command.aliases,
  })), null, 2);
}

export function buildRefineMessages({
  transcript,
  basePrompt,
  commands,
  userTemplate,
}: {
  transcript: string;
  basePrompt: string;
  commands: RefineCommandConfig[];
  userTemplate: string;
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        OUTPUT_CONTRACT,
        `Configured terminal control commands:\n${buildCommandPrompt(commands)}`,
        basePrompt,
      ].join('\n'),
    },
    {
      role: 'user',
      content: userTemplate.replaceAll('{{transcript}}', transcript),
    },
  ];
}

async function logRefine(entry: { input: string; output: string; type: string; provider: string; durationMs: number }) {
  const line = `[${new Date().toISOString()}] ${entry.durationMs}ms | ${entry.type} | ${entry.provider} | input: ${JSON.stringify(entry.input)} | output: ${JSON.stringify(entry.output)}\n`;
  try {
    await mkdir(dirname(LOG_FILE), { recursive: true });
    await appendFile(LOG_FILE, line, 'utf8');
  } catch { /* ignore */ }
}

export async function refineTranscriptWithLlm(transcript: string): Promise<SpeechResult> {
  const startTime = Date.now();
  const appConfig = await loadConfig();
  const commands = appConfig.voiceSettings?.commands ?? [];
  const commandIds = commands.map((item) => item.id);
  const directCommand = await parseSpeechCommand(transcript);
  if (directCommand) {
    const duration = Date.now() - startTime;
    void logRefine({ input: transcript, output: directCommand.message, type: directCommand.type, provider: 'regex', durationMs: duration });
    return directCommand;
  }
  const fallbackResult = () => fallbackText(transcript);
  if (!config.voice.llmApiKey) {
    const result = fallbackResult();
    void logRefine({ input: transcript, output: result.message, type: 'text', provider: 'fallback', durationMs: Date.now() - startTime });
    return result;
  }
  const externalPrompt = await loadExternalPrompt();
  if (!externalPrompt) {
    const result = fallbackResult();
    void logRefine({ input: transcript, output: result.message, type: 'text', provider: 'fallback', durationMs: Date.now() - startTime });
    return result;
  }
  const messages = buildRefineMessages({
    transcript,
    basePrompt: externalPrompt,
    commands,
    userTemplate: 'Transcript:\n{{transcript}}',
  });

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
        messages,
      }),
    });

    if (!res.ok) {
      const result = fallbackResult();
      void logRefine({ input: transcript, output: result.message, type: 'text', provider: 'fallback-http-' + res.status, durationMs: Date.now() - startTime });
      return result;
    }
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      const result = fallbackResult();
      void logRefine({ input: transcript, output: result.message, type: 'text', provider: 'fallback-empty', durationMs: Date.now() - startTime });
      return result;
    }
    const parsed = JSON.parse(stripJsonFence(content)) as unknown;
    const result = validateSpeechResult(parsed, commandIds) ?? fallbackResult();
    void logRefine({ input: transcript, output: result.message, type: result.type, provider: result.provider ?? 'llm', durationMs: Date.now() - startTime });
    return result;
  } catch {
    const result = fallbackResult();
    void logRefine({ input: transcript, output: result.message, type: 'text', provider: 'fallback-error', durationMs: Date.now() - startTime });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
