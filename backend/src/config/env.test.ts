import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAuthCredentials,
  readServerEnv,
  type ServerEnv,
} from './env.js';

/** Well-formed bcrypt hash (cost 10); not a real deployed secret. */
const SAMPLE_HASH =
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function baseEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    port: 3001,
    nodeEnv: 'test',
    corsOrigin: undefined,
    llmApiUrl: 'https://api.deepseek.com/chat/completions',
    llmApiKey: 'sk-test',
    defaultModel: 'deepseek-v4-flash',
    authUsername: 'demo',
    authPasswordHash: SAMPLE_HASH,
    authSessionTtlHours: 24,
    ...overrides,
  };
}

describe('assertAuthCredentials', () => {
  const prevPassword = process.env.AUTH_PASSWORD;

  afterEach(() => {
    if (prevPassword === undefined) {
      delete process.env.AUTH_PASSWORD;
    } else {
      process.env.AUTH_PASSWORD = prevPassword;
    }
  });

  it('accepts valid username + bcrypt hash + ttl', () => {
    delete process.env.AUTH_PASSWORD;
    expect(() => assertAuthCredentials(baseEnv())).not.toThrow();
  });

  it('rejects missing username', () => {
    delete process.env.AUTH_PASSWORD;
    expect(() =>
      assertAuthCredentials(baseEnv({ authUsername: '' })),
    ).toThrow(/AUTH_USERNAME/);
  });

  it('rejects missing password hash', () => {
    delete process.env.AUTH_PASSWORD;
    expect(() =>
      assertAuthCredentials(baseEnv({ authPasswordHash: '' })),
    ).toThrow(/AUTH_PASSWORD_HASH/);
  });

  it('rejects non-bcrypt hash', () => {
    delete process.env.AUTH_PASSWORD;
    expect(() =>
      assertAuthCredentials(baseEnv({ authPasswordHash: 'plaintext' })),
    ).toThrow(/bcrypt/);
  });

  it('rejects plaintext AUTH_PASSWORD env', () => {
    process.env.AUTH_PASSWORD = 'secret';
    expect(() => assertAuthCredentials(baseEnv())).toThrow(/AUTH_PASSWORD/);
  });

  it('rejects non-positive TTL', () => {
    delete process.env.AUTH_PASSWORD;
    expect(() =>
      assertAuthCredentials(baseEnv({ authSessionTtlHours: 0 })),
    ).toThrow(/AUTH_SESSION_TTL_HOURS/);
  });
});

describe('readServerEnv auth fields', () => {
  const keys = [
    'AUTH_USERNAME',
    'AUTH_PASSWORD_HASH',
    'AUTH_SESSION_TTL_HOURS',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('defaults session TTL to 24 hours', () => {
    for (const key of keys) {
      saved[key] = process.env[key];
    }
    process.env.AUTH_USERNAME = 'demo';
    process.env.AUTH_PASSWORD_HASH = SAMPLE_HASH;
    delete process.env.AUTH_SESSION_TTL_HOURS;

    const env = readServerEnv();
    expect(env.authUsername).toBe('demo');
    expect(env.authPasswordHash).toBe(SAMPLE_HASH);
    expect(env.authSessionTtlHours).toBe(24);
  });
});
