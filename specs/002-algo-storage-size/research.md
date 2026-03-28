# Research: Algorithm Extensibility, Storage Adapters, and Package Size

**Feature**: `002-algo-storage-size`
**Phase**: 0 — Research
**Date**: 2026-03-24

---

## 1. Sliding Window Algorithm

### Decision
Implement the **Sliding Window Counter** (interpolation approximation), not the Sliding Window Log.

### Rationale
Two approaches exist:

| Approach | Memory | Accuracy | Storage ops |
|---|---|---|---|
| Sliding Window Log | O(n) — one entry per request | Exact | 1 write + 1 scan per check |
| Sliding Window Counter | O(1) — two integers per key | ~99.97% accurate | 2 reads + 1 write per check |

The Sliding Window Counter is used by Cloudflare, Nginx, and Redis's own rate limiting modules. At O(1) storage it is compatible with the existing `StorageAdapter` interface and `MemoryStore`. The ~0.03% over-counting error under real traffic distributions is acceptable for rate limiting.

**Formula:**
```
effectiveCount = prevBucket.count × (1 − elapsed / windowMs) + currBucket.count
```
where `elapsed = now − currentWindowStart`.

### State Storage
Two storage keys per logical rate limit key:
- `limiterx:sw:{key}:curr` → `{ count: number, windowStart: number }` (current aligned window)
- `limiterx:sw:{key}:prev` → `{ count: number, windowStart: number }` (previous aligned window)

Uses **the same `FixedWindowState` shape** — no changes to `StorageAdapter` needed for this algorithm.

### Alternatives Considered
- **Sliding Window Log**: Rejected — O(n) memory per key is unsafe for high-cardinality keyspaces and incompatible with the existing `StorageAdapter.increment` model.
- **Leaky Bucket**: Different semantics (output rate limiting vs. input counting); out of scope for v1.1.

---

## 2. Token Bucket Algorithm

### Decision
Implement a **refillable token bucket** with continuous (virtual) token refill computed on each check — no background timer needed.

### Rationale
Token bucket is the canonical algorithm for allowing controlled bursting. Virtual refill (compute tokens at check time based on elapsed ms) avoids background timers and is safe for serverless environments where there is no persistent process.

**Refill rate:** `max / windowMs` tokens per millisecond.
**On each check:**
1. Compute elapsed ms since `lastRefill`.
2. Add `elapsed × refillRate` tokens, capped at `max`.
3. If `tokens >= 1`: allow, subtract 1 token, store new state.
4. If `tokens < 1`: deny, compute `retryAfter = ceil((1 − tokens) / refillRate)` ms.

### State Shape
```typescript
interface TokenBucketState {
  tokens: number;      // current token count (can be fractional)
  lastRefill: number;  // timestamp ms of last state update
}
```

This is **different from `FixedWindowState`**. The `StorageAdapter` must support a more general state type.

### StorageAdapter Generalization
- Change `get/set` signatures to use `Record<string, number>` instead of `FixedWindowState`.
- `FixedWindowState` (`{ count, windowStart }`) and `TokenBucketState` (`{ tokens, lastRefill }`) both satisfy `Record<string, number>`.
- `MemoryStore` implementation change is trivial (replace type annotation only).
- `StorageAdapter` was `@internal` and not exported in v1.0, so this is not a public breaking change.
- When exported publicly in v1.1 (per FR-004), the `Record<string, number>` type is the correct public contract.
- The `increment()` method is not used by token bucket; it remains for fixed/sliding window.

### Alternatives Considered
- **Background timer refill**: Rejected — requires persistent process, breaks serverless/edge deployments.
- **Leaky bucket**: Different semantics (smoothed output); does not deliver "allow burst" user story.

---

## 3. Redis Storage Adapter

### Decision
Accept a **minimal Redis client interface** (duck-typed) so consumers can pass either `ioredis` or `redis` (node-redis v4+). Use **Lua scripts** for atomic multi-key operations.

### Rationale
Coupling to a specific Redis client library would force a peer dependency and a version constraint on consumers. A thin interface (`get`, `set`, `del`, `eval`, `flushall`) covers all needed operations and both major Node.js Redis clients satisfy it.

