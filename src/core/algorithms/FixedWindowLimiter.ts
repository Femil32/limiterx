import type { RateLimiterResult, StorageAdapter } from '../types.js';

/**
 * Fixed window rate limiting algorithm.
 * Aligns window boundaries to wall-clock time using `Math.floor(Date.now() / windowMs) * windowMs`.
 *
 * @example
 * ```typescript
 * const limiter = new FixedWindowLimiter(store, 100, 900000); // 100 req / 15min
 * const result = await limiter.check('user-123');
 * ```
 * @internal
 */
export class FixedWindowLimiter {
  constructor(
    private readonly store: StorageAdapter,
    private readonly max: number,
    private readonly windowMs: number,
    private readonly debug: boolean = false,
  ) {}

  /**
   * Execute a rate limit check for the given namespaced key.
   *
   * @param namespacedKey - The full storage key (already namespaced with 'limiterx:')
   * @param displayKey - The user-facing key for the result
   * @returns Rate limit result
   */
  async check(namespacedKey: string, displayKey: string): Promise<RateLimiterResult> {
    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowEnd = currentWindowStart + this.windowMs;
    const resetAt = new Date(windowEnd);
    const retryAfterMs = windowEnd - now;

    // Check existing state
    const state = await this.store.get(namespacedKey);

    if (state && state.windowStart === currentWindowStart) {
      // Same window — check if limit exceeded
      if (state.count >= this.max) {
        if (this.debug) {
          console.log(`[limiterx] DENY key="${displayKey}" count=${state.count} max=${this.max} retryAfter=${retryAfterMs}ms`);
        }
        return {
          allowed: false,
          remaining: 0,
          limit: this.max,
          retryAfter: retryAfterMs,
          resetAt,
          key: displayKey,
        };
      }

      // Increment count
      const newCount = state.count + 1;
      await this.store.set(namespacedKey, { count: newCount, windowStart: currentWindowStart }, retryAfterMs);
      const remaining = Math.max(0, this.max - newCount);

      if (this.debug) {
        console.log(`[limiterx] ALLOW key="${displayKey}" count=${newCount} remaining=${remaining}`);
      }

      return {
        allowed: true,
        remaining,
        limit: this.max,
        retryAfter: 0,
        resetAt,
        key: displayKey,
      };
    }

    // New window — reset count
    await this.store.set(namespacedKey, { count: 1, windowStart: currentWindowStart }, retryAfterMs);
    const remaining = this.max - 1;

    if (this.debug) {
      console.log(`[limiterx] ALLOW key="${displayKey}" count=1 remaining=${remaining} (new window)`);
    }

    return {
      allowed: true,
      remaining,
      limit: this.max,
      retryAfter: 0,
      resetAt,
      key: displayKey,
    };
  }
}
