import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const MAX_USERNAME_LEN = 64;
const MAX_PASSWORD_LEN = 128;

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Spend comparable work on length mismatch without leaking which side differed.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export type CredentialCheckResult =
  | { ok: true; username: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'mismatch' };

/**
 * Verify demo username/password against env.
 * Never distinguishes unknown user vs bad password in the result reason for clients.
 */
export async function verifyDemoCredentials(input: {
  username: unknown;
  password: unknown;
  expectedUsername: string;
  passwordHash: string;
}): Promise<CredentialCheckResult> {
  const username =
    typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!username || !password) {
    return { ok: false, reason: 'empty' };
  }
  if (
    username.length > MAX_USERNAME_LEN ||
    password.length > MAX_PASSWORD_LEN
  ) {
    return { ok: false, reason: 'too_long' };
  }

  const userOk = timingSafeEqualString(username, input.expectedUsername);
  const passOk = await bcrypt.compare(password, input.passwordHash);

  if (!userOk || !passOk) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, username: input.expectedUsername };
}
