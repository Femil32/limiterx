/**
 * Unified configuration object for creating a rate limiter.
 * Accepted by `createRateLimiter()` and all adapter factory functions.
 *
 * @example
 * ```typescript
 * const config: LimiterxConfig = {
 *   max: 100,
 *   window: '15m',
 *   onLimit: (result) => console.log(`Blocked: ${result.key}`)
 * };
 * ```
 */
export interface LimiterxConfig {
  /**
   * Maximum number of requests allowed per window.
   * Accepts a positive integer or a sync/async function that receives the request context
   * and returns the limit for that specific request (useful for per-user tiers).
   */
  max: number | ((ctx: RequestContext) => number | Promise<number>);
  /** Window duration in milliseconds (number) or as a human-readable string ('30s', '5m', '1h', '1d'). */
  window: number | string;
  /** Algorithm to use. Defaults to 'fixed-window'. */
  algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket';
  /**
   * Custom storage backend. Defaults to an in-memory LRU store.
   * Use `RedisStore` from `limiterx/redis` for multi-process deployments.
   */
  store?: StorageAdapter;
  /**
   * Custom function to generate a rate limiting key from the request context.
   * Defaults to IP address for backend adapters, 'global' for frontend adapters.
   * Supports async functions (return a Promise<string>).
   */
  keyGenerator?: (ctx: RequestContext) => string | Promise<string>;
  /**
   * Callback invoked when a request is denied. Errors thrown by this callback are silently swallowed.
   * Supports async functions.
   */
  onLimit?: (result: RateLimiterResult, ctx: RequestContext) => void | Promise<void>;
  /**
   * Maximum number of distinct keys stored in the internal memory store (LRU eviction).
   * @default 10000
   */
  maxKeys?: number;
  /**
   * Enable console diagnostic output for troubleshooting.
   * WARNING: Debug output may include keys and IP addresses. Only enable in trusted environments.
   * @default false
   */
  debug?: boolean;
  /** Whether to send rate limit headers on backend responses. @default true */
  headers?: boolean;
  /**
   * Bypass rate limiting for requests where this function returns true.
   * Supports async functions (return a Promise<boolean>).
   */
  skip?: (ctx: RequestContext) => boolean | Promise<boolean>;
  /**
   * Response body sent when a request is denied (backend adapters only).
   * Accepts a string, object, or a sync/async function returning either.
   * @default 'Too many requests'
   */
  message?: string | object | ((result: RateLimiterResult, ctx: RequestContext) => string | object | Promise<string | object>);
  /** HTTP status code for denied responses (backend adapters only). @default 429 */
  statusCode?: number;

  // ── spec-003: express-rate-limit parity ──────────────────────────────────

  /**
   * Emit legacy `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers
   * in addition to the IETF standard `RateLimit-*` headers.
   * `X-RateLimit-Reset` is a Unix epoch timestamp (absolute), unlike `RateLimit-Reset` (relative).
   * @default false
   */
  legacyHeaders?: boolean;

  /**
   * IPv6 subnet prefix length for the default key generator.
   * Addresses within the same subnet share one rate limit counter.
   * Set to `false` to disable masking and use the raw IP address (v1.0.x behaviour).
   * Has no effect when a custom `keyGenerator` is provided.
   * @default 56
   */
  ipv6Subnet?: number | false;

  /**
   * Property name on the request object where the `RateLimiterResult` is attached after check.
   * Allows downstream middleware to read `req[requestPropertyName].remaining`.
   * Applies to Express, Koa, and Next.js API adapters. Not supported in `rateLimitEdge`.
   * @default 'rateLimit'
   */
  requestPropertyName?: string;

  /**
   * When `true`, if the storage layer throws during a rate limit check,
   * the request is allowed through instead of propagating the error.
   * Useful for high-availability deployments where a Redis outage should not block traffic.
   * @default false
   */
  passOnStoreError?: boolean;

  /**
   * Custom handler called when a request is denied (instead of the built-in 429 response).
   * The handler is responsible for sending a response.
   * `onLimit` still fires before `handler` if both are configured.
   * Supports async functions.
   */
  handler?: (result: RateLimiterResult, ctx: RequestContext) => void | Promise<void>;

  // ── spec-003 Phase B ─────────────────────────────────────────────────────

