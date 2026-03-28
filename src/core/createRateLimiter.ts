import type { LimiterxConfig, RateLimiter, RateLimiterResult, RequestContext, StorageAdapter } from './types.js';
import { validateConfig } from './validateConfig.js';
import { parseWindow } from './parseWindow.js';
import { MemoryStore } from './storage/MemoryStore.js';
import { FixedWindowLimiter } from './algorithms/FixedWindowLimiter.js';
import { SlidingWindowLimiter } from './algorithms/SlidingWindowLimiter.js';
import { TokenBucketLimiter } from './algorithms/TokenBucketLimiter.js';

const KEY_PREFIX = 'limiterx:';

// Module-level set to deduplicate runtime warnings across calls
const warnedChecks = new Set<string>();

const MAX_SAFE_TIMEOUT = 2147483647;

function runRuntimeValidation(windowMs: number, validate: boolean | Record<string, boolean> | undefined): void {
  if (validate === false) return;

  const checkEnabled = (name: string): boolean => {
    if (validate === true || validate === undefined) return true;
    if (typeof validate === 'object') return (validate as Record<string, boolean>)[name] !== false;
    return true;
  };

  if (checkEnabled('windowMs') && windowMs > MAX_SAFE_TIMEOUT) {
    const warnKey = `windowMs:${windowMs}`;
    if (!warnedChecks.has(warnKey)) {
      warnedChecks.add(warnKey);
      console.warn(
        `[limiterx] Warning: 'windowMs' (${windowMs}ms) exceeds the max safe timeout value (${MAX_SAFE_TIMEOUT}ms). This may cause issues with setTimeout in some environments.`,
      );
    }
  }
}

/**
 * Create a configured rate limiter instance.
 *
 * @param config - Rate limiter configuration
 * @returns A RateLimiter instance with `check()`, `reset()`, `clear()`, and `destroy()` methods
 * @throws Error on invalid configuration
 *
 * @example
 * ```typescript
 * import { createRateLimiter } from 'limiterx';
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
export function createRateLimiter(config: LimiterxConfig): RateLimiter {
  const validated = validateConfig(config);
  const windowMs = parseWindow(validated.window);

  // Run runtime validation warnings
  runRuntimeValidation(windowMs, validated.validate);

  const store: StorageAdapter = validated.store ?? new MemoryStore({ maxKeys: validated.maxKeys });

  // Use a static max of 1 as placeholder when max is dynamic (algorithms won't use it for dynamic requests)
  const staticMax = typeof validated.max === 'number' ? validated.max : 1;

  type AlgorithmLike = { check(namespacedKey: string, displayKey: string, maxOverride?: number): Promise<RateLimiterResult> };
  let algorithm: AlgorithmLike;
  if (validated.algorithm === 'sliding-window') {
    algorithm = new SlidingWindowLimiter(store, staticMax, windowMs, validated.debug);
  } else if (validated.algorithm === 'token-bucket') {
    algorithm = new TokenBucketLimiter(store, staticMax, windowMs, validated.debug);
  } else {
    algorithm = new FixedWindowLimiter(store, staticMax, windowMs, validated.debug);
  }

  function getNamespacedKey(resolvedKey: string): string {
    if (validated.algorithm === 'sliding-window') {
      return `${KEY_PREFIX}sw:${resolvedKey}`;
    }
    if (validated.algorithm === 'token-bucket') {
      return `${KEY_PREFIX}tb:${resolvedKey}`;
    }
    return `${KEY_PREFIX}${resolvedKey}`;
  }

  return {
    async check(key: string): Promise<RateLimiterResult> {
      const resolvedKey = key === '' ? 'global' : key;
      const namespacedKey = getNamespacedKey(resolvedKey);
      const ctx: RequestContext = { key: resolvedKey };

      // Resolve dynamic max
      let maxOverride: number | undefined;
      if (typeof validated.max === 'function') {
        maxOverride = await validated.max(ctx);
        if (!Number.isInteger(maxOverride) || maxOverride <= 0) {
          throw new Error(`[limiterx] Dynamic 'max' function returned an invalid value: ${maxOverride}`);
        }
      }

      const result = await algorithm.check(namespacedKey, resolvedKey, maxOverride);

      if (!result.allowed && validated.onLimit) {
        try {
          validated.onLimit(result, { key: resolvedKey });
        } catch {
          // onLimit errors are silently swallowed per contract
        }
      }

      return result;
    },

    async decrement(key: string): Promise<void> {
      const resolvedKey = key === '' ? 'global' : key;
      const namespacedKey = getNamespacedKey(resolvedKey);
      await store.decrement(namespacedKey, windowMs);
    },

    async reset(key: string): Promise<void> {
      const resolvedKey = key === '' ? 'global' : key;
      if (validated.algorithm === 'sliding-window') {
        const swBase = `${KEY_PREFIX}sw:${resolvedKey}`;
        await store.delete(`${swBase}:curr`);
        await store.delete(`${swBase}:prev`);
      } else if (validated.algorithm === 'token-bucket') {
        await store.delete(`${KEY_PREFIX}tb:${resolvedKey}`);
      } else {
        await store.delete(`${KEY_PREFIX}${resolvedKey}`);
      }
    },

    async clear(): Promise<void> {
      await store.clear();
    },

    destroy(): void {
      (store as { destroy?: () => void }).destroy?.();
    },
  };
}
