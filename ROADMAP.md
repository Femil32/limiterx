# Roadmap & Contribution Opportunities

limiterx is an open-source project and **all of the items below are open for community contributions**.
If you want to work on something, open an issue first to discuss the approach, then submit a PR.

Labels used here:
- 🟢 **Good first issue** — isolated, well-scoped, no deep context needed
- 🟡 **Medium** — needs understanding of the affected module
- 🔴 **Advanced** — cross-cutting or requires design discussion first

---

## Bug Fixes & Correctness

### 1. `onLimit` async rejection is silently lost 🟡
`onLimit` can return `Promise<void>`, but the call site in `createRateLimiter` does not `await` it,
so a rejected promise produces an **unhandled rejection** instead of being caught.
The fix is to `await` the call inside the existing `try/catch`.

**Files:** `src/core/createRateLimiter.ts` · `tests/contract/`

---

### 2. `decrement()` is broken for sliding-window and token-bucket 🔴
Sliding-window stores state under `:curr` / `:prev` suffixed keys, but `decrement` targets the
bare namespaced key. Token-bucket state is `tokens / lastRefill`; decrementing `count` is
semantically wrong. This affects `skipSuccessfulRequests` and `skipFailedRequests` when either
algorithm is active.

Options:
- Delegate `decrement` to the algorithm itself (each algorithm knows its key shape)
- Document clearly that skip-flows are fixed-window only until this is resolved

**Files:** `src/core/createRateLimiter.ts`, `src/core/algorithms/`

---

### 3. Fixed-window read–modify–write race condition 🔴
`FixedWindowLimiter.check` calls `store.get` then `store.set` separately. Under concurrent
requests (especially in a single-process async context), two requests can both read "under limit"
before either writes the incremented counter. The `RedisStore` has an atomic `increment` via
Lua, but it is not wired up for the fixed-window hot path.

**Files:** `src/core/algorithms/FixedWindowLimiter.ts`, `src/storage/RedisStore.ts`

---

### 4. `RedisStore.decrement` is not atomic 🟡
`decrement` does a `get → parse → set` round trip without a Lua script, so it has the same
lost-update risk as the issue above. Wrap it in a Lua script (similar to the existing `increment`
script) to make it atomic.

**Files:** `src/storage/RedisStore.ts`

---

### 5. `RedisStore.clear()` uses `FLUSHALL` — catastrophic on shared Redis 🟡
`FLUSHALL` wipes every key in the instance, including unrelated data from other services. It
should be replaced with a `SCAN + DEL` over keys matching the `limiterx:` namespace prefix.

**Files:** `src/storage/RedisStore.ts`

---

### 6. Koa adapter has no outer `try/catch` for `keyGenerator` / `skip` errors 🟡
When `keyGenerator` throws in the Express adapter it calls `next(err)`, correctly turning the
error into a 500 (not a raw crash). The Koa middleware has no equivalent outer guard, so a
throwing `keyGenerator` bubbles uncaught unless the Koa app has centralized error middleware.
Add a top-level `try/catch → ctx.throw(500)` to match Express behavior.

**Files:** `src/adapters/koa.ts`, `tests/integration/koa.test.ts`

---

## New Adapters

> Each adapter below follows the same pattern as the existing ones.
> A good starting point is copying `src/adapters/express.ts` and adjusting framework-specific
> request/response types and the default key generator.

### 7. Hono adapter 🟡
Hono is already listed in `package.json` keywords but has no adapter. Implement
`rateLimitHono` that wraps `createRateLimiter` and uses Hono's `Context` for request
access and response control, with a matching export in `package.json` and `tsup.config.ts`.

**Files:** `src/adapters/hono.ts` (new), `package.json`, `tsup.config.ts`

---

### 8. Fastify adapter 🟡
Fastify uses a plugin system (`fastifyPlugin`). The adapter should register as a Fastify
plugin that decorates the request with the `RateLimiterResult` and sends a 429 on denial.

**Files:** `src/adapters/fastify.ts` (new), `package.json`, `tsup.config.ts`

---

### 9. Remix / SvelteKit / h3 (Nitro) adapters 🟡
Edge-runtime-friendly adapters using the `Request` / `Response` Web API (similar to the
existing `next.ts` edge path). Each would be its own entry point.

---

## Error Handling Improvements

### 10. Document and test `message` resolver error behavior 🟢
If the `message` option is an async function that rejects, the error propagates to the
framework handler (not swallowed). This is not documented in the README and has no
integration test. Add a test for each adapter and a note to the README.

**Files:** `src/adapters/internal/resolve-message.ts`, `tests/integration/`

---

### 11. `keyGenerator` error should produce 429 not 500 (configurable) 🟡
When `keyGenerator` throws, all current backend adapters treat it as an unexpected error (500).
Add a `failOpen` / `passOnKeyError` config option (or extend `passOnStoreError` semantics) to
let applications choose fail-open (allow request) vs fail-closed (429) on key generation errors,
similar to `passOnStoreError`.

**Files:** `src/core/validateConfig.ts`, `src/adapters/`

---

## Testing Improvements

### 12. Run Redis integration tests in CI 🟢
`tests/integration/redis.test.ts` is guarded by `describe.skipIf(!REDIS_AVAILABLE)`.
Add a `docker-compose.yml` (or GitHub Actions `services:` block) that spins up Redis so the
Redis suite runs on every pull request.

**Files:** `.github/workflows/` (new/existing), `docker-compose.yml` (new)

---

### 13. Async `onLimit` rejection test 🟢
There is no test that passes an async `onLimit` returning a rejected promise and asserts the
rejection is handled (not an unhandled rejection). Once issue #1 is fixed, add a regression
test.

