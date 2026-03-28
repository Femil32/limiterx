import type { LimiterxConfig, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { RateLimitError } from '../core/RateLimitError.js';

/** Minimal Axios types to avoid hard dependency. */
interface AxiosInstance {
  interceptors: {
    request: {
      use(
        onFulfilled: (config: AxiosRequestConfig) => Promise<AxiosRequestConfig>,
        onRejected?: (error: unknown) => unknown,
      ): number;
    };
  };
  [key: string]: unknown;
}

interface AxiosRequestConfig {
  url?: string;
  method?: string;
  [key: string]: unknown;
}

/**
 * Add a rate limiting request interceptor to an Axios instance.
 * When the limit is exceeded, rejects the request with a `RateLimitError` before it reaches the network.
 *
 * @param instance - The Axios instance to add the interceptor to
 * @param config - Rate limiter configuration
 * @returns The same Axios instance (mutated with the interceptor) for chaining
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { rateLimitAxios } from 'limiterx/axios';
 *
 * const client = rateLimitAxios(axios.create({ baseURL: 'https://api.example.com' }), {
 *   max: 10,
 *   window: '1m',
 *   onLimit: () => console.warn('Rate limited')
 * });
 *
 * try {
 *   const res = await client.get('/data');
 * } catch (err) {
 *   if (err.name === 'RateLimitError') {
 *     console.log('Retry after:', err.result.retryAfter, 'ms');
 *   }
 * }
 * ```
 */
export function rateLimitAxios(
  instance: AxiosInstance,
  config: LimiterxConfig,
): AxiosInstance {
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

  instance.interceptors.request.use(
    async (axiosConfig: AxiosRequestConfig): Promise<AxiosRequestConfig> => {
      const ctx: RequestContext = { key: '', config: axiosConfig };

      // FR-019: keyGenerator errors propagate
      const key = await resolvedKeyGenerator(ctx);
      ctx.key = key;

      if (skipFn && (await skipFn(ctx))) {
        return axiosConfig;
      }

      let result;
      try {
        result = await limiter.check(key);
      } catch (storeErr) {
        if (passOnStoreError) {
          return axiosConfig;
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
          console.log(`[limiterx:axios] DENY key="${result.key}" retryAfter=${result.retryAfter}ms`);
        }
        throw new RateLimitError(result);
      }

      if (debug) {
        console.log(`[limiterx:axios] ALLOW key="${result.key}" remaining=${result.remaining}`);
      }

      return axiosConfig;
    },
  );

  return instance;
}
