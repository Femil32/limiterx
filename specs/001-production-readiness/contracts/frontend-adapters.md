# Contract: Frontend Adapters

**Feature Branch**: `001-production-readiness`  
**Date**: 2026-03-23

## Common Frontend Adapter Behavior

All frontend adapters share these guarantees:

1. **Config shape**: Accept `FlowGuardConfig` (same as core) with frontend-specific defaults.
2. **Default `keyGenerator`**: Returns `'global'` (single shared limit) unless overridden.
3. **No HTTP headers**: Frontend adapters do not set HTTP headers — they control client-side behavior only.
4. **`onLimit` callback**: Fires when an action/request is blocked, receives `RateLimiterResult`.
5. **`skip` support**: If `config.skip(context)` returns `true`, action passes without counting.

---

## `flowguard/react` — React Hook

### `useRateLimit(key: string, config: FlowGuardConfig): UseRateLimitReturn`

**Signature**:
```typescript
import { useRateLimit } from 'flowguard/react';

interface UseRateLimitReturn {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  resetAt: Date | null;
  attempt: () => boolean;
  reset: () => void;
}

function useRateLimit(key: string, config: {
  max: number;
  window: number | string;
  onLimit?: (result: RateLimiterResult) => void;
  skip?: () => boolean;
}): UseRateLimitReturn;
```

**Behavior**:
- Creates an internal `FixedWindowLimiter` scoped to the component lifecycle (via `useRef`)
- Initial state: `{ allowed: true, remaining: config.max, retryAfter: 0, resetAt: null }`
- `attempt()`: Executes a rate limit check. Returns `true` if allowed, `false` if denied. Updates reactive state.
- `reset()`: Clears the internal limiter state for this key. Returns state to initial values.
- When `retryAfter > 0`, a timer is set (via `useEffect`) that counts down and automatically updates `retryAfter` and re-enables `allowed` when the window expires.
- Limiter instance is recreated if `key`, `max`, or `window` changes (dependency array).
- Cleanup on unmount: cancels any pending timers.

**Peer dependency**: `react >= 18.0.0`

**Example**:
```typescript
import { useRateLimit } from 'flowguard/react';

function SubmitButton() {
  const { allowed, remaining, retryAfter, attempt, reset } = useRateLimit('form-submit', {
    max: 5,
    window: '1m',
    onLimit: (result) => alert(`Slow down! Try again in ${Math.ceil(result.retryAfter / 1000)}s`)
  });

  const handleClick = () => {
    if (attempt()) {
      submitForm();
    }
  };

  return (
    <button onClick={handleClick} disabled={!allowed}>
      Submit {remaining > 0 ? `(${remaining} left)` : '(limit reached)'}
    </button>
  );
}
```

---

## `flowguard/fetch` — Fetch Wrapper

### `rateLimitFetch(fetchFn: typeof fetch, config: FlowGuardConfig): typeof fetch`

**Signature**:
```typescript
import { rateLimitFetch } from 'flowguard/fetch';

function rateLimitFetch(
  fetchFn: typeof fetch,
  config: {
    max: number;
    window: number | string;
    keyGenerator?: (input: RequestInfo | URL, init?: RequestInit) => string;
    onLimit?: (result: RateLimiterResult) => void;
    skip?: (input: RequestInfo | URL, init?: RequestInit) => boolean;
  }
): typeof fetch;
```

**Behavior**:
- Returns a function with the same signature as `fetch`
- Before each call, checks the rate limiter
- If allowed: calls the underlying `fetchFn` and returns its result
- If denied: does NOT make the network request; fires `onLimit` callback; throws `RateLimitError` (extends `Error`) with `result` property
- Default `keyGenerator`: returns `'global'` (all requests share one counter)
- Supports URL-based key generation: `keyGenerator: (input) => new URL(input).hostname`

**Example**:
```typescript
import { rateLimitFetch } from 'flowguard/fetch';

const guardedFetch = rateLimitFetch(fetch, {
  max: 10,
  window: '1m',
  onLimit: (result) => console.warn(`Fetch blocked. Retry in ${result.retryAfter}ms`)
});

try {
  const res = await guardedFetch('https://api.example.com/data');
} catch (err) {
  if (err.name === 'RateLimitError') {
    console.log('Rate limited:', err.result.retryAfter);
  }
}
```

---

## `flowguard/axios` — Axios Interceptor

### `rateLimitAxios(instance: AxiosInstance, config: FlowGuardConfig): AxiosInstance`

**Signature**:
```typescript
import { rateLimitAxios } from 'flowguard/axios';

function rateLimitAxios(
  instance: AxiosInstance,
  config: {
    max: number;
    window: number | string;
    keyGenerator?: (axiosConfig: AxiosRequestConfig) => string;
    onLimit?: (result: RateLimiterResult) => void;
    skip?: (axiosConfig: AxiosRequestConfig) => boolean;
  }
): AxiosInstance;
```

**Behavior**:
- Adds a request interceptor to the provided Axios instance
- Before each request, checks the rate limiter
- If allowed: request proceeds normally
- If denied: rejects the request with `RateLimitError` (Axios interceptor rejection); fires `onLimit` callback; the network request is never made
- Default `keyGenerator`: returns `'global'`
- Returns the same Axios instance (mutated with the interceptor) for chaining

**Example**:
```typescript
import axios from 'axios';
import { rateLimitAxios } from 'flowguard/axios';

const client = rateLimitAxios(axios.create({ baseURL: 'https://api.example.com' }), {
  max: 10,
  window: '1m',
  onLimit: () => console.warn('Rate limited')
});

try {
  const res = await client.get('/data');
} catch (err) {
  if (err.name === 'RateLimitError') {
    console.log('Retry after:', err.result.retryAfter, 'ms');
  }
}
```

---

## Shared Error Type

### `RateLimitError`

```typescript
class RateLimitError extends Error {
  name: 'RateLimitError';
  result: RateLimiterResult;
  constructor(result: RateLimiterResult);
}
```

Thrown by `rateLimitFetch` and `rateLimitAxios` when a request is denied. The `result` property contains the full `RateLimiterResult` for inspection.
