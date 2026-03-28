import type { LimiterxConfig, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { parseWindow } from '../core/parseWindow.js';
import { setRateLimitHeaders } from './internal/rate-limit-headers.js';
import { maskIPv6 } from './internal/ipv6.js';
import { resolveMessage } from './internal/resolve-message.js';

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
  const ipv6Subnet = config.ipv6Subnet !== undefined ? config.ipv6Subnet : 56;

  const defaultKeyGenerator = (context: RequestContext) => {
    const koaCtx = context.ctx as KoaContext;
    return ipv6Subnet !== false ? maskIPv6(koaCtx.ip, ipv6Subnet) : koaCtx.ip;
  };

  const resolvedConfig: LimiterxConfig = {
    ...config,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
    onLimit: undefined,
  };

  const windowMs = parseWindow(config.window);
  const limiter = createRateLimiter(resolvedConfig);
  const skip = config.skip;
  const onLimit = config.onLimit;
  const handler = config.handler;
  const headers = config.headers !== false;
  const legacyHeaders = config.legacyHeaders ?? false;
  const standardHeaders = config.standardHeaders ?? 'draft-7';
  const identifier = config.identifier;
  const message = config.message ?? 'Too many requests';
  const statusCode = config.statusCode ?? 429;
  const debug = config.debug ?? false;
  const requestPropertyName = config.requestPropertyName ?? 'rateLimit';
  const passOnStoreError = config.passOnStoreError ?? false;
  const skipSuccessfulRequests = config.skipSuccessfulRequests ?? false;
  const skipFailedRequests = config.skipFailedRequests ?? false;
  const requestWasSuccessful = config.requestWasSuccessful;

  return async function rateLimitMiddleware(
    ctx: KoaContext,
    next: KoaNext,
  ): Promise<void> {
    const context: RequestContext = { key: '', ctx };

    const key = await resolvedConfig.keyGenerator!(context);
    context.key = key;

    if (skip && (await skip(context))) {
      await next();
      return;
    }

    let result;
    try {
      result = await limiter.check(key);
    } catch (storeErr) {
      if (passOnStoreError) {
        await next();
        return;
      }
      throw storeErr;
    }

    // Attach result to context for downstream middleware
    ctx[requestPropertyName] = result;

    if (headers) {
      setRateLimitHeaders((name, value) => ctx.set(name, value), result, { standard: true, legacyHeaders, standardHeaders, identifier, windowMs });
    }

    if (!result.allowed) {
      if (onLimit) {
        try {
          await onLimit(result, context);
        } catch {
          // swallow
        }
      }

      if (handler) {
        try {
          await handler(result, context);
        } catch {
          // swallow
        }
        return;
      }

      if (debug) {
        console.log(`[limiterx:koa] DENY key="${result.key}" status=${statusCode}`);
      }
      ctx.status = statusCode;
      ctx.body = await resolveMessage(message, result, context);
      return;
    }

    if (debug) {
      console.log(`[limiterx:koa] ALLOW key="${result.key}" remaining=${result.remaining}`);
    }

    // Register finish hook for skipSuccessfulRequests/skipFailedRequests
    if (skipSuccessfulRequests || skipFailedRequests) {
      const skipKey = key; // capture key in closure
      (ctx.res as { on(event: string, listener: () => void): void }).on('finish', () => {
        void (async () => {
          try {
            const statusCode = ctx.status;
            const defaultSuccess = statusCode < 400;
            const wasSuccessful = requestWasSuccessful
              ? await requestWasSuccessful({ key: skipKey, ctx })
              : defaultSuccess;

            if (skipSuccessfulRequests && wasSuccessful) {
              await limiter.decrement(skipKey);
            } else if (skipFailedRequests && !wasSuccessful) {
              await limiter.decrement(skipKey);
            }
          } catch {
            // Never throw in finish hook
          }
        })();
      });
    }

    await next();
  };
}
