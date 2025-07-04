// lib/utils/logger.ts

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const isDevelopment = process.env.NODE_ENV === 'development';

function log(level: LogLevel, message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;

  if (isDevelopment) {
    console.log(logMessage, ...args);
  } else {
    // In production, you might want to send logs to a service like Sentry, Datadog, etc.
    if (level === LogLevel.ERROR || level === LogLevel.WARN) {
      console.log(JSON.stringify({
        level,
        message: logMessage,
        args,
      }));
    }
  }
}

export const logger = {
  debug: (message: string, ...args: any[]) => log(LogLevel.DEBUG, message, ...args),
  info: (message: string, ...args: any[]) => log(LogLevel.INFO, message, ...args),
  warn: (message: string, ...args: any[]) => log(LogLevel.WARN, message, ...args),
  error: (message: string, ...args: any[]) => log(LogLevel.ERROR, message, ...args),
};
