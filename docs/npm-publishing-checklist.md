# Flowguard - npm Publishing Checklist

Step-by-step guide to publish Flowguard to npm.

---

## Before You Start

- [ ] You have an npm account ([npmjs.com/signup](https://www.npmjs.com/signup))
- [ ] You are logged in: `npm whoami` (if not, run `npm login`)
- [ ] You have 2FA enabled on your npm account (recommended for publishing)

---

## Pre-Publish Checks

### 1. Verify Version

- [ ] Update `version` in `package.json` (follow [semver](https://semver.org/))
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Ensure the version hasn't been published already: `npm view flowguard versions`

### 2. Run All Quality Gates

```bash
# From the flowguard root directory
npm run typecheck      # TypeScript compilation check
npm run lint           # ESLint
npm test               # 244 tests + coverage thresholds
npm run build          # Produce dist/
```

- [ ] All commands exit with code 0
- [ ] Coverage thresholds met (90% statements, 85% branches, 95% functions)

### 3. Verify the Build Output

```bash
ls dist/
```

- [ ] `dist/index.js` and `dist/index.cjs` exist (core ESM + CJS)
- [ ] `dist/index.d.ts` and `dist/index.d.cts` exist (type declarations)
- [ ] All 7 adapter files exist in `dist/adapters/` (express, node, next, koa, react, fetch, axios)
- [ ] Each adapter has `.js`, `.cjs`, `.d.ts`, `.d.cts` files

### 4. Verify Tree Shaking

```bash
node scripts/verify-tree-shake.mjs
```

- [ ] Script passes (Express bundle excludes React/Koa/Axios code)

### 5. Dry Run the Package

```bash
npm pack --dry-run
```

- [ ] Only `dist/`, `README.md`, `CHANGELOG.md`, and `LICENSE` are included
- [ ] No test files, source files, or config files leak into the package
- [ ] Package size is reasonable (should be under 50KB)

### 6. Test Locally with the Tarball

```bash
npm pack
# Creates flowguard-1.0.0.tgz
```

- [ ] Install in a test project: `npm install /path/to/flowguard-1.0.0.tgz`
- [ ] Test at least Express and React adapters work (see `docs/local-testing-guide.md`)
- [ ] CJS `require('flowguard')` works
- [ ] ESM `import from 'flowguard'` works
- [ ] TypeScript types resolve correctly

---

## Publishing

### 7. Commit and Tag

```bash
git add -A
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

- [ ] All changes committed
- [ ] Git tag matches package.json version
- [ ] Pushed to remote (triggers CI if configured)

### 8. Publish to npm

```bash
# First publish (if the package name is new):
npm publish --access public

# Subsequent publishes:
npm publish
```

- [ ] If using 2FA, enter the OTP when prompted
- [ ] Publish succeeds without errors

### 9. Verify on npm

```bash
npm view flowguard
```

- [ ] Version matches what you published
- [ ] Check [npmjs.com/package/flowguard](https://www.npmjs.com/package/flowguard) in a browser
- [ ] README renders correctly on npm

### 10. Smoke Test from npm

```bash
mkdir verify-publish && cd verify-publish
npm init -y
npm install flowguard
```

```js
import { createRateLimiter } from 'flowguard';
const limiter = createRateLimiter({ max: 5, window: '30s' });
const result = await limiter.check('test');
console.log(result); // { allowed: true, remaining: 4, ... }
limiter.destroy();
```

- [ ] Package installs from npm registry
- [ ] Core import works
- [ ] At least one adapter import works (e.g., `flowguard/express`)

---

## Post-Publish

- [ ] Create a GitHub Release for the tag with changelog notes
- [ ] Announce the release (Twitter, Discord, blog, etc.)
- [ ] Delete the local `.tgz` test file: `rm flowguard-*.tgz`
- [ ] Clean up any test directories you created

---

## Unpublish (Emergency Only)

If you published by mistake within 72 hours:

```bash
npm unpublish flowguard@1.0.0
```

After 72 hours, contact npm support. This is destructive -- avoid it.

---

## Publishing a Scoped Package (Alternative)

If `flowguard` is taken on npm, use a scoped name:

1. In `package.json`, change `"name"` to `"@your-scope/flowguard"`
2. Update all example imports in docs accordingly
3. Publish: `npm publish --access public`

---

## Quick Reference

| Step | Command | Must Pass |
|------|---------|-----------|
| Login | `npm whoami` | Shows your username |
| Typecheck | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0 |
| Test | `npm test` | 244 pass, coverage met |
| Build | `npm run build` | Exit 0, dist/ populated |
| Tree shake | `node scripts/verify-tree-shake.mjs` | Pass |
| Dry run | `npm pack --dry-run` | Only dist + docs |
| Publish | `npm publish --access public` | Success |
| Verify | `npm view flowguard` | Correct version |
