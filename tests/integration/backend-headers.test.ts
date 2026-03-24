import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { rateLimitExpress } from '../../src/adapters/express.js';

function makeApp(max = 5) {
  const app = express();
  app.use(rateLimitExpress({ max, window: '1m', keyGenerator: () => 'headers-test' }));
  app.get('/', (_req, res) => res.send('ok'));
  return app;
}

describe('backend-headers: standard RateLimit-* headers only', () => {
  it('response has RateLimit-Limit header', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('response has RateLimit-Remaining header', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('response has RateLimit-Reset header', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('response does NOT have X-RateLimit-Limit header', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('response does NOT have X-RateLimit-Remaining header', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
  });

  it('response does NOT have X-RateLimit-Reset header', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.headers['x-ratelimit-reset']).toBeUndefined();
  });

  it('denied response has Retry-After header', async () => {
    const app = makeApp(1);
    await request(app).get('/');
    const res = await request(app).get('/');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
