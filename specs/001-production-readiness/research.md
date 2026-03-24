# Research: Limiterx Production Readiness

**Feature Branch**: `001-production-readiness`  
**Date**: 2026-03-23  
**Status**: Complete

## Research Tasks

### R-001: Build Tooling — Dual ESM/CJS with Multiple Entry Points

**Decision**: Use tsup with tsc for type-checking.

**Rationale**:
- tsup is zero-config, esbuild-powered, and supports `format: ['esm', 'cjs']` natively.
- Multiple entry points are configured via the `entry` object in `tsup.config.ts`, mapping output names to source files.
- Declaration files generated via `dts: true` or via separate `tsc --emitDeclarationOnly` step for more reliable `.d.ts` output.
- The build script chain is `tsc --noEmit` (type check) → `tsup` (bundle + declarations).
- Each adapter entry point maps to a separate file in `dist/`, enabling tree-shaking when `sideEffects: false` is set.

**Configuration approach**:
- `tsup.config.ts` with named entries: `{ index: 'src/index.ts', 'adapters/express': 'src/adapters/express.ts', ... }`
- `format: ['esm', 'cjs']` — outputs `.js` (ESM) and `.cjs` (CJS) for every entry.
- `dts: true` — generates `.d.ts` per entry.
- `external` — all peerDependencies (`react`, `express`, `koa`, `next`, `axios`) are externalized.
- `splitting: false` — no shared chunks; each entry is self-contained for predictable imports.
- `clean: true` — clears `dist/` before each build.

**`package.json` exports field** must provide both `import` and `require` for every subpath:
```json
{
  ".": { "import": "./dist/index.js", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
  "./express": { "import": "./dist/adapters/express.js", "require": "./dist/adapters/express.cjs", "types": "./dist/adapters/express.d.ts" }
}
```

**Alternatives considered**:
- **Rollup**: More configurable but higher setup complexity; no advantage for this use case.
- **esbuild directly**: Lacks `.d.ts` generation; would need tsc anyway.
- **tsc only**: No CJS output from ESM source without additional transforms; tsup handles this cleanly.

---

### R-002: Testing Framework — Vitest Configuration

**Decision**: Vitest with v8 coverage provider and fake timers.

**Rationale**:
- Vitest is ESM-native, fast, and shares Vite's transform pipeline — ideal for a TypeScript library.
- Built-in `vi.useFakeTimers()` and `vi.setSystemTime()` for deterministic testing of time-dependent rate limiting logic.
- Coverage via `@vitest/coverage-v8` with threshold enforcement in config.
- Compatible with `@testing-library/react` for React hook tests and `supertest` for HTTP integration tests.

**Configuration approach** (`vitest.config.ts`):
- `test.coverage.provider: 'v8'`
- `test.coverage.thresholds`: `{ statements: 90, branches: 85, functions: 95 }`
- `test.coverage.include: ['src/**']`, exclude test files and examples
- `test.environment: 'node'` (default); React tests override with `// @vitest-environment jsdom`
- `test.fakeTimers.shouldAdvanceTime: false` — manual timer control for precision

**Alternatives considered**:
- **Jest**: Heavier, ESM support requires experimental flags, slower for TypeScript.
- **Node.js test runner**: Missing coverage threshold enforcement and ecosystem maturity.

---

### R-003: Fixed Window Algorithm — Wall-Clock Alignment

**Decision**: Align window boundaries to wall-clock time using `Math.floor(Date.now() / windowMs) * windowMs`.

**Rationale**:
- Wall-clock alignment means all clients sharing a key see the same window boundaries, providing predictable behavior.
- `Date.now()` is available in all target runtimes (browser, Node.js, edge) — no dependency on `process.hrtime` or `performance.now()`.
- The tradeoff is susceptibility to 2× burst at window boundaries (documented in spec as acceptable for v1.0).
- Clock jumps (NTP) may cause early window resets — documented behavior, acceptable for single-process deployments.

**Algorithm state per key**:
```
{ count: number, windowStart: number }
```

