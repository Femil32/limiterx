# Data Model: Flowguard Production Readiness

**Feature Branch**: `001-production-readiness`  
**Date**: 2026-03-23  
**Status**: Complete

## Entities

### FlowGuardConfig

The unified configuration object accepted by `createRateLimiter()` and all adapter factory functions.

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `max` | `number` | Yes | — | Positive integer (`> 0`, `Number.isInteger()`) |
| `window` | `number \| string` | Yes | — | Positive number (ms) or valid duration string matching `/^(\d+)(ms\|s\|m\|h\|d)$/` |
| `algorithm` | `'fixed-window'` | No | `'fixed-window'` | Must be `'fixed-window'` for v1.0 |
| `keyGenerator` | `(ctx: RequestContext) => string` | No | IP (backend) / `'global'` (frontend) | Must be a function if provided |
| `onLimit` | `(result: RateLimiterResult, ctx: RequestContext) => void` | No | `undefined` | Must be a function if provided |
| `maxKeys` | `number` | No | `10000` | Positive integer — max distinct keys for internal LRU (`spec.md` FR-007) |
| `debug` | `boolean` | No | `false` | Opt-in console diagnostics (`spec.md` FR-018); must be omitted or boolean |
| `headers` | `boolean` | No | `true` | Boolean |
| `skip` | `(ctx: RequestContext) => boolean` | No | `undefined` | Must be a function if provided |
| `message` | `string \| object` | No | `'Too many requests'` | String or serializable object |
| `statusCode` | `number` | No | `429` | Integer between 100–599 |

**v1.0 storage**: `FlowGuardConfig` does **not** expose a `store` field. The implementation always uses an internal `MemoryStore` sized and tuned by `maxKeys` (and related internal defaults; see `MemoryStore` entity). See `spec.md` clarifications and FR-006/FR-016.

**Relationships**: Consumed by `createRateLimiter()` → produces a `RateLimiter` instance. Each adapter wraps this config with framework-specific defaults.

---

### RateLimiterResult

The outcome of every rate limit check. Returned by `limiter.check()`, adapter middleware, React hook state, and callback arguments.

| Field | Type | Description |
|-------|------|-------------|
| `allowed` | `boolean` | Whether the request/action was permitted |
| `remaining` | `number` | Requests remaining in the current window (≥ 0) |
| `limit` | `number` | Total max requests per window (mirrors `config.max`) |
| `retryAfter` | `number` | Milliseconds until the current window resets (0 if allowed) |
| `resetAt` | `Date` | Absolute timestamp when the current window expires |
| `key` | `string` | The resolved key that was rate limited |

**Relationships**: Produced by `FixedWindowLimiter.check()`. Passed to `onLimit` callback. Used by adapters to set HTTP headers and by React hook to expose reactive state.

---

### StorageAdapter (Interface)

**Internal-only (v1.0)** — not exported from the package and not user-implementable in v1.0 (`spec.md` clarifications). The interface exists so core algorithms can target a single type while `MemoryStore` is the only implementation shipped.

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key: string) => Promise<FixedWindowState \| null>` | Retrieve state for a key; returns `null` if not found or expired |
| `set` | `(key: string, state: FixedWindowState, ttlMs: number) => Promise<void>` | Persist state with a TTL in milliseconds |
| `increment` | `(key: string, ttlMs: number) => Promise<number>` | Atomically increment count for key; creates entry if missing; returns new count |
| `delete` | `(key: string) => Promise<void>` | Remove a single key |
| `clear` | `() => Promise<void>` | Remove all keys (primarily for testing) |

**Relationships**: Implemented by `MemoryStore`. `FixedWindowLimiter` receives a `StorageAdapter` instance wired internally by `createRateLimiter()` (not via public config).

---

### MemoryStore

The default `StorageAdapter` implementation using an in-memory `Map`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxKeys` | `number` | `10_000` | Maximum number of keys before LRU eviction (matches `spec.md` FR-007) |
| `cleanupIntervalMs` | `number` | `60_000` | Interval for background TTL sweep (ms) |

**Internal entry shape**:

| Field | Type | Description |
|-------|------|-------------|
| `count` | `number` | Request count in current window |
| `windowStart` | `number` | Timestamp (ms) when current window started |
| `expiresAt` | `number` | Timestamp (ms) after which entry is considered expired |

**State transitions**:
- **New key**: Entry created with `count = 1`, `windowStart = currentWindowStart`, `expiresAt = windowStart + windowMs`.
- **Same window hit**: `count` incremented; `expiresAt` unchanged.
- **Window expired**: Entry reset — `count = 1`, `windowStart = newWindowStart`, `expiresAt` updated.
- **Capacity reached**: Oldest entry (first in Map iteration order) is evicted before inserting new entry.
- **Background sweep**: Entries with `expiresAt < Date.now()` are deleted.

