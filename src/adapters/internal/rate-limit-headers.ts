import type { RateLimiterResult } from '../../core/types.js';

/**
 * Compute reset seconds from a result for when the request is allowed.
 * Uses (resetAt - now) / 1000 since retryAfter is 0 on allowed requests.
 * @internal
 */
export function computeResetSeconds(result: RateLimiterResult): number {
  return Math.ceil(Math.max(0, result.resetAt.getTime() - Date.now()) / 1000);
}

/**
 * Set standard rate limit headers on an HTTP-like response object.
 * All values are coerced to integers via Math.ceil for header safety (FR-017).
 *
 * @param setHeader - Function to set a header (e.g., res.setHeader or ctx.set)
 * @param result - The rate limiter result
 *
 * @example
 * ```typescript
 * setRateLimitHeadersFull((name, value) => res.setHeader(name, value), result);
 * ```
 * @internal
 */
export function setRateLimitHeadersFull(
  setHeader: (name: string, value: string) => void,
  result: RateLimiterResult,
): void {
  const resetSeconds = result.allowed
    ? computeResetSeconds(result)
    : Math.ceil(result.retryAfter / 1000);

  setHeader('RateLimit-Limit', String(Math.ceil(result.limit)));
  setHeader('RateLimit-Remaining', String(Math.ceil(result.remaining)));
  setHeader('RateLimit-Reset', String(resetSeconds));

  if (!result.allowed) {
    setHeader('Retry-After', String(resetSeconds));
  }
}