**Check logic**:
1. Compute `currentWindowStart = Math.floor(Date.now() / windowMs) * windowMs`
2. Load state; if `windowStart !== currentWindowStart` → reset `count = 0`, update `windowStart`
3. If `count >= max` → deny (fire `onLimit`, return result with `allowed: false`)
4. Increment `count`, persist state with TTL = `windowMs`
5. Return result with `allowed: true`

**Alternatives considered**:
- **Sliding window**: More accurate near boundaries but higher memory/complexity; deferred to v1.1.
- **Request-time anchored windows**: Simpler but per-client windows don't align, harder to reason about.

---

### R-004: In-Memory Storage — LRU Eviction Strategy

**Decision**: `Map`-based store with periodic TTL cleanup and LRU eviction at capacity.

**Rationale**:
- JavaScript `Map` preserves insertion order, making LRU eviction straightforward: delete the first key when capacity is reached.
- Periodic cleanup (every 60 seconds, configurable) scans for expired entries, preventing memory leaks from keys that naturally expire.
- Max key count defaults to **10,000** — configurable via `LimiterxConfig.maxKeys` on `createRateLimiter()` (and the same default applies when constructing `MemoryStore` directly in tests; per `spec.md` FR-007 and `data-model.md`).
- Cleanup uses `setInterval` with `unref()` on Node.js to avoid holding the event loop open.

**Design**:
- Each entry stores: `{ count, windowStart, expiresAt }`.
- On `get()`: check `expiresAt < Date.now()` → return `null` if expired (lazy cleanup).
- On `set()`: if `map.size >= maxKeys` → delete oldest entry (first key in Map iteration order).
- Background sweep: iterate map, delete entries where `expiresAt < Date.now()`.

**Alternatives considered**:
- **LRU cache library (lru-cache)**: Adds a runtime dependency; the Map approach is sufficient and keeps zero-dependency promise.
- **WeakRef/FinalizationRegistry**: Not suitable for TTL-based expiry; designed for GC-based cleanup.

---

### R-005: HTTP Rate Limit Headers — Standards Compliance

**Decision**: Follow RFC 6585 (429 status) and draft-ietf-httpapi-ratelimit-headers (RateLimit-* headers).

**Rationale**:
- `RateLimit-Limit`: Total requests allowed per window (integer).
- `RateLimit-Remaining`: Requests remaining in current window (integer, >= 0).
- `RateLimit-Reset`: Seconds until window resets (integer, relative from now — matches Retry-After semantics).
- `Retry-After`: Seconds until retry is possible (only on 429 responses, per RFC 7231).
- All values coerced to `Math.ceil()` integers before writing to headers to prevent injection.

**Alternatives considered**:
- **X-RateLimit-* prefix**: Deprecated convention; standardized headers are preferred.
- **Absolute timestamp in Reset**: Some implementations use Unix epoch; relative seconds is simpler and more widely supported.

---

### R-006: React Hook Design — Client-Side Rate Limiting

**Decision**: `useRateLimit(key, config)` hook returning reactive state with `attempt()` and `reset()` functions.

**Rationale**:
- The hook creates an internal `FixedWindowLimiter` instance scoped to the component lifecycle.
- State (`allowed`, `remaining`, `retryAfter`, `resetAt`) updates via `useState` when `attempt()` is called.
- A `useEffect` sets up a timer that updates `retryAfter` reactively as the window expiration approaches, then resets state when the window expires.
- `reset()` clears the internal limiter state and returns to initial values.
- The limiter instance is created once per hook mount (stable reference via `useRef`), reconfigured only if `max` or `window` changes.

**Alternatives considered**:
- **External state manager (Zustand/Jotai)**: Adds dependency; internal state is sufficient for component-scoped limiting.
- **Context-based shared limiter**: More complex; per-component isolation is the common use case. Shared limiters can be achieved by reusing one `RateLimiter` from `createRateLimiter()` (e.g. module singleton or React context), consistent with v1.0 internal `MemoryStore` only.

---

### R-007: Config Validation — Fail-Fast at Creation Time

