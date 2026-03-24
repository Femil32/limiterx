# Contract: Core API

**Feature Branch**: `001-production-readiness`  
**Date**: 2026-03-23

## Public Exports from `flowguard` (main entry)

### `createRateLimiter(config: FlowGuardConfig): RateLimiter`

Factory function that validates config and returns a configured limiter instance.

**Behavior**:
- Validates all config fields synchronously at call time (see Validation Rules in data-model.md)
- Throws `Error` with descriptive message on invalid config
- Returns a `RateLimiter` instance with `check()`, `reset()`, and `clear()` methods
- Always uses an internal `MemoryStore` — v1.0 does not accept a public `store` field on `FlowGuardConfig` (`spec.md` clarifications; see `data-model.md`)
- Defaults `algorithm` to `'fixed-window'`

**Signature**:
```typescript
function createRateLimiter(config: FlowGuardConfig): RateLimiter;
```

**Example**:
```typescript
import { createRateLimiter } from 'flowguard';

const limiter = createRateLimiter({
  max: 100,
  window: '15m',
  onLimit: (result) => console.log(`Blocked: ${result.key}`)
});

const result = await limiter.check('user-123');
// { allowed: true, remaining: 99, limit: 100, retryAfter: 0, resetAt: Date, key: 'user-123' }
```

---

### `RateLimiter.check(key: string): Promise<RateLimiterResult>`

Execute a rate limit check for the given key.

**Behavior**:
- Computes current window boundary: `Math.floor(Date.now() / windowMs) * windowMs`
- Loads state from storage; resets if window has changed
- If `count >= max`: returns `{ allowed: false, remaining: 0, retryAfter: msUntilReset, ... }` and fires `onLimit` if configured
- If `count < max`: increments count, returns `{ allowed: true, remaining: max - count - 1, ... }`
- Storage key is namespaced: `flowguard:{userKey}`

**Guarantees**:
- Result `remaining` is always `>= 0`
- Result `retryAfter` is `0` when `allowed: true`, positive milliseconds when `allowed: false`
- Result `resetAt` is a valid `Date` representing the window boundary
- `onLimit` callback errors do not propagate — they are caught and silently swallowed

---

### `RateLimiter.reset(key: string): Promise<void>`

Remove rate limit state for a specific key.

**Behavior**:
- Deletes the namespaced key (`flowguard:{key}`) from storage
- Next `check()` for this key starts with a fresh window

---

### `RateLimiter.clear(): Promise<void>`

Remove all rate limit state.

**Behavior**:
- Calls `store.clear()` — all keys across all limiters sharing this store are removed
- Intended for testing and administrative resets

---

### `parseWindow(window: string | number): number`

Parse a human-readable duration string into milliseconds.

**Behavior**:
- Numbers pass through as-is (must be positive)
- Strings must match `/^(\d+)(ms|s|m|h|d)$/`
- Returns milliseconds as a positive integer
- Throws on invalid input

**Examples**:
| Input | Output |
|-------|--------|
| `1000` | `1000` |
| `'500ms'` | `500` |
| `'30s'` | `30000` |
| `'5m'` | `300000` |
| `'1h'` | `3600000` |
| `'1d'` | `86400000` |

---

### `MemoryStore`

Default storage adapter constructor.

**Signature**:
```typescript
class MemoryStore implements StorageAdapter {
  constructor(options?: { maxKeys?: number; cleanupIntervalMs?: number });
  get(key: string): Promise<FixedWindowState | null>;
  set(key: string, state: FixedWindowState, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  destroy(): void; // Clears cleanup interval
}
```

**Behavior**:
- Default options when omitted: `maxKeys` **10,000**, `cleanupIntervalMs` **60,000** (per `spec.md` FR-007 and `data-model.md`)
- `destroy()` must be called to stop background cleanup interval (prevents test leaks / process hang)
- All methods are async for interface compatibility (future Redis adapter), but resolve synchronously for MemoryStore
- LRU eviction deletes the oldest entry when `map.size >= maxKeys`
- Cleanup timer uses `unref()` on Node.js to avoid holding the event loop

---

## Type Exports

The following types are exported from the main `flowguard` entry point:

```typescript
export type { FlowGuardConfig };
export type { RateLimiterResult };
export type { FixedWindowState };
export type { RequestContext };
export type { RateLimiter };
```

`StorageAdapter` is an internal implementation type only — it is **not** exported in v1.0 (`spec.md` Key Entities / clarifications). The `MemoryStore` class is exported for advanced testing or inspection where needed; it implements `StorageAdapter` internally.
