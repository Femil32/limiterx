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
  /** Maximum number of requests allowed per window. Must be a positive integer. */
  max: number;
  /** Window duration in milliseconds (number) or as a human-readable string ('30s', '5m', '1h', '1d'). */
  window: number | string;
  /** Algorithm to use. Only 'fixed-window' is supported in v1.0. */
  algorithm?: 'fixed-window';
  /**
   * Custom function to generate a rate limiting key from the request context.
   * Defaults to IP address for backend adapters, 'global' for frontend adapters.
   */
  keyGenerator?: (ctx: RequestContext) => string;
  /** Callback invoked when a request is denied. Errors thrown by this callback are silently swallowed. */
  onLimit?: (result: RateLimiterResult, ctx: RequestContext) => void;
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
  /** Bypass rate limiting for requests where this function returns true. */
  skip?: (ctx: RequestContext) => boolean;
  /** Response body sent when a request is denied (backend adapters only). @default 'Too many requests' */
  message?: string | object;
  /** HTTP status code for denied responses (backend adapters only). @default 429 */
  statusCode?: number;
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
  /** Total max requests per window (mirrors config.max). */
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
 * Internal storage abstraction for persisting rate limit state.
 * Not exported from the public API in v1.0.
 * @internal
 */
export interface StorageAdapter {
  /** Retrieve state for a key; returns null if not found or expired. */
  get(key: string): Promise<FixedWindowState | null>;
  /** Persist state with a TTL in milliseconds. */
  set(key: string, state: FixedWindowState, ttlMs: number): Promise<void>;
  /** Atomically increment count for key; creates entry if missing; returns new count. */
  increment(key: string, ttlMs: number): Promise<number>;
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
  /** Reset state for a specific key. */
  reset(key: string): Promise<void>;
  /** Clear all rate limit state. */
  clear(): Promise<void>;
  /** Stop background timers and clean up resources. */
  destroy(): void;
}
