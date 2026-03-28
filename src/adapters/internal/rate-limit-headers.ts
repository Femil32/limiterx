import type { RateLimiterResult } from '../../core/types.js';

/**
 * Compute reset seconds from a result for when the request is allowed.
 * Uses (resetAt - now) / 1000 since retryAfter is 0 on allowed requests.
 * @internal
 */
export function computeResetSeconds(result: RateLimiterResult): number {
  return Math.ceil(Math.max(0, result.resetAt.getTime() - Date.now()) / 1000);
}

/**
 * Options for `setRateLimitHeaders`.
 * @internal
 */
export interface RateLimitHeaderOptions {
  /** Whether to send IETF standard RateLimit-* headers. */
  standard: boolean;
  /** Whether to additionally send legacy X-RateLimit-* headers. */
  legacyHeaders: boolean;
  /** IETF draft version for standard headers. @default 'draft-7' */
  standardHeaders?: 'draft-6' | 'draft-7' | 'draft-8';
  /** Custom identifier for RateLimit-Policy header (draft-8 only). */
  identifier?: string;
  /** Window duration in ms, used to compute RateLimit-Policy (draft-8). */
  windowMs?: number;
}

/**
 * Set rate limit headers on an HTTP-like response object.
 * Supports both IETF standard (RateLimit-*) and legacy (X-RateLimit-*) header formats.
 *
 * - Standard headers use a **relative** reset time (seconds until window resets).
 * - Legacy `X-RateLimit-Reset` uses an **absolute** Unix epoch timestamp (matches GitHub/Twitter convention).
 *
 * @param setHeader - Function to set a header
 * @param result - The rate limiter result
 * @param options - Header emission options
 * @internal
 */
export function setRateLimitHeaders(
  setHeader: (name: string, value: string) => void,
  result: RateLimiterResult,
  options: RateLimitHeaderOptions,
): void {
  const { standard, legacyHeaders, standardHeaders: standardHeadersVersion, identifier, windowMs } = options;

  if (!standard && !legacyHeaders) return;

  const resetSeconds = result.allowed
    ? computeResetSeconds(result)
    : Math.ceil(result.retryAfter / 1000);

  if (standard) {
    if (standardHeadersVersion === 'draft-6') {
      // draft-6: single combined RateLimit header
      setHeader('RateLimit', `limit=${Math.ceil(result.limit)}, remaining=${Math.ceil(result.remaining)}, reset=${resetSeconds}`);
      if (!result.allowed) {
        setHeader('Retry-After', String(resetSeconds));
      }
    } else if (standardHeadersVersion === 'draft-8') {
      // draft-8: separate headers (same as draft-7) + RateLimit-Policy
      setHeader('RateLimit-Limit', String(Math.ceil(result.limit)));
      setHeader('RateLimit-Remaining', String(Math.ceil(result.remaining)));
      setHeader('RateLimit-Reset', String(resetSeconds));

      if (!result.allowed) {
        setHeader('Retry-After', String(resetSeconds));
      }

      const windowSec = windowMs ? Math.round(windowMs / 1000) : resetSeconds;
      const policyValue = identifier
        ? `${identifier};w=${windowSec}`
        : `${Math.ceil(result.limit)};w=${windowSec}`;
      setHeader('RateLimit-Policy', policyValue);
    } else {
      // draft-7 (default): separate headers
      setHeader('RateLimit-Limit', String(Math.ceil(result.limit)));
      setHeader('RateLimit-Remaining', String(Math.ceil(result.remaining)));
      setHeader('RateLimit-Reset', String(resetSeconds));

      if (!result.allowed) {
        setHeader('Retry-After', String(resetSeconds));
      }
    }
  }

  if (legacyHeaders) {
    // X-RateLimit-Reset is an absolute Unix epoch timestamp (seconds since 1970-01-01T00:00:00Z)
    // NOT a relative countdown — this matches GitHub/Twitter/Stripe legacy convention
    const epochSeconds = Math.floor(result.resetAt.getTime() / 1000);

    setHeader('X-RateLimit-Limit', String(Math.ceil(result.limit)));
    setHeader('X-RateLimit-Remaining', String(Math.ceil(result.remaining)));
    setHeader('X-RateLimit-Reset', String(epochSeconds));

    if (!result.allowed && !standard) {
      // Set Retry-After via legacy branch only when standard headers are disabled
      // (standard branch already sets Retry-After when standard: true)
      setHeader('Retry-After', String(resetSeconds));
    }
  }
}

/**
 * Set standard rate limit headers on an HTTP-like response object.
 * All values are coerced to integers via Math.ceil for header safety (FR-017).
 *
 * @param setHeader - Function to set a header (e.g., res.setHeader or ctx.set)
 * @param result - The rate limiter result
 *
 * @example
 * ```typescript
 * setRateLimitHeadersFull((name, value) => res.setHeader(name, value), result);
 * ```
 * @internal
 */
export function setRateLimitHeadersFull(
  setHeader: (name: string, value: string) => void,
  result: RateLimiterResult,
): void {
  setRateLimitHeaders(setHeader, result, { standard: true, legacyHeaders: false });
}
