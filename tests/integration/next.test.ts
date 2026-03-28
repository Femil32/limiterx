import { describe, it, expect } from 'vitest';
import { rateLimitNext, rateLimitEdge } from '../../src/adapters/next.js';

// Minimal mock for NextApiResponse that captures interactions
function makeMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let sentBody: unknown = undefined;
  let ended = false;
  let chainedStatus = 0;

  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      statusCode = code;
      chainedStatus = code;
      return res;
    },
    json(body: unknown) {
      sentBody = body;
      ended = true;
    },
    send(body: string) {
      sentBody = body;
      ended = true;
    },
    end() {
      ended = true;
    },
    _headers: headers,
    get _status() {
      return statusCode;
    },
    get _body() {
      return sentBody;
    },
    get _ended() {
      return ended;
    },
  };

  return res;
}

// Minimal mock for NextApiRequest
function makeMockReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {} as Record<string, string | string[] | undefined>,
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

describe('rateLimitNext', () => {
  it('check() sets rate limit headers on the response and returns a result', async () => {
    const limiter = rateLimitNext({ max: 10, window: '1m' });
    const req = makeMockReq();
    const res = makeMockRes();

    const result = await limiter.check(req, res);

    expect(result.allowed).toBe(true);
    expect(res._headers['ratelimit-limit']).toBeDefined();
    expect(res._headers['ratelimit-remaining']).toBeDefined();
    expect(res._headers['ratelimit-reset']).toBeDefined();
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.limit).toBe('number');
  });

  it('sends 429 response when request is denied', async () => {
    const limiter = rateLimitNext({ max: 1, window: '1m', keyGenerator: () => 'next-deny' });
    const req = makeMockReq();

    // First request — allowed
    await limiter.check(req, makeMockRes());

    // Second request — denied
    const res = makeMockRes();
    const result = await limiter.check(req, res);

    expect(result.allowed).toBe(false);
    expect(res._status).toBe(429);
    expect(res._ended).toBe(true);
  });

  it('default keyGenerator uses x-forwarded-for header', async () => {
    const limiter = rateLimitNext({ max: 100, window: '1m' });
    const req = makeMockReq({
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });
    const res = makeMockRes();

    const result = await limiter.check(req, res);

    // Key should be the first IP from x-forwarded-for
    expect(result.key).toBe('10.0.0.1');
  });
});

describe('rateLimitEdge', () => {
  // Build a minimal mock NextRequest with a real Headers object
  function makeMockNextRequest(overrides: {
    ip?: string;
    headers?: Record<string, string>;
  } = {}) {
    return {
      ip: overrides.ip,
      headers: new Headers(overrides.headers ?? {}),
    };
  }

  it('returns undefined when request is allowed', async () => {
    const middleware = rateLimitEdge({ max: 10, window: '1m' });
    const req = makeMockNextRequest({ ip: '1.2.3.4' });

    const response = await middleware(req);

    expect(response).toBeUndefined();
  });

  it('returns Response with status 429 when request is denied', async () => {
    const middleware = rateLimitEdge({ max: 1, window: '1m', keyGenerator: () => 'edge-deny' });
    const req = makeMockNextRequest({ ip: '5.6.7.8' });

    await middleware(req); // allowed
    const response = await middleware(req); // denied

    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(429);
  });

  it('denied Response includes rate limit headers', async () => {
    const middleware = rateLimitEdge({ max: 1, window: '1m', keyGenerator: () => 'edge-headers' });
    const req = makeMockNextRequest({ ip: '9.10.11.12' });

    await middleware(req); // allowed
    const response = await middleware(req); // denied

    expect(response).toBeInstanceOf(Response);
    expect(response!.headers.get('RateLimit-Limit')).not.toBeNull();
    expect(response!.headers.get('RateLimit-Remaining')).not.toBeNull();
    expect(response!.headers.get('RateLimit-Reset')).not.toBeNull();
    expect(response!.headers.get('Retry-After')).not.toBeNull();
  });

  it('draft-6: denied Response has combined RateLimit header', async () => {
    const middleware = rateLimitEdge({ max: 1, window: '1m', keyGenerator: () => 'edge-d6', standardHeaders: 'draft-6' });
    const req = makeMockNextRequest({ ip: '1.1.1.1' });

    await middleware(req); // allowed
    const response = await middleware(req); // denied

    expect(response).toBeInstanceOf(Response);
    expect(response!.headers.get('RateLimit')).toMatch(/limit=\d+/);
    expect(response!.headers.get('RateLimit-Limit')).toBeNull();
  });

  it('draft-8: denied Response has RateLimit-Policy header', async () => {
    const middleware = rateLimitEdge({ max: 1, window: 60000, keyGenerator: () => 'edge-d8', standardHeaders: 'draft-8' });
    const req = makeMockNextRequest({ ip: '2.2.2.2' });

    await middleware(req); // allowed
    const response = await middleware(req); // denied

    expect(response).toBeInstanceOf(Response);
    expect(response!.headers.get('RateLimit-Policy')).toMatch(/1;w=\d+/);
  });

  it('legacyHeaders: denied Response has X-RateLimit-* headers', async () => {
    const middleware = rateLimitEdge({ max: 1, window: '1m', keyGenerator: () => 'edge-legacy', legacyHeaders: true });
    const req = makeMockNextRequest({ ip: '3.3.3.3' });

    await middleware(req); // allowed
    const response = await middleware(req); // denied

    expect(response).toBeInstanceOf(Response);
    expect(response!.headers.get('X-RateLimit-Limit')).not.toBeNull();
    expect(response!.headers.get('X-RateLimit-Reset')).not.toBeNull();
  });
});
