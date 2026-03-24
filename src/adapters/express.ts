import type { Request, Response, NextFunction } from 'express';
import type { LimiterxConfig, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { setRateLimitHeadersFull } from './internal/rate-limit-headers.js';

/**
 * Create Express middleware for rate limiting.
 *
 * @param config - Rate limiter configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { rateLimitExpress } from 'limiterx/express';
 *
 * const app = express();
 * app.use(rateLimitExpress({ max: 100, window: '15m' }));
 * ```
 */
export function rateLimitExpress(config: LimiterxConfig) {
  const defaultKeyGenerator = (ctx: RequestContext) => {
    const req = ctx.req as Request;
    return req.ip || '127.0.0.1';
  };

  const resolvedConfig: LimiterxConfig = {
    ...config,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
    onLimit: undefined, // Adapter handles onLimit with full context
  };

  const limiter = createRateLimiter(resolvedConfig);
  const skip = config.skip;
  const onLimit = config.onLimit;
  const headers = config.headers !== false;
  const message = config.message ?? 'Too many requests';
  const statusCode = config.statusCode ?? 429;
  const debug = config.debug ?? false;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx: RequestContext = { key: '', req, res };

      // Resolve key — FR-019: keyGenerator errors propagate to next(err)
      const key = resolvedConfig.keyGenerator!(ctx);
      ctx.key = key;

      // Skip check — request passes without counting
      if (skip && skip(ctx)) {
        next();
        return;
      }

      const result = await limiter.check(key);

      if (headers) {
        setRateLimitHeadersFull((name, value) => res.setHeader(name, value), result);
      }

      if (!result.allowed) {
        if (onLimit) {
          try {
            onLimit(result, ctx);
          } catch {
            // swallow onLimit errors
          }
        }
        if (debug) {
          console.log(`[limiterx:express] DENY key="${result.key}" status=${statusCode}`);
        }
        res.status(statusCode);
        if (typeof message === 'string') {
          res.send(message);
        } else {
          res.json(message);
        }
        return;
      }

      if (debug) {
        console.log(`[limiterx:express] ALLOW key="${result.key}" remaining=${result.remaining}`);
      }

      next();
    } catch (err) {
      next(err as Error);
    }
  };
}
