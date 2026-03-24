import { rateLimitEdge } from 'flowguard/next';

export const middleware = rateLimitEdge({
  max: 10,
  window: '30s',
});

export const config = { matcher: ['/api/:path*'] };
