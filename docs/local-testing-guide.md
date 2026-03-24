# Flowguard - Local Testing Guide

Test the Flowguard npm package locally across all platforms before publishing.

All test projects live under `test-npm/` at the project root (already in `.gitignore`).

## Prerequisites

```bash
# From the flowguard root directory
npm install
npm run build
npm pack
# Output: flowguard-1.0.0.tgz

# Create the test-npm parent directory
mkdir -p test-npm
```

---

## 1. Run the Built-in Test Suite

```bash
npm test               # 244 tests + coverage
npm run typecheck       # TypeScript compilation
npm run lint            # ESLint
```

All must pass before proceeding.

---

## 2. Test with Express

### JavaScript

```bash
mkdir -p test-npm/test-express-js && cd test-npm/test-express-js
npm init -y
npm install ../../flowguard-1.0.0.tgz express
```

Create `index.js`:

```js
import express from 'express';
import { rateLimitExpress } from 'flowguard/express';

const app = express();

app.use(rateLimitExpress({
  max: 5,
  window: '30s',
  debug: true,
}));

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from Flowguard!' });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

Add `"type": "module"` to `package.json`, then:

```bash
node index.js
# In another terminal:
for i in $(seq 1 7); do curl -i http://localhost:3000; echo; done
```

### TypeScript

```bash
mkdir -p test-npm/test-express-ts && cd test-npm/test-express-ts
npm init -y
npm install ../../flowguard-1.0.0.tgz express
npm install -D typescript @types/express @types/node tsx
```

Create `index.ts`:

```ts
import express, { Request, Response } from 'express';
import { rateLimitExpress } from 'flowguard/express';
import type { FlowGuardConfig } from 'flowguard';

const config: FlowGuardConfig = {
  max: 5,
  window: '30s',
  debug: true,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
};

const app = express();
app.use(rateLimitExpress(config));

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Hello from Flowguard (TS)!' });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

```bash
npx tsx index.ts
for i in $(seq 1 7); do curl -i http://localhost:3000; echo; done
```

**Verify:**
- Requests 1-5 return `200` with `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers
- Requests 6-7 return `429 Too Many Requests` with `Retry-After` header
- Debug logs appear in the server console
- TypeScript: no type errors, autocomplete works on config

---

## 3. Test with Node HTTP (No Framework)

### JavaScript

```bash
mkdir -p test-npm/test-node-js && cd test-npm/test-node-js
npm init -y
npm install ../../flowguard-1.0.0.tgz
```

Create `server.js`:

```js
import http from 'node:http';
import { rateLimitNode } from 'flowguard/node';

const limiter = rateLimitNode({ max: 3, window: '30s', debug: true });