**Lua scripts for atomicity:**
Redis is single-threaded, so Lua scripts execute atomically without MULTI/EXEC transaction overhead. Required for:
- Sliding window: atomic read of both `prev` and `curr` keys + conditional write
- Token bucket: atomic read-compute-write in one round trip
- Fixed window: existing `increment` behavior can use `INCR` + `EXPIRE`

### Minimal Redis Client Interface
```typescript
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { ex: number }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  flushall(): Promise<unknown>;
}
```

Both `ioredis` and `redis` (node-redis v4+) satisfy this interface.

### Entry Point
- Source: `src/adapters/redis.ts`
- tsup entry: `'adapters/redis': 'src/adapters/redis.ts'`
- Package export: `"./redis"` in `package.json`
- Peer dependency: `redis` and/or `ioredis` listed as optional peers
- **Not imported by any other adapter** — zero cost when unused.

### Error Handling
Redis errors propagate as thrown exceptions (no silent pass-through). This matches FR-006 and is the safe default: if storage fails, the limiter fails loudly rather than silently allowing all traffic.

### Alternatives Considered
- **Couple to `ioredis` specifically**: Rejected — would force consumers using `redis` (node-redis) to install a second client.
- **Use Redis Streams or Sorted Sets for sliding window log**: Rejected — O(n) memory, higher complexity, not needed given Sliding Window Counter decision.

---

## 4. Package Size Reduction

### Root Cause Analysis
From `npm pack --dry-run` on v1.0.1:
- **Total unpacked: 621 kB across 54 files**
- Source maps (`.js.map`, `.cjs.map`): ~494 kB — **80% of total size**
- JS bundles (`.js`, `.cjs`): ~100 kB
- Type declarations (`.d.ts`, `.d.cts`): ~27 kB

The current tsup config sets `sourcemap: true`, which generates a `.map` file for each of the 9 entry points × 2 formats = 18 source map files.

Additionally, `splitting: false` means every adapter entry point bundles the entire core (~11 kB) independently → ~99 kB of duplicated JS. With `splitting: true`, tsup creates a shared chunk, reducing total JS size significantly.

### Decision: Two-fix approach

| Fix | Change | Estimated saving |
|---|---|---|
| Remove source maps | `sourcemap: false` in tsup.config.ts | ~494 kB |
| Enable code splitting | `splitting: true` in tsup.config.ts | ~40–60 kB |

**Projected post-fix size: ~70–90 kB unpacked** (well under the 300 kB target).

Source maps are useful during development but are not needed in the published package — consumers who want source maps can use the bundled TypeScript declarations for IDE navigation, or configure their build to generate maps from source.

### Alternatives Considered
- **Minify output** (`minify: true`): Would help but makes debugging harder and saves less than removing maps. Not needed to hit target.
- **Exclude map files from `files` in package.json instead of disabling generation**: Equivalent outcome, but disabling generation is cleaner — no unused files produced at build time.
- **Remove CHANGELOG.md / README.md from published package**: Minimal impact (<5 kB combined). Not worth the UX regression for npm page consumers.

---

## 5. Algorithm Plug-in Architecture

### Decision
Use a **factory function + string key** pattern — `createRateLimiter` instantiates the correct algorithm class based on `config.algorithm`. No public algorithm registry or class hierarchy needed in v1.1.

### Rationale
The `algorithm` config field already exists and is validated. Adding `'sliding-window'` and `'token-bucket'` to the allowed values and routing to new algorithm classes is minimal surface area and fully backwards compatible. A plugin registry would add complexity for no benefit at this stage.

### Internal Algorithm Interface
All algorithm classes implement:
```typescript
interface Algorithm {
  check(namespacedKey: string, displayKey: string): Promise<RateLimiterResult>;
}
```
This is already satisfied by `FixedWindowLimiter`. New classes `SlidingWindowLimiter` and `TokenBucketLimiter` will implement the same shape.

---

## 6. Resolved NEEDS CLARIFICATION Items

None — the spec had no open clarifications. All decisions above are research-confirmed.
