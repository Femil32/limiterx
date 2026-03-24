import type { IncomingMessage, ServerResponse } from 'http';
import type { LimiterxConfig, RateLimiterResult, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { setRateLimitHeadersFull } from './internal/rate-limit-headers.js';

/**
 * Node HTTP rate limiter result.
 */
export interface NodeRateLimiter {
  /** Check rate limit and set headers on the response. Developer controls response flow. */
  check(req: IncomingMessage, res: ServerResponse): Promise<RateLimiterResult>;
}

/**
 * Create a rate limiter for raw Node.js HTTP servers.
 * Returns an object with `check()` — the developer controls response sending.
 *
 * @param config - Rate limiter configuration
 * @returns NodeRateLimiter with check() method
 *
 * @example
 * ```typescript
 * import http from 'http';
 * import { rateLimitNode } from 'limiterx/node';
 *
 * const limiter = rateLimitNode({ max: 50, window: '1m' });
 *
 * http.createServer(async (req, res) => {
 *   const result = await limiter.check(req, res);
 *   if (!result.allowed) {
 *     res.writeHead(429);
 *     res.end('Too Many Requests');
 *     return;
 *   }
 *   res.end('OK');
 * }).listen(3000);
 * ```
 */
export function rateLimitNode(config: LimiterxConfig): NodeRateLimiter {
  const defaultKeyGenerator = (ctx: RequestContext) => {
    const req = ctx.req as IncomingMessage;
    return req.socket?.remoteAddress || '127.0.0.1';
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
  const debug = config.debug ?? false;

  return {
    async check(req: IncomingMessage, res: ServerResponse): Promise<RateLimiterResult> {
      const ctx: RequestContext = { key: '', req, res };

      // FR-019: keyGenerator errors propagate
      const key = resolvedConfig.keyGenerator!(ctx);
      ctx.key = key;

      if (skip && skip(ctx)) {
        // Skip: don't count, return a synthetic result
        const result: RateLimiterResult = {
          allowed: true,
          remaining: resolvedConfig.max,
          limit: resolvedConfig.max,
          retryAfter: 0,
          resetAt: new Date(Date.now()),
          key: key || 'global',
        };
        if (headers) {
          setRateLimitHeadersFull((name, value) => res.setHeader(name, value), result);
        }
        return result;
      }

      const result = await limiter.check(key);

      if (headers) {
        setRateLimitHeadersFull((name, value) => res.setHeader(name, value), result);
      }

      if (!result.allowed && onLimit) {
        try {
          onLimit(result, ctx);
        } catch {
          // swallow
        }
      }

      if (debug) {
        const action = result.allowed ? 'ALLOW' : 'DENY';
        console.log(`[limiterx:node] ${action} key="${result.key}" remaining=${result.remaining}`);
      }

      return result;
    },
  };
}
