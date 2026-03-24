# Feature Specification: Flowguard Production Readiness

**Feature Branch**: `001-production-readiness`  
**Created**: 2026-03-23  
**Status**: Draft  
**Input**: User description: "Universal production-ready rate limiting library for JavaScript/TypeScript with multi-algorithm support, framework adapters, and TypeScript-first design"

## Clarifications

### Session 2026-03-23

- Q: Is `StorageAdapter` a public extension point in v1 or internal-only? → A: Internal only — only `MemoryStore` is supported; `StorageAdapter` is not part of the public API in v1.
- Q: What level of observability should v1 provide (none, debug, hooks, OpenTelemetry)? → A: Optional debug mode — opt-in `debug` flag with console diagnostic output; no first-class metrics or tracing API in v1.
- Q: Which HTTP header family should backend adapters emit (`RateLimit-*`, dual, configurable, or legacy `X-RateLimit-*` only)? → A: `RateLimit-*` only — no `X-RateLimit-*` headers in v1.
- Q: If `keyGenerator` fails (throws or unusable key), should the system fail-open, fail-closed to 429, propagate error (5xx), or be configurable? → A: Propagate error — backend adapters respond with **5xx** or delegate to the framework error handler; core surfaces the error; no fail-open or 429-for-key-failure in v1.
- Q: What default should apply for in-memory LRU maximum key count (`maxKeys` or equivalent)? → A: **Documented default: 10,000** keys unless the caller overrides.

### Session 2026-03-23 (b) — Requirements hardening

- **Window strings (FR-003)**: After trimming leading/trailing ASCII whitespace, duration strings MUST match `^(\d+)(ms|s|m|h|d)$/` (one integer + unit suffix). Plural or alternate spellings (e.g. `mins`, `hr`) are invalid. Numeric `window` MUST be a positive finite number of milliseconds; `0` or negative values are rejected at validation. Any parsed duration that yields **less than 1 ms** (including `0ms`) MUST be rejected at validation.
- **Fixed window (FR-002)**: All boundaries use `Date.now()` (UTC epoch milliseconds). Current window start is `Math.floor(now / windowMs) * windowMs`; no local timezone interpretation.
- **Rate limit headers (FR-009)**: `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` values are **integer decimal strings**. `RateLimit-Reset` is **seconds until the next window reset** (not an HTTP-date). `Retry-After` on denied responses is **integer seconds**. Normative detail: `contracts/backend-adapters.md`. v1.0 MUST NOT emit `X-RateLimit-*`.
- **Header safety (FR-017)**: Header values are derived from safe coercions (e.g. integers); user-controlled strings MUST NOT be written raw into header values.
- **Namespaces (FR-016)**: Internal persistence keys use the `flowguard:{userKey}` prefix so user key strings cannot collide with unrelated store entries.
- **Skip (FR-014)**: When `skip` returns true, the request does not increment count and `onLimit` does not fire for that request. Backend adapters still emit rate limit headers when `headers !== false` (reflecting quota without consuming for that call).
- **Debug (FR-018)**: Diagnostic output may include resolved keys and network-derived identifiers; v1.0 does **not** mandate PII redaction. README MUST warn to enable `debug` only in trusted environments.
- **Memory pressure (FR-007)**: LRU eviction bounds memory; per-key correctness holds for keys still resident after eviction.
- **SC-002**: Under single-process event-loop semantics, concurrent `check()` calls for the same key are serialized; implementations MUST NOT interleave in a way that violates allow/deny counts.
- **SC-006 / SC-007**: **Aspirational product metrics** — not enforced by CI; measured via npm/stakeholder reporting.
- **Node HTTP (FR-008)**: Parity with other backend adapters for headers, `keyGenerator`, `skip`, and `onLimit`; response sending remains developer-controlled (`contracts/backend-adapters.md`).
- **Frontend (User Story 3)**: Multi-tab or cross-context synchronization is **out of scope** for v1 unless the application shares a module-level limiter instance.
- **Backward clock jumps**: **Out of scope** for v1; behavior is undefined if wall time moves backward.
- **NFR-TS coverage**: Statement/branch/function thresholds apply to `src/**`; exclude declaration-only `*.d.ts` and generated `dist/**` from coverage where configured.
- **NFR-UX / a11y**: Default user-visible strings are English; **no WCAG or i18n baseline** for v1.0 — applications may wrap or localize messages.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Core Rate Limiting with Fixed Window (Priority: P1)