**Decision**: Validate all config fields in `createRateLimiter()` and throw descriptive errors immediately.

**Rationale**:
- Validation at creation time (not request time) catches misconfigurations before any traffic hits the limiter.
- Error messages follow the pattern: `[limiterx] Invalid config: '{field}' {constraint}, received: {value}`.
- Validated fields: `max` (positive integer), `window` (valid duration string or positive number), `algorithm` (recognized enum value), `keyGenerator` (function or undefined), `skip` (function or undefined), `onLimit` (function or undefined), `maxKeys` (positive integer or undefined), `debug` (boolean or undefined), `headers` (boolean or undefined), `statusCode` (integer 100-599), `message` (string or plain object per V-012). See `data-model.md` V-001–V-012.
- Returns a frozen config object to prevent mutation after validation.

**Alternatives considered**:
- **Zod/Joi schema validation**: Adds runtime dependency; manual validation is lightweight and keeps zero-dependency promise.
- **Runtime-only validation**: Delays error discovery to first request; poor DX.

---

### R-008: Window String Parsing — Duration Format

**Decision**: Custom `parseWindow()` function supporting `ms`, `s`, `m`, `h`, `d` suffixes and raw numbers.

**Rationale**:
- Format: `/^(\d+)(ms|s|m|h|d)$/` — single numeric value + unit suffix.
- Raw numbers treated as milliseconds.
- Multipliers: `ms=1`, `s=1000`, `m=60000`, `h=3600000`, `d=86400000`.
- Returns milliseconds as a positive integer.
- Throws descriptive error for unrecognized formats: `[limiterx] Invalid config: 'window' string '{input}' is not a valid duration format. Expected: number, or string like '30s', '5m', '1h'`.

**Alternatives considered**:
- **ms library (vercel/ms)**: Adds a dependency; the parsing logic is trivial (< 20 lines).
- **ISO 8601 durations (PT1M30S)**: Overly complex for the supported units; human-readable strings are more ergonomic.

---

### R-009: CI/CD Pipeline — GitHub Actions

**Decision**: GitHub Actions with lint → typecheck → test+coverage → build → conditional npm publish.

**Rationale**:
- Triggers: push to `main`, pull requests, and `v*` tags.
- Matrix testing across Node.js 18, 20, 22 to verify runtime compatibility (per SC-003).
- Supplemental job running the same test suite under **Bun** for SC-003; **browser**-oriented surfaces covered via Vitest **jsdom** (or file-level `// @vitest-environment jsdom`) for React/client adapters; **edge** posture covered by Next.js Edge middleware tests and keeping `src/core` free of Node-only APIs.
- Coverage report uploaded as artifact; thresholds enforced by Vitest config (build fails if unmet).
- Automated npm publish on `v*` tags using `NPM_TOKEN` secret and `npm publish --provenance`.
- ESLint with `@typescript-eslint/eslint-plugin` for TypeScript-aware linting.

**Alternatives considered**:
- **GitLab CI**: GitHub Actions is more standard for npm ecosystem projects.
- **Changesets**: Useful for monorepos; single-package workflow is simpler with manual version + tag.

---

### R-010: Package Entry Points — Tree-Shaking Strategy

**Decision**: Separate tsup entry points per adapter with `sideEffects: false` in `package.json`.

**Rationale**:
- Each adapter (`express.ts`, `react.ts`, etc.) is a distinct tsup entry point, producing a separate file in `dist/`.
- `package.json` `exports` field maps subpaths (`limiterx/express`, `limiterx/react`) to specific files.
- `sideEffects: false` tells bundlers (webpack, Rollup, esbuild) that unused exports can be safely eliminated.
- Importing `limiterx/express` includes only the Express adapter + core logic it imports; React code is excluded.
- Verified by checking bundle output with `size-limit` or manual inspection of bundled output.

**Alternatives considered**:
- **Single bundle with re-exports**: Larger bundles for consumers who only need one adapter.
- **Separate npm packages (e.g. `@scope/express`, etc.)**: Higher maintenance overhead; subpath exports achieve the same result.
