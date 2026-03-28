import type { RateLimiterResult, StorageAdapter } from '../types.js';

/**
 * Sliding window counter rate limiting algorithm.
 * Blends the previous window's count with the current window's count using
 * a weighted formula: `effectiveCount = prev.count × (1 − elapsed/windowMs) + curr.count`
 *
 * This eliminates the burst-at-boundary problem of fixed window counters.
 *
 * @internal
 */
export class SlidingWindowLimiter {
  constructor(
    private readonly store: StorageAdapter,
    private readonly max: number,
    private readonly windowMs: number,
    private readonly debug: boolean = false,
  ) {}

  /**
   * Execute a rate limit check for the given namespaced key.
   * Uses two storage keys: `${namespacedKey}:curr` and `${namespacedKey}:prev`.
   *
   * @param namespacedKey - Full storage key prefix (already namespaced, e.g. 'limiterx:sw:user')
   * @param displayKey - The user-facing key for the result
   */
  async check(namespacedKey: string, displayKey: string, maxOverride?: number): Promise<RateLimiterResult> {
    const effectiveMax = maxOverride ?? this.max;
    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowEnd = currentWindowStart + this.windowMs;
    const elapsed = now - currentWindowStart; // ms elapsed into the current window
    const ttlMs = windowEnd - now; // time until current window ends

    // TTL for curr must cover the full next window so rolling still works
    const currTtlMs = this.windowMs * 2;
    const currKey = `${namespacedKey}:curr`;
    const prevKey = `${namespacedKey}:prev`;

    let [currState, prevState] = await Promise.all([
      this.store.get(currKey),
      this.store.get(prevKey),
    ]);

    const prevWindowStart = currentWindowStart - this.windowMs;

    // If curr belongs to a previous window, handle accordingly
    if (currState && currState['windowStart'] !== currentWindowStart) {
      if (currState['windowStart'] === prevWindowStart) {
        // Curr is from the immediately preceding window — roll it to prev
        await Promise.all([
          this.store.set(prevKey, currState, this.windowMs * 2),
          this.store.delete(currKey),
        ]);
        prevState = currState;
      } else {
        // Curr is from 2+ windows ago — discard (weight would be 0 or negative)
        await this.store.delete(currKey);
        prevState = null;
      }
      currState = null;
    }

    // Only use prevState if it's from the immediately preceding window
    if (prevState && prevState['windowStart'] !== prevWindowStart) {
      prevState = null;
    }

    const prevCount = prevState ? (prevState['count'] ?? 0) : 0;
    const currCount = currState ? (currState['count'] ?? 0) : 0;

    // Weighted sliding window formula
    const effectiveCount = prevCount * (1 - elapsed / this.windowMs) + currCount;

    if (effectiveCount >= effectiveMax) {
      if (this.debug) {
        console.log(
          `[limiterx] DENY key="${displayKey}" effectiveCount=${effectiveCount.toFixed(2)} max=${effectiveMax} retryAfter=${ttlMs}ms`,
        );
      }
      return {
        allowed: false,
        remaining: 0,
        limit: effectiveMax,
        retryAfter: ttlMs,
        resetAt: new Date(windowEnd),
        key: displayKey,
      };
    }

    // Allow — increment curr bucket
    const newCurrCount = currCount + 1;
    await this.store.set(currKey, { count: newCurrCount, windowStart: currentWindowStart }, currTtlMs);
    const remaining = Math.max(0, Math.floor(effectiveMax - effectiveCount - 1));

    if (this.debug) {
      console.log(
        `[limiterx] ALLOW key="${displayKey}" effectiveCount=${effectiveCount.toFixed(2)} remaining=${remaining}`,
      );
    }

    return {
      allowed: true,
      remaining,
      limit: effectiveMax,
      retryAfter: 0,
      resetAt: new Date(windowEnd),
      key: displayKey,
    };
  }
}
