import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CliConfig } from '../storage/cliConfigStore.js';
import { HOOKS_DIR } from '../storage/paths.js';
import { createLogger } from '../logger.js';

const logger = createLogger('cli-hooks');

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');
const CLAUDE_RELAY_FILE = join(HOOKS_DIR, 'claude-hook-relay.cjs');
const VENUS_HOOK_MARKER_PREFIX = 'venus-hook:';

export type CliHookName = 'notify' | 'session_end';
export type CliKind = 'claude' | 'codex' | 'opencode';

export interface EnsureCliHooksInput {
  cliConfig?: CliConfig;
  command?: string;
  cwd?: string;
  sessionId: string;
}

export interface EnsureCliHooksResult {
  cli?: CliKind;
  changed: boolean;
  details: string[];
}

interface CliHookAdapter {
  readonly cli: CliKind;
  matches(input: EnsureCliHooksInput): boolean;
  ensureHooks(input: EnsureCliHooksInput): Promise<EnsureCliHooksResult>;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookMatcher[]>;
  [key: string]: unknown;
}

interface ClaudeHookMatcher {
  matcher?: string;
  hooks?: ClaudeCommandHook[];
  [key: string]: unknown;
}

interface ClaudeCommandHook {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

const adapters: CliHookAdapter[] = [
  {
    cli: 'claude',
    matches: isClaudeCli,
    ensureHooks: ensureClaudeHooks,
  },
];

export async function ensureCliHooks(input: EnsureCliHooksInput): Promise<EnsureCliHooksResult> {
  const adapter = adapters.find((item) => item.matches(input));
  if (!adapter) return { changed: false, details: [] };
  try {
    const result = await adapter.ensureHooks(input);
    logger.info('cli hooks ensured', {
      cli: result.cli,
      changed: result.changed,
      sessionId: input.sessionId,
      details: result.details,
    });
    return result;
  } catch (err) {
    logger.warn('cli hook setup failed; continuing without hook changes', {
      cli: adapter.cli,
      sessionId: input.sessionId,
      err: err as Error,
    });
    return { cli: adapter.cli, changed: false, details: [`failed: ${(err as Error).message}`] };
  }
}

function isClaudeCli(input: EnsureCliHooksInput): boolean {
  const tokens = [
    input.cliConfig?.id,
    input.cliConfig?.name,
    input.cliConfig?.command,
    input.command,
  ].filter(Boolean).map((value) => value!.toLowerCase());
  return tokens.some((value) => basename(value) === 'claude' || value.includes('claude'));
}

async function ensureClaudeHooks(_input: EnsureCliHooksInput): Promise<EnsureCliHooksResult> {
  await ensureClaudeRelayScript();

  const settings = await readSettings(CLAUDE_SETTINGS_FILE);
  const hooks = settings.hooks ?? {};
  settings.hooks = hooks;

  const details: string[] = [];
  let changed = false;

  for (const spec of [
    { claudeEvent: 'Notification', venusEvent: 'notify' as const },
    { claudeEvent: 'Stop', venusEvent: 'notify' as const },
    { claudeEvent: 'SessionEnd', venusEvent: 'session_end' as const },
  ]) {
    const added = ensureClaudeCommandHook(hooks, spec.claudeEvent, spec.venusEvent);
    if (added) {
      changed = true;
      details.push(`added ${spec.claudeEvent}`);
    } else {
      details.push(`exists ${spec.claudeEvent}`);
    }
  }

  if (changed) await writeSettings(CLAUDE_SETTINGS_FILE, settings);
  return { cli: 'claude', changed, details };
}

function ensureClaudeCommandHook(
  hooks: Record<string, ClaudeHookMatcher[]>,
  claudeEvent: string,
  venusEvent: CliHookName,
): boolean {
  const list = hooks[claudeEvent];
  if (list !== undefined && !Array.isArray(list)) {
    throw new Error(`Claude hooks.${claudeEvent} must be an array`);
  }

  const entries = list ?? [];
  hooks[claudeEvent] = entries;
  const marker = `${VENUS_HOOK_MARKER_PREFIX}${venusEvent}`;
  const exists = entries.some((entry) =>
    Array.isArray(entry.hooks) &&
    entry.hooks.some((hook) => hook.type === 'command' && typeof hook.command === 'string' && hook.command.includes(marker))
  );
  if (exists) return false;

  entries.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: buildRelayCommand(venusEvent),
      },
    ],
  });
  return true;
}

function buildRelayCommand(event: CliHookName): string {
  return [
    `VENUS_HOOK_EVENT=${shellQuote(event)}`,
    `VENUS_HOOK_MARKER=${shellQuote(`${VENUS_HOOK_MARKER_PREFIX}${event}`)}`,
    shellQuote(process.execPath),
    shellQuote(CLAUDE_RELAY_FILE),
  ].join(' ');
}

async function ensureClaudeRelayScript(): Promise<void> {
  await mkdir(dirname(CLAUDE_RELAY_FILE), { recursive: true });
  await writeFile(CLAUDE_RELAY_FILE, relayScriptSource(), { encoding: 'utf8', mode: 0o755 });
}

async function readSettings(file: string): Promise<ClaudeSettings> {
  if (!(await exists(file))) return {};
  const raw = await readFile(file, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Claude settings must be a JSON object: ${file}`);
  }
  return parsed as ClaudeSettings;
}

async function writeSettings(file: string, settings: ClaudeSettings): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  await renameAtomic(tmp, file);
}

async function renameAtomic(from: string, to: string): Promise<void> {
  await rename(from, to);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

function relayScriptSource(): string {
  return `const http = require('node:http');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let raw = {};
  try {
    raw = input.trim() ? JSON.parse(input) : {};
  } catch (err) {
    raw = { parseError: err instanceof Error ? err.message : String(err), input };
  }

  const event = process.env.VENUS_HOOK_EVENT || 'notify';
  const payload = JSON.stringify({
    cli: 'claude',
    event,
    sessionId: process.env.VENUS_SESSION_ID || raw.session_id || raw.sessionId,
    source: 'claude',
    message: extractMessage(raw, event),
    cwd: typeof raw.cwd === 'string' ? raw.cwd : process.cwd(),
    raw,
  });
  const url = new URL(process.env.VENUS_HOOK_URL || process.env.VENUS_NOTIFICATION_URL || 'http://127.0.0.1:8001/api/hooks/cli-event');
  const req = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    },
  }, (res) => {
    res.resume();
  });
  req.on('error', () => {});
  req.end(payload);
});

function extractMessage(raw, event) {
  if (typeof raw.last_assistant_message === 'string') return raw.last_assistant_message;
  if (typeof raw.message === 'string') return raw.message;
  if (typeof raw.reason === 'string') return raw.reason;
  if (typeof raw.notification === 'string') return raw.notification;
  if (event === 'session_end') return 'Claude session ended';
  return 'Claude notification';
}
`;
}
