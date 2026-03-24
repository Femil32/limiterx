/**
 * Flowguard - Universal production-ready rate limiting for JavaScript/TypeScript.
 *
 * @example
 * ```typescript
 * import { createRateLimiter } from 'flowguard';
 *
 * const limiter = createRateLimiter({ max: 100, window: '15m' });
 * const result = await limiter.check('user-123');
 * ```
 * @packageDocumentation
 */

export type {
  FlowGuardConfig,
  RateLimiterResult,
  FixedWindowState,
  RequestContext,
  RateLimiter,
} from './core/types.js';

export { createRateLimiter } from './core/createRateLimiter.js';
export { parseWindow } from './core/parseWindow.js';
export { MemoryStore } from './core/storage/MemoryStore.js';
export { RateLimitError } from './core/RateLimitError.js';
