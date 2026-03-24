import { defineConfig } from 'tsup';

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
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  external: ['react', 'express', 'koa', 'next', 'axios'],
  sourcemap: true,
});
