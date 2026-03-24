---
description: "Task list template for feature implementation"
---

# Tasks: Limiterx Production Readiness

**Input**: Design documents from `/specs/001-production-readiness/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Align test tasks with `.specify/memory/constitution.md` and `spec.md` NFRs (unit / contract / integration). Automated tests are in scope unless a story explicitly excludes them.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **This feature**: Single library layout at repository root — `src/`, `tests/` per `plan.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, build, lint, and test harness

- [x] T001 Create directory layout per `plan.md`: `src/core/algorithms/`, `src/core/storage/`, `src/adapters/`, `tests/unit/`, `tests/integration/`, `tests/contract/`, `examples/`, `.github/workflows/`
- [x] T002 Create `package.json` at repository root with `name: "limiterx"`, `"sideEffects": false`, `exports` placeholders for `limiterx` and subpaths (`./express`, `./node`, `./next`, `./koa`, `./react`, `./fetch`, `./axios`), and scripts: `build`, `test`, `lint`, `typecheck`, `coverage`
- [x] T003 Add `tsconfig.json` (strict, ES2022, `moduleResolution` suitable for Node 18+) and `tsup.config.ts` with multi-entry `index` plus adapter entries per `research.md` R-001
- [x] T004 [P] Add `vitest.config.ts` with `@vitest/coverage-v8`, thresholds `statements: 90`, `branches: 85`, `functions: 95`, and `include: ['src/**']` per `research.md` R-002
- [x] T005 [P] Add ESLint config (e.g. `eslint.config.js` or `.eslintrc.cjs`) with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` targeting `src/**/*.ts`
- [x] T006 [P] Add `.gitignore` for `node_modules/`, `dist/`, `coverage/`, and common editor artifacts
- [x] T007 Add `peerDependencies` (`react`, `express`, `koa`, `next`, `axios`) and `devDependencies` (`typescript`, `tsup`, `vitest`, `@vitest/coverage-v8`, `supertest`, `@testing-library/react`, `jsdom`, `@types/*` as needed) per `plan.md` Technical Context
- [x] T008 Wire npm scripts so `npm run typecheck` runs `tsc --noEmit`, `npm run build` runs `tsup`, and `npm test` runs `vitest run` with coverage

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and entry barrel so user-story work shares one contract

**⚠️ CRITICAL**: Core types must exist before implementing algorithms or adapters

- [x] T009 Define `LimiterxConfig`, `RateLimiterResult`, `StorageAdapter` (internal-only — implement in `src/core/types.ts` but **do not** export from `src/index.ts`), `FixedWindowState`, `RateLimiter`, and `RequestContext` in `src/core/types.ts` with JSDoc; document default `maxKeys` **10,000** for in-memory storage per `spec.md` FR-007 (aligned with `data-model.md` — no public `store` on config in v1.0)
- [x] T010 Add `src/index.ts` that re-exports types from `src/core/types.ts` and will host `createRateLimiter` once implemented in Phase 3

**Checkpoint**: Foundation ready — User Story phases can proceed (US2–US5 still depend on US1 core implementation)

---

## Phase 3: User Story 1 — Core Rate Limiting with Fixed Window (Priority: P1) 🎯 MVP

**Goal**: `createRateLimiter`, fixed-window algorithm, `MemoryStore`, `parseWindow`, config validation, and contract-tested public API

**Independent Test**: Instantiate a limiter without any framework, call `check()` with fake timers, verify allow/deny, `remaining`, `retryAfter`, `resetAt`, `onLimit`, and `skip` behavior per `spec.md` User Story 1

### Tests for User Story 1

- [x] T011 [P] [US1] Add unit tests for duration parsing in `tests/unit/parseWindow.test.ts` (valid strings, numeric ms, invalid input)
- [x] T012 [P] [US1] Add unit tests for config validation in `tests/unit/validateConfig.test.ts` covering V-001–V-012 in `data-model.md`
- [x] T013 [P] [US1] Add unit tests for LRU eviction, TTL cleanup, `destroy()`, and async interface in `tests/unit/MemoryStore.test.ts` (default `maxKeys` 10,000 per `spec.md`)
- [x] T014 [P] [US1] Add unit tests for wall-clock window alignment and allow/deny transitions in `tests/unit/FixedWindowLimiter.test.ts` using `vi.useFakeTimers()` per `research.md` R-003
- [x] T015 [US1] Add contract tests in `tests/contract/createRateLimiter.test.ts` for namespaced keys (`limiterx:{key}`), `onLimit` invocation, `onLimit` error swallowing, empty-key fallback to `'global'`, and `skip` bypass per `contracts/core-api.md`

### Implementation for User Story 1

- [x] T016 [P] [US1] Implement `parseWindow()` in `src/core/parseWindow.ts` per `contracts/core-api.md` and `research.md` R-008
- [x] T017 [US1] Implement `validateConfig()` in `src/core/validateConfig.ts` with `[limiterx] Invalid config: '{field}'...` messages per `data-model.md` Validation Rules and `spec.md` FR-004
- [x] T018 [US1] Implement `MemoryStore` in `src/core/storage/MemoryStore.ts` per `contracts/core-api.md` (LRU via `Map` order, periodic cleanup, `unref` on Node, `destroy()` stops timers)
- [x] T019 [US1] Implement `FixedWindowLimiter` in `src/core/algorithms/FixedWindowLimiter.ts` integrating `StorageAdapter.increment` / state semantics per `research.md` R-003 and `data-model.md`
- [x] T020 [US1] Implement `createRateLimiter()` and `RateLimiter` methods (`check`, `reset`, `clear`) in `src/core/createRateLimiter.ts`, re-exported from `src/index.ts` per `contracts/core-api.md`
- [x] T021 [US1] Export `parseWindow`, `MemoryStore`, `createRateLimiter`, and public types from `src/index.ts` per `contracts/core-api.md` (omit `StorageAdapter` from public exports); ensure `check()` applies storage key namespace and returns `RateLimiterResult` fields per FR-005

**Checkpoint**: Core package works in isolation; contract tests green

---

## Phase 4: User Story 2 — Backend Framework Middleware (Priority: P2)

**Goal**: Express, Node HTTP, Next.js (API + Edge), and Koa adapters with `RateLimit-*` headers, 429 + `Retry-After` on deny, and FR-019 error propagation for `keyGenerator` failures

**Independent Test**: Spin up minimal servers or middleware fixtures, use HTTP client (`supertest` / native) to assert headers, status codes, and 5xx on key resolution errors — not 429 for key failures

### Tests for User Story 2

- [x] T022 [P] [US2] Add `tests/integration/express.test.ts` — headers on success, 429 + body + `Retry-After` on deny, custom `keyGenerator`, `keyGenerator` throw yields 5xx or framework error path (not 429) per `spec.md` User Story 2
- [x] T023 [P] [US2] Add `tests/integration/node.test.ts` for `rateLimitNode` header behavior and developer-controlled 429 response per `contracts/backend-adapters.md`
- [x] T024 [P] [US2] Add `tests/integration/next.test.ts` covering Next API `check()` behavior and Edge middleware 429 before origin per `contracts/backend-adapters.md`
- [x] T025 [P] [US2] Add `tests/integration/koa.test.ts` for middleware chain, headers, and deny path per `contracts/backend-adapters.md`
- [x] T026 [US2] Add shared integration cases or `tests/integration/backend-headers.test.ts` asserting only `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (and `Retry-After` when denied) — no `X-RateLimit-*` per `spec.md` FR-009

### Implementation for User Story 2

- [x] T027 [P] [US2] Add shared HTTP helper module `src/adapters/internal/rate-limit-headers.ts` to coerce header integers safely (`Math.ceil`) per `contracts/backend-adapters.md` Common Behavior
- [x] T028 [P] [US2] Implement `rateLimitExpress` in `src/adapters/express.ts` per `contracts/backend-adapters.md`
- [x] T029 [P] [US2] Implement `rateLimitNode` in `src/adapters/node.ts` per `contracts/backend-adapters.md`
- [x] T030 [US2] Implement `rateLimitNext` and `rateLimitEdge` in `src/adapters/next.ts` per `contracts/backend-adapters.md` (document edge isolate limitation in JSDoc)
- [x] T031 [US2] Implement `rateLimitKoa` in `src/adapters/koa.ts` per `contracts/backend-adapters.md`
- [x] T032 [US2] Register `express`, `node`, `next`, `koa` entry points in `tsup.config.ts` and `package.json` `exports` map with ESM/CJS/types paths per `research.md` R-001

**Checkpoint**: All backend adapters integrate with core limiter; integration tests green

---

## Phase 5: User Story 3 — Frontend Client-Side Rate Limiting (Priority: P3)

**Goal**: React hook, fetch wrapper, and Axios interceptor with `RateLimitError` and FR-019 propagation from `keyGenerator` failures

**Independent Test**: React Testing Library for hook state transitions; integration tests for fetch/axios blocking network when denied; errors propagate on key resolution failure

### Tests for User Story 3

- [x] T033 [P] [US3] Add `tests/integration/react.test.ts` for `useRateLimit` initial state, `attempt()` exhaustion, `reset()`, and timer-driven `retryAfter` updates per `contracts/frontend-adapters.md`
- [x] T034 [P] [US3] Add `tests/integration/fetch.test.ts` for `rateLimitFetch` — no network call on deny, `onLimit` fired, `RateLimitError` shape per `contracts/frontend-adapters.md`
- [x] T035 [P] [US3] Add `tests/integration/axios.test.ts` for interceptor rejection before network, `onLimit`, and `RateLimitError` per `contracts/frontend-adapters.md`
- [x] T036 [US3] Add `tests/integration/frontend-keygenerator-errors.test.ts` asserting thrown/rejected errors when `keyGenerator` throws (no silent allow/deny) per `spec.md` FR-019

### Implementation for User Story 3

- [x] T037 [US3] Implement `RateLimitError` class in `src/core/RateLimitError.ts`, export from `src/index.ts` per `contracts/frontend-adapters.md`
- [x] T038 [US3] Implement `useRateLimit` in `src/adapters/react.ts` per `contracts/frontend-adapters.md` (peer `react >= 18`)
- [x] T039 [US3] Implement `rateLimitFetch` in `src/adapters/fetch.ts` per `contracts/frontend-adapters.md`
- [x] T040 [US3] Implement `rateLimitAxios` in `src/adapters/axios.ts` per `contracts/frontend-adapters.md`
- [x] T041 [US3] Register `react`, `fetch`, `axios` entry points in `tsup.config.ts` and `package.json` `exports`

**Checkpoint**: Frontend adapters work independently with core; integration tests green

---

## Phase 6: User Story 4 — Developer Ergonomics & Configuration Safety (Priority: P4)

**Goal**: Strict typing surface, exhaustive validation messages, tree-shakeable entry points, optional `debug` diagnostics, bundle budgets

**Independent Test**: Invalid configs throw at creation with field-named errors; `npm run build` + size check meets NFR-PF; importing a single subpath does not pull unrelated adapters (smoke test or analyzer script)

### Tests for User Story 4

- [x] T042 [P] [US4] Add unit tests in `tests/unit/validateConfig.edge-cases.test.ts` for representative invalid `max`, `window`, callback types, and `message` (V-012) per `spec.md` User Story 4 acceptance scenarios (if not already covered in T012)

### Implementation for User Story 4

- [x] T043 [US4] Audit all exported public APIs under `src/` for JSDoc with `@example` per `spec.md` NFR-CQ; fill gaps in `src/core/*.ts`, `src/index.ts`, and `src/adapters/*.ts`
- [x] T044 [US4] Implement `debug: true` console diagnostics in core `check()` path and each adapter per `spec.md` FR-018 (no output when `debug` false/omitted)
- [x] T045 [US4] Add bundle size verification (e.g. `size-limit` in `package.json` or CI step using `npm pack` + `gzip`-size check) targeting core ≤ 5KB and `limiterx/react` ≤ 3KB min+gz per `plan.md` Performance Goals
- [x] T046 [US4] Add tree-shaking smoke test or build fixture under `tests/integration/tree-shake-express.test.ts` (or `scripts/verify-tree-shake.mjs`) confirming `limiterx/express` bundle excludes React/Koa/axios adapters per `spec.md` User Story 4
- [x] T047 [US4] Add latency regression guard for in-memory `check()` (e.g. Vitest bench or loop in `tests/perf/check-latency.test.ts`): assert median/p95 stays **< 1ms** on CI Node runners per `spec.md` NFR-PF; document threshold in `vitest.config.ts` or test file

**Checkpoint**: DX and performance NFRs evidenced by tests or scripted checks

---

## Phase 7: User Story 5 — Production Publishing & CI Quality Gate (Priority: P5)

**Goal**: Dual ESM/CJS publish, README, changelog, GitHub Actions matrix, npm publish on `v*` tags

**Independent Test**: CI passes on PR; tagged release workflow publishes; fresh `npm install` resolves `limiterx`, `limiterx/express`, `limiterx/react` per `spec.md` User Story 5

### Documentation for User Story 5

- [x] T048 [P] [US5] Document npm release requirements in `README.md`: GitHub secret `NPM_TOKEN`, tag-based publish, and `npm publish --provenance` (per User Story 5); add `publishConfig` to `package.json` (`"access": "public"` for scoped packages if needed)

### Implementation for User Story 5

- [x] T049 [US5] Author `README.md` at repository root with installation, adapter table, default `maxKeys` (10,000), `debug` flag, and quickstart aligned with `specs/001-production-readiness/quickstart.md`
- [x] T050 [US5] Add `CHANGELOG.md` (Keep a Changelog or project standard) with v1.0.0 placeholder
- [x] T051 [US5] Create `.github/workflows/ci.yml` running lint, typecheck, test+coverage thresholds, and build on push/PR; matrix Node 18, 20, 22 per `research.md` R-009; add a **Bun** job (`oven-sh/setup-bun`, `bun install`, `bun run test` or `bunx vitest run`) for SC-003; ensure React/client tests use **jsdom** via Vitest `environment` / `environmentMatchGlobs` / per-file pragma; document in workflow comments or README that **edge** coverage comes from `tests/integration/next.test.ts` (Edge middleware) plus portable `src/core`
- [x] T052 [US5] Add publish job on `v*` tags: `npm publish` with provenance, `NPM_TOKEN` secret, failure on any prior step per `spec.md` acceptance scenario 2
- [x] T053 [US5] Finalize `package.json` `files`, `types`, `module`, `main`, and `exports` conditions for dual ESM/CJS per `research.md` R-001 and `spec.md` acceptance scenario 3

**Checkpoint**: Release pipeline defined; package consumable from npm

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Examples, manual validation, and constitution-aligned quality gate

- [x] T054 [P] Add minimal runnable examples under `examples/express-app/`, `examples/nextjs-app/`, and `examples/react-vite-app/` per `plan.md` Project Structure (each with its own `package.json` referencing local `file:../..` or workspace protocol)
- [x] T055 Validate `specs/001-production-readiness/quickstart.md` steps against implemented API names (`rateLimitExpress` vs `createRateLimiter` exports) and update `README.md` links if paths differ
- [x] T056 Run full gate: `npm test && npm run lint && npm run typecheck && npm run build`; fix coverage or threshold gaps to satisfy Constitution Principle II
- [x] T057 Review adapter consistency (config shape, error prefixes, header behavior) against Constitution Principle III for all touched surfaces

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — blocks core implementation clarity
- **User Story 1 (Phase 3)**: Depends on Foundational — **MVP scope**
- **User Stories 2–5 (Phases 4–7)**: Depend on User Story 1 core exports (`createRateLimiter`, types, `MemoryStore`)
- **Polish (Phase 8)**: Depends on Phases 1–7 for intended release scope

### User Story Dependencies

- **US1 (P1)**: After Foundational — no other story dependency
- **US2 (P2)**: After US1 — imports core limiter and config validation
- **US3 (P3)**: After US1 — may proceed in parallel with US2 after US1
- **US4 (P4)**: After US1–US3 for full-surface JSDoc, `debug` in adapters, tree-shake verification, bundle/latency checks (**T045**–**T047**)
- **US5 (P5)**: After artifact completeness (README reflects real exports); typically after US1–US4

### Within Each User Story

- Tests (listed first per story) should fail before implementation where TDD is used
- Core modules before adapters; shared helpers before framework wiring
- Register `exports` / `tsup` entries when that story’s adapters are added (US2, US3, US5)

### Parallel Opportunities

- Setup tasks **T004**, **T005**, **T006** in parallel
- US1 unit tests **T011–T014** in parallel
- US2 integration tests **T022–T025** in parallel; adapter files **T028–T031** in parallel after **T027**
- US3 tests **T033–T035** in parallel
- US5 **T048** documentation checks parallel with changelog (**T050**) if staffed separately

---

## Parallel Example: User Story 1

```bash
# Unit tests (parallel):
vitest run tests/unit/parseWindow.test.ts tests/unit/validateConfig.test.ts tests/unit/MemoryStore.test.ts tests/unit/FixedWindowLimiter.test.ts

# Core modules after tests exist (parallel where split by file):
# src/core/parseWindow.ts
# src/core/validateConfig.ts
# src/core/storage/MemoryStore.ts (after types + parseWindow for TTL semantics)
```

---

## Parallel Example: User Story 2

```bash
# Integration tests (parallel):
vitest run tests/integration/express.test.ts tests/integration/node.test.ts tests/integration/next.test.ts tests/integration/koa.test.ts

# Adapters (after shared header helper T027):
# src/adapters/express.ts
# src/adapters/node.ts
# src/adapters/koa.ts
# src/adapters/next.ts (coordinate Next API + Edge in one file)
```

---

## Parallel Example: User Story 3

```bash
# Integration tests (parallel):
vitest run tests/integration/react.test.ts tests/integration/fetch.test.ts tests/integration/axios.test.ts

# Implementation (after T037 RateLimitError):
# src/adapters/react.ts
# src/adapters/fetch.ts
# src/adapters/axios.ts
```

---

## Parallel Example: User Story 4

```bash
# T042 unit edge cases in parallel with prep for T045–T046:
vitest run tests/unit/validateConfig.edge-cases.test.ts

# Scripted checks (different tools):
# package.json size-limit / CI gzip step (T045)
# scripts/verify-tree-shake.mjs or integration fixture (T046)
```

---

## Parallel Example: User Story 5

```bash
# Documentation (parallel):
# README.md release section (T048)
# CHANGELOG.md (T050)

# Pipeline: T051 workflow + T052 publish job + T053 exports finalization (serialize after feature complete)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (core + tests + exports)
4. **STOP and VALIDATE**: Contract + unit tests pass; no framework required
5. Demo via Node script or REPL importing `limiterx`

### Incremental Delivery

1. Setup + Foundational → types and tooling ready
2. US1 → publishable core-only pre-release (if desired)
3. US2 → backend middleware story
4. US3 → frontend adapters (can follow US2 in parallel teams)
5. US4 → DX hardening, bundle proofs, and latency guard (T047)
6. US5 → CI/CD and npm
7. Polish → examples and doc sync

### Parallel Team Strategy

- Developer A: US1 then US4 (core + DX)
- Developer B: US2 after US1
- Developer C: US3 after US1
- US5 + Polish once features converge

---

## Notes

- [P] tasks = different files or no ordering dependency within the same phase
- [USn] label maps tasks to `spec.md` user stories for traceability
- `data-model.md`, `plan.md`, and `research.md` default `maxKeys` (**10,000**) align with `spec.md` FR-007; implementation MUST match.
- Commit after each task or logical group; stop at checkpoints to validate stories independently