A developer installs flowguard and creates a rate limiter using the unified configuration shape. They specify the maximum number of requests and a human-readable time window (e.g., "15m", "30s"), and the limiter accurately tracks and enforces those thresholds using the fixed window algorithm. When a request is allowed, the developer receives a result containing remaining quota, reset timing, and the resolved key. When the limit is exceeded, the developer receives a denial result and an optional callback fires.

**Why this priority**: The core algorithm engine is the foundation that every adapter and integration depends on. Without a correct, tested fixed window implementation and a unified config shape, nothing else in the library functions.

**Independent Test**: Can be fully tested by creating a rate limiter instance in isolation (no framework), calling `check()` repeatedly, and verifying allow/deny decisions, remaining counts, reset timing, and onLimit callback invocations.

**Acceptance Scenarios**:

1. **Given** a rate limiter configured with max=5 and window="1m", **When** 5 requests are made within the same 1-minute window, **Then** all 5 return `allowed: true` with decreasing `remaining` counts (4, 3, 2, 1, 0).
2. **Given** a rate limiter configured with max=5 and window="1m" that has already processed 5 requests in the current window, **When** a 6th request arrives, **Then** it returns `allowed: false`, `remaining: 0`, a positive `retryAfter` value, and a `resetAt` timestamp marking the next window boundary.
3. **Given** a rate limiter configured with max=5 and window="1m" that was fully exhausted, **When** the 1-minute window elapses and a new request arrives, **Then** the counter resets and the request returns `allowed: true` with `remaining: 4`.
4. **Given** a rate limiter configured with an `onLimit` callback, **When** a request exceeds the limit, **Then** the `onLimit` callback fires with a result object containing `allowed`, `remaining`, `limit`, `retryAfter`, `resetAt`, and `key`.
5. **Given** a rate limiter with a `skip` function that returns `true` for certain requests, **When** a skipped request arrives, **Then** the limiter does not count it and returns `allowed: true` regardless of current quota.

---

### User Story 2 - Backend Framework Middleware (Priority: P2)

A backend developer protects their API endpoints by applying flowguard as middleware in their chosen framework (Express, raw Node.js HTTP, Next.js API routes, Next.js Edge Middleware, or Koa). The middleware automatically identifies the requester (by IP or custom key), enforces the rate limit, responds with standard HTTP rate limit headers on every request, and returns a 429 status with a configurable message when the limit is exceeded — all using the same unified config shape.

**Why this priority**: Backend API protection is the primary real-world use case for rate limiting. Framework adapters turn the core engine into immediately deployable middleware, delivering value to the largest segment of the target audience.

**Independent Test**: Can be tested by starting a server with the appropriate adapter, sending HTTP requests via an HTTP client, and verifying response status codes, rate limit headers, and 429 behavior when limits are exceeded.

**Acceptance Scenarios**:

1. **Given** an Express app with flowguard middleware configured with max=10 and window="1m", **When** an HTTP request is made, **Then** the response includes `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers with correct values.
2. **Given** an Express app with flowguard middleware that has exhausted its quota for a given IP, **When** the next request arrives from that IP, **Then** the server responds with HTTP 429, a `Retry-After` header (in seconds), and the configured error message body.
3. **Given** a Next.js API route protected by flowguard, **When** requests arrive within the limit, **Then** the route handler executes normally and rate limit headers are present.
4. **Given** a Next.js Edge Middleware powered by flowguard, **When** a request exceeds the limit, **Then** the middleware returns a 429 response before the request reaches the origin.
5. **Given** any backend adapter with a custom `keyGenerator`, **When** requests arrive, **Then** the limiter identifies requesters by the custom key (e.g., user ID, API key) rather than IP address.
6. **Given** any backend adapter response, **When** rate limit headers are present, **Then** the response includes only `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (and `Retry-After` when denied) — not legacy `X-RateLimit-*` headers.
7. **Given** a backend adapter whose `keyGenerator` throws during a request, **When** the middleware runs, **Then** the error propagates to a **5xx** response or the framework’s error handler, and the response is **not** a 429 from rate limiting.

---

### User Story 3 - Frontend Client-Side Rate Limiting (Priority: P3)

A frontend developer limits the rate of user-triggered actions (form submissions, button clicks, API calls) using flowguard's React hook, fetch wrapper, or Axios interceptor. The developer sees real-time state — whether the action is allowed, how many attempts remain, and when the window resets — enabling them to build responsive UI feedback without backend round-trips.

