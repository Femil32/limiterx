import http from 'http';
import { describe, it, expect, afterEach } from 'vitest';
import { rateLimitNode } from '../../src/adapters/node.js';

function makeRequest(
  server: http.Server,
  path = '/',
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const req = http.request({ hostname: '127.0.0.1', port: address.port, path }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

function startServer(handler: http.RequestListener): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('rateLimitNode', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) await stopServer(server);
  });

  it('check() returns a RateLimiterResult with correct fields', async () => {
    const limiter = rateLimitNode({ max: 10, window: '1m' });
    server = await startServer(async (req, res) => {
      const result = await limiter.check(req, res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });

    const { status, body } = await makeRequest(server);
    const result = JSON.parse(body);

    expect(status).toBe(200);
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.limit).toBe('number');
    expect(typeof result.retryAfter).toBe('number');
    expect(typeof result.resetAt).toBe('string'); // serialized Date
    expect(typeof result.key).toBe('string');
  });

  it('sets RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers on response', async () => {
    const limiter = rateLimitNode({ max: 10, window: '1m' });
    server = await startServer(async (req, res) => {
      await limiter.check(req, res);
      res.writeHead(200);
      res.end('ok');
    });

    const { headers } = await makeRequest(server);
    expect(headers['ratelimit-limit']).toBeDefined();
    expect(headers['ratelimit-remaining']).toBeDefined();
    expect(headers['ratelimit-reset']).toBeDefined();
  });

  it('developer controls 429 response when check() returns allowed:false', async () => {
    const limiter = rateLimitNode({ max: 1, window: '1m', keyGenerator: () => 'same' });
    server = await startServer(async (req, res) => {
      const result = await limiter.check(req, res);
      if (!result.allowed) {
        res.writeHead(429);
        res.end('Too Many Requests');
        return;
      }
      res.writeHead(200);
      res.end('ok');
    });

    await makeRequest(server); // consume the 1 allowed request
    const { status, body } = await makeRequest(server);

    expect(status).toBe(429);
    expect(body).toBe('Too Many Requests');
  });

  it('does NOT auto-send a 429 response — developer must send it manually', async () => {
    const limiter = rateLimitNode({ max: 1, window: '1m', keyGenerator: () => 'auto-test' });
    let resultFromCheck: { allowed: boolean } | undefined;

    server = await startServer(async (req, res) => {
      const result = await limiter.check(req, res);
      resultFromCheck = { allowed: result.allowed };
      // Deliberately NOT sending 429 even if denied
      res.writeHead(200);
      res.end('always-ok');
    });

    await makeRequest(server); // consume the 1 allowed request
    const { status, body } = await makeRequest(server); // should be denied by limiter

    // The adapter must NOT have sent 429 on its own
    expect(status).toBe(200);
    expect(body).toBe('always-ok');
    expect(resultFromCheck?.allowed).toBe(false);
  });
});
