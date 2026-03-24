import type { LimiterxConfig, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { setRateLimitHeadersFull } from './internal/rate-limit-headers.js';

/** Minimal Koa Context type. */
interface KoaContext {
  ip: string;
  status: number;
  body: unknown;
  set(name: string, value: string): void;
  [key: string]: unknown;
}

/** Minimal Koa Next type. */
type KoaNext = () => Promise<void>;

/**
 * Create Koa middleware for rate limiting.
 *
 * @param config - Rate limiter configuration
 * @returns Koa middleware function
 *
 * @example
 * ```typescript
 * import Koa from 'koa';
 * import { rateLimitKoa } from 'limiterx/koa';
 *
 * const app = new Koa();
 * app.use(rateLimitKoa({ max: 60, window: '1m' }));
 * ```
 */
export function rateLimitKoa(config: LimiterxConfig) {
  const defaultKeyGenerator = (context: RequestContext) => {
    const koaCtx = context.ctx as KoaContext;
    return koaCtx.ip;
  };

  const resolvedConfig: LimiterxConfig = {
    ...config,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
    onLimit: undefined,
  };

  const limiter = createRateLimiter(resolvedConfig);
  const skip = config.skip;
  const onLimit = config.onLimit;
  const headers = config.headers !== false;
  const message = config.message ?? 'Too many requests';
  const statusCode = config.statusCode ?? 429;
  const debug = config.debug ?? false;

  return async function rateLimitMiddleware(
    ctx: KoaContext,
    next: KoaNext,
  ): Promise<void> {
    const context: RequestContext = { key: '', ctx };

    const key = resolvedConfig.keyGenerator!(context);
    context.key = key;

    if (skip && skip(context)) {
      await next();
      return;
    }

    const result = await limiter.check(key);

    if (headers) {
      setRateLimitHeadersFull((name, value) => ctx.set(name, value), result);
    }

    if (!result.allowed) {
      if (onLimit) {
        try {
          onLimit(result, context);
        } catch {
          // swallow
        }
      }
      if (debug) {
        console.log(`[limiterx:koa] DENY key="${result.key}" status=${statusCode}`);
      }
      ctx.status = statusCode;
      ctx.body = message;
      return;
    }

    if (debug) {
      console.log(`[limiterx:koa] ALLOW key="${result.key}" remaining=${result.remaining}`);
    }

    await next();
  };
}
