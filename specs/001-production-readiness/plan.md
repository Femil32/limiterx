# Implementation Plan: Limiterx Production Readiness

**Branch**: `001-production-readiness` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-production-readiness/spec.md`

## Summary

Build the complete v1.0 of the limiterx rate limiting library: a TypeScript-first, universal (browser + Node.js + edge) rate limiter with a fixed window algorithm, in-memory storage with LRU eviction, backend middleware adapters (Express, Node HTTP, Next.js, Koa), frontend adapters (React hook, fetch wrapper, Axios interceptor), comprehensive config validation, and a CI/CD pipeline with automated npm publishing. The architecture isolates a zero-dependency core engine from framework-specific adapters, enabling tree-shaking and independent testing.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), targeting ES2022; Node.js ≥ 18.0.0  
**Primary Dependencies**: Zero runtime dependencies in core; `react` as peerDependency for React adapter; `express`/`koa`/`next`/`axios` as peerDependencies for respective adapters  
**Build Tooling**: tsup (esbuild-powered bundler) for dual ESM/CJS output with `.d.ts` generation; tsc for type checking  
**Storage**: In-memory `Map`-based store (MemoryStore) — no external storage for v1.0  
**Testing**: Vitest (test runner + fake timers + coverage), supertest (HTTP integration), @testing-library/react (React hook tests)  
**Target Platform**: Browser, Node.js 18/20/22, Bun, Edge/Serverless runtimes (Vercel Edge, Cloudflare Workers)  
**Project Type**: Library (npm package)  
**Performance Goals**: Core rate limit check < 1ms latency (in-memory); core bundle ≤ 5KB min+gz; React adapter ≤ 3KB min+gz  
**Constraints**: Zero runtime dependencies in core; `sideEffects: false` for tree-shaking; dual ESM/CJS publish via `exports` field; `Date.now()` as sole time source (edge-compatible)  
**Scale/Scope**: Single-process deployments; in-memory store capped at configurable maxKeys (default **10,000**, per `spec.md` FR-007) with LRU eviction

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Per `.specify/memory/constitution.md` (Limiterx Constitution), verify:

- [x] **Code quality & maintainability**: Source structure mirrors PRD architecture — `src/core/` (algorithms, storage, validation, types) isolated from `src/adapters/` (framework-specific wrappers). Each adapter is a separate entry point. TypeScript strict mode enforced. All public APIs documented with JSDoc + `@example`. No complexity deviations needed at this stage.
- [x] **Testing standards**: Three test layers planned — unit tests (algorithms, config validation, window parsing, MemoryStore), contract tests (public API guarantees via `createRateLimiter`), integration tests (Express/Node/Next.js/Koa via supertest; React hook via @testing-library/react). Coverage thresholds: statements ≥ 90%, branches ≥ 85%, functions ≥ 95%.
- [x] **User experience consistency**: Unified `LimiterxConfig` shape shared across all adapters. Error messages follow `[limiterx] Invalid config: '{field}'...` format. HTTP rate limit headers consistent across all backend adapters. React hook exposes same result shape. Documentation planned for each adapter with runnable examples.
- [x] **Performance**: Hot paths identified — `FixedWindowLimiter.check()` and `MemoryStore.get/set/increment`. Budget: < 1ms per check. MemoryStore background TTL sweep runs on a **60s** interval (`cleanupIntervalMs` default 60,000 in `data-model.md`) and LRU eviction (default **maxKeys: 10,000**) prevent unbounded memory growth. Bundle size budgets stated. No performance-regressing patterns in initial design.

## Project Structure

### Documentation (this feature)

```text
specs/001-production-readiness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── core-api.md
│   ├── backend-adapters.md
│   └── frontend-adapters.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── algorithms/
│   │   └── FixedWindowLimiter.ts
│   ├── storage/
│   │   └── MemoryStore.ts
│   ├── parseWindow.ts
│   ├── validateConfig.ts
│   └── types.ts
├── adapters/
│   ├── express.ts
│   ├── node.ts
│   ├── next.ts
│   ├── koa.ts
│   ├── react.ts
│   ├── fetch.ts
│   └── axios.ts
└── index.ts

tests/
├── unit/
│   ├── FixedWindowLimiter.test.ts
│   ├── MemoryStore.test.ts
│   ├── parseWindow.test.ts
│   └── validateConfig.test.ts
├── integration/
│   ├── express.test.ts
│   ├── node.test.ts
│   ├── next.test.ts
│   ├── koa.test.ts
│   └── react.test.ts
└── contract/
    └── createRateLimiter.test.ts

examples/
├── express-app/
├── nextjs-app/
└── react-vite-app/

.github/
└── workflows/
    └── ci.yml
```

**Structure Decision**: Single library project following the PRD architecture. Core logic in `src/core/` with zero framework dependencies. Each adapter in `src/adapters/` is a separate tsup entry point for tree-shaking. Tests mirror source structure with unit/integration/contract separation per Constitution testing standards.

## Constitution Check — Post-Design Re-evaluation

*Re-checked after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md) are complete.*

- [x] **Code quality & maintainability**: Data model entities map cleanly to source modules — `LimiterxConfig` → `types.ts`, `FixedWindowState` → `types.ts`, `MemoryStore` → `storage/MemoryStore.ts`, `FixedWindowLimiter` → `algorithms/FixedWindowLimiter.ts`. Validation rules are exhaustive (V-001 through V-012). No unexpected complexity introduced. `RateLimitError` class added for frontend adapter error handling — a simple `Error` subclass, justified by DX consistency across fetch/axios adapters.
- [x] **Testing standards**: Contracts define precise behavioral guarantees that map directly to test cases — `check()` allow/deny, `onLimit` error swallowing, header coercion, `skip` bypass, `destroy()` cleanup. Each acceptance scenario from the spec has a corresponding contract guarantee. The three-layer testing strategy (unit/contract/integration) covers all public API surfaces.
- [x] **User experience consistency**: Verified across all contracts — identical `LimiterxConfig` shape accepted by every adapter. Error message format is uniform. React hook exposes the same `RateLimiterResult` fields via reactive state. HTTP headers are consistently applied across Express, Node, Next.js, and Koa. `rateLimitFetch` and `rateLimitAxios` reject with `RateLimitError` when a call is denied (see `contracts/frontend-adapters.md`); the React hook does not throw on deny — it sets `allowed` / `remaining` / `retryAfter`. Quickstart guide demonstrates the unified pattern.
- [x] **Performance**: No design decisions introduce hot-path regressions. `MemoryStore.increment()` is O(1) Map lookup + insert. `FixedWindowLimiter.check()` is a single arithmetic comparison + store call. LRU eviction is O(1) using Map iteration order. Background cleanup is periodic (60s) and non-blocking. `destroy()` method documented to prevent timer leaks.

**Result**: All Constitution gates pass. No complexity violations. Proceed to `/speckit.tasks` for Phase 2 task breakdown.

## Complexity Tracking

No complexity violations identified. The architecture directly follows the PRD structure with no deviations from Constitution guidelines.
