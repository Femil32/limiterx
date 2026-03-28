import type { LimiterxConfig, RateLimiterResult, RequestContext } from '../../core/types.js';

/**
 * Resolve a rate limit message value to a string or object.
 * Supports static strings, static objects, and sync/async functions.
 *
 * @param message - The configured message value
 * @param result - The rate limiter result (passed to function messages)
 * @param ctx - The request context (passed to function messages)
 * @returns The resolved message as a string or object
 * @internal
 */
export async function resolveMessage(
  message: LimiterxConfig['message'],
  result: RateLimiterResult,
  ctx: RequestContext,
): Promise<string | object> {
  if (typeof message === 'function') {
    return message(result, ctx);
  }
  return message ?? 'Too many requests';
}