**Why this priority**: Frontend rate limiting is a key differentiator from all competing libraries. It enables a new category of use cases (client-side protection, UX-driven throttling) and fulfills the "universal" promise of the library.

**Independent Test**: Can be tested by rendering a React component using the hook, simulating user actions, and verifying that the UI state (`allowed`, `remaining`, `retryAfter`) updates correctly and that excess actions are blocked client-side.

**Acceptance Scenarios**:

1. **Given** a React component using `useRateLimit` configured with max=5 and window="1m", **When** the component renders, **Then** it exposes `allowed: true` and `remaining: 5`.
2. **Given** the same component after 5 calls to `attempt()`, **When** the user tries a 6th action, **Then** `allowed` is `false`, `remaining` is `0`, and `retryAfter` is a positive number of milliseconds.
3. **Given** a `rateLimitFetch` wrapper configured with max=10 and window="1m", **When** the 11th fetch call is attempted, **Then** the wrapper blocks the request and invokes the `onLimit` callback instead of making a network request.
4. **Given** a `rateLimitAxios` interceptor configured with a limit, **When** the limit is exceeded, **Then** the interceptor rejects the request before it reaches the network and invokes the `onLimit` callback.
5. **Given** a React component using `useRateLimit` with `reset()` called, **When** the limiter state is reset, **Then** the hook returns to its initial state with full quota available.
6. **Given** a frontend adapter whose `keyGenerator` throws when resolving a key, **When** the guarded action runs, **Then** the error propagates to the caller (e.g. thrown from `attempt` or a rejected promise) and no silent allow/deny occurs.

---

### User Story 4 - Developer Ergonomics & Configuration Safety (Priority: P4)

A developer gets immediate, actionable feedback when they misconfigure flowguard. Configuration validation happens at setup time (not at request time), error messages name the offending field and show expected vs. actual values, and TypeScript autocompletion guides them through every option. The library is tree-shakeable so only imported adapters are included in the bundle.

**Why this priority**: Developer experience directly impacts adoption and retention. Clear error messages reduce support burden, and tree-shaking keeps bundles small — both essential for a production-quality library.

**Independent Test**: Can be tested by providing invalid configurations and verifying that clear, specific error messages are thrown at creation time, and by importing a single adapter and measuring bundle output to confirm unused adapters are excluded.

**Acceptance Scenarios**:

1. **Given** a developer passes `max: -5` to `createRateLimiter`, **When** the limiter is created, **Then** a descriptive error is thrown immediately naming the `max` field and stating it must be a positive integer.
2. **Given** a developer passes `window: '2x'` (invalid duration), **When** the limiter is created, **Then** a descriptive error is thrown naming the `window` field and stating the string is not a valid duration format.
3. **Given** a developer imports only `flowguard/express`, **When** the application is bundled, **Then** no React hook code, Koa middleware, or other adapter code is included in the output.
4. **Given** a developer uses an IDE with TypeScript support, **When** they type a config object for `createRateLimiter`, **Then** all available options are suggested with correct types and JSDoc descriptions.
5. **Given** a limiter created with `debug: true`, **When** rate limit checks run, **Then** diagnostic lines are written to the console (e.g. key, allow/deny, remaining quota) and no debug output occurs when `debug` is `false` or omitted.

---

### User Story 5 - Production Publishing & CI Quality Gate (Priority: P5)

The library is published to npm under the `flowguard` package name with dual ESM/CJS module format, a comprehensive README, changelog, and a GitHub Actions CI pipeline that gates every release on linting, testing, type checking, and coverage thresholds. The published package works identically when installed via `npm i flowguard` in Node.js 18+, Bun, and browser bundlers.

**Why this priority**: Publishing and CI are the final gate before the library reaches users. Without reliable packaging and automated quality checks, all prior work cannot be delivered or maintained.

**Independent Test**: Can be tested by running the CI pipeline end-to-end, installing the published package in a fresh project, and importing each adapter entry point to verify correct module resolution and runtime behavior.

**Acceptance Scenarios**:

