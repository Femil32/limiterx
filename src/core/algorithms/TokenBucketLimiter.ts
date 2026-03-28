import type { RateLimiterResult, StorageAdapter } from '../types.js';

/**
 * Token bucket rate limiting algorithm.
 * Allows bursts up to `max` tokens, then throttles to a steady refill rate of
 * `max / windowMs` tokens per millisecond.
 *
 * State is computed lazily on each check — no background refill timer.
 *
 * @internal
 */
export class TokenBucketLimiter {
  constructor(
    private readonly store: StorageAdapter,
    private readonly max: number,
    private readonly windowMs: number,
    private readonly debug: boolean = false,
  ) {}

  /**
   * Execute a rate limit check for the given namespaced key.
   *
   * @param namespacedKey - Full storage key (already namespaced, e.g. 'limiterx:tb:user')
   * @param displayKey - The user-facing key for the result
   */
  async check(namespacedKey: string, displayKey: string, maxOverride?: number): Promise<RateLimiterResult> {
    const effectiveMax = maxOverride ?? this.max;
    const now = Date.now();
    const refillRate = effectiveMax / this.windowMs; // tokens per ms

    const state = await this.store.get(namespacedKey);

    let tokens: number;
    if (!state) {
      // First request — bucket starts full minus one (this request)
      tokens = effectiveMax - 1;
      await this.store.set(
        namespacedKey,
        { tokens, lastRefill: now },
        this.windowMs * 2,
      );

      if (this.debug) {
        console.log(`[limiterx] ALLOW key="${displayKey}" tokens=${tokens} (new bucket)`);
      }

      return {
        allowed: true,
        remaining: Math.floor(tokens),
        limit: effectiveMax,
        retryAfter: 0,
        resetAt: new Date(now + this.windowMs),
        key: displayKey,
      };
    }

    // Refill based on elapsed time since last state write
    const elapsed = now - state['lastRefill'];
    const newTokens = Math.min(effectiveMax, state['tokens'] + elapsed * refillRate);

    if (newTokens >= 1) {
      // Allow — consume one token
      const remaining = newTokens - 1;
      await this.store.set(
        namespacedKey,
        { tokens: remaining, lastRefill: now },
        this.windowMs * 2,
      );

      if (this.debug) {
        console.log(`[limiterx] ALLOW key="${displayKey}" tokens=${remaining.toFixed(3)}`);
      }

      return {
        allowed: true,
        remaining: Math.floor(remaining),
        limit: effectiveMax,
        retryAfter: 0,
        resetAt: new Date(now + this.windowMs),
        key: displayKey,
      };
    }

    // Deny — not enough tokens
    const retryAfter = Math.ceil((1 - newTokens) / refillRate);

    if (this.debug) {
      console.log(
        `[limiterx] DENY key="${displayKey}" tokens=${newTokens.toFixed(3)} retryAfter=${retryAfter}ms`,
      );
    }

    return {
      allowed: false,
      remaining: 0,
      limit: effectiveMax,
      retryAfter,
      resetAt: new Date(now + retryAfter),
      key: displayKey,
    };
  }
}
