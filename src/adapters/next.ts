import type { LimiterxConfig, RateLimiterResult, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { parseWindow } from '../core/parseWindow.js';
import { setRateLimitHeaders } from './internal/rate-limit-headers.js';
import { maskIPv6 } from './internal/ipv6.js';
import { resolveMessage } from './internal/resolve-message.js';

/**
 * Next.js API route rate limiter.
 */
export interface NextRateLimiter {
  /** Check rate limit, set headers, and send 429 response when denied. */
  check(req: NextApiRequest, res: NextApiResponse): Promise<RateLimiterResult>;
}

/** Minimal Next.js API request type. */
interface NextApiRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  [key: string]: unknown;
}

/** Minimal Next.js API response type. */
interface NextApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): NextApiResponse;
  json(body: unknown): void;
  send(body: string): void;
  end(): void;
  [key: string]: unknown;
}

/** Minimal Next.js Request type for edge middleware. */
interface NextRequest {
  ip?: string;
  headers: Headers;
  [key: string]: unknown;
}

/**
 * Create a rate limiter for Next.js API routes (Pages Router and App Router).
 *
 * @param config - Rate limiter configuration
 * @returns NextRateLimiter with check() method
 *
 * @example
 * ```typescript
 * import { rateLimitNext } from 'limiterx/next';
 *
 * const limiter = rateLimitNext({ max: 20, window: '1m' });
 *
 * export default async function handler(req, res) {
 *   const result = await limiter.check(req, res);
 *   if (!result.allowed) return;
 *   res.json({ data: 'ok' });
 * }
 * ```
 */
