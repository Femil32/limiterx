# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - Unreleased

### Added

- Core rate limiting engine with fixed window algorithm
- `createRateLimiter()` factory function with unified configuration
- `parseWindow()` for human-readable duration strings ('30s', '5m', '1h', '1d')
- `MemoryStore` with LRU eviction (default 10,000 keys) and periodic TTL cleanup
- Express middleware adapter (`flowguard/express`)
- Raw Node.js HTTP adapter (`flowguard/node`)
- Next.js API route and Edge middleware adapter (`flowguard/next`)
- Koa middleware adapter (`flowguard/koa`)
- React hook `useRateLimit` (`flowguard/react`)
- Fetch wrapper `rateLimitFetch` (`flowguard/fetch`)
- Axios interceptor `rateLimitAxios` (`flowguard/axios`)
- `RateLimitError` class for frontend adapter rejections
- Standard `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers
- `Retry-After` header on denied responses
- Config validation with descriptive `[flowguard]` error messages
- `skip` function for bypassing rate limiting
- `onLimit` callback for limit exceeded events
- `debug` flag for console diagnostics
- `keyGenerator` for custom key resolution
- Tree-shakeable subpath exports with `sideEffects: false`
- Dual ESM/CJS output
- TypeScript strict mode with full type exports
- CI/CD pipeline with Node 18/20/22 matrix and Bun testing
- Automated npm publishing on `v*` tags with provenance
