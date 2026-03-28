# Data Model: Algorithm Extensibility, Storage Adapters, and Package Size

**Feature**: `002-algo-storage-size`
**Phase**: 1 — Design
**Date**: 2026-03-24

---

## Existing Types (unchanged)

### `FixedWindowState`
```typescript
interface FixedWindowState {
  count: number;        // requests in the current window
  windowStart: number;  // ms timestamp of window start
}
```
Used by: `FixedWindowLimiter`, `SlidingWindowLimiter` (both buckets use this shape).

### `RateLimiterResult`
No changes. All three algorithms return this exact type.

### `LimiterxConfig`
Extended `algorithm` field union only:
```typescript
algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket';
```

---

## New Types

### `TokenBucketState`
```typescript
interface TokenBucketState {
  tokens: number;      // current available tokens (can be fractional)
  lastRefill: number;  // ms timestamp of last state write
}
```
Used exclusively by `TokenBucketLimiter`. Stored via `StorageAdapter.set/get`.

### `StorageAdapter` (generalized, now public)

The existing internal `StorageAdapter` interface is generalized to `Record<string, number>` state and exported publicly.

```typescript
export interface StorageAdapter {
  get(key: string): Promise<Record<string, number> | null>;
  set(key: string, state: Record<string, number>, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

Both `FixedWindowState` and `TokenBucketState` structurally satisfy `Record<string, number>`.

`MemoryStore` is updated to use `Record<string, number>` instead of `FixedWindowState` internally (the stored data shape is identical; only the TypeScript annotation changes).

### `RedisClientInterface`
Minimal duck-typed interface accepted by `RedisStore`. Both `ioredis` and `redis` (node-redis v4+) clients satisfy it.

```typescript
export interface RedisClientInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { ex: number }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  flushall(): Promise<unknown>;
}
```

### `RedisStore`
```typescript
export class RedisStore implements StorageAdapter {
  constructor(client: RedisClientInterface) { ... }
  // implements: get, set, increment, delete, clear
}
```
Values serialized as `JSON.stringify(Record<string, number>)` in Redis strings.
TTL set via Redis `EX` option on every write.
`increment` implemented via Lua script for atomicity.

---

## State Transitions

### Fixed Window (unchanged)
```
New window       Same window (under limit)   Same window (at limit)
    │                     │                          │
    ▼                     ▼                          ▼
{ count: 1,       { count: n+1,             DENY — no write
  windowStart }     windowStart }
```

### Sliding Window Counter
Two parallel keys per logical key: `:curr` and `:prev`.

```
Window boundary crossed:
  prev ← curr  (TTL = 2 × windowMs)
  curr ← { count: 1, windowStart: newStart }

Within window:
  effectiveCount = prev.count × (1 − elapsed/windowMs) + curr.count
  if effectiveCount < max: curr.count++, allow
  else: deny
```

### Token Bucket
```
On each check:
  elapsed = now − state.lastRefill
  newTokens = min(max, state.tokens + elapsed × (max / windowMs))
  if newTokens >= 1:
    store { tokens: newTokens − 1, lastRefill: now }, allow
  else:
    deny, retryAfter = ceil((1 − newTokens) / (max / windowMs)) ms
```

---

## Storage Key Conventions

| Algorithm | Keys used |
|---|---|
| Fixed Window | `limiterx:{key}` |
| Sliding Window | `limiterx:sw:{key}:curr`, `limiterx:sw:{key}:prev` |
| Token Bucket | `limiterx:tb:{key}` |

All keys remain namespaced under `limiterx:` prefix. Prefixes `sw:` and `tb:` prevent collisions if the algorithm is changed at runtime (not a supported use case, but prevents subtle bugs).
