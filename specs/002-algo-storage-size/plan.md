# Implementation Plan: Algorithm Extensibility, Storage Adapters & Package Size

**Branch**: `002-algo-storage-size` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-algo-storage-size/spec.md`

---

## Summary

Add two new rate limiting algorithms (sliding window counter, token bucket), a pluggable `StorageAdapter` public interface, a first-party Redis storage adapter, and reduce the published package size from 621 kB to below 300 kB. All changes are backwards-compatible (minor release). The primary size fix is disabling source maps in the tsup build; the algorithm and storage work follows the existing `src/core/algorithms/` pattern.

---

## Technical Context

**Language/Version**: TypeScript 5.7+ targeting ES2022; Node.js >=18.0.0
**Primary Dependencies**: tsup 8.x (build), vitest 3.x (test), eslint 9.x (lint); `redis` / `ioredis` as optional peer dependencies for the Redis adapter
**Storage**: In-memory `MemoryStore` (default); new `RedisStore` (optional, separate entry point)
**Testing**: vitest — unit, contract, integration test layers
**Target Platform**: Browser, Node.js >=18, Edge runtimes (Cloudflare Workers, Vercel Edge)
**Project Type**: Published npm library (dual ESM/CJS)
**Performance Goals**: New algorithms ≤ 0.1ms p95 overhead vs. fixed window in existing perf test
**Constraints**: <300 kB unpacked; no breaking public API changes; no new mandatory runtime dependencies
**Scale/Scope**: Library consumed across runtimes; `MemoryStore` must support up to 10 000 concurrent keys by default

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Per `.specify/memory/constitution.md` (Limiterx Constitution):

- [x] **Code quality & maintainability**: New algorithms live in `src/core/algorithms/` following `FixedWindowLimiter` pattern. `StorageAdapter` is the only contract between algorithms and storage — no algorithm accesses store internals. No `any` casts introduced. `store` config field added cleanly to `LimiterxConfig` without breaking existing consumers.
- [x] **Testing standards**: Unit tests for `SlidingWindowLimiter` and `TokenBucketLimiter`. Contract tests for `StorageAdapter` interface. Integration tests for `RedisStore` against a real Redis instance. Existing coverage thresholds (90% statements, 85% branches, 95% functions) preserved. Existing tests unchanged.
- [x] **User experience consistency**: `algorithm` field works identically across all 7 framework adapters — no per-adapter code change needed. `store` field wired in `createRateLimiter` centrally. Error messages follow `[limiterx] Invalid config:` format. TypeScript types updated to reflect new options.
- [x] **Performance**: Sliding window and token bucket benchmarked against fixed window in `tests/perf/check-latency.test.ts`. Source map removal and `splitting: true` reduce unpacked size from 621 kB to projected ~80–90 kB. Redis adapter exempt from in-process latency budget.

**Post-Phase-1 re-check**: All gates still pass. No violations requiring Complexity Tracking.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-algo-storage-size/
├── plan.md           ✅ this file
├── research.md       ✅ Phase 0 output
├── data-model.md     ✅ Phase 1 output
├── quickstart.md     ✅ Phase 1 output
├── contracts/
│   └── algorithm-api.md  ✅ Phase 1 output
└── tasks.md          🔲 Phase 2 output (/speckit.tasks)
```

### Source Code Changes

```text
src/
├── index.ts                          ← add StorageAdapter, TokenBucketState exports
├── core/
│   ├── types.ts                      ← generalize StorageAdapter; add TokenBucketState; add store to LimiterxConfig
│   ├── createRateLimiter.ts          ← wire algorithm selection + store config
│   ├── validateConfig.ts             ← extend algorithm union; validate store field
│   ├── storage/
│   │   └── MemoryStore.ts            ← update type annotation (Record<string,number>)
│   └── algorithms/
│       ├── FixedWindowLimiter.ts     ← unchanged
│       ├── SlidingWindowLimiter.ts   ← NEW
│       └── TokenBucketLimiter.ts     ← NEW
└── adapters/
    ├── redis.ts                      ← NEW (entry point: limiterx/redis)
    └── [express|koa|node|next|react|fetch|axios].ts  ← unchanged

tests/
├── unit/
│   ├── SlidingWindowLimiter.test.ts  ← NEW
│   └── TokenBucketLimiter.test.ts    ← NEW
├── contract/
│   ├── createRateLimiter.test.ts     ← extend with algorithm/store fields
│   └── StorageAdapter.contract.test.ts  ← NEW (shared contract suite for MemoryStore + RedisStore)
├── integration/
│   └── redis.test.ts                 ← NEW (requires running Redis)
└── perf/
    └── check-latency.test.ts         ← extend to bench all three algorithms

tsup.config.ts                        ← sourcemap: false; splitting: true; add redis entry
package.json                          ← add ./redis export; add redis/ioredis as optional peers
```

**Structure Decision**: Single project layout (existing). All new source under `src/core/algorithms/` and `src/adapters/`. No new top-level directories needed.

---

## Key Design Decisions (from research.md)

### Sliding Window Counter
- Formula: `effectiveCount = prev.count × (1 − elapsed/windowMs) + curr.count`
- Two storage keys per logical key: `limiterx:sw:{key}:curr` and `limiterx:sw:{key}:prev`
- Same `FixedWindowState` shape — no `StorageAdapter` change needed for this algorithm alone

### Token Bucket
- Virtual refill: compute tokens at check time, no background timer
- Refill rate: `max / windowMs` tokens per ms
- State: `{ tokens: number, lastRefill: number }` stored via generalized `StorageAdapter`

### StorageAdapter Generalization
- `get/set` state type: `Record<string, number>` (both existing and new state shapes satisfy this)
- `StorageAdapter` exported publicly from `limiterx` main entry (FR-004)
- `MemoryStore` internal `MemoryEntry` updated accordingly (annotation only)

### Redis Adapter
- Duck-typed `RedisClientInterface` — both `ioredis` and `redis` (node-redis v4+) satisfy it
- Atomic operations via Lua scripts
- Entry point: `limiterx/redis` — zero cost when unused

### Package Size
- `sourcemap: false` in tsup → saves ~494 kB (source maps were 80% of total)
- `splitting: true` in tsup → shared core chunk, eliminates ~40–60 kB of duplication
- Projected unpacked size: ~80–90 kB (target: <300 kB)

---

## Complexity Tracking

> No Constitution Check violations — this section intentionally empty.