export function rateLimitNext(config: LimiterxConfig): NextRateLimiter {
  const ipv6Subnet = config.ipv6Subnet !== undefined ? config.ipv6Subnet : 56;

  const defaultKeyGenerator = (ctx: RequestContext) => {
    const req = ctx.req as NextApiRequest;
    const forwarded = req.headers['x-forwarded-for'];
    const rawIp = (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined)
      || req.socket?.remoteAddress
      || '127.0.0.1';
    return ipv6Subnet !== false ? maskIPv6(rawIp, ipv6Subnet) : rawIp;
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

  return {
    async check(req: NextApiRequest, res: NextApiResponse): Promise<RateLimiterResult> {
      const ctx: RequestContext = { key: '', req, res };

      const key = await resolvedConfig.keyGenerator!(ctx);
      ctx.key = key;

      if (skip && (await skip(ctx))) {
        const staticMax = typeof resolvedConfig.max === 'number' ? resolvedConfig.max : 0;
        const result: RateLimiterResult = {
          allowed: true,
          remaining: staticMax,
          limit: staticMax,
          retryAfter: 0,
          resetAt: new Date(),
          key: key || 'global',
        };
        if (headers || legacyHeaders) {
          setRateLimitHeaders((name, value) => res.setHeader(name, value), result, { standard: headers, legacyHeaders, standardHeaders, identifier, windowMs });
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
            resetAt: new Date(),
            key: key || 'global',
          };
        }
        throw storeErr;
      }

      // Attach result to request for downstream access
      (req as unknown as Record<string, unknown>)[requestPropertyName] = result;

      if (headers) {
        setRateLimitHeaders((name, value) => res.setHeader(name, value), result, { standard: true, legacyHeaders, standardHeaders, identifier, windowMs });
      }

      if (!result.allowed) {
        if (onLimit) {
          try {
            await onLimit(result, ctx);
          } catch {
            // swallow
          }
        }

        if (handler) {
          try {
            await handler(result, ctx);
          } catch {
            // swallow
          }
          return result;
        }

        if (debug) {
          console.log(`[limiterx:next] DENY key="${result.key}" status=${statusCode}`);
        }
        res.status(statusCode);
        const body = await resolveMessage(message, result, ctx);
        if (typeof body === 'string') {
          res.send(body);
        } else {
          res.json(body);
        }
      } else {
        if (debug) {
          console.log(`[limiterx:next] ALLOW key="${result.key}" remaining=${result.remaining}`);
        }

        // Register finish hook for skipSuccessfulRequests/skipFailedRequests
        if (skipSuccessfulRequests || skipFailedRequests) {
          const skipKey = key; // capture key in closure
          const nodeRes = res as unknown as { on(event: string, listener: () => void): void };
          nodeRes.on('finish', () => {
            void (async () => {
              try {
                const resStatusCode = (res as unknown as { statusCode: number }).statusCode ?? 200;
                const defaultSuccess = resStatusCode < 400;
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
      }

      return result;
    },
  };
}

/**
 * Create a rate limiter for Next.js Edge Middleware.
 * Returns `undefined` when allowed (middleware continues), or a `Response` with 429 when denied.
 *
 * **Note**: State is per-isolate in edge runtimes — not shared across instances.
 * **Note**: `skipSuccessfulRequests` and `skipFailedRequests` are not supported in edge middleware.
 *
 * @param config - Rate limiter configuration
 * @returns Async function for Edge middleware
 *
 * @example
 * ```typescript
 * import { rateLimitEdge } from 'limiterx/next';
 *
 * export const middleware = rateLimitEdge({ max: 10, window: '30s' });
 * export const config = { matcher: ['/api/:path*'] };
 * ```
 */
export function rateLimitEdge(config: LimiterxConfig) {
  const ipv6Subnet = config.ipv6Subnet !== undefined ? config.ipv6Subnet : 56;

  const defaultKeyGenerator = (ctx: RequestContext) => {
    const request = ctx.request as NextRequest;
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const rawIp = request.ip || forwarded || 'unknown';
    return ipv6Subnet !== false ? maskIPv6(rawIp, ipv6Subnet) : rawIp;
  };

  const resolvedConfig: LimiterxConfig = {
    ...config,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
    onLimit: undefined,
  };

  const windowMsEdge = parseWindow(config.window);
  const limiter = createRateLimiter(resolvedConfig);
  const skip = config.skip;
  const onLimit = config.onLimit;
  const handler = config.handler;
  const headers = config.headers !== false;
  const legacyHeaders = config.legacyHeaders ?? false;
  // NOTE: skipSuccessfulRequests and skipFailedRequests are not supported in edge middleware
  // because Edge Runtime does not support Node.js response 'finish' events.
  const standardHeadersEdge = config.standardHeaders ?? 'draft-7';
  const identifierEdge = config.identifier;
  const message = config.message ?? 'Too many requests';
  const statusCode = config.statusCode ?? 429;
  const debug = config.debug ?? false;
  const passOnStoreError = config.passOnStoreError ?? false;

  return async function edgeRateLimitMiddleware(
    request: NextRequest,
  ): Promise<Response | undefined> {
    const ctx: RequestContext = { key: '', request };

    const key = await resolvedConfig.keyGenerator!(ctx);
    ctx.key = key;

    if (skip && (await skip(ctx))) {
      return undefined;
    }

    let result: RateLimiterResult;
    try {
      result = await limiter.check(key);
    } catch (storeErr) {
      if (passOnStoreError) {
        return undefined;
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

      if (handler) {
        try {
          await handler(result, ctx);
        } catch {
          // swallow
        }
        // handler is responsible for response — edge adapter cannot intercept it
        return undefined;
      }

      if (debug) {
        console.log(`[limiterx:edge] DENY key="${result.key}" status=${statusCode}`);
      }

      const resolvedMsg = await resolveMessage(message, result, ctx);
      const body = typeof resolvedMsg === 'string' ? resolvedMsg : JSON.stringify(resolvedMsg);
      const contentType = typeof resolvedMsg === 'string' ? 'text/plain' : 'application/json';

      const responseHeaders: Record<string, string> = { 'Content-Type': contentType };

      if (headers) {
        const resetSeconds = Math.ceil(result.retryAfter / 1000);
        if (standardHeadersEdge === 'draft-6') {
          responseHeaders['RateLimit'] = `limit=${Math.ceil(result.limit)}, remaining=${Math.ceil(result.remaining)}, reset=${resetSeconds}`;
          responseHeaders['Retry-After'] = String(resetSeconds);
        } else if (standardHeadersEdge === 'draft-8') {
          responseHeaders['RateLimit-Limit'] = String(Math.ceil(result.limit));
          responseHeaders['RateLimit-Remaining'] = String(Math.ceil(result.remaining));
          responseHeaders['RateLimit-Reset'] = String(resetSeconds);
          responseHeaders['Retry-After'] = String(resetSeconds);
          const windowSec = Math.round(windowMsEdge / 1000);
          const policyValue = identifierEdge
            ? `${identifierEdge};w=${windowSec}`
            : `${Math.ceil(result.limit)};w=${windowSec}`;
          responseHeaders['RateLimit-Policy'] = policyValue;
        } else {
          // draft-7 (default)
          responseHeaders['RateLimit-Limit'] = String(Math.ceil(result.limit));
          responseHeaders['RateLimit-Remaining'] = String(Math.ceil(result.remaining));
          responseHeaders['RateLimit-Reset'] = String(resetSeconds);
          responseHeaders['Retry-After'] = String(resetSeconds);
        }
        if (legacyHeaders) {
          const epochSeconds = Math.floor(result.resetAt.getTime() / 1000);
          responseHeaders['X-RateLimit-Limit'] = String(Math.ceil(result.limit));
          responseHeaders['X-RateLimit-Remaining'] = String(Math.ceil(result.remaining));
          responseHeaders['X-RateLimit-Reset'] = String(epochSeconds);
        }
      }

      return new Response(body, { status: statusCode, headers: responseHeaders });
    }

    if (debug) {
      console.log(`[limiterx:edge] ALLOW key="${result.key}" remaining=${result.remaining}`);
    }

    return undefined;
  };
}
