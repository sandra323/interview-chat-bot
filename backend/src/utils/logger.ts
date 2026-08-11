type LogLevel = 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, meta?: LogMeta): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: LogMeta): void {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: LogMeta): void {
    console.error(formatLog('error', message, meta));
  },
};
