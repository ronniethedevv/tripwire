import pino from 'pino';

// Shared structured logger. Redacts secret-ish fields, and we log ids, not
// message bodies (I5). Level via LOG_LEVEL (default 'info').
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: [
      'token',
      'secret',
      'apiKey',
      'api_key',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.api_key',
      'headers.authorization',
      'req.headers.authorization',
      'GITHUB_TOKEN_READONLY',
      'GITHUB_WEBHOOK_SECRET',
      'SWITCH_AGENT_API_KEY',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
