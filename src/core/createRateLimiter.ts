import type { FlowGuardConfig, RateLimiter, RateLimiterResult } from './types.js';
import { validateConfig } from './validateConfig.js';
import { parseWindow } from './parseWindow.js';
import { MemoryStore } from './storage/MemoryStore.js';
import { FixedWindowLimiter } from './algorithms/FixedWindowLimiter.js';

const KEY_PREFIX = 'flowguard:';

/**
 * Create a configured rate limiter instance.
 *
 * @param config - Rate limiter configuration
 * @returns A RateLimiter instance with `check()`, `reset()`, `clear()`, and `destroy()` methods
 * @throws Error on invalid configuration
 *
 * @example
 * ```typescript
 * import { createRateLimiter } from 'flowguard';
 *
 * const limiter = createRateLimiter({
 *   max: 100,
 *   window: '15m',
 *   onLimit: (result) => console.log(`Blocked: ${result.key}`)
 * });
 *
 * const result = await limiter.check('user-123');
 * ```
 */
export function createRateLimiter(config: FlowGuardConfig): RateLimiter {
  const validated = validateConfig(config);
  const windowMs = parseWindow(validated.window);
  const store = new MemoryStore({ maxKeys: validated.maxKeys });
  const algorithm = new FixedWindowLimiter(store, validated.max, windowMs, validated.debug);

  return {
    async check(key: string): Promise<RateLimiterResult> {
      const resolvedKey = key === '' ? 'global' : key;
      const namespacedKey = `${KEY_PREFIX}${resolvedKey}`;

      const result = await algorithm.check(namespacedKey, resolvedKey);

      if (!result.allowed && validated.onLimit) {
        try {
          validated.onLimit(result, { key: resolvedKey });
        } catch {
          // onLimit errors are silently swallowed per contract
        }
      }

      return result;
    },

    async reset(key: string): Promise<void> {
      const resolvedKey = key === '' ? 'global' : key;
      await store.delete(`${KEY_PREFIX}${resolvedKey}`);
    },

    async clear(): Promise<void> {
      await store.clear();
    },

    destroy(): void {
      store.destroy();
    },
  };
}
