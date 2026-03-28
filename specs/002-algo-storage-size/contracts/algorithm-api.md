# Contract: Algorithm & Storage Public API

**Feature**: `002-algo-storage-size`
**Type**: TypeScript public API surface

---

## `createRateLimiter` — updated config

```typescript
// LimiterxConfig.algorithm — extended union
algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket';
//           ^existing        ^new               ^new
```

All other config fields unchanged. Validation error format:
```
[limiterx] Invalid config: 'algorithm' must be 'fixed-window', 'sliding-window', or 'token-bucket', received: <value>
```

---

## `StorageAdapter` — now public export

```typescript
// src/index.ts — new export
export type { StorageAdapter } from './core/types.js';
```

```typescript
export interface StorageAdapter {
  get(key: string): Promise<Record<string, number> | null>;
  set(key: string, state: Record<string, number>, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

**Guarantees**:
- `get` returns `null` for missing or expired keys.
- `set` MUST persist state for at least `ttlMs` milliseconds.
- `increment` MUST be atomic — no two concurrent calls for the same key may both read the same value and both write back an increment. It stores `{ count: <new>, windowStart: <now> }` as the underlying state and sets TTL to `ttlMs`. It is used only by the fixed-window algorithm; sliding-window and token-bucket use `get`/`set` directly.
- `delete` and `clear` are idempotent.

---

## `TokenBucketState` — new public export

```typescript
export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}
```

---

## `RedisStore` — new entry point `limiterx/redis`

```typescript
// import path
import { RedisStore } from 'limiterx/redis';
import { RedisClientInterface } from 'limiterx/redis';
```

```typescript
export interface RedisClientInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { ex: number }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  flushall(): Promise<unknown>;
}

export class RedisStore implements StorageAdapter {
  constructor(client: RedisClientInterface);
  get(key: string): Promise<Record<string, number> | null>;
  set(key: string, state: Record<string, number>, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

**Usage contract**:
```typescript
import { createRateLimiter } from 'limiterx';
import { RedisStore } from 'limiterx/redis';
import Redis from 'ioredis'; // or: import { createClient } from 'redis';

const redis = new Redis();
const limiter = createRateLimiter({
  max: 100,
  window: '15m',
  store: redis,  // ← new optional config field
});
```

`store` is a new optional field in `LimiterxConfig`:
```typescript
store?: StorageAdapter;
// If omitted, defaults to new MemoryStore({ maxKeys: config.maxKeys })
```

---

## `LimiterxConfig` — `store` field added

```typescript
export interface LimiterxConfig {
  // ... existing fields ...

  /**
   * Custom storage backend. Defaults to an in-memory LRU store.
   * Use `RedisStore` from `limiterx/redis` for multi-process deployments.
   */
  store?: StorageAdapter;
}
```

---

## Package Exports — new entry

```jsonc
// package.json additions
"./redis": {
  "import": { "types": "./dist/adapters/redis.d.ts", "default": "./dist/adapters/redis.js" },
  "require": { "types": "./dist/adapters/redis.d.cts", "default": "./dist/adapters/redis.cjs" }
}
```

---

## Invariants (all algorithms)

1. `result.limit` always equals `config.max`.
2. `result.remaining >= 0` always.
3. `result.retryAfter === 0` when `result.allowed === true`.
4. `result.retryAfter > 0` when `result.allowed === false`.
5. `result.resetAt` is always a valid future `Date`.
6. `limiter.reset(key)` clears state for that key regardless of algorithm (may clear multiple storage keys for sliding window).
7. `limiter.clear()` clears all state across all keys.
8. `limiter.destroy()` stops background timers; the limiter instance MUST NOT be used after `destroy()`.