const server = http.createServer(async (req, res) => {
  const result = await limiter.check(req, res);
  if (!result.allowed) {
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('Rate limited');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

server.listen(3001, () => console.log('http://localhost:3001'));
```

Add `"type": "module"` to `package.json`, then:

```bash
node server.js
for i in $(seq 1 5); do curl -i http://localhost:3001; echo; done
```

### TypeScript

```bash
mkdir -p test-npm/test-node-ts && cd test-npm/test-node-ts
npm init -y
npm install ../../flowguard-1.0.0.tgz
npm install -D typescript @types/node tsx
```

Create `server.ts`:

```ts
import http from 'node:http';
import { rateLimitNode } from 'flowguard/node';
import type { RateLimiterResult } from 'flowguard';

const limiter = rateLimitNode({ max: 3, window: '30s', debug: true });

const server = http.createServer(async (req, res) => {
  const result: RateLimiterResult = await limiter.check(req, res);
  if (!result.allowed) {
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end(`Rate limited. Retry in ${Math.ceil(result.retryAfter / 1000)}s`);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`OK - ${result.remaining} remaining`);
});

server.listen(3001, () => console.log('http://localhost:3001'));
```

```bash
npx tsx server.ts
for i in $(seq 1 5); do curl -i http://localhost:3001; echo; done
```

**Verify:** First 3 return `200`, rest return `429`.

---

## 4. Test with Next.js (API Routes + Edge Middleware)

Next.js already uses TypeScript by default.

```bash
cd test-npm
npx create-next-app@latest test-nextjs --ts --app --no-tailwind --no-eslint --no-src-dir
cd test-nextjs
npm install ../../flowguard-1.0.0.tgz
```

### Edge Middleware

Create `middleware.ts` at the project root:

```ts
import { rateLimitEdge } from 'flowguard/next';

export const middleware = rateLimitEdge({
  max: 5,
  window: '30s',
});

export const config = { matcher: ['/api/:path*'] };
```

### API Route

Create `app/api/hello/route.ts`:

```ts
import { rateLimitNext } from 'flowguard/next';
import { NextRequest, NextResponse } from 'next/server';

const limiter = rateLimitNext({ max: 3, window: '30s' });

export async function GET(req: NextRequest) {
  const result = await limiter(req);
  if (result) return result; // 429 response
  return NextResponse.json({ message: 'Hello!' });
}
```

```bash
npm run dev
for i in $(seq 1 7); do curl -i http://localhost:3000/api/hello; echo; done
```

**Verify:** Rate limit headers appear and 429 is returned after the limit.

---

## 5. Test with Koa

### JavaScript

```bash
mkdir -p test-npm/test-koa-js && cd test-npm/test-koa-js
npm init -y
npm install ../../flowguard-1.0.0.tgz koa
```

Create `index.js`:

```js
import Koa from 'koa';
import { rateLimitKoa } from 'flowguard/koa';

const app = new Koa();

app.use(rateLimitKoa({
  max: 5,
  window: '30s',
  debug: true,
}));

app.use((ctx) => {
  ctx.body = { message: 'Hello from Koa!' };
});

app.listen(3002, () => console.log('http://localhost:3002'));
```

Add `"type": "module"` to `package.json`, then:

```bash
node index.js
for i in $(seq 1 7); do curl -i http://localhost:3002; echo; done
```

### TypeScript

```bash
mkdir -p test-npm/test-koa-ts && cd test-npm/test-koa-ts
npm init -y
npm install ../../flowguard-1.0.0.tgz koa
npm install -D typescript @types/koa @types/node tsx
```

Create `index.ts`:

```ts
import Koa from 'koa';
import { rateLimitKoa } from 'flowguard/koa';
import type { FlowGuardConfig } from 'flowguard';

const config: FlowGuardConfig = {
  max: 5,
  window: '30s',
  debug: true,
};

const app = new Koa();
app.use(rateLimitKoa(config));

app.use((ctx) => {
  ctx.body = { message: 'Hello from Koa (TS)!' };
});

app.listen(3002, () => console.log('http://localhost:3002'));
```

```bash
npx tsx index.ts
for i in $(seq 1 7); do curl -i http://localhost:3002; echo; done
```

**Verify:** `200` up to limit, then `429`.

---

## 6. Test with React (Vite)

### JavaScript

```bash
cd test-npm
npm create vite@latest test-react-js -- --template react
cd test-react-js
npm install
npm install ../../flowguard-1.0.0.tgz
```

Replace `src/App.jsx`:

```jsx
import { useRateLimit } from 'flowguard/react';

export default function App() {
  const { allowed, remaining, retryAfter, attempt, reset } = useRateLimit('demo', {
    max: 5,
    window: '30s',
    onLimit: (result) => alert(`Rate limited! Retry in ${Math.ceil(result.retryAfter / 1000)}s`),
  });

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Flowguard React Demo</h1>
      <p>Allowed: {allowed ? 'Yes' : 'No'}</p>
      <p>Remaining: {remaining}</p>
      {retryAfter > 0 && <p>Retry after: {Math.ceil(retryAfter / 1000)}s</p>}
      <button onClick={() => attempt()} disabled={!allowed}>
        Click me ({remaining} left)
      </button>
      <button onClick={() => reset()} style={{ marginLeft: '1rem' }}>
        Reset
      </button>
    </div>
  );
}
```

```bash
npm run dev
```

### TypeScript

```bash
cd test-npm
npm create vite@latest test-react-ts -- --template react-ts
cd test-react-ts
npm install
npm install ../../flowguard-1.0.0.tgz
```

Replace `src/App.tsx`:

```tsx
import { useRateLimit } from 'flowguard/react';
import type { RateLimiterResult, FlowGuardConfig } from 'flowguard';

const config: FlowGuardConfig = {
  max: 5,
  window: '30s',
  onLimit: (result: RateLimiterResult) =>
    alert(`Rate limited! Retry in ${Math.ceil(result.retryAfter / 1000)}s`),
};

export default function App() {
  const { allowed, remaining, retryAfter, attempt, reset } = useRateLimit('demo', config);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Flowguard React Demo (TS)</h1>
      <p>Allowed: {allowed ? 'Yes' : 'No'}</p>
      <p>Remaining: {remaining}</p>
      {retryAfter > 0 && <p>Retry after: {Math.ceil(retryAfter / 1000)}s</p>}
      <button onClick={() => attempt()} disabled={!allowed}>
        Click me ({remaining} left)
      </button>
      <button onClick={() => reset()} style={{ marginLeft: '1rem' }}>
        Reset
      </button>
    </div>
  );
}
```

```bash
npm run dev
```

**Verify:**
- Button shows remaining count decreasing on each click
- After 5 clicks, button is disabled and alert fires
- Reset button restores the counter
- After 30 seconds, the counter auto-resets
- TypeScript: no type errors, full autocomplete on hook return values

---

## 7. Test the Fetch Wrapper

### JavaScript

```bash
mkdir -p test-npm/test-fetch-js && cd test-npm/test-fetch-js
npm init -y
npm install ../../flowguard-1.0.0.tgz
```

Create `test.js`:

```js
import { rateLimitFetch } from 'flowguard/fetch';

const limitedFetch = rateLimitFetch(fetch, {
  max: 3,
  window: '30s',
});

async function run() {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await limitedFetch('https://httpbin.org/get');
      console.log(`Request ${i + 1}: ${res.status}`);
    } catch (err) {
      console.log(`Request ${i + 1}: BLOCKED - ${err.name}: ${err.message}`);
    }
  }
}

