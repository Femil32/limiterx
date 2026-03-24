# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-03-24

### Changed

- **BREAKING**: npm package name is now `limiterx` (unscoped). Subpath imports use `limiterx/express`, `limiterx/react`, etc.
- **BREAKING**: `FlowGuardConfig` renamed to `LimiterxConfig`.
- Error and debug log prefixes use `[limiterx]`; internal storage key namespace is `limiterx:`.

## [1.0.0] - Unreleased

### Added

- Core rate limiting engine with fixed window algorithm
- `createRateLimiter()` factory function with unified configuration
- `parseWindow()` for human-readable duration strings ('30s', '5m', '1h', '1d')
- `MemoryStore` with LRU eviction (default 10,000 keys) and periodic TTL cleanup
- Express middleware adapter (`limiterx/express`)
- Raw Node.js HTTP adapter (`limiterx/node`)
- Next.js API route and Edge middleware adapter (`limiterx/next`)
- Koa middleware adapter (`limiterx/koa`)
- React hook `useRateLimit` (`limiterx/react`)
- Fetch wrapper `rateLimitFetch` (`limiterx/fetch`)
- Axios interceptor `rateLimitAxios` (`limiterx/axios`)
- `RateLimitError` class for frontend adapter rejections
- Standard `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers
- `Retry-After` header on denied responses
- Config validation with descriptive `[limiterx]` error messages
- `skip` function for bypassing rate limiting
- `onLimit` callback for limit exceeded events
- `debug` flag for console diagnostics
- `keyGenerator` for custom key resolution
- Tree-shakeable subpath exports with `sideEffects: false`
- Dual ESM/CJS output
- TypeScript strict mode with full type exports
- CI/CD pipeline with Node 18/20/22 matrix and Bun testing
- Automated npm publishing on `v*` tags with provenance