1. **Given** a push to the main branch, **When** the CI pipeline runs, **Then** it executes linting, type checking, all tests, and fails the build if any step fails or coverage drops below the threshold.
2. **Given** a git tag matching `v`* is pushed, **When** CI completes successfully, **Then** the package is published to npm automatically.
3. **Given** a user runs `npm i flowguard` in a new project, **When** they import from `flowguard`, `flowguard/express`, or `flowguard/react`, **Then** each import resolves correctly in both ESM and CJS environments.

---

### Edge Cases

- What happens when a key is an empty string? The system falls back to a default key (`'global'`).
- What happens when `max` is set to 0 or a negative number? The system throws a clear validation error at configuration time.
- What happens when `window` is set to an unrecognized string format? The system throws a clear validation error naming the invalid string.
- What happens when 100+ requests arrive simultaneously for the same key? The system handles concurrency correctly within a single process (the event loop serializes operations), and every request gets an accurate allow/deny decision.
- What happens when the in-memory store reaches its maximum key capacity? The system evicts the oldest keys (LRU policy) to make room, preventing unbounded memory growth. Default maximum distinct keys is **10,000** unless `maxKeys` (or equivalent) is set in configuration.
- What happens when the `onLimit` callback throws an error? The middleware still responds with the appropriate 429 response; the callback error does not crash the server.
- What happens when the system clock jumps forward (e.g., NTP correction)? The fixed window algorithm aligns to wall-clock boundaries, so a clock jump may cause an early window reset — this is documented behavior and acceptable for single-process deployments.
- What happens when the system clock jumps backward? **Undefined behavior** in v1.0; not a supported scenario (see Session 2026-03-23 (b)).
- What happens when `window` parses to zero milliseconds (e.g. invalid `0ms` or equivalent)? Validation rejects at configuration time — windows must be strictly positive.
- What happens when `skip` returns true? The request is not counted toward the limit, `onLimit` does not fire for that request, and backend adapters still emit rate limit headers when enabled (see Session 2026-03-23 (b)).
- What happens when `debug` is enabled? The library emits console diagnostic output for troubleshooting; default is off so production paths stay quiet unless explicitly enabled.
- What happens when `keyGenerator` throws or when its return value cannot be coerced to a string without error? The error propagates: backend adapters yield **5xx** (or framework error handling); core `check()` throws; frontend adapters surface the error to the caller. The request MUST NOT be treated as allowed, denied (429), or skipped solely due to this failure. Empty string still falls back to `'global'` as above.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `createRateLimiter` factory function that accepts a unified configuration object and returns a limiter instance usable across all environments.
- **FR-002**: System MUST implement the Fixed Window algorithm that resets request counters at wall-clock-aligned time boundaries.
- **FR-003**: System MUST parse human-readable window duration strings (`'500ms'`, `'30s'`, `'5m'`, `'1h'`, `'1d'`) into millisecond values, and accept raw numbers as milliseconds.
- **FR-004**: System MUST validate all configuration fields at limiter creation time and throw descriptive errors that name the invalid field and show expected vs. received values.
- **FR-005**: System MUST return a `RateLimiterResult` on every check containing: `allowed`, `remaining`, `limit`, `retryAfter`, `resetAt`, and `key`.
- **FR-006**: System MUST provide a default in-memory storage mechanism that requires zero external dependencies.
- **FR-007**: In-memory storage MUST automatically clean up expired keys periodically and enforce a maximum distinct-key count using LRU eviction. Unified configuration MUST expose `maxKeys` (or equivalent); if omitted, the default MUST be **10,000** keys. The default MUST be documented in README and JSDoc.
- **FR-008**: System MUST provide backend middleware adapters for Express, raw Node.js HTTP, Next.js (API routes and Edge Middleware), and Koa.
- **FR-009**: Backend adapters MUST set HTTP rate limit headers using only the names `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` on every response, and `Retry-After` on denied responses. Semantics for `RateLimit-Reset` and `Retry-After` (integer **seconds**) MUST match `contracts/backend-adapters.md`. v1.0 MUST NOT emit `X-RateLimit-*` or other duplicate legacy header families.
- **FR-010**: Backend adapters MUST respond with a configurable HTTP status code (default 429) and message body when a request is denied.
- **FR-011**: System MUST provide frontend adapters: a React hook (`useRateLimit`), a fetch wrapper (`rateLimitFetch`), and an Axios interceptor (`rateLimitAxios`).
- **FR-012**: The React hook MUST expose reactive state: `allowed`, `remaining`, `retryAfter`, `resetAt`, an `attempt` function, and a `reset` function.
- **FR-013**: System MUST support a `keyGenerator` function for identifying requesters by custom logic (user ID, API key, etc.) with sensible defaults (IP on backend, `'global'` on frontend). If `keyGenerator` throws or yields an unusable key, behavior MUST follow **FR-019**.
- **FR-014**: System MUST support a `skip` function that bypasses rate limiting for matching requests without counting them.
- **FR-015**: System MUST fire an `onLimit` callback (if provided) whenever a request is denied, passing the full result and request context.
- **FR-016**: System MUST namespace all internal storage keys in the in-memory store to prevent collisions between limiter instances and unrelated keys (no user-pluggable storage in v1.0).
- **FR-017**: System MUST coerce all values written to HTTP headers to safe types, preventing header injection.
- **FR-018**: Unified configuration MUST support an optional `debug` boolean (default `false`). When `true`, the core limiter and all adapters MUST emit diagnostic messages to the console (e.g. resolved key, allow/deny, remaining quota) for local troubleshooting. When `false`, no debug output MUST be emitted. v1.0 MUST NOT add separate metrics APIs, OpenTelemetry integration, or generic `onDecision`-style hooks.
- **FR-019**: If `keyGenerator` throws, or if coercing its return value to a string throws, the error MUST propagate. The core `check()` path MUST throw (or equivalent) rather than returning a normal `RateLimiterResult`. Backend adapters MUST respond with HTTP **5xx** (default **500**) or delegate to the framework’s error mechanism; they MUST NOT return **429** for this failure class or treat the request as allowed. Frontend adapters MUST surface the error to the caller (e.g. throw from `attempt`, rejected promise from fetch/axios) without applying rate limit allow/deny for that invocation. If the resolved key is an empty string, the existing fallback to `'global'` applies (**Edge Cases**); that path is not an **FR-019** error. v1.0 MUST NOT offer configurable fail-open or fail-closed-to-429 strategies for `keyGenerator` failures.

