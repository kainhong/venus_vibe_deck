import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { stripJsonFence } from '../speech/llmRefine.js';

const logger = createLogger('hook-summary');
const LOG_FILE = new URL('../../logs/speech-refine.log', import.meta.url).pathname;

interface SummaryResponse {
  summary?: unknown;
}

export async function summarizeHookMessage(message: string | undefined, maxChars = config.hooks.summaryMaxChars): Promise<string | undefined> {
  const startedAt = Date.now();
  const normalized = normalizeMessage(message);
  if (!normalized) return undefined;
  const limit = normalizeLimit(maxChars);

  if (!config.voice.llmApiKey) {
    const output = truncateToChars(normalized, limit);
    void logHookSummary({
      input: normalized,
      output,
      provider: 'fallback-no-key',
      durationMs: Date.now() - startedAt,
    });
    return output;
  }

  const result = await summarizeWithLlm(normalized, limit);
  const output = truncateToChars(result.summary ?? normalized, limit);
  void logHookSummary({
    input: normalized,
    output,
    provider: result.provider,
    durationMs: Date.now() - startedAt,
  });
  return output;
}

async function summarizeWithLlm(message: string, maxChars: number): Promise<{ summary?: string; provider: string }> {
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
              '你负责把 Claude Code hook 的最后回复总结成移动端通知文案。',
              `输出必须是不超过 ${maxChars} 个字符的中文短句。`,
              '保留关键结论、任务状态、下一步动作；去掉 Markdown、表格、链接堆砌和寒暄。',
              '只返回一个 JSON 对象: {"summary":"..."}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn('hook summary llm request failed', { status: res.status });
      return { provider: `fallback-http-${res.status}` };
    }
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { provider: 'fallback-empty' };
    const parsed = JSON.parse(stripJsonFence(content)) as SummaryResponse;
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
      ? normalizeMessage(parsed.summary)
      : undefined;
    return summary ? { summary, provider: 'llm' } : { provider: 'fallback-invalid' };
  } catch (err) {
    logger.warn('hook summary llm failed', { err: err as Error });
    return { provider: 'fallback-error' };
  } finally {
    clearTimeout(timeout);
  }
}

async function logHookSummary(entry: { input: string; output: string; provider: string; durationMs: number }) {
  const input = isDebugLogging()
    ? entry.input
    : `[${Array.from(entry.input).length} chars; enable debug log level to record full hook content]`;
  const line = `[${new Date().toISOString()}] ${entry.durationMs}ms | hook-summary | ${entry.provider} | input: ${JSON.stringify(input)} | output: ${JSON.stringify(entry.output)}\n`;
  try {
    await mkdir(dirname(LOG_FILE), { recursive: true });
    await appendFile(LOG_FILE, line, 'utf8');
  } catch { /* ignore */ }
}

function normalizeMessage(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function normalizeLimit(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 240;
}

function truncateToChars(value: string, maxChars: number): string {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  if (maxChars <= 3) return chars.slice(0, maxChars).join('');
  return `${chars.slice(0, maxChars - 3).join('')}...`;
}

function isDebugLogging(): boolean {
  return config.logLevel.toLowerCase() === 'debug';
}
