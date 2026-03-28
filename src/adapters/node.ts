import type { IncomingMessage, ServerResponse } from 'http';
import type { LimiterxConfig, RateLimiterResult, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { parseWindow } from '../core/parseWindow.js';
import { setRateLimitHeaders } from './internal/rate-limit-headers.js';
import { maskIPv6 } from './internal/ipv6.js';

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
  const ipv6Subnet = config.ipv6Subnet !== undefined ? config.ipv6Subnet : 56;

  const defaultKeyGenerator = (ctx: RequestContext) => {
    const req = ctx.req as IncomingMessage;
    const ip = req.socket?.remoteAddress || '127.0.0.1';
    return ipv6Subnet !== false ? maskIPv6(ip, ipv6Subnet) : ip;
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
  const headers = config.headers !== false;
  const legacyHeaders = config.legacyHeaders ?? false;
  const standardHeaders = config.standardHeaders ?? 'draft-7';
  const identifier = config.identifier;
  const debug = config.debug ?? false;
  const passOnStoreError = config.passOnStoreError ?? false;
  // NOTE: skipSuccessfulRequests/skipFailedRequests in the Node adapter is developer-managed.
  // The node adapter returns a result and the developer controls the response; call
  // `limiter.decrement(key)` manually after the response if you want to skip counting.

  return {
    async check(req: IncomingMessage, res: ServerResponse): Promise<RateLimiterResult> {
      const ctx: RequestContext = { key: '', req, res };

      // FR-019: keyGenerator errors propagate
      const key = await resolvedConfig.keyGenerator!(ctx);
      ctx.key = key;

      if (skip && (await skip(ctx))) {
        // Skip: don't count, return a synthetic result
        const staticMax = typeof resolvedConfig.max === 'number' ? resolvedConfig.max : 0;
        const result: RateLimiterResult = {
          allowed: true,
          remaining: staticMax,
          limit: staticMax,
          retryAfter: 0,
          resetAt: new Date(Date.now()),
          key: key || 'global',
        };
        if (headers) {
          setRateLimitHeaders((name, value) => res.setHeader(name, value), result, { standard: true, legacyHeaders, standardHeaders, identifier, windowMs });
        }
        return result;
      }

      let result: RateLimiterResult;
      try {
        result = await limiter.check(key);
      } catch (storeErr) {
        if (passOnStoreError) {
          const staticMax = typeof resolvedConfig.max === 'number' ? resolvedConfig.max : 0;
          return {
            allowed: true,
            remaining: staticMax,
            limit: staticMax,
            retryAfter: 0,
            resetAt: new Date(Date.now()),
            key: key || 'global',
          };
        }
        throw storeErr;
      }

      if (headers || legacyHeaders) {
        setRateLimitHeaders((name, value) => res.setHeader(name, value), result, { standard: headers, legacyHeaders, standardHeaders, identifier, windowMs });
      }

      if (!result.allowed && onLimit) {
        try {
          await onLimit(result, ctx);
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