### Key Entities

- **FlowGuardConfig**: The unified configuration object specifying rate limit rules — includes max requests, window duration, algorithm selection, key generation strategy, behavioral callbacks, optional `maxKeys` for MemoryStore LRU capacity (default **10,000**), and optional `debug` for opt-in console diagnostics.
- **RateLimiterResult**: The outcome of a rate limit check — communicates whether the request is allowed, how much quota remains, and when the window resets.
- **StorageAdapter**: Internal implementation abstraction for persisting rate limit state (not exported in v1.0); consumers cannot supply custom implementations until a future release introduces additional built-in stores (e.g. Redis in v1.1).
- **MemoryStore**: The only supported storage implementation in v1.0 — holds state in-process with automatic expiration cleanup and LRU eviction for memory safety; default LRU capacity **10,000** distinct keys unless configured.
- **RequestContext**: A framework-agnostic representation of an incoming request, extended by each adapter with framework-specific fields.

### Non-Functional Requirements

- **NFR-CQ**: All source code MUST pass linting and TypeScript strict mode (`"strict": true`) with zero implicit `any` types. Every exported function and interface MUST have JSDoc documentation with `@example` blocks.
- **NFR-TS**: Unit tests MUST cover all core algorithm logic, config validation, window parsing, and storage operations. Integration tests MUST cover each backend adapter end-to-end, including a `keyGenerator` that throws (expect **5xx** or framework error delegation, not **429**). React hook MUST have rendering tests. Overall statement coverage MUST be ≥ 90%, branch coverage ≥ 85%, function coverage ≥ 95%. Coverage metrics MUST exclude generated artifacts and declaration-only files as described in Session 2026-03-23 (b).
- **NFR-UX**: All adapters MUST share the same configuration shape. Error messages, callback signatures, and result types MUST be consistent across all adapters. Documentation MUST cover each adapter with runnable examples.
- **NFR-PF**: Core rate limit check latency MUST be under 1ms for in-memory storage. Bundle size limits apply to named entry points: the **`flowguard`** core entry MUST be ≤ 5KB minified+gzipped; **`flowguard/react`** MUST be ≤ 3KB minified+gzipped (peer `react` externalized). The library MUST declare `"sideEffects": false` and support tree-shaking so unused adapters are excluded from bundles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no prior flowguard experience can install the package and have a working rate-limited endpoint in under 5 minutes using the README quick-start guide — **assuming** Node.js 18+, network access to the npm registry, and no extraordinary proxy or offline constraints beyond a typical developer workstation.
- **SC-002**: The rate limiter accurately enforces configured thresholds — zero false allows (requests above the limit that are permitted) and zero false denies (requests within the limit that are blocked) under normal single-process operation.
- **SC-003**: The library operates correctly in target environments — **Node.js** 18/20/22 (CI matrix), **browser** (Vitest jsdom or equivalent for client-facing adapters), **Bun** (CI job running the test suite under Bun), and **edge/serverless** (Next.js Edge middleware integration tests and portable core APIs without Node-only globals) — with automated verification for each in the release pipeline.
- **SC-004**: All automated quality checks (lint, type check, tests, coverage thresholds) pass on every commit to the main branch with zero manual intervention.
- **SC-005**: The published npm package installs and imports cleanly in a fresh project with no peer dependency warnings or resolution errors.
- **SC-006**: *(Aspirational / product metric.)* The library achieves ≥ 100 weekly npm downloads within one month of publishing, indicating community interest and adoption — not a CI gate.
- **SC-007**: *(Aspirational / product metric.)* 90% of developers who attempt the quick-start guide complete it successfully on their first try, as measured by example project completion rates and GitHub issue reports — not a CI gate.

