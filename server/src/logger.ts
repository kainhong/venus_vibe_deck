import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

const configuredLevel = normalizeLevel(config.logLevel);

export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => write('debug', scope, message, context),
    info: (message, context) => write('info', scope, message, context),
    warn: (message, context) => write('warn', scope, message, context),
    error: (message, context) => write('error', scope, message, context),
  };
}

function normalizeLevel(value: string): LogLevel {
  const normalized = value.toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error' || normalized === 'silent') {
    return normalized;
  }
  return 'info';
}

function write(level: Exclude<LogLevel, 'silent'>, scope: string, message: string, context?: LogContext): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[configuredLevel]) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context ? { context: sanitizeContext(context) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function sanitizeContext(context: LogContext): LogContext {
  const result: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (/token|secret|key|authorization/i.test(key)) {
      result[key] = '[redacted]';
    } else if (value instanceof Error) {
      result[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    } else {
      result[key] = value;
    }
  }
  return result;
}