run();
```

Add `"type": "module"` to `package.json`, then:

```bash
node test.js
```

### TypeScript

```bash
mkdir -p test-npm/test-fetch-ts && cd test-npm/test-fetch-ts
npm init -y
npm install ../../flowguard-1.0.0.tgz
npm install -D typescript @types/node tsx
```

Create `test.ts`:

```ts
import { rateLimitFetch } from 'flowguard/fetch';
import { RateLimitError } from 'flowguard';

const limitedFetch = rateLimitFetch(fetch, {
  max: 3,
  window: '30s',
});

async function run(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await limitedFetch('https://httpbin.org/get');
      console.log(`Request ${i + 1}: ${res.status}`);
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.log(`Request ${i + 1}: BLOCKED - retryAfter=${err.result.retryAfter}ms`);
      }
    }
  }
}

run();
```

```bash
npx tsx test.ts
```

**Verify:** First 3 requests succeed, requests 4-5 throw `RateLimitError`.

---

## 8. Test the Axios Interceptor

### JavaScript

```bash
mkdir -p test-npm/test-axios-js && cd test-npm/test-axios-js
npm init -y
npm install ../../flowguard-1.0.0.tgz axios
```

Create `test.js`:

```js
import axios from 'axios';
import { rateLimitAxios } from 'flowguard/axios';

const client = axios.create({ baseURL: 'https://httpbin.org' });

rateLimitAxios(client, {
  max: 3,
  window: '30s',
  key: 'httpbin',
});

async function run() {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await client.get('/get');
      console.log(`Request ${i + 1}: ${res.status}`);
    } catch (err) {
      if (err.name === 'RateLimitError') {
        console.log(`Request ${i + 1}: BLOCKED - ${err.message}`);
      } else {
        console.log(`Request ${i + 1}: ERROR - ${err.message}`);
      }
    }
  }
}

run();
```

Add `"type": "module"` to `package.json`, then:

```bash
node test.js
```

### TypeScript

```bash
mkdir -p test-npm/test-axios-ts && cd test-npm/test-axios-ts
npm init -y
npm install ../../flowguard-1.0.0.tgz axios
npm install -D typescript @types/node tsx
```

Create `test.ts`:

```ts
import axios from 'axios';
import { rateLimitAxios } from 'flowguard/axios';
import { RateLimitError } from 'flowguard';

const client = axios.create({ baseURL: 'https://httpbin.org' });

