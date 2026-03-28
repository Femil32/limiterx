import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { rateLimitExpress } from '../../src/adapters/express.js';

describe('legacyHeaders', () => {
  it('does NOT emit X-RateLimit-* by default (legacyHeaders: false)', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 10, window: '1m' }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
    expect(res.headers['x-ratelimit-reset']).toBeUndefined();
  });

  it('emits X-RateLimit-* headers when legacyHeaders: true', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 10, window: '1m', legacyHeaders: true }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('X-RateLimit-Limit equals RateLimit-Limit', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 42, window: '1m', legacyHeaders: true }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    expect(res.headers['x-ratelimit-limit']).toBe('42');
    expect(res.headers['ratelimit-limit']).toBe('42');
  });

  it('X-RateLimit-Reset is a Unix epoch timestamp (absolute), not relative seconds', async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = express();
    app.use(rateLimitExpress({ max: 10, window: '1m', legacyHeaders: true }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    const legacyReset = parseInt(res.headers['x-ratelimit-reset'], 10);
    const standardReset = parseInt(res.headers['ratelimit-reset'], 10);

    // Legacy reset should be a Unix epoch timestamp (much larger than 60)
    expect(legacyReset).toBeGreaterThan(now);
    expect(legacyReset).toBeLessThan(now + 120); // within 2 minutes ahead

    // Standard reset is relative seconds (should be <= 60)
    expect(standardReset).toBeGreaterThanOrEqual(0);
    expect(standardReset).toBeLessThanOrEqual(61);
  });

  it('both RateLimit-* and X-RateLimit-* headers present when legacyHeaders: true and headers: true', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 10, window: '1m', headers: true, legacyHeaders: true }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    // Standard headers
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
    // Legacy headers
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('headers: false suppresses both header sets even when legacyHeaders: true', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 10, window: '1m', headers: false, legacyHeaders: true }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    expect(res.headers['ratelimit-limit']).toBeUndefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('X-RateLimit-Remaining decrements correctly', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 5, window: '1m', legacyHeaders: true }));
    app.get('/', (_req, res) => res.send('ok'));

    const res1 = await request(app).get('/');
    const res2 = await request(app).get('/');

    const rem1 = parseInt(res1.headers['x-ratelimit-remaining'], 10);
    const rem2 = parseInt(res2.headers['x-ratelimit-remaining'], 10);
    expect(rem2).toBe(rem1 - 1);
  });
});
