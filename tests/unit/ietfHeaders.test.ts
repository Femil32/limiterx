import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimitExpress } from '../../src/adapters/express.js';

describe('IETF standardHeaders option', () => {
  it("draft-7 (default) emits RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset", async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 5, window: '1m' }));
    app.get('/', (_req, res) => res.sendStatus(200));
    const r = await request(app).get('/');
    expect(r.headers['ratelimit-limit']).toBeDefined();
    expect(r.headers['ratelimit-remaining']).toBeDefined();
    expect(r.headers['ratelimit-reset']).toBeDefined();
    expect(r.headers['ratelimit']).toBeUndefined(); // no draft-6 combined header
  });

  it("draft-6 emits combined RateLimit header", async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 5, window: '1m', standardHeaders: 'draft-6' }));
    app.get('/', (_req, res) => res.sendStatus(200));
    const r = await request(app).get('/');
    expect(r.headers['ratelimit']).toBeDefined();
    expect(r.headers['ratelimit']).toMatch(/limit=\d+/);
    expect(r.headers['ratelimit']).toMatch(/remaining=\d+/);
    expect(r.headers['ratelimit-limit']).toBeUndefined();
  });

  it("draft-8 emits RateLimit-* headers plus RateLimit-Policy", async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 5, window: 60000, standardHeaders: 'draft-8' }));
    app.get('/', (_req, res) => res.sendStatus(200));
    const r = await request(app).get('/');
    expect(r.headers['ratelimit-limit']).toBeDefined();
    expect(r.headers['ratelimit-policy']).toBeDefined();
    expect(r.headers['ratelimit-policy']).toMatch(/5;w=\d+/);
  });

  it("custom identifier used in draft-8 policy header", async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 5, window: 60000, standardHeaders: 'draft-8', identifier: 'api-v2' }));
    app.get('/', (_req, res) => res.sendStatus(200));
    const r = await request(app).get('/');
    expect(r.headers['ratelimit-policy']).toMatch(/api-v2/);
  });
});
