# Contributing

Looking for something to work on? See [ROADMAP.md](./ROADMAP.md) for a full list of open
contribution opportunities, from good-first-issues to advanced features, each with a clear
description and the files involved.

## Development

```bash
npm install
npm run build        # Compile with tsup (ESM + CJS into dist/)
npm run typecheck    # TypeScript type checking without emitting
npm run lint         # ESLint over src/**/*.ts
npm run test         # Run all tests with coverage (vitest run --coverage)
npm run test:watch   # Watch mode (no coverage)
```

Run a single test file:
```bash
npx vitest run tests/unit/MemoryStore.test.ts
```

## Publishing

This package is published to npm with provenance. To publish a new version:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit and tag: `git tag vX.Y.Z` (match `package.json`)
4. Push tag: `git push origin vX.Y.Z`
5. CI will publish automatically (requires `NPM_TOKEN` secret)

The pre-publish gate (`npm run prepublishOnly`) runs typecheck, lint, test, and build in sequence.