**Relationships**: Implements `StorageAdapter`. Instantiated internally by `createRateLimiter()` according to config (e.g. `maxKeys`); not injected by callers in v1.0.

---

### FixedWindowState

Internal state tracked per rate-limited key within the fixed window algorithm.

| Field | Type | Description |
|-------|------|-------------|
| `count` | `number` | Number of requests recorded in the current window |
| `windowStart` | `number` | Timestamp (ms) marking the start of the current window |

**Relationships**: Stored/retrieved via `StorageAdapter`. Used by `FixedWindowLimiter` to make allow/deny decisions.

---

### RequestContext

A framework-agnostic representation of an incoming request. Extended by each adapter with framework-specific fields.

**Base fields**:

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | The resolved identifier for this request (output of `keyGenerator`) |

**Extended by adapters**:

| Adapter | Additional Fields |
|---------|-------------------|
| Express | `req: express.Request`, `res: express.Response` |
| Node HTTP | `req: http.IncomingMessage`, `res: http.ServerResponse` |
| Next.js API | `req: NextApiRequest`, `res: NextApiResponse` |
| Next.js Edge | `request: NextRequest` |
| Koa | `ctx: koa.Context` |
| React hook | `key: string` (user-provided identifier) |
| Fetch wrapper | `input: RequestInfo`, `init?: RequestInit` |
| Axios | `config: AxiosRequestConfig` |

**Relationships**: Created by each adapter from the framework-specific request object. Passed to `keyGenerator`, `skip`, and `onLimit` callbacks.

---

### RateLimiter

The core limiter instance created by `createRateLimiter()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `check` | `(key: string) => Promise<RateLimiterResult>` | Execute a rate limit check for the given key |
| `reset` | `(key: string) => Promise<void>` | Reset state for a specific key |
| `clear` | `() => Promise<void>` | Clear all rate limit state |

**Relationships**: Created by `createRateLimiter(config)`. Wraps `FixedWindowLimiter` + `StorageAdapter`. Used internally by all adapters.

---

## Entity Relationship Diagram

```
FlowGuardConfig ──creates──▶ RateLimiter
                                │
                    uses ┌──────┴──────┐
                         │             │
              FixedWindowLimiter   StorageAdapter (interface)
                         │             │
                  checks/returns   implemented by
                         │             │
              RateLimiterResult    MemoryStore
                         │
                  passed to
                         │
                    onLimit callback
                    HTTP headers (backend)
                    React state (frontend)

RequestContext ──extended by──▶ Adapter-specific context types
      │
  consumed by
      │
  keyGenerator, skip, onLimit
```

## Validation Rules

| Rule | Field | Constraint | Error Message |
|------|-------|-----------|---------------|
| V-001 | `max` | `Number.isInteger(max) && max > 0` | `[flowguard] Invalid config: 'max' must be a positive integer, received: {value}` |
| V-002 | `window` | Valid duration string or positive number | `[flowguard] Invalid config: 'window' must be a positive number (ms) or duration string ('30s', '5m', '1h'), received: {value}` |
| V-003 | `window` (string) | Matches `/^(\d+)(ms\|s\|m\|h\|d)$/` | `[flowguard] Invalid config: 'window' string '{value}' is not a valid duration format. Expected: '500ms', '30s', '5m', '1h', '1d'` |
| V-004 | `algorithm` | `=== 'fixed-window'` or `undefined` | `[flowguard] Invalid config: 'algorithm' must be 'fixed-window', received: {value}` |
| V-005 | `keyGenerator` | `typeof fn === 'function'` or `undefined` | `[flowguard] Invalid config: 'keyGenerator' must be a function, received: {typeof value}` |
| V-006 | `skip` | `typeof fn === 'function'` or `undefined` | `[flowguard] Invalid config: 'skip' must be a function, received: {typeof value}` |
| V-007 | `onLimit` | `typeof fn === 'function'` or `undefined` | `[flowguard] Invalid config: 'onLimit' must be a function, received: {typeof value}` |
| V-008 | `statusCode` | `Number.isInteger(sc) && sc >= 100 && sc <= 599` | `[flowguard] Invalid config: 'statusCode' must be an integer between 100-599, received: {value}` |
| V-009 | `headers` | `typeof h === 'boolean'` or `undefined` | `[flowguard] Invalid config: 'headers' must be a boolean, received: {typeof value}` |
| V-010 | `maxKeys` | `undefined` or (`Number.isInteger(v) && v > 0`) | `[flowguard] Invalid config: 'maxKeys' must be a positive integer, received: {value}` |
| V-011 | `debug` | `undefined` or `typeof v === 'boolean'` | `[flowguard] Invalid config: 'debug' must be a boolean, received: {typeof value}` |
| V-012 | `message` | `undefined`, any `string`, or a non-null `object` that is not an array (plain object for JSON response bodies) | `[flowguard] Invalid config: 'message' must be a string or non-array object, received: {typeof value}` |
