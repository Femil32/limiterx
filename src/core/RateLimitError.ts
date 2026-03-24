import type { RateLimiterResult } from './types.js';

/**
 * Error thrown by frontend adapters when a request is rate limited.
 * Contains the full `RateLimiterResult` for inspection.
 *
 * @example
 * ```typescript
 * try {
 *   await guardedFetch('/api/data');
 * } catch (err) {
 *   if (err instanceof RateLimitError) {
 *     console.log('Retry after:', err.result.retryAfter, 'ms');
 *   }
 * }
 * ```
 */
export class RateLimitError extends Error {
  override readonly name = 'RateLimitError';
  readonly result: RateLimiterResult;

  constructor(result: RateLimiterResult) {
    super(`Rate limit exceeded. Retry after ${result.retryAfter}ms`);
    this.result = result;
  }
}
