import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyDemoCredentials } from './credentials.js';

describe('verifyDemoCredentials', () => {
  it('accepts matching username and password', async () => {
    const passwordHash = await bcrypt.hash('secret', 4);
    const result = await verifyDemoCredentials({
      username: ' demo ',
      password: 'secret',
      expectedUsername: 'demo',
      passwordHash,
    });
    expect(result).toEqual({ ok: true, username: 'demo' });
  });

  it('returns mismatch for wrong password without revealing field', async () => {
    const passwordHash = await bcrypt.hash('secret', 4);
    const result = await verifyDemoCredentials({
      username: 'demo',
      password: 'nope',
      expectedUsername: 'demo',
      passwordHash,
    });
    expect(result).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('returns empty for missing fields', async () => {
    const passwordHash = await bcrypt.hash('secret', 4);
    const result = await verifyDemoCredentials({
      username: '',
      password: 'secret',
      expectedUsername: 'demo',
      passwordHash,
    });
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });
});
