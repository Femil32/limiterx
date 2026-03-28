#!/usr/bin/env node

/**
 * Tree-shaking smoke test (T046).
 * Verifies that importing limiterx/express does not pull in React/Koa/Axios code.
 *
 * Run: node scripts/verify-tree-shake.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read the Express adapter ESM output
const expressBundle = readFileSync(resolve(root, 'dist/adapters/express.js'), 'utf-8');

const violations = [];

// Should NOT contain React-specific code
if (expressBundle.includes('useState') || expressBundle.includes('useRef') || expressBundle.includes('useEffect')) {
  violations.push('Express bundle contains React hooks (useState/useRef/useEffect)');
}

// Should NOT contain Koa-specific code
if (expressBundle.includes('rateLimitKoa')) {
  violations.push('Express bundle contains Koa adapter (rateLimitKoa)');
}

// Should NOT contain Axios-specific code
if (expressBundle.includes('rateLimitAxios')) {
  violations.push('Express bundle contains Axios adapter (rateLimitAxios)');
}

// Should NOT contain fetch adapter code
if (expressBundle.includes('rateLimitFetch')) {
  violations.push('Express bundle contains Fetch adapter (rateLimitFetch)');
}

if (violations.length > 0) {
  console.error('Tree-shaking violations found:');
  violations.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
} else {
  console.log('Tree-shaking verification passed: Express bundle excludes React/Koa/Axios/Fetch adapters');
}
