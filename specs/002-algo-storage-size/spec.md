# Feature Specification: Algorithm Extensibility, Storage Adapters, and Package Size Reduction

**Feature Branch**: `002-algo-storage-size`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Add pluggable algorithm support (sliding window, token bucket), pluggable storage adapters (Redis), and reduce published package unpacked size"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sliding Window Rate Limiting (Priority: P1)

A developer integrating limiterx wants smoother, more accurate rate limiting that avoids the burst spike problem inherent in fixed windows. At a fixed-window boundary, a client can fire `max` requests at the end of one window and another `max` requests at the start of the next — effectively doubling throughput for one short interval. The developer wants to select a sliding window algorithm to eliminate this boundary burst and get a more consistent throughput guarantee.

**Why this priority**: The fixed-window burst problem is the most common complaint about v1.0 and directly affects abuse protection. Sliding window is the natural first algorithm extension.

**Independent Test**: A developer can configure `algorithm: 'sliding-window'` and verify that a client cannot exceed `max` requests in any rolling interval, even when straddling window boundaries.

**Acceptance Scenarios**:

1. **Given** a limiter configured with `algorithm: 'sliding-window'` and `max: 10, window: '1m'`, **When** a client sends 10 requests at the last second of minute 1 and 10 at the first second of minute 2, **Then** requests beyond the 10-request rolling-window limit are denied with `allowed: false`.
2. **Given** a limiter configured with `algorithm: 'sliding-window'`, **When** a client sends requests evenly spaced across the window, **Then** all requests up to `max` are allowed and the `remaining` count correctly reflects the rolling count.
3. **Given** an invalid `algorithm` value, **When** a developer calls `createRateLimiter`, **Then** a descriptive error is thrown immediately at construction time.
4. **Given** an existing integration using the default `algorithm: 'fixed-window'`, **When** no algorithm field is specified, **Then** behavior is unchanged from v1.0.

---

### User Story 2 — Token Bucket Rate Limiting (Priority: P2)

A developer wants to allow short legitimate bursts (e.g., a user opening a page that fires several API calls) while still enforcing an overall sustained throughput cap. The token bucket algorithm refills tokens at a steady rate and allows up to `max` tokens to accumulate, enabling controlled bursting that fixed window does not support.

**Why this priority**: Token bucket enables a class of real-world use cases (mobile clients, batch actions, bursty APIs) that sliding window also does not address well. It is the second most-requested algorithm pattern.

**Independent Test**: A developer can configure `algorithm: 'token-bucket'` and verify that a burst of requests up to `max` is allowed immediately, but sustained throughput beyond the refill rate is denied.

**Acceptance Scenarios**:

1. **Given** a limiter configured with `algorithm: 'token-bucket'`, `max: 10`, and `window: '1m'`, **When** a client sends 10 requests in rapid succession from a full bucket, **Then** all 10 are allowed.
2. **Given** the same limiter after the bucket is exhausted, **When** the client sends one more request before enough tokens have refilled, **Then** the request is denied with `allowed: false` and `retryAfter` reflects when the next token is available.
3. **Given** a bucket that was exhausted and sufficient time has elapsed for partial refill, **When** the client sends requests equal to the refilled count, **Then** exactly that many are allowed.

---

### User Story 3 — Redis Storage Adapter (Priority: P3)

A developer running limiterx across multiple server processes finds that the in-memory store is per-process — a client can bypass limits by hitting different instances. The developer wants to plug in a Redis-backed storage adapter so all instances share a single rate-limit state.

**Why this priority**: Multi-process deployments are the primary environment where limiterx v1.0 falls short operationally. Redis is the industry-standard shared store for rate limiting.

**Independent Test**: A developer can import a Redis adapter, pass it to `createRateLimiter`, and verify that counters are shared across two separate limiter instances pointing at the same Redis key space.

**Acceptance Scenarios**:

1. **Given** two limiter instances both using the same Redis adapter and configured with `max: 5`, **When** instance A processes 3 requests and instance B processes 3 requests for the same key, **Then** the 6th request (across both instances) is denied.
2. **Given** a Redis adapter configured with a TTL, **When** the TTL expires, **Then** the key is evicted and the counter resets.
3. **Given** a Redis connection failure, **When** a rate limit check is attempted, **Then** the error propagates cleanly — no silent pass-through that would disable limiting.
4. **Given** a developer who does not install or configure Redis, **When** they use the default `MemoryStore`, **Then** no Redis dependency is loaded, bundled, or required.

---

### User Story 4 — Reduced Published Package Size (Priority: P4)

A developer adding limiterx to a frontend bundle or serverless function is concerned about the 621 kB unpacked size. They want the package to have a significantly smaller footprint so it does not meaningfully impact cold start times or bundle sizes.

**Why this priority**: Size matters for edge/serverless deployments and frontend adapters (fetch, axios, react). It is a distribution quality concern that should ship alongside the algorithm/storage work.

