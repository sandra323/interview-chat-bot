/**
 * Sliding-window counters for login abuse protection.
 * - Request cap: limits POSTs per IP before bcrypt (CPU DoS).
 * - Failure caps: per-IP and per-username lockouts after bad passwords.
 */

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_REQUESTS_PER_IP = 20;
const DEFAULT_MAX_FAILURES = 5;

class SlidingWindowCounter {
  private timestamps = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private prune(key: string, now: number): number[] {
    const windowStart = now - this.windowMs;
    const recent = (this.timestamps.get(key) ?? []).filter(
      (ts) => ts > windowStart,
    );
    this.timestamps.set(key, recent);
    return recent;
  }

  count(key: string, now: number = Date.now()): number {
    return this.prune(key, now).length;
  }

  isAtLimit(key: string, now: number = Date.now()): boolean {
    return this.count(key, now) >= this.max;
  }

  /** Record an event; returns false if already at limit (does not add). */
  tryAdd(key: string, now: number = Date.now()): boolean {
    const recent = this.prune(key, now);
    if (recent.length >= this.max) {
      return false;
    }
    recent.push(now);
    this.timestamps.set(key, recent);
    return true;
  }

  clear(key: string): void {
    this.timestamps.delete(key);
  }

  clearAll(): void {
    this.timestamps.clear();
  }
}

export interface LoginRateGuardOptions {
  windowMs?: number;
  maxRequestsPerIp?: number;
  maxFailures?: number;
}

export class LoginRateGuard {
  private readonly requests: SlidingWindowCounter;
  private readonly failures: SlidingWindowCounter;

  constructor(options: LoginRateGuardOptions = {}) {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.requests = new SlidingWindowCounter(
      options.maxRequestsPerIp ?? DEFAULT_MAX_REQUESTS_PER_IP,
      windowMs,
    );
    this.failures = new SlidingWindowCounter(
      options.maxFailures ?? DEFAULT_MAX_FAILURES,
      windowMs,
    );
  }

  /** Absolute POST quota per IP (before bcrypt). */
  tryBeginRequest(ip: string, now: number = Date.now()): boolean {
    return this.requests.tryAdd(`req:${ip || 'unknown'}`, now);
  }

  /** True when IP or username already hit failure lockout. */
  isFailureBlocked(
    ip: string,
    username: string,
    now: number = Date.now(),
  ): boolean {
    const safeIp = ip || 'unknown';
    const safeUser = username.trim().toLowerCase() || 'unknown';
    return (
      this.failures.isAtLimit(`ip:${safeIp}`, now) ||
      this.failures.isAtLimit(`user:${safeUser}`, now)
    );
  }

  recordFailure(ip: string, username: string, now: number = Date.now()): void {
    const safeIp = ip || 'unknown';
    const safeUser = username.trim().toLowerCase() || 'unknown';
    this.failures.tryAdd(`ip:${safeIp}`, now);
    this.failures.tryAdd(`user:${safeUser}`, now);
  }

  clearFailures(ip: string, username: string): void {
    const safeIp = ip || 'unknown';
    const safeUser = username.trim().toLowerCase() || 'unknown';
    this.failures.clear(`ip:${safeIp}`);
    this.failures.clear(`user:${safeUser}`);
  }

  /** Test helper. */
  reset(): void {
    this.requests.clearAll();
    this.failures.clearAll();
  }
}

let singleton: LoginRateGuard | null = null;

export function getLoginRateGuard(): LoginRateGuard {
  if (!singleton) {
    singleton = new LoginRateGuard();
  }
  return singleton;
}

export function resetLoginRateGuardForTests(
  options?: LoginRateGuardOptions,
): LoginRateGuard {
  singleton = new LoginRateGuard(options);
  return singleton;
}
