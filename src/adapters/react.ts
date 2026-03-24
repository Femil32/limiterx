import { useState, useRef, useEffect, useCallback } from 'react';
import type { RateLimiterResult } from '../core/types.js';
import { parseWindow } from '../core/parseWindow.js';

/**
 * Return type for the useRateLimit hook.
 */
export interface UseRateLimitReturn {
  /** Whether the next action is allowed. */
  allowed: boolean;
  /** Remaining actions in the current window. */
  remaining: number;
  /** Milliseconds until the window resets (0 when allowed). */
  retryAfter: number;
  /** Absolute timestamp when the current window expires, or null if no checks made. */
  resetAt: Date | null;
  /** Execute a rate limit check. Returns true if allowed, false if denied. */
  attempt: () => boolean;
  /** Reset the limiter state to initial values. */
  reset: () => void;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * React hook for client-side rate limiting.
 *
 * @param key - Identifier for this rate limit scope
 * @param config - Rate limit configuration
 * @returns Reactive state and control functions
 *
 * @example
 * ```typescript
 * import { useRateLimit } from 'flowguard/react';
 *
 * function SubmitButton() {
 *   const { allowed, remaining, retryAfter, attempt, reset } = useRateLimit('form-submit', {
 *     max: 5,
 *     window: '1m',
 *     onLimit: (result) => alert(`Slow down! Try again in ${Math.ceil(result.retryAfter / 1000)}s`)
 *   });
 *
 *   return (
 *     <button onClick={() => attempt() && submitForm()} disabled={!allowed}>
 *       Submit ({remaining} left)
 *     </button>
 *   );
 * }
 * ```
 */
export function useRateLimit(
  key: string,
  config: {
    max: number;
    window: number | string;
    onLimit?: (result: RateLimiterResult) => void;
    skip?: () => boolean;
  },
): UseRateLimitReturn {
  const windowMs = parseWindow(config.window);
  const { max, onLimit, skip } = config;

  const stateRef = useRef<WindowState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hookState, setHookState] = useState({
    allowed: true,
    remaining: max,
    retryAfter: 0,
    resetAt: null as Date | null,
  });

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Reset internal state when key/max/window changes
  useEffect(() => {
    stateRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHookState({
      allowed: true,
      remaining: max,
      retryAfter: 0,
      resetAt: null,
    });
  }, [key, max, windowMs]);

  const scheduleReset = useCallback((windowEnd: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const delay = Math.max(0, windowEnd - Date.now());
    timerRef.current = setTimeout(() => {
      stateRef.current = null;
      timerRef.current = null;
      setHookState({
        allowed: true,
        remaining: max,
        retryAfter: 0,
        resetAt: null,
      });
    }, delay);
  }, [max]);

  const attempt = useCallback((): boolean => {
    if (skip && skip()) {
      return true;
    }

    const now = Date.now();
    const currentWindowStart = Math.floor(now / windowMs) * windowMs;
    const windowEnd = currentWindowStart + windowMs;
    const resetAt = new Date(windowEnd);
    const retryAfterMs = windowEnd - now;

    let state = stateRef.current;

    // Check if window has changed
    if (!state || state.windowStart !== currentWindowStart) {
      state = { count: 0, windowStart: currentWindowStart };
      stateRef.current = state;
    }

    if (state.count >= max) {
      // Denied
      const result: RateLimiterResult = {
        allowed: false,
        remaining: 0,
        limit: max,
        retryAfter: retryAfterMs,
        resetAt,
        key,
      };

      setHookState({
        allowed: false,
        remaining: 0,
        retryAfter: retryAfterMs,
        resetAt,
      });

      scheduleReset(windowEnd);

      if (onLimit) {
        try {
          onLimit(result);
        } catch {
          // swallow
        }
      }

      return false;
    }

    // Allowed
    state.count++;
    const remaining = max - state.count;

    setHookState({
      allowed: remaining > 0,
      remaining,
      retryAfter: remaining > 0 ? 0 : retryAfterMs,
      resetAt: remaining > 0 ? resetAt : resetAt,
    });

    if (remaining <= 0) {
      scheduleReset(windowEnd);
    }

    return true;
  }, [key, max, windowMs, onLimit, skip, scheduleReset]);

  const resetFn = useCallback(() => {
    stateRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHookState({
      allowed: true,
      remaining: max,
      retryAfter: 0,
      resetAt: null,
    });
  }, [max]);

  return {
    ...hookState,
    attempt,
    reset: resetFn,
  };
}
