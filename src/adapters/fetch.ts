import type { LimiterxConfig, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { RateLimitError } from '../core/RateLimitError.js';

/**
 * Create a rate-limited fetch wrapper.
 * When the limit is exceeded, throws a `RateLimitError` instead of making a network request.
 *
 * @param fetchFn - The fetch function to wrap (e.g., globalThis.fetch)
 * @param config - Rate limiter configuration
 * @returns A function with the same signature as fetch
 *
 * @example
 * ```typescript
 * import { rateLimitFetch } from 'limiterx/fetch';
 *
 * const guardedFetch = rateLimitFetch(fetch, {
 *   max: 10,
 *   window: '1m',
 *   onLimit: (result) => console.warn(`Fetch blocked. Retry in ${result.retryAfter}ms`)
 * });
 *
 * try {
 *   const res = await guardedFetch('https://api.example.com/data');
 * } catch (err) {
 *   if (err instanceof RateLimitError) {
 *     console.log('Rate limited:', err.result.retryAfter);
 *   }
 * }
 * ```
 */
export function rateLimitFetch(
  fetchFn: typeof fetch,
  config: LimiterxConfig,
): typeof fetch {
  const defaultKeyGenerator = () => 'global';
  const resolvedKeyGenerator = config.keyGenerator ?? defaultKeyGenerator;
  const skipFn = config.skip;
  const onLimit = config.onLimit;
  const debug = config.debug ?? false;
  const passOnStoreError = config.passOnStoreError ?? false;

  const limiter = createRateLimiter({
    ...config,
    keyGenerator: resolvedKeyGenerator,
    onLimit: undefined,
  });

  return async function guardedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const ctx: RequestContext = { key: '', input, init };

    // FR-019: keyGenerator errors propagate
    const key = await resolvedKeyGenerator(ctx);
    ctx.key = key;

    if (skipFn && (await skipFn(ctx))) {
      return fetchFn(input, init);
    }

    let result;
    try {
      result = await limiter.check(key);
    } catch (storeErr) {
      if (passOnStoreError) {
        return fetchFn(input, init);
      }
      throw storeErr;
    }

    if (!result.allowed) {
      if (onLimit) {
        try {
          await onLimit(result, ctx);
        } catch {
          // swallow
        }
      }
      if (debug) {
        console.log(`[limiterx:fetch] DENY key="${result.key}" retryAfter=${result.retryAfter}ms`);
      }
      throw new RateLimitError(result);
    }

    if (debug) {
      console.log(`[limiterx:fetch] ALLOW key="${result.key}" remaining=${result.remaining}`);
    }

    return fetchFn(input, init);
  } as typeof fetch;
}
