import { describe, expect, it } from 'vitest';
import { LoginRateGuard } from './loginRateLimit.js';

describe('LoginRateGuard', () => {
  it('blocks after max failures per IP before bcrypt would run', () => {
    const guard = new LoginRateGuard({
      windowMs: 60_000,
      maxFailures: 3,
      maxRequestsPerIp: 100,
    });
    const now = 1_700_000_000_000;
    expect(guard.isFailureBlocked('1.1.1.1', 'demo', now)).toBe(false);
    guard.recordFailure('1.1.1.1', 'demo', now);
    guard.recordFailure('1.1.1.1', 'demo', now + 1);
    guard.recordFailure('1.1.1.1', 'demo', now + 2);
    expect(guard.isFailureBlocked('1.1.1.1', 'demo', now + 3)).toBe(true);
    // Different IP still ok for same user until user bucket fills — user also recorded
    expect(guard.isFailureBlocked('2.2.2.2', 'demo', now + 3)).toBe(true);
  });

  it('clears failure lockout after successful login signal', () => {
    const guard = new LoginRateGuard({
      windowMs: 60_000,
      maxFailures: 2,
      maxRequestsPerIp: 100,
    });
    const now = 1_700_000_000_000;
    guard.recordFailure('1.1.1.1', 'demo', now);
    guard.recordFailure('1.1.1.1', 'demo', now + 1);
    expect(guard.isFailureBlocked('1.1.1.1', 'demo', now + 2)).toBe(true);
    guard.clearFailures('1.1.1.1', 'demo');
    expect(guard.isFailureBlocked('1.1.1.1', 'demo', now + 3)).toBe(false);
  });

  it('enforces absolute request cap per IP', () => {
    const guard = new LoginRateGuard({
      windowMs: 60_000,
      maxFailures: 100,
      maxRequestsPerIp: 3,
    });
    const now = 1_700_000_000_000;
    expect(guard.tryBeginRequest('9.9.9.9', now)).toBe(true);
    expect(guard.tryBeginRequest('9.9.9.9', now + 1)).toBe(true);
    expect(guard.tryBeginRequest('9.9.9.9', now + 2)).toBe(true);
    expect(guard.tryBeginRequest('9.9.9.9', now + 3)).toBe(false);
  });
});
