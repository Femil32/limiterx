import { defineConfig } from 'tsup';

// Unpacked size: ~147 kB (measured 2026-03-28). Target: < 300 kB (spec-002 US4).

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/express': 'src/adapters/express.ts',
    'adapters/node': 'src/adapters/node.ts',
    'adapters/next': 'src/adapters/next.ts',
    'adapters/koa': 'src/adapters/koa.ts',
    'adapters/react': 'src/adapters/react.ts',
    'adapters/fetch': 'src/adapters/fetch.ts',
    'adapters/axios': 'src/adapters/axios.ts',
    'adapters/redis': 'src/adapters/redis.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  minify: true,
  target: 'node18',
  external: ['react', 'express', 'koa', 'next', 'axios', 'ioredis', 'redis'],
  sourcemap: false,
});