## Assumptions

- Node.js 18+ is the minimum supported runtime; older versions are not targeted.
- The fixed window algorithm is sufficient for v1.0; sliding window, token bucket, and leaky bucket are deferred to v1.1.
- Redis-backed distributed storage is out of scope for v1.0; the in-memory store is the only storage implementation. `StorageAdapter` is an internal abstraction only — custom user-defined storage backends are not supported in v1.0.
- The library targets single-process deployments for v1.0; multi-instance coordination requires Redis (v1.1).
- `Date.now()` is the time source for all timestamp operations, ensuring edge runtime compatibility.
- Express `trust proxy` is the responsibility of the application developer to configure; flowguard documents this requirement but does not enforce it.
- Backend adapters use the `RateLimit-*` header names only (aligned with the IETF RateLimit header work); legacy `X-RateLimit-*` headers are not emitted in v1.0.
- The library ships as dual ESM/CJS using the `exports` field in `package.json`.
- Vitest is the test runner; supertest is used for HTTP integration tests; @testing-library/react is used for React hook tests.
- Observability in v1.0 is limited to optional `debug` console output. OpenTelemetry, structured logging APIs, and first-class allow/deny metrics callbacks are out of scope for v1.0.
- `keyGenerator` failures propagate as errors (see **FR-019**); fail-open behavior and mapping key resolution errors to **429** are not supported in v1.0.
- MemoryStore LRU uses a default `maxKeys` of **10,000**; callers may override for larger or tighter memory bounds.
- **Peer dependencies** (adapters): `react` ≥ 18, `express` ≥ 4, `koa` ≥ 2, `next` ≥ 13, `axios` ≥ 1 — exact semver ranges are defined in the published `package.json` `peerDependencies` (see `tasks.md` / release checklist).

## Scope Boundaries

**In scope (v1.0):**

- Fixed Window algorithm
- MemoryStore with LRU eviction (default **10,000** keys) and TTL cleanup
- Express, Node HTTP, Next.js (API + Edge), and Koa backend adapters
- React hook, fetch wrapper, and Axios interceptor frontend adapters
- Unified config shape, config validation, window string parsing
- Optional `debug` flag (console diagnostics when enabled)
- `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` (no `X-RateLimit-*` in v1.0)
- TypeScript strict types with JSDoc
- CI/CD pipeline with automated npm publishing
- Comprehensive README and changelog

**Out of scope (v1.0):**

- Sliding window, token bucket, and leaky bucket algorithms (v1.1)
- Redis storage adapter (v1.1)
- Public API for custom `StorageAdapter` implementations (deferred until additional built-in stores ship; v1.1+)
- Distributed rate limiting across multiple server instances
- Rate limiting by geographic region or IP geolocation
- GraphQL-specific directives
- Paid tier / quota management features
- Browser extension or CLI tooling
- OpenTelemetry integration, generic `onDecision`/metrics hooks, or other first-class observability APIs beyond `debug` console output
- Legacy `X-RateLimit-*` header emission or dual-header modes (deferred if needed based on ecosystem feedback)
- Configurable strategies for `keyGenerator` failures (fail-open, map to 429, etc.)