  /** Decrement the rate limit counter for successful requests. @default false */
  skipSuccessfulRequests?: boolean;
  /** Decrement the rate limit counter for failed requests. @default false */
  skipFailedRequests?: boolean;
  /**
   * Custom predicate to determine if a request was "successful".
   * Only used when skipSuccessfulRequests or skipFailedRequests is set.
   * Default: statusCode < 400
   */
  requestWasSuccessful?: (ctx: RequestContext) => boolean | Promise<boolean>;

  /**
   * IETF RateLimit header format version.
   * - 'draft-6': single combined `RateLimit` header (legacy draft)
   * - 'draft-7': separate `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (default, current)
   * - 'draft-8': draft-7 headers plus `RateLimit-Policy` header
   * @default 'draft-7'
   */
  standardHeaders?: 'draft-6' | 'draft-7' | 'draft-8';
  /**
   * Custom identifier used in the `RateLimit-Policy` header (draft-8 only).
   * Default: `"{limit};w={windowSec}"`
   */
  identifier?: string;

  /**
   * Enable or disable runtime validation warnings.
   * Pass `false` to suppress all warnings, or an object to toggle specific checks.
   * @default true
   */
  validate?: boolean | Record<string, boolean>;
}

/**
 * The outcome of a rate limit check.
 *
 * @example
 * ```typescript
 * const result = await limiter.check('user-123');
 * if (!result.allowed) {
 *   console.log(`Retry in ${result.retryAfter}ms`);
 * }
 * ```
 */
export interface RateLimiterResult {
  /** Whether the request was permitted. */
  allowed: boolean;
  /** Requests remaining in the current window (>= 0). */
  remaining: number;
  /** The resolved max requests for this request's window (resolved value when max is a function). */
  limit: number;
  /** Milliseconds until the current window resets. 0 when allowed, positive when denied. */
  retryAfter: number;
  /** Absolute timestamp when the current window expires. */
  resetAt: Date;
  /** The resolved key that was rate limited. */
  key: string;
}

/**
 * Internal state tracked per rate-limited key within the fixed window algorithm.
 *
 * @example
 * ```typescript
 * const state: FixedWindowState = { count: 5, windowStart: 1711929600000 };
 * ```
 */
export interface FixedWindowState {
  /** Number of requests recorded in the current window. */
  count: number;
  /** Timestamp (ms) marking the start of the current window. */
  windowStart: number;
}

/**
 * State tracked per key by the token bucket algorithm.
 */
export interface TokenBucketState {
  /** Current available tokens (may be fractional). */
  tokens: number;
  /** Timestamp (ms) of the last state write. */
  lastRefill: number;
}

/**
 * Storage abstraction for persisting rate limit state.
 * Implement this interface to use a custom backend (e.g. Redis, Postgres).
 */
export interface StorageAdapter {
  /** Retrieve state for a key; returns null if not found or expired. */
  get(key: string): Promise<Record<string, number> | null>;
  /** Persist state with a TTL in milliseconds. */
  set(key: string, state: Record<string, number>, ttlMs: number): Promise<void>;
  /** Atomically increment count for key; creates entry if missing; returns new count. */
  increment(key: string, ttlMs: number): Promise<number>;
  /** Atomically decrement count for key by 1, floor at 0. No-op if key is missing or expired. */
  decrement(key: string, ttlMs: number): Promise<void>;
  /** Remove a single key. */
  delete(key: string): Promise<void>;
  /** Remove all keys. */
  clear(): Promise<void>;
}

/**
 * A framework-agnostic representation of an incoming request.
 * Extended by each adapter with framework-specific fields.
 *
 * @example
 * ```typescript
 * const ctx: RequestContext = { key: 'user-123' };
 * ```
 */
export interface RequestContext {
  /** The resolved identifier for this request (output of keyGenerator). */
  key: string;
  /** Additional framework-specific properties. */
  [key: string]: unknown;
}

/**
 * The core limiter instance created by `createRateLimiter()`.
 *
 * @example
 * ```typescript
 * const limiter = createRateLimiter({ max: 100, window: '15m' });
 * const result = await limiter.check('user-123');
 * ```
 */
export interface RateLimiter {
  /** Execute a rate limit check for the given key. */
  check(key: string): Promise<RateLimiterResult>;
  /** Decrement the rate limit counter for a key (used by skipSuccessfulRequests/skipFailedRequests). */
  decrement(key: string): Promise<void>;
  /** Reset state for a specific key. */
  reset(key: string): Promise<void>;
  /** Clear all rate limit state. */
  clear(): Promise<void>;
  /** Stop background timers and clean up resources. */
  destroy(): void;
}
