export class RateLimiter {
  private timestamps = new Map<string, number[]>();

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  tryConsume(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const existing = this.timestamps.get(key) ?? [];
    const recent = existing.filter((ts) => ts > windowStart);

    if (recent.length >= this.maxRequests) {
      this.timestamps.set(key, recent);
      return false;
    }

    recent.push(now);
    this.timestamps.set(key, recent);
    return true;
  }
}