**Independent Test**: Running a publish dry-run and inspecting the resulting tarball, the unpacked size is below 300 kB. Importing only `limiterx/express` in a bundled application does not pull in Redis or React code.

**Acceptance Scenarios**:

1. **Given** a production build that imports only `limiterx/express`, **When** the bundle is analyzed, **Then** no Redis adapter code or React code is present in the output.
2. **Given** the published package tarball, **When** its unpacked size is measured, **Then** it is below 300 kB.
3. **Given** an existing consumer of `limiterx` v1.0, **When** they upgrade, **Then** no import paths or public API signatures change as a result of the size reduction work alone.

---

### Edge Cases

- What happens when `algorithm: 'sliding-window'` is used with a very short window (e.g., `100ms`)? Precision must not cause off-by-one errors at sub-second granularity.
- What happens when the Redis adapter is given a key with special characters or very long strings?
- What happens when `max: 1` is used with token bucket — does a single token refill correctly signal `retryAfter`?
- What happens if a custom `StorageAdapter` implementation is slow or throws? The public API contract must remain stable.
- What happens when the Redis adapter is used with the sliding window or token bucket algorithms?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support selecting a rate limiting algorithm via the `algorithm` field in `LimiterxConfig`, accepting `'fixed-window'`, `'sliding-window'`, and `'token-bucket'`.
- **FR-002**: The sliding window algorithm MUST enforce that no more than `max` requests are permitted within any rolling interval of duration `window`, not just aligned calendar windows.
- **FR-003**: The token bucket algorithm MUST allow bursts up to `max` tokens and MUST refill at a steady rate derived from `max` over `window`.
- **FR-004**: The system MUST expose a public `StorageAdapter` interface that both first-party and third-party implementations can satisfy to back any algorithm.
- **FR-005**: A first-party Redis storage adapter MUST be available as a separate, optionally-installed entry point so consumers can use it without including it in builds where it is not needed.
- **FR-006**: The Redis adapter MUST NOT be bundled or imported when a consumer does not use it; it MUST be fully isolated from the core package.
- **FR-007**: All existing framework adapters (express, koa, next, node, fetch, axios, react) MUST function correctly regardless of which algorithm or storage adapter is selected.
- **FR-008**: The `retryAfter` and `resetAt` values in `RateLimiterResult` MUST be accurate for all three algorithm types.
- **FR-009**: The published package unpacked size MUST be reduced to below 300 kB.
- **FR-010**: No existing public API or import path from v1.0 MAY be broken; the release MUST be a backwards-compatible minor version.
- **FR-011**: All new configuration fields MUST be validated at construction time with descriptive error messages consistent with the existing validation format.

### Key Entities

- **Algorithm**: A rate limiting strategy implementation. Receives storage, `max`, and `windowMs`. Returns a `RateLimiterResult` per check. Identified by a string key in config.
- **StorageAdapter**: The interface contract between algorithms and backing stores. Implementations include `MemoryStore` (existing) and `RedisStore` (new).
- **RedisStore**: A `StorageAdapter` implementation backed by Redis, distributed as a separate optional entry point.

### Non-Functional Requirements *(constitution alignment)*

- **NFR-CQ**: New algorithm implementations MUST follow the pattern of `FixedWindowLimiter` in `src/core/algorithms/`. The `StorageAdapter` interface is the only contract between algorithms and storage — no algorithm may access store internals directly. No `any` casts without documented justification.
- **NFR-TS**: Unit tests required for each new algorithm. Contract tests required to verify the `StorageAdapter` interface. Integration tests required for the Redis adapter against a real Redis instance. Existing coverage thresholds (90% statements, 85% branches, 95% functions) MUST not regress.
- **NFR-UX**: The `algorithm` config field MUST behave identically across all framework adapters. Error messages for invalid algorithm values MUST match the existing `[limiterx] Invalid config:` pattern. TypeScript types and docs MUST reflect all new options at release.
- **NFR-PF**: Sliding window and token bucket MUST add no more than 0.1ms p95 latency overhead versus fixed window in the existing perf test. The Redis adapter is exempt from in-process latency budgets. Published package MUST be below 300 kB unpacked.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can switch between `'fixed-window'`, `'sliding-window'`, and `'token-bucket'` by changing one config field, with no other code changes required.
- **SC-002**: A developer running two separate processes sharing a Redis instance observes consistent, shared rate limit state — a client cannot bypass limits by hitting different processes.
- **SC-003**: The published package unpacked size drops from 621 kB to below 300 kB.
- **SC-004**: All existing v1.0 tests pass without modification after this feature ships.
- **SC-005**: A developer importing only `limiterx/express` in a bundled application sees zero Redis or token-bucket algorithm code in the final output.
- **SC-006**: The `retryAfter` value for a denied sliding-window or token-bucket request is accurate within 10ms of the true next-allowed time.
