import type { FlowGuardConfig, RateLimiterResult, RequestContext } from '../core/types.js';
import { createRateLimiter } from '../core/createRateLimiter.js';
import { setRateLimitHeadersFull } from './internal/rate-limit-headers.js';

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
 * import { rateLimitNext } from 'flowguard/next';
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
export function rateLimitNext(config: FlowGuardConfig): NextRateLimiter {
  const defaultKeyGenerator = (ctx: RequestContext) => {
    const req = ctx.req as NextApiRequest;
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined;
    return forwardedIp || req.socket?.remoteAddress || '127.0.0.1';
  };

  const resolvedConfig: FlowGuardConfig = {
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

  return {
    async check(req: NextApiRequest, res: NextApiResponse): Promise<RateLimiterResult> {
      const ctx: RequestContext = { key: '', req, res };

      const key = resolvedConfig.keyGenerator!(ctx);
      ctx.key = key;

      if (skip && skip(ctx)) {
        const result: RateLimiterResult = {
          allowed: true,
          remaining: resolvedConfig.max,
          limit: resolvedConfig.max,
          retryAfter: 0,
          resetAt: new Date(),
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

      if (!result.allowed) {
        if (onLimit) {
          try {
            onLimit(result, ctx);
          } catch {
            // swallow
          }
        }
        if (debug) {
          console.log(`[flowguard:next] DENY key="${result.key}" status=${statusCode}`);
        }
        res.status(statusCode);
        if (typeof message === 'string') {
          res.send(message);
        } else {
          res.json(message);
        }
      } else if (debug) {
        console.log(`[flowguard:next] ALLOW key="${result.key}" remaining=${result.remaining}`);
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
 *
 * @param config - Rate limiter configuration
 * @returns Async function for Edge middleware
 *
 * @example
 * ```typescript
 * import { rateLimitEdge } from 'flowguard/next';
 *
 * export const middleware = rateLimitEdge({ max: 10, window: '30s' });
 * export const config = { matcher: ['/api/:path*'] };
 * ```
 */
export function rateLimitEdge(config: FlowGuardConfig) {
  const defaultKeyGenerator = (ctx: RequestContext) => {
    const request = ctx.request as NextRequest;
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    return request.ip || forwarded || 'unknown';
  };

  const resolvedConfig: FlowGuardConfig = {
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

  return async function edgeRateLimitMiddleware(
    request: NextRequest,
  ): Promise<Response | undefined> {
    const ctx: RequestContext = { key: '', request };

    const key = resolvedConfig.keyGenerator!(ctx);
    ctx.key = key;

    if (skip && skip(ctx)) {
      return undefined;
    }

    const result = await limiter.check(key);

    if (!result.allowed) {
      if (onLimit) {
        try {
          onLimit(result, ctx);
        } catch {
          // swallow
        }
      }

      if (debug) {
        console.log(`[flowguard:edge] DENY key="${result.key}" status=${statusCode}`);
      }

      const body = typeof message === 'string' ? message : JSON.stringify(message);
      const contentType = typeof message === 'string' ? 'text/plain' : 'application/json';

      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
      };

      if (headers) {
        const resetSeconds = Math.ceil(result.retryAfter / 1000);
        responseHeaders['RateLimit-Limit'] = String(Math.ceil(result.limit));
        responseHeaders['RateLimit-Remaining'] = String(Math.ceil(result.remaining));
        responseHeaders['RateLimit-Reset'] = String(resetSeconds);
        responseHeaders['Retry-After'] = String(resetSeconds);
      }

      return new Response(body, {
        status: statusCode,
        headers: responseHeaders,
      });
    }

    if (debug) {
      console.log(`[flowguard:edge] ALLOW key="${result.key}" remaining=${result.remaining}`);
    }

    return undefined;
  };
}
