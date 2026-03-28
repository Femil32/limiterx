# Tasks: Algorithm Extensibility, Storage Adapters & Package Size

**Input**: Design documents from `/specs/002-algo-storage-size/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend build config and package metadata before any algorithm work begins.

- [x] T001 Update `tsup.config.ts`: set `sourcemap: false`, `splitting: true`, add `'adapters/redis': 'src/adapters/redis.ts'` entry (redis entry deferred to T014; sourcemap/splitting already done in spec-003)
- [x] T002 Update `package.json`: add `"./redis"` export block; add `redis` and `ioredis` as optional `peerDependencies`

**Checkpoint**: `npm run build` succeeds and `npm pack --dry-run` shows unpacked size < 300 kB (US4 done).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core type and wiring changes that ALL algorithm and storage work depends on.

- [x] T003 Update `src/core/types.ts`: change `StorageAdapter.get/set` state type from `FixedWindowState` to `Record<string, number>`; add `TokenBucketState` interface; add `store?: StorageAdapter` to `LimiterxConfig`; add `algorithm: 'sliding-window' | 'token-bucket'` to the union
- [x] T004 Update `src/core/storage/MemoryStore.ts`: change `MemoryEntry` and method signatures from `FixedWindowState` to `Record<string, number>` (annotation-only, no logic change)
- [x] T005 Update `src/core/validateConfig.ts`: extend `algorithm` validation to accept `'sliding-window'` and `'token-bucket'`; add `store` field validation (must be object with `get/set/increment/delete/clear` methods)
- [x] T006 Update `src/core/createRateLimiter.ts`: accept `config.store` to override default `MemoryStore`; route `config.algorithm` to the correct algorithm class (switch on value; `'sliding-window'` → `SlidingWindowLimiter`, `'token-bucket'` → `TokenBucketLimiter`, default → `FixedWindowLimiter`); update `reset(key)` to delete both `limiterx:sw:{key}:curr` and `limiterx:sw:{key}:prev` when algorithm is `'sliding-window'` (M1 remediation)
- [x] T007 Update `src/index.ts`: export `StorageAdapter` type and `TokenBucketState` interface

**Checkpoint**: `npm run typecheck` passes. Existing tests still pass (`npm run test`).

---

## Phase 3: User Story 1 — Sliding Window Algorithm (Priority: P1) 🎯 MVP

**Goal**: `algorithm: 'sliding-window'` enforces rolling-window limits with no burst at boundary.

**Independent Test**: Configure `algorithm: 'sliding-window'`, fire `max` requests at a window boundary, verify the combined count cannot exceed `max` in any rolling interval.

### Tests for US1 ⚠️ Write first — verify they FAIL before implementing

- [x] T008 [P] [US1] Write unit tests in `tests/unit/SlidingWindowLimiter.test.ts`:
  - allow up to `max` in a window
  - deny on `max + 1`
  - boundary burst test (prev + curr combined cannot exceed `max`)
  - `remaining` decrements correctly
  - `retryAfter === 0` when allowed, `> 0` when denied
  - new window resets count

### Implementation for US1

- [x] T009 [US1] Create `src/core/algorithms/SlidingWindowLimiter.ts`:
  - Constructor: `(store: StorageAdapter, max: number, windowMs: number, debug?: boolean)`
  - Keys: `${namespacedKey}:curr` and `${namespacedKey}:prev`
  - On window boundary: copy curr → prev (with TTL `2 × windowMs`), start fresh curr
  - Formula: `effectiveCount = prev.count × (1 − elapsed/windowMs) + curr.count`
  - If `effectiveCount >= max`: deny, `retryAfter = windowEnd − now`
  - Else: increment `curr.count`, allow
  - `retryAfter` is `0` when allowed, `windowEnd − now` when denied
  - `resetAt` is always `new Date(currentWindowStart + windowMs)`
  - Implements same `check(namespacedKey, displayKey): Promise<RateLimiterResult>` signature

**Checkpoint**: `npx vitest run tests/unit/SlidingWindowLimiter.test.ts` — all tests pass.

---

## Phase 4: User Story 2 — Token Bucket Algorithm (Priority: P2)

**Goal**: `algorithm: 'token-bucket'` allows bursts up to `max`, then throttles to steady refill rate.

**Independent Test**: Exhaust bucket in one burst, verify immediate 4th request is denied, verify request after refill window is allowed.

### Tests for US2 ⚠️ Write first — verify they FAIL before implementing

- [x] T010 [P] [US2] Write unit tests in `tests/unit/TokenBucketLimiter.test.ts`:
  - full bucket: `max` consecutive requests all allowed
  - bucket exhausted: next request denied immediately
  - `retryAfter` reflects time until 1 token refills (within 10ms tolerance)
  - partial refill: after half refill time, `floor(refillRate × elapsed)` requests allowed
  - `max: 1` edge case: single request allowed, second denied until refill
  - `remaining` reflects available tokens correctly

### Implementation for US2

- [x] T011 [US2] Create `src/core/algorithms/TokenBucketLimiter.ts`:
  - Constructor: `(store: StorageAdapter, max: number, windowMs: number, debug?: boolean)`
  - Key: `${namespacedKey}` (single key, prefix `tb:` applied by caller in `createRateLimiter`)
  - State type: `TokenBucketState` — `{ tokens: number, lastRefill: number }`
  - On check:
    1. Load state; if null, initialize `{ tokens: max, lastRefill: now }`
    2. Compute `elapsed = now − state.lastRefill`
    3. `newTokens = Math.min(max, state.tokens + elapsed × (max / windowMs))`
    4. If `newTokens >= 1`: allow, store `{ tokens: newTokens − 1, lastRefill: now }` with TTL `windowMs × 2`
    5. Else: deny, `retryAfter = Math.ceil((1 − newTokens) / (max / windowMs))`
  - `resetAt = new Date(now + retryAfter)` when denied; `new Date(now + windowMs)` when allowed

**Checkpoint**: `npx vitest run tests/unit/TokenBucketLimiter.test.ts` — all tests pass.

---

## Phase 5: User Story 3 — Redis Storage Adapter (Priority: P3)

**Goal**: `store: new RedisStore(client)` shares rate limit state across multiple processes.

**Independent Test**: Two limiter instances with same `RedisStore` share counter — 6th request across both instances is denied when `max: 5`.

### Tests for US3 ⚠️ Write first — verify they FAIL before implementing

- [x] T012 [P] [US3] Write contract tests in `tests/contract/StorageAdapter.contract.test.ts`:
  - Parameterised suite that runs against both `MemoryStore` and `RedisStore`
  - `get` returns null for missing key
  - `set` then `get` returns correct state
  - `increment` is atomic and returns new count
  - `delete` removes key
  - `clear` removes all keys
  - TTL: key expires after `ttlMs` (use short TTL + `vi.advanceTimersByTime` for MemoryStore; real sleep for Redis)

- [x] T013 [P] [US3] Write integration tests in `tests/integration/redis.test.ts`:
  - Shared counter across two `createRateLimiter` instances using same `RedisStore`
  - Works with `algorithm: 'fixed-window'` + Redis
  - Works with `algorithm: 'sliding-window'` + Redis
  - Works with `algorithm: 'token-bucket'` + Redis
  - `limiter.reset(key)` clears Redis key(s)
  - `limiter.clear()` flushes all keys
  - Redis error (disconnect) propagates — does not silently allow all traffic

### Implementation for US3

- [x] T014 [P] [US3] Create `src/adapters/redis.ts`:
  - Export `RedisClientInterface` (duck-typed: `get`, `set` with `{ ex }`, `del`, `eval`, `flushall`)
  - Export `RedisStore implements StorageAdapter`
  - `get`: `JSON.parse(await client.get(key))` or null
  - `set`: `await client.set(key, JSON.stringify(state), { ex: Math.ceil(ttlMs / 1000) })`
  - `increment`: Lua script — atomically INCR, set TTL on first call, return new count. **Note**: `increment(key, ttlMs)` only receives `ttlMs` as the second argument — do NOT reference `ARGV[2]` for `windowStart`. The `windowStart` is stored as `Date.now()` within the Lua script using `redis.call('TIME')` seconds × 1000 (C2 remediation):
    ```lua
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
    end
    return count
    ```
    Then wrap result in `{ count, windowStart: now }` on the JS side after the Lua call returns the count.
  - `delete`: `await client.del(key)`
  - `clear`: `await client.flushall()` (scoped to the connected db — document this in types)

**Checkpoint**: `npx vitest run tests/contract/StorageAdapter.contract.test.ts tests/integration/redis.test.ts` passes (requires Redis running locally on default port).

---

## Phase 6: User Story 4 — Package Size < 300 kB (Priority: P4)

**Goal**: Published unpacked size drops from 621 kB to below 300 kB with zero API changes.

**Independent Test**: `npm run build && npm pack --dry-run` shows unpacked size < 300 kB.

- [x] T015 [US4] Verify `npm run build` succeeds with `sourcemap: false` and `splitting: true` from T001
- [x] T016 [US4] Run `npm pack --dry-run` and confirm unpacked size < 300 kB; record actual size in a comment in `tsup.config.ts`
- [x] T017 [P] [US4] Verify tree-shake isolation: inspect `dist/adapters/express.js` — must not contain `RedisStore`, `useRateLimit`, or `TokenBucketLimiter` code

**Checkpoint**: Size target met. Express bundle contains no Redis or React code.

---

## Phase 7: Contract Tests & Cross-Cutting Concerns

**Purpose**: Extend existing contract suite, run perf baseline, validate all adapters.

- [x] T018 [P] Extend `tests/contract/createRateLimiter.test.ts`:
  - `algorithm: 'sliding-window'` accepted by `createRateLimiter`
  - `algorithm: 'token-bucket'` accepted by `createRateLimiter`
  - `store: new MemoryStore()` accepted as `config.store`
  - Invalid `algorithm` value throws `[limiterx] Invalid config:` error
  - Invalid `store` (non-object) throws `[limiterx] Invalid config:` error

- [x] T019 [P] Extend `tests/perf/check-latency.test.ts`: add latency checks for `sliding-window` and `token-bucket` — both must stay within 0.1ms p95 of fixed-window baseline

- [x] T020 [P] [C1] Extend existing adapter integration tests to cover new algorithms (FR-007 remediation):
  - In `tests/integration/express.test.ts`: add two test blocks — `algorithm: 'sliding-window'` and `algorithm: 'token-bucket'` — verifying middleware returns 200 under limit and 429 when exceeded
  - In `tests/integration/fetch.test.ts`: add `algorithm: 'token-bucket'` block verifying `RateLimitError` is thrown on denial
  - These are the two most representative adapters (backend + frontend); other adapters share the same core wiring and are covered by the contract test

- [x] T021 [P] Run full test suite: `npm run test` — all tests pass, coverage thresholds met (90% statements, 85% branches, 95% functions)

- [x] T022 Run `npm run lint` and `npm run typecheck` — zero errors

- [x] T023 [M2] Update `README.md`: document `algorithm: 'sliding-window' | 'token-bucket'` options with brief examples; document `store?: StorageAdapter` config field; add `limiterx/redis` import usage example with `RedisStore`; update algorithm comparison table if one exists

- [ ] T024 Run quickstart.md validation scenarios manually (US1–US4 smoke tests)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately. US4 size target is verifiable after T001+T002.
- **Phase 2 (Foundational)**: Depends on Phase 1. **Blocks all algorithm/storage work.**
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2. Can run in parallel with Phase 3.
- **Phase 5 (US3)**: Depends on Phase 2. Can run in parallel with Phases 3–4.
- **Phase 6 (US4)**: Depends on Phase 1 only — can be verified immediately after T001.
- **Phase 7**: Depends on all user story phases complete.

### Within Each User Story

- Tests (T008, T010, T012, T013) MUST be written and confirmed FAILING before implementation tasks run.
- Implementation tasks within a story have no internal ordering constraint (single file each).

### Parallel Opportunities

```bash
# After Phase 2 completes, these can run in parallel:
Task: T008 — Write SlidingWindowLimiter tests
Task: T010 — Write TokenBucketLimiter tests
Task: T012 — Write StorageAdapter contract tests
Task: T013 — Write Redis integration tests