**Files:** `tests/contract/createRateLimiter.test.ts`

---

### 14. Sliding window + `skipSuccessfulRequests` / `skipFailedRequests` tests 🟡
Existing skip-flow tests likely exercise only the fixed-window algorithm. Add integration tests
that select `algorithm: 'sliding-window'` and `algorithm: 'token-bucket'` to lock behavior
(or document "fixed-window only" until issue #2 is resolved).

**Files:** `tests/integration/express.test.ts`, `tests/integration/`

---

### 15. Concurrent race-condition stress test 🔴
Add a test that fires N concurrent `limiter.check()` calls and asserts the counter never exceeds
`max`, to catch the lost-update issue (#3) and guard against regressions after it is fixed.

**Files:** `tests/perf/` or new `tests/integration/concurrency.test.ts`

---

## Documentation Fixes

### 16. README: Node HTTP example calls `limiter(req, res)` instead of `limiter.check(req, res)` 🟢
The Node HTTP adapter section shows an incorrect call signature. Fix the snippet and add a
brief note about attaching the result to `req[requestPropertyName]`.

**Files:** `README.md`

---

### 17. README: `standardHeaders` default is documented as `'draft-6'`; code defaults to `'draft-7'` 🟢
`validateConfig.ts` defaults `standardHeaders` to `'draft-7'` but the README config table
says `'draft-6'`. One of them is wrong — verify and sync.

**Files:** `README.md`, `src/core/validateConfig.ts`

---

### 18. README: Next.js App Router example mismatches the adapter API 🟢
The "Next.js API Route" snippet uses the App Router `Request` shape but `rateLimitNext().check`
expects Pages Router `NextApiRequest` / `NextApiResponse` types. Either fix the example to use
the Pages Router pattern or add a separate App Router example using `rateLimitEdge`.

**Files:** `README.md`

---

### 19. Add `ARCHITECTURE.md` 🟢
New contributors have `CLAUDE.md` (internal AI context) and `README.md` (user docs), but no
human-oriented architecture guide. A short `ARCHITECTURE.md` covering the adapter pattern,
the `StorageAdapter` interface, how algorithms consume storage, and how to add a new adapter
would significantly reduce ramp-up time.

**Files:** `ARCHITECTURE.md` (new)

---

## Performance

### 20. Reduce `MemoryStore` LRU churn on hot keys 🟡
`MemoryStore.get` deletes and re-inserts the entry every read to refresh LRU order. Under
high-throughput scenarios this creates unnecessary `Map` churn. Consider a doubly-linked-list
LRU (standard pattern) or a generation-based eviction to reduce overhead on frequently-hit keys.

**Files:** `src/core/storage/MemoryStore.ts`

---

### 21. Redis sliding-window pipeline 🟡
The sliding-window algorithm issues multiple `GET` / `SET` / `DEL` calls to Redis sequentially.
Batching these into a single Lua script or `pipeline()` call would halve round trips per check.

**Files:** `src/core/algorithms/SlidingWindowLimiter.ts`, `src/storage/RedisStore.ts`

---

## Known Limitations (Documentation-only)

These are inherent trade-offs, not bugs. The best contribution here is clear, accurate documentation.

### 22. Document LRU eviction behavior under high key cardinality 🟢
When `maxKeys` (default 10,000) is exhausted, the oldest keys are evicted. For workloads with
unbounded key spaces (per-API-key, per-endpoint, etc.) this can silently reset counters. Document
the trade-off in the README, suggest tuning `maxKeys`, and recommend Redis for cardinalities above
tens of thousands.

**Files:** `README.md`, `src/core/storage/MemoryStore.ts` (JSDoc)

---

### 23. Document proxy trust and IP spoofability 🟢
Client IP from `req.ip` or `x-forwarded-for` is only as trustworthy as proxy configuration.
Add a "Proxy trust & IP headers" section to the README explaining how to set Express's
`app.set('trust proxy', N)`, Next.js trusted proxy headers, and recommending API-key or
session-based keys for sensitive actions.

**Files:** `README.md`

---

### 24. Document memory overhead comparison for algorithm choice 🟢
Sliding-window counters require approximately 2× the memory per key vs fixed-window (current +
previous window buckets). Token-bucket stores tokens + timestamp. Users choosing algorithms
should know the trade-offs upfront.

**Files:** `README.md` (algorithm selection guide)

---

### 25. Document security scope — rate limiting is not a complete security layer 🟢
Add a "Security considerations" section to the README clarifying that rate limiting mitigates
abuse throughput but does not replace TLS, input validation, authentication/authorization, or
audit logging. Suggest pairing with `helmet`, HTTPS, and proper authn/z for production
deployments.

**Files:** `README.md`

---

## React Hook (`useRateLimit`)

### 26. React hook does not use `createRateLimiter` core 🔴
`useRateLimit` reimplements a fixed-window counter locally rather than delegating to
`createRateLimiter`. This means it silently misses any future core improvements (new
algorithms, dynamic `max`, `skip`, etc.). Investigate whether `createRateLimiter` can be
wired into the hook lifecycle without breaking React rules (single instance via `useRef`, no
cleanup side-effects), or document the intentional simplification.

**Files:** `src/adapters/react.ts`

---

## How to Contribute

1. **Pick an item** above, open an issue referencing the number (e.g. `#12 - Redis CI`), and describe your approach.
2. Fork the repo, create a branch named `fix/<number>-short-description` or `feat/<number>-short-description`.
3. Make the change, add or update tests, and ensure `npm test && npm run lint` passes.
4. Open a pull request. PRs are reviewed and merged by the maintainer.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup commands.
