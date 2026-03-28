import type { Request, Response, NextFunction } from 'express';
import type { LimiterxConfig, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { parseWindow } from '../core/parseWindow.js';
import { setRateLimitHeaders } from './internal/rate-limit-headers.js';
import { maskIPv6 } from './internal/ipv6.js';
import { resolveMessage } from './internal/resolve-message.js';

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
  const ipv6Subnet = config.ipv6Subnet !== undefined ? config.ipv6Subnet : 56;

  const defaultKeyGenerator = (ctx: RequestContext) => {
    const req = ctx.req as Request;
    const ip = req.ip || '127.0.0.1';
    return ipv6Subnet !== false ? maskIPv6(ip, ipv6Subnet) : ip;
  };

  const resolvedConfig: LimiterxConfig = {
    ...config,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
    onLimit: undefined, // Adapter handles onLimit with full context
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
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx: RequestContext = { key: '', req, res };

      // Resolve key — FR-019: keyGenerator errors propagate to next(err)
      const key = await resolvedConfig.keyGenerator!(ctx);
      ctx.key = key;

      // Skip check — request passes without counting
      if (skip && (await skip(ctx))) {
        next();
        return;
      }

      // Check rate limit — wrap for passOnStoreError support
      let result;
      try {
        result = await limiter.check(key);
      } catch (storeErr) {
        if (passOnStoreError) {
          next();
          return;
        }
        throw storeErr;
      }

      // Attach result to request object for downstream middleware
      (req as unknown as Record<string, unknown>)[requestPropertyName] = result;

      if (headers) {
        setRateLimitHeaders((name, value) => res.setHeader(name, value), result, { standard: true, legacyHeaders, standardHeaders, identifier, windowMs });
      }

      if (!result.allowed) {
        if (onLimit) {
          try {
            await onLimit(result, ctx);
          } catch {
            // swallow onLimit errors
          }
        }

        if (handler) {
          try {
            await handler(result, ctx);
          } catch {
            // swallow handler errors
          }
          return;
        }

        if (debug) {
          console.log(`[limiterx:express] DENY key="${result.key}" status=${statusCode}`);
        }

        const body = await resolveMessage(message, result, ctx);
        res.status(statusCode);
        if (typeof body === 'string') {
          res.send(body);
        } else {
          res.json(body);
        }
        return;
      }

      if (debug) {
        console.log(`[limiterx:express] ALLOW key="${result.key}" remaining=${result.remaining}`);
      }

      // Register finish hook for skipSuccessfulRequests/skipFailedRequests
      if (skipSuccessfulRequests || skipFailedRequests) {
        const skipKey = key; // capture key in closure
        res.on('finish', () => {
          void (async () => {
            try {
              const statusCode = res.statusCode;
              const defaultSuccess = statusCode < 400;
              const wasSuccessful = requestWasSuccessful
                ? await requestWasSuccessful({ key: skipKey, req, res })
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

      next();
    } catch (err) {
      next(err as Error);
    }
  };
}