# After tests written:
Task: T009 — Implement SlidingWindowLimiter
Task: T011 — Implement TokenBucketLimiter
Task: T014 — Implement RedisStore
```

---

## Implementation Strategy

### MVP (US1 only — Phase 1 + 2 + 3)

1. T001–T002: Fix build (US4 size benefit is immediate)
2. T003–T007: Foundation types + wiring
3. T008: Write sliding window tests (must fail first)
4. T009: Implement `SlidingWindowLimiter`
5. **STOP + VALIDATE**: `npm run test` passes, `algorithm: 'sliding-window'` works end-to-end

### Full Incremental Delivery

- MVP → add US2 (T010→T011) → add US3 (T012→T013→T014) → Polish (T018–T022)
- Each story can be demonstrated independently after its checkpoint.

---

## Notes

- `[P]` = parallelizable (different files, no blocking dependency)
- `[US1/2/3/4]` = story label for traceability
- Redis integration tests require a running Redis instance on `localhost:6379`; consider adding a `vitest.config.ts` `environmentMatchGlobs` or a separate test script (`npm run test:redis`) to keep the CI default green without Redis
- `splitting: true` in tsup creates shared chunk files (e.g., `chunk-abc123.js`) — verify these are included in `dist/` and the `files` field in `package.json` picks them up automatically (it should, since `dist` is listed)
- `limiter.reset(key)` in `createRateLimiter.ts` must delete all keys for the given logical key: for sliding window that means both `:curr` and `:prev` suffixed keys
