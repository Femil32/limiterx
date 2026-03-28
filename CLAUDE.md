# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile with tsup (ESM + CJS dual output into dist/)
npm run typecheck    # TypeScript type checking without emitting
npm run lint         # ESLint over src/**/*.ts
npm run test         # Run all tests with coverage (vitest run --coverage)
npm run test:watch   # Watch mode (no coverage)
npm run coverage     # Alias for test with coverage
```

Run a single test file:
```bash
npx vitest run tests/unit/MemoryStore.test.ts
```

Pre-publish gate (`npm run prepublishOnly`) runs typecheck, lint, test, and build in sequence.

## Architecture

This is **limiterx** — a universal rate limiting library published as a dual ESM/CJS npm package. Each adapter is a separate entry point (e.g. `limiterx/express`, `limiterx/react`).

### Core (`src/core/`)

The core is framework-agnostic:

- `createRateLimiter.ts` — Public factory. Wires together `validateConfig` → `parseWindow` → `MemoryStore` → `FixedWindowLimiter`. Returns a `RateLimiter` object (`check`, `reset`, `clear`, `destroy`). Keys are namespaced with `limiterx:` prefix internally.
- `algorithms/FixedWindowLimiter.ts` — The only algorithm in v1. Windows align to wall-clock time using `Math.floor(Date.now() / windowMs) * windowMs`.
- `storage/MemoryStore.ts` — In-memory `Map`-based `StorageAdapter` with LRU eviction (`maxKeys`, default 10 000) and periodic TTL cleanup (every 60 s). The cleanup timer is `unref()`ed so it doesn't block Node process exit. Call `destroy()` to stop the timer.
- `validateConfig.ts` — Validates all config fields eagerly and applies defaults. Error messages follow `[limiterx] Invalid config: '...'` format.
- `parseWindow.ts` — Parses duration strings (`500ms`, `30s`, `5m`, `1h`, `1d`) or raw millisecond numbers.
- `RateLimitError.ts` — Error subclass thrown by frontend adapters (fetch, axios) when a request is denied. Carries the full `RateLimiterResult`.
- `types.ts` — All shared TypeScript interfaces: `LimiterxConfig`, `RateLimiterResult`, `RateLimiter`, `StorageAdapter`, `RequestContext`, `FixedWindowState`.

### Adapters (`src/adapters/`)

Each adapter wraps `createRateLimiter` and applies framework conventions:

| Adapter | Export | Default key | Denied behaviour |
|---|---|---|---|
| `express.ts` | `rateLimitExpress` | `req.ip` (IPv6-masked at /56) | Sends HTTP 429, calls `next(err)` on unexpected errors |
| `node.ts` | `rateLimitNode` | `req.socket.remoteAddress` (IPv6-masked) | Returns result; developer controls response |
| `koa.ts` | `rateLimitKoa` | `ctx.ip` (IPv6-masked) | Sets `ctx.status = 429`, skips `next` |
| `next.ts` | `rateLimitNext` | `req.ip` or `x-forwarded-for` (IPv6-masked) | Returns `NextResponse` with 429 |
| `fetch.ts` | `rateLimitFetch` | `'global'` | Throws `RateLimitError` |
| `axios.ts` | `rateLimitAxios` | `'global'` | Throws `RateLimitError` |
| `react.ts` | `useRateLimit` (hook) | n/a (key param) | Returns `allowed: false`, calls `onLimit` |

#### Internal adapter helpers (`src/adapters/internal/`)

- `rate-limit-headers.ts` — `setRateLimitHeaders(setHeader, result, { standard, legacyHeaders })` sets IETF `RateLimit-*` headers and optionally `X-RateLimit-*` legacy headers. The backward-compatible alias `setRateLimitHeadersFull` wraps this with `{ standard: true, legacyHeaders: false }`.
- `ipv6.ts` — `maskIPv6(ip, prefixLength)` applies a subnet mask to IPv6 addresses using BigInt arithmetic (no Node.js `net` module — safe for Edge Runtime). Called by default `keyGenerator` in all backend adapters. IPv4 addresses pass through unchanged.
- `resolve-message.ts` — `resolveMessage(message, result, ctx)` resolves `LimiterxConfig.message` which can be a string, object, or sync/async function.

### Key Config Fields (spec-003 additions, v1.2.0)

| Field | Default | Purpose |
|---|---|---|
| `legacyHeaders` | `false` | Emit `X-RateLimit-*` headers (epoch timestamp for Reset) |
| `ipv6Subnet` | `56` | IPv6 subnet mask prefix length; `false` to disable |
| `requestPropertyName` | `'rateLimit'` | Property on `req`/`ctx` where `RateLimiterResult` is attached |
| `passOnStoreError` | `false` | When `true`, allow requests through on storage errors (fail-open) |
| `handler` | `undefined` | Replaces built-in 429 response; `onLimit` still fires first |
| `message` | `'Too many requests'` | String, object, or `(result, ctx) => string\|object\|Promise<…>` |
| `keyGenerator` | IP-based | Now supports `async (ctx) => string` |
| `skip` | — | Now supports `async (ctx) => boolean` |

### Header behaviour

- `headers: false` — suppresses ALL rate limit headers (both IETF and legacy). Acts as master gate.
- `headers: true` (default) + `legacyHeaders: false` (default) — only IETF `RateLimit-*` headers.
- `headers: true` + `legacyHeaders: true` — both `RateLimit-*` and `X-RateLimit-*` headers.
- `RateLimit-Reset` is a **relative** countdown in seconds. `X-RateLimit-Reset` is an **absolute** Unix epoch timestamp. This matches the historical convention of GitHub/Twitter APIs.

### Build

`tsup.config.ts` produces ESM (`.js`) and CJS (`.cjs`) with `.d.ts` and `.d.cts` declaration files. Each adapter is a separate entry so consumers can tree-shake by importing only what they use.

- `splitting: true` — shared core code lives in a single chunk; adapter entries import it rather than bundling independently. Reduces published size by ~50 KB.
- `sourcemap: false` — source maps are not published. Reduces published size by ~494 KB.

### Tests (`tests/`)

- `tests/unit/` — Pure unit tests for core modules
  - `ipv6.test.ts` — maskIPv6: IPv4 passthrough, /56 mask, different subnets, loopback, disable
  - `resolveMessage.test.ts` — string/object passthrough, sync/async function
  - `validateConfig.spec-003.test.ts` — all spec-003 new config fields
- `tests/integration/` — One file per adapter using real framework instances (supertest for Express/Node/Koa, jsdom for React)
  - `express.spec-003.test.ts` — spec-003 features: legacyHeaders, requestPropertyName, passOnStoreError, handler, async keyGenerator/skip, message function
  - `legacy-headers.test.ts` — X-RateLimit-* format, epoch seconds for Reset, header suppression
- `tests/contract/` — Contract tests for `createRateLimiter` public API
- `tests/perf/` — Latency smoke test

The React integration test runs under jsdom (configured via `environmentMatchGlobs` in `vitest.config.ts`). Coverage thresholds: 90% statements, 85% branches, 95% functions.

### Specs

Feature specifications live in `specs/`:

| Spec | Branch | Status | Description |
|---|---|---|---|
| `001-production-readiness` | `main` | ✅ Shipped (v1.0.0) | Core + all adapters |
| `002-algo-storage-size` | `002-algo-storage-size` | 🚧 In progress | Sliding window, token bucket, Redis, size |
| `003-express-rate-limit-parity` | Current | 🚧 Phase A done | 7 gaps closed (v1.2.0 target) |

Each spec contains: `spec.md` (user stories), `plan.md` (design), `tasks.md`, `quickstart.md`, `data-model.md`, `contracts/`, `checklists/`.
