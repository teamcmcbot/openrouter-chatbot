// lib/utils/logger.ts

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

function getCurrentLevel(): Level {
  const env = (process.env.LOG_LEVEL || '').toLowerCase() as Level | '';
  if (env && ['debug', 'info', 'warn', 'error'].includes(env)) return env as Level;
  return isDev ? 'debug' : 'warn';
}

function enabled(level: Level): boolean {
  return LEVELS[level] >= LEVELS[getCurrentLevel()];
}

function safe(obj: unknown) {
  if (obj == null) return obj as unknown;
  try {
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
    return JSON.stringify(obj).slice(0, 2000);
  } catch {
    return '[unserializable]';
  }
}

function buildPayload(level: Level, message: string, args: unknown[]) {
  const ts = new Date().toISOString();
  // If the last arg is a plain object, treat it as context; otherwise keep args array
  const last = args.length ? args[args.length - 1] : undefined;
  const ctx = last && typeof last === 'object' && !Array.isArray(last) ? (last as Record<string, unknown>) : undefined;
  return ctx
    ? { ts, level, msg: message, ...ctx }
    : { ts, level, msg: message, args: args.map(safe) };
}

// Optional HTTP drain (free-tier friendly). Server-only.
async function drain(payload: unknown, level: Level) {
  if (typeof window !== 'undefined') return; // never send from browser
  const url = process.env.LOG_HTTP_DRAIN_URL;
  if (!url) return;
  // Sampling: always send error/warn; sample info/debug via env (0-1)
  const sample = Number(process.env.LOG_HTTP_DRAIN_SAMPLE_INFO ?? '0');
  if ((level === 'info' || level === 'debug') && Math.random() >= Math.max(0, Math.min(1, sample))) return;

  const timeoutMs = Number(process.env.LOG_HTTP_DRAIN_TIMEOUT_MS ?? '150');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.LOG_HTTP_DRAIN_TOKEN ? { authorization: `Bearer ${process.env.LOG_HTTP_DRAIN_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Do not wait on response body
    }).catch(() => {});
    clearTimeout(t);
  } catch {
    // swallow
  }
}

function log(level: Level, message: string, ...args: unknown[]) {
  if (!enabled(level)) return;
  const payload = buildPayload(level, message, args);

  // In tests, emit plain message and include context args for better debugging
  if (isTest) {
    const hasArgs = Array.isArray(args) && args.length > 0;
    const output = hasArgs ? `${message} ${JSON.stringify(args)}` : message;
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
    return;
  }

  if (isDev) {
    // Developer-friendly output
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
    return;
  }

  // Prod: single-line JSON and correct streams
  const json = JSON.stringify(payload);
  if (level === 'error') console.error(json);
  else if (level === 'warn') console.warn(json);
  else console.log(json);

  // Fire-and-forget optional drain
  drain(payload, level);
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
};