rateLimitAxios(client, {
  max: 3,
  window: '30s',
  key: 'httpbin',
});

async function run(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await client.get('/get');
      console.log(`Request ${i + 1}: ${res.status}`);
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.log(`Request ${i + 1}: BLOCKED - retryAfter=${err.result.retryAfter}ms`);
      }
    }
  }
}

run();
```

```bash
npx tsx test.ts
```

**Verify:** First 3 requests succeed, requests 4-5 throw `RateLimitError`.

---

## 9. Test CommonJS Compatibility

```bash
mkdir -p test-npm/test-cjs && cd test-npm/test-cjs
npm init -y
npm install ../../flowguard-1.0.0.tgz
```

Create `test.cjs`:

```js
const { createRateLimiter } = require('flowguard');

const limiter = createRateLimiter({ max: 3, window: '10s' });

async function run() {
  for (let i = 0; i < 5; i++) {
    const result = await limiter.check('test-key');
    console.log(`Attempt ${i + 1}: allowed=${result.allowed}, remaining=${result.remaining}`);
  }
  limiter.destroy();
}

run();
```

```bash
node test.cjs
```

**Verify:** CJS require works without errors. First 3 are allowed, last 2 are denied.

---

## 10. Test TypeScript Types Only

This verifies type declarations compile correctly without running any code.

```bash
mkdir -p test-npm/test-types && cd test-npm/test-types
npm init -y
npm install ../../flowguard-1.0.0.tgz typescript @types/node
npx tsc --init --strict --moduleResolution bundler --module ES2022
```

Create `test.ts`:

```ts
import { createRateLimiter } from 'flowguard';
import { rateLimitExpress } from 'flowguard/express';
import { rateLimitNode } from 'flowguard/node';
import { rateLimitNext, rateLimitEdge } from 'flowguard/next';
import { rateLimitKoa } from 'flowguard/koa';
import { useRateLimit } from 'flowguard/react';
import { rateLimitFetch } from 'flowguard/fetch';
import { rateLimitAxios } from 'flowguard/axios';
import type { FlowGuardConfig, RateLimiterResult, RateLimiter } from 'flowguard';

// Verify core types
const config: FlowGuardConfig = { max: 5, window: '30s' };
const limiter: RateLimiter = createRateLimiter(config);

async function test(): Promise<void> {
  const result: RateLimiterResult = await limiter.check('key');
  const allowed: boolean = result.allowed;
  const remaining: number = result.remaining;
  const retryAfter: number = result.retryAfter;
  const limit: number = result.limit;
  console.log(allowed, remaining, retryAfter, limit);
  limiter.destroy();
}

test();
```

```bash
npx tsc --noEmit
```

**Verify:** No type errors across all adapter imports and core types.

---

## 11. Verify Tree Shaking

From the flowguard root:

```bash
node scripts/verify-tree-shake.mjs
```

**Verify:** Express bundle excludes React/Koa/Axios code.

---

## Cleanup

```bash
# Remove all test projects at once
rm -rf test-npm/
rm flowguard-*.tgz
```

---

## Quick Checklist

| Platform | JS | TS | Expected |
|----------|----|----|----------|
| Tests | `npm test` | -- | 244 pass, coverage met |
| Express | `test-npm/test-express-js` | `test-npm/test-express-ts` | 5x `200`, 2x `429` |
| Node HTTP | `test-npm/test-node-js` | `test-npm/test-node-ts` | 3x `200`, 2x `429` |
| Next.js | -- | `test-npm/test-nextjs` | Rate limited after 5 |
| Koa | `test-npm/test-koa-js` | `test-npm/test-koa-ts` | 5x `200`, 2x `429` |
| React | `test-npm/test-react-js` | `test-npm/test-react-ts` | Counter + disable + alert |
| Fetch | `test-npm/test-fetch-js` | `test-npm/test-fetch-ts` | 3 ok, 2 RateLimitError |
| Axios | `test-npm/test-axios-js` | `test-npm/test-axios-ts` | 3 ok, 2 RateLimitError |
| CJS | `test-npm/test-cjs` | -- | require() works |
| Types | -- | `test-npm/test-types` | No type errors |
| Tree shake | `scripts/verify-tree-shake.mjs` | -- | Pass |
