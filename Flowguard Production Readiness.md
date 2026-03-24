# flowguard — Product Requirements Document (PRD)

> **Version:** 1.0  
> **Author:** Femil Savaliya  
> **Status:** Active  
> **Last Updated:** March 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Target Audience](#4-target-audience)
5. [Competitive Analysis](#5-competitive-analysis)
6. [Package Identity](#6-package-identity)
7. [Architecture Overview](#7-architecture-overview)
8. [Core API Design](#8-core-api-design)
9. [Algorithm Specifications — v1.0](#9-algorithm-specifications--v10)
10. [Storage Adapters](#10-storage-adapters)
11. [Framework Adapters](#11-framework-adapters)
12. [Security Requirements](#12-security-requirements)
13. [Testing Strategy](#13-testing-strategy)
14. [TypeScript & Developer Experience](#14-typescript--developer-experience)
15. [Project Structure](#15-project-structure)
16. [Phased Roadmap](#16-phased-roadmap)
17. [Publishing & CI/CD](#17-publishing--cicd)
18. [Success Metrics](#18-success-metrics)

---

## 1. Overview

**flowguard** is a universal, production-ready rate limiting library for JavaScript/TypeScript. It works identically in the browser, Node.js, and edge runtimes, and ships first-class adapters for Express, Node.js HTTP, Next.js (API routes + Edge Middleware), Koa, React (hook), and plain fetch/Axios.

The core philosophy is **algorithm flexibility + developer ergonomics**. Developers choose which rate limiting algorithm fits their use case, configure it with a clean unified API, and get consistent behavior whether they are on the frontend or backend.

---

## 2. Problem Statement

Every existing rate limiting library has at least one of these problems:

| Problem | Affected Packages |
|---|---|
| Backend-only — no frontend/browser support | `express-rate-limit`, `rate-limiter-flexible` |
| Only one algorithm (fixed window) | `express-rate-limit`, `universal-rate-limiter` |
| No React hook / frontend-first DX | All major backend packages |
| Too tightly coupled to one framework | `express-rate-limit` (Express only), `fastify-rate-limit` |
| No TypeScript-first design | `limiter` |
| Minimal community / abandoned | `universal-rate-limiter` (near-zero downloads) |

**The gap:** No package offers a universal (frontend + backend), multi-algorithm, TypeScript-first rate limiter with framework adapters across React, Next.js, Express, and Koa in a single install.

---

## 3. Goals & Non-Goals

### Goals

- ✅ Universal — runs in Browser, Node.js 18+, Bun, Edge/Serverless runtimes
- ✅ Multi-algorithm — Fixed Window (v1.0), Sliding Window + Token Bucket + Leaky Bucket (v1.1)
- ✅ TypeScript-first — full types shipped, zero `@types/` separate install needed
- ✅ Framework adapters — Express, Node HTTP, Next.js, Koa, React hook, fetch, Axios
- ✅ Pluggable storage — MemoryStore (v1.0), RedisStore (v1.1)
- ✅ Production-ready — standard HTTP headers, security hardening, comprehensive tests
- ✅ Developer ergonomics — single config shape across all algorithms and adapters
- ✅ Zero required dependencies in core

### Non-Goals (v1.0)

- ❌ Distributed rate limiting across multiple server instances (requires Redis — v1.1)
- ❌ Rate limiting by geographic region / IP geolocation
- ❌ GraphQL-specific directives
- ❌ Paid tiers / quota management
- ❌ Browser extension or CLI tooling

---

## 4. Target Audience

**Primary:**
- Full-stack and backend JavaScript/TypeScript developers building APIs, SaaS products, or internal tools
- Frontend developers who need client-side rate limiting (form submission, button debounce at the network level, third-party API calls)

**Secondary:**
- Next.js developers wanting a single package that works in both API routes and Edge Middleware
- Open source contributors and developers evaluating the library for learning purposes

---

## 5. Competitive Analysis

| Package | Weekly Downloads | Algorithms | Frontend | Backend | TypeScript | Multi-framework |
|---|---|---|---|---|---|---|
| `express-rate-limit` | ~10M | Fixed Window | ❌ | Express only | ✅ | ❌ |
| `rate-limiter-flexible` | ~500K | Fixed Window | ❌ | Node.js (multi-store) | ✅ | Partial |
| `limiter` | ~11M | Token Bucket | ✅ (basic) | ✅ | ✅ | ❌ |
| `universal-rate-limiter` | ~0 | Fixed Window | ✅ | ✅ | ✅ | ✅ |
| `@tanstack/pacer` | Growing | Fixed Window | React/Solid | ❌ | ✅ | Partial |
| **flowguard** | — | Fixed→4 algos | ✅ | ✅ | ✅ | ✅ |

**Unique differentiator:** The only package combining universal runtime support + multiple configurable algorithms + a React hook + backend middleware in a single, maintained, TypeScript-first library.

---

## 6. Package Identity

| Property | Value |
|---|---|
| npm name | `flowguard` |
| Import | `import { createRateLimiter } from 'flowguard'` |
| License | MIT |
| Node.js requirement | ≥ 18.0.0 |
| TypeScript | ≥ 5.0 |
| Module formats | ESM + CJS (dual publish via `exports` field) |
| Zero dependencies | ✅ core has no runtime deps |
| Side effects | None (`"sideEffects": false` in package.json) |

---

## 7. Architecture Overview

```
flowguard/
│
├── core/                        ← Pure algorithm engine (no framework deps)
│   ├── algorithms/
│   │   ├── FixedWindowLimiter   ← v1.0
│   │   ├── SlidingWindowLimiter ← v1.1
│   │   ├── TokenBucketLimiter   ← v1.1
│   │   └── LeakyBucketLimiter   ← v1.1
│   ├── storage/
│   │   ├── MemoryStore          ← v1.0 (default)
│   │   └── RedisStore           ← v1.1
│   ├── RateLimiterResult        ← Shared result type
│   └── types.ts                 ← All public types
│
├── adapters/
│   ├── backend/
│   │   ├── express.ts           ← Express middleware
│   │   ├── node.ts              ← Raw Node.js http.IncomingMessage
│   │   ├── nextjs.ts            ← Next.js API route + Edge Middleware
│   │   └── koa.ts               ← Koa middleware
│   └── frontend/
│       ├── react.ts             ← useRateLimit() hook
│       ├── fetch.ts             ← rateLimitFetch() wrapper
│       └── axios.ts             ← rateLimitAxios() interceptor
│
├── tests/                       ← Jest test suites
└── examples/                    ← Runnable demos per framework
```

**Key design principle:** The `core/` has zero knowledge of any framework. Every adapter imports from `core/` and wraps it in framework-specific patterns. This means the algorithm logic is tested once and trusted everywhere.

---

## 8. Core API Design

### 8.1 Unified Config Shape

All adapters share the same base config. This is the single most important DX decision — developers learn one interface.

```typescript
interface FlowGuardConfig {
  // Required
  max: number;                      // Max requests allowed in the window
  window: number | string;          // Window duration. Number = ms. String = '1m', '30s', '1h'

  // Algorithm (v1.0 default: 'fixed-window')
  algorithm?: 'fixed-window'        // v1.0
            | 'sliding-window'      // v1.1
            | 'token-bucket'        // v1.1
            | 'leaky-bucket';       // v1.1

  // Key generation — what identifies a "user"
  keyGenerator?: (context: RequestContext) => string;
  // Default: IP address on backend, 'global' key on frontend

  // Called when limit is exceeded
  onLimit?: (result: RateLimiterResult, context: RequestContext) => void;

  // Storage adapter (default: MemoryStore)
  store?: StorageAdapter;

  // HTTP headers (backend adapters only)
  headers?: boolean;                // Default: true — send standard RateLimit headers

  // Skip limiter for certain requests (e.g. skip health checks)
  skip?: (context: RequestContext) => boolean;

  // Custom message on 429 response (backend adapters only)
  message?: string | object;        // Default: "Too many requests"

  // Status code for blocked requests (backend adapters only)
  statusCode?: number;              // Default: 429
}
```

### 8.2 RateLimiterResult

Every check — whether via middleware, hook, or wrapper — returns this object:

```typescript
interface RateLimiterResult {
  allowed: boolean;        // Was the request allowed?
  remaining: number;       // Requests remaining in current window
  limit: number;           // Total max requests (mirrors config.max)
  retryAfter: number;      // Milliseconds until the window resets
  resetAt: Date;           // Absolute Date when window resets
  key: string;             // The key that was rate limited
}
```

### 8.3 onLimit Callback

When a request exceeds the limit, `onLimit` fires with the result object + request context. This allows developers to log, alert, or customize behavior without replacing the middleware entirely.

```typescript
const limiter = createRateLimiter({
  max: 10,
  window: '1m',
  onLimit: (result, context) => {
    console.warn(`Rate limit hit for key: ${result.key}`);
    console.warn(`Retry after: ${result.retryAfter}ms`);
    // You could: log to analytics, trigger an alert, block the IP, etc.
  }
});
```

### 8.4 Window String Parsing

`window` accepts human-readable strings for better ergonomics:

| Input | Parsed as |
|---|---|
| `1000` (number) | 1000ms |
| `'500ms'` | 500ms |
| `'30s'` | 30,000ms |
| `'5m'` | 300,000ms |
| `'1h'` | 3,600,000ms |
| `'1d'` | 86,400,000ms |

---

## 9. Algorithm Specifications — v1.0

### 9.1 Fixed Window (v1.0)

**How it works:** A counter is incremented for each request within a fixed time window. When the window expires, the counter resets to zero. The window boundaries are aligned to wall-clock time (e.g., :00 to :59 for a 1-minute window).

**Characteristics:**
- Fastest and lowest memory footprint
- Susceptible to burst at window boundaries (up to 2× max at the boundary seam)
- Best for: general API protection, simple use cases

**Internal state per key:**
```typescript
interface FixedWindowState {
  count: number;       // Requests in current window
  windowStart: number; // Timestamp when current window started (ms)
}
```

**Algorithm logic:**
```
1. Get current timestamp T
2. Compute windowStart = floor(T / windowMs) * windowMs
3. Load state for key (count, windowStart)
4. If stored windowStart !== computed windowStart → reset count to 0, update windowStart
5. If count >= max → DENY (call onLimit, return result with allowed: false)
6. Increment count, save state
7. ALLOW — return result with allowed: true
```

**Config example:**
```typescript
import { createRateLimiter } from 'flowguard';

const limiter = createRateLimiter({
  algorithm: 'fixed-window',
  max: 100,
  window: '15m',
  onLimit: (result) => console.log(`Blocked. Retry in ${result.retryAfter}ms`)
});
```

---

## 10. Storage Adapters

### 10.1 MemoryStore (v1.0 — Default)

In-process memory store using a `Map`. No external dependencies.

**Behaviour:**
- State is local to the current process (not shared across instances)
- Automatic cleanup of expired keys runs every 5 minutes to prevent memory leaks
- Thread-safe for single-process Node.js (event loop guarantees sequential execution)

**Limitations:**
- State is lost on process restart
- Not suitable for multi-instance / horizontally scaled deployments (use RedisStore in v1.1)

**Interface:**
```typescript
interface StorageAdapter {
  get(key: string): Promise<WindowState | null>;
  set(key: string, state: WindowState, ttl: number): Promise<void>;
  increment(key: string, ttl: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;           // Useful for testing
}
```

### 10.2 RedisStore (v1.1 — Planned)

Atomic operations via Lua scripts (same pattern as `rate-limiter-flexible`). Supports `ioredis` and the official `redis` client. Required for multi-instance deployments.

---

## 11. Framework Adapters

### 11.1 Express Middleware

```typescript
import express from 'express';
import { rateLimitExpress } from 'flowguard/express';

const app = express();

app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  onLimit: (result, req) => {
    console.log(`${req.ip} exceeded limit`);
  }
}));
```

- Reads IP from `req.ip` (respects `trust proxy`)
- Sends standard HTTP headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- Responds with `429 Too Many Requests` when blocked (customizable via `statusCode` + `message`)
- `keyGenerator` receives `(req: Request) => string` for custom key logic (user ID, API key, etc.)

### 11.2 Node.js HTTP

```typescript
import http from 'http';
import { rateLimitNode } from 'flowguard/node';

const limiter = rateLimitNode({ max: 50, window: '1m' });

const server = http.createServer(async (req, res) => {
  const result = await limiter.check(req);
  if (!result.allowed) {
    res.writeHead(429);
    res.end('Too Many Requests');
    return;
  }
  // ... handle request
});
```

### 11.3 Next.js — API Routes + Edge Middleware

```typescript
// pages/api/data.ts or app/api/data/route.ts
import { rateLimitNext } from 'flowguard/next';

const limiter = rateLimitNext({ max: 20, window: '1m' });

export default async function handler(req, res) {
  const result = await limiter.check(req, res);
  if (!result.allowed) return; // limiter already sent 429
  res.json({ data: 'ok' });
}
```

```typescript
// middleware.ts (Edge Middleware)
import { rateLimitEdge } from 'flowguard/next';

export const middleware = rateLimitEdge({
  max: 10,
  window: '30s',
});
export const config = { matcher: ['/api/:path*'] };
```

### 11.4 Koa Middleware

```typescript
import Koa from 'koa';
import { rateLimitKoa } from 'flowguard/koa';

const app = new Koa();
app.use(rateLimitKoa({ max: 60, window: '1m' }));
```

### 11.5 React Hook

```typescript
import { useRateLimit } from 'flowguard/react';

function SubmitButton() {
  const { allowed, remaining, retryAfter, attempt } = useRateLimit('form-submit', {
    max: 5,
    window: '1m',
    onLimit: (result) => alert(`Slow down! Try again in ${Math.ceil(result.retryAfter / 1000)}s`)
  });

  return (
    <button onClick={attempt} disabled={!allowed}>
      Submit {remaining > 0 ? `(${remaining} left)` : '(limit reached)'}
    </button>
  );
}
```

**Hook return values:**

| Property | Type | Description |
|---|---|---|
| `allowed` | `boolean` | Whether the next action is currently allowed |
| `remaining` | `number` | Remaining attempts in current window |
| `retryAfter` | `number` | Ms until window resets (0 if allowed) |
| `resetAt` | `Date` | When the window resets |
| `attempt` | `() => boolean` | Call this to consume one token; returns `allowed` |
| `reset` | `() => void` | Manually reset the limiter state |

### 11.6 Fetch Wrapper

```typescript
import { rateLimitFetch } from 'flowguard/fetch';

const guardedFetch = rateLimitFetch(fetch, {
  max: 10,
  window: '1m',
  onLimit: (result) => console.warn(`Fetch blocked. Retry in ${result.retryAfter}ms`)
});

// Use exactly like native fetch
const res = await guardedFetch('https://api.example.com/data');
```

### 11.7 Axios Adapter

```typescript
import axios from 'axios';
import { rateLimitAxios } from 'flowguard/axios';

const client = rateLimitAxios(axios.create(), {
  max: 10,
  window: '1m',
  onLimit: (result) => console.warn('Rate limited')
});

const res = await client.get('/api/data');
```

---

## 12. Security Requirements

### 12.1 IP Spoofing Protection
- On Express, use `req.ip` which respects the `trust proxy` setting — do NOT blindly read `X-Forwarded-For` (it is trivially spoofable)
- Document the `trust proxy` requirement in README

### 12.2 Key Collision Prevention
- Keys are namespaced internally: `flowguard:${userKey}` to avoid collisions with other data in the same store
- If using RedisStore (v1.1), namespace is configurable via `keyPrefix` option

### 12.3 Memory DoS Prevention
- MemoryStore enforces a max key count (default: `100,000`)
- LRU eviction kicks in if max is reached — oldest keys are evicted first
- Configurable via `store: new MemoryStore({ maxKeys: 50000 })`

### 12.4 Time Manipulation
- All timestamps use `Date.now()` — no dependency on `process.hrtime` (edge-compatible)
- Window calculations are deterministic and not susceptible to clock drift within a single process

### 12.5 Header Injection Prevention
- All values written to HTTP headers are coerced to safe number/string types
- `retryAfter` in `Retry-After` header is always a positive integer (seconds, per RFC 7231)

---

## 13. Testing Strategy

### 13.1 Unit Tests — Core Algorithms
- Every algorithm is tested in isolation with a mock clock (`jest.useFakeTimers`)
- Test cases per algorithm:
  - Allows requests under limit
  - Blocks requests at exact limit
  - Resets correctly after window expires
  - Handles concurrent same-key requests (race condition simulation)
  - Calls `onLimit` with correct `RateLimiterResult` shape
  - Window string parsing (`'1m'`, `'30s'`, etc.)

### 13.2 Integration Tests — Adapters
- Express: uses `supertest` to make real HTTP requests
- Node HTTP: creates a real server, fires requests
- React hook: uses `@testing-library/react` with fake timers

### 13.3 Edge Case Tests
- Empty key (should fall back to default key)
- Negative or zero `max` (should throw clear error at config time)
- Invalid window string (should throw clear error at config time)
- `skip()` returning true (should bypass limit entirely)
- Rapid burst: 100 requests fired simultaneously (concurrency test)

### 13.4 Coverage Target
- **Statements:** ≥ 90%
- **Branches:** ≥ 85%
- **Functions:** ≥ 95%

### 13.5 Tooling
- Test runner: **Vitest** (fast, ESM-native, compatible with Node 18+)
- HTTP integration: **supertest**
- React testing: **@testing-library/react**
- Fake timers: Vitest's built-in `vi.useFakeTimers()`

---

## 14. TypeScript & Developer Experience

### 14.1 Strict Types
- `"strict": true` in `tsconfig.json`
- All public APIs have complete return types — no implicit `any`
- Generic `RequestContext` type allows adapters to extend with framework-specific fields

### 14.2 JSDoc
- Every exported function and interface has a JSDoc comment
- `@example` blocks on all config options

### 14.3 Error Messages
- Config validation runs at `createRateLimiter()` call time, not at request time
- Errors include the offending field name and expected vs received values:
  ```
  [flowguard] Invalid config: 'max' must be a positive integer, received: -5
  [flowguard] Invalid config: 'window' string '2x' is not a valid duration
  ```

### 14.4 Tree-Shaking
- `"sideEffects": false` in `package.json`
- Each adapter is a separate entry point — bundlers only include what is imported:
  ```typescript
  import { rateLimitExpress } from 'flowguard/express'; // only Express adapter in bundle
  import { useRateLimit } from 'flowguard/react';       // only React hook in bundle
  ```

---

## 15. Project Structure

```
flowguard/
├── src/
│   ├── core/
│   │   ├── algorithms/
│   │   │   ├── FixedWindowLimiter.ts
│   │   │   ├── SlidingWindowLimiter.ts      (v1.1)
│   │   │   ├── TokenBucketLimiter.ts        (v1.1)
│   │   │   └── LeakyBucketLimiter.ts        (v1.1)
│   │   ├── storage/
│   │   │   ├── MemoryStore.ts
│   │   │   └── RedisStore.ts                (v1.1)
│   │   ├── parseWindow.ts                   (window string → ms)
│   │   ├── validateConfig.ts
│   │   └── types.ts
│   ├── adapters/
│   │   ├── express.ts
│   │   ├── node.ts
│   │   ├── next.ts
│   │   ├── koa.ts
│   │   ├── react.ts
│   │   ├── fetch.ts
│   │   └── axios.ts
│   └── index.ts                             (core re-exports)
├── tests/
│   ├── core/
│   │   ├── FixedWindowLimiter.test.ts
│   │   ├── parseWindow.test.ts
│   │   └── MemoryStore.test.ts
│   ├── adapters/
│   │   ├── express.test.ts
│   │   ├── node.test.ts
│   │   └── react.test.ts
│   └── fixtures/
│       └── mockStore.ts
├── examples/
│   ├── express-app/
│   ├── nextjs-app/
│   └── react-vite-app/
├── .github/
│   └── workflows/
│       └── ci.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── CHANGELOG.md
├── README.md
└── FLOWGUARD_PRD.md                         ← this file
```

---

## 16. Phased Roadmap

### Phase 1 — Core Engine (Week 1) 🔨 IN PROGRESS

**Goal:** Build the algorithm engine. Zero framework dependencies. All logic tested in isolation.

**Deliverables:**
- [ ] Repo scaffolding: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- [ ] `types.ts` — `FlowGuardConfig`, `RateLimiterResult`, `StorageAdapter`, `RequestContext`
- [ ] `parseWindow.ts` — human-readable window string parser with tests
- [ ] `validateConfig.ts` — config validation with clear error messages
- [ ] `MemoryStore.ts` — in-memory `Map`-based store with LRU eviction + TTL cleanup
- [ ] `FixedWindowLimiter.ts` — full Fixed Window algorithm implementation
- [ ] Unit tests for all of the above (≥ 90% coverage)
- [ ] `src/index.ts` — barrel export of core

**Exit criteria:** `npm test` passes with ≥ 90% coverage on core modules.

---

### Phase 2 — Backend Adapters (Week 2)

**Goal:** Plug the core engine into Node.js ecosystem frameworks.

**Deliverables:**
- [ ] `adapters/express.ts` — Express middleware (`rateLimitExpress`)
- [ ] `adapters/node.ts` — Raw Node.js HTTP handler (`rateLimitNode`)
- [ ] `adapters/next.ts` — Next.js API route wrapper + Edge Middleware (`rateLimitNext`, `rateLimitEdge`)
- [ ] `adapters/koa.ts` — Koa middleware (`rateLimitKoa`)
- [ ] Standard HTTP response headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`
- [ ] Integration tests for each adapter using `supertest`
- [ ] `examples/express-app/` — runnable Express demo
- [ ] `examples/nextjs-app/` — runnable Next.js demo (API route + edge)

**Exit criteria:** All adapter integration tests pass. `examples/express-app` runs end-to-end.

---

### Phase 3 — Frontend Adapters (Week 3)

**Goal:** First-class frontend experience in React, fetch, and Axios.

**Deliverables:**
- [ ] `adapters/react.ts` — `useRateLimit()` hook with full state (`allowed`, `remaining`, `retryAfter`, `attempt`, `reset`)
- [ ] `adapters/fetch.ts` — `rateLimitFetch()` drop-in fetch wrapper
- [ ] `adapters/axios.ts` — `rateLimitAxios()` Axios interceptor adapter
- [ ] Tests for React hook using `@testing-library/react` + fake timers
- [ ] `examples/react-vite-app/` — runnable Vite + React demo with UI showing remaining/reset state
- [ ] Verify tree-shaking — each adapter entry point bundles independently (use `bundlesize` or `size-limit`)

**Exit criteria:** React hook renders correctly in both Vite and Next.js. Bundle size of `flowguard/react` alone is under 3KB minified+gzipped.

---

### Phase 4 — Production Polish & Publish (Week 4)

**Goal:** Make flowguard publishable and portfolio-quality.

**Deliverables:**
- [ ] Full README with: install, quick start, per-algorithm explanation, per-adapter docs, config reference table, FAQ
- [ ] `CHANGELOG.md` following Keep a Changelog format
- [ ] GitHub Actions CI: lint (ESLint) → test (Vitest) → build (tsc) → coverage report
- [ ] Automated npm publish on git tag (`v1.0.0`)
- [ ] Benchmark script: compare flowguard Fixed Window vs `express-rate-limit` at 10K req/s
- [ ] Publish to npm as `flowguard`
- [ ] Dev.to article: "I built a universal rate limiter npm package — here's how the algorithms work"

**Exit criteria:** `npm publish` succeeds. Package is installable via `npm i flowguard`. README renders correctly on npmjs.com.

---

### Phase 5 — v1.1: More Algorithms + Redis (Post Week 4)

**Goal:** Fill the algorithm roadmap and enable distributed/multi-instance use.

**Deliverables:**
- [ ] `SlidingWindowLimiter.ts` — rolling timestamp window (more accurate, higher memory)
- [ ] `TokenBucketLimiter.ts` — burst-friendly, tokens refill over time
- [ ] `LeakyBucketLimiter.ts` — smooths output rate, FIFO queue model
- [ ] `RedisStore.ts` — atomic Lua script operations via `ioredis` / `redis`
- [ ] Update all tests for new algorithms
- [ ] Benchmark all 4 algorithms head-to-head
- [ ] Algorithm selection guide in README (when to use which)

---

## 17. Publishing & CI/CD

### package.json key fields

```json
{
  "name": "flowguard",
  "version": "1.0.0",
  "license": "MIT",
  "engines": { "node": ">=18.0.0" },
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./express": { "import": "./dist/adapters/express.js" },
    "./next": { "import": "./dist/adapters/next.js" },
    "./koa": { "import": "./dist/adapters/koa.js" },
    "./react": { "import": "./dist/adapters/react.js" },
    "./fetch": { "import": "./dist/adapters/fetch.js" },
    "./axios": { "import": "./dist/adapters/axios.js" }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc && tsup",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src tests",
    "prepublishOnly": "npm run lint && npm run test && npm run build"
  }
}
```

### CI Pipeline (GitHub Actions)

```
Trigger: push to main, pull_request, git tag v*

Steps:
1. Checkout
2. Setup Node 18
3. npm ci
4. ESLint
5. Vitest + coverage
6. tsc build (type check)
7. [On tag only] npm publish
```

---

## 18. Success Metrics

| Metric | Target |
|---|---|
| Test coverage | ≥ 90% statements |
| Bundle size (core) | ≤ 5KB min+gz |
| Bundle size (react adapter) | ≤ 3KB min+gz |
| npm weekly downloads (1 month post-launch) | ≥ 100 |
| GitHub stars (1 month post-launch) | ≥ 25 |
| Zero open P0 bugs at launch | ✅ |
| TypeScript strict mode passes | ✅ |
| Works in Node 18, 20, 22 | ✅ |

---

*This PRD is the source of truth for flowguard v1.0 and v1.1. All implementation decisions should be traceable back to a requirement in this document. When in doubt about scope, refer to Section 3 (Goals & Non-Goals) first.*
