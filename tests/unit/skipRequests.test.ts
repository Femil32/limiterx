import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimitExpress } from '../../src/adapters/express.js';

describe('skipSuccessfulRequests', () => {
  it('successful (2xx) request does not consume quota', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 2, window: '1m', skipSuccessfulRequests: true }));
    app.get('/', (_req, res) => res.status(200).json({ ok: true }));

    // 5 successful requests — should NOT exhaust limit of 2
    for (let i = 0; i < 5; i++) {
      const r = await request(app).get('/');
      expect(r.status).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 10)); // let finish hook run
    }
  });

  it('failed (4xx) request DOES consume quota with skipSuccessfulRequests', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 2, window: '1m', skipSuccessfulRequests: true }));
    app.get('/', (_req, res) => res.status(400).json({ err: true }));

    await request(app).get('/');
    await new Promise(resolve => setTimeout(resolve, 10));
    await request(app).get('/');
    await new Promise(resolve => setTimeout(resolve, 10));
    const r = await request(app).get('/');
    expect(r.status).toBe(429);
  });

  it('skipFailedRequests: failed request does not consume quota', async () => {
    const app = express();
    app.use(rateLimitExpress({ max: 2, window: '1m', skipFailedRequests: true }));
    app.get('/', (_req, res) => res.status(500).json({ err: true }));

    for (let i = 0; i < 5; i++) {
      const r = await request(app).get('/');
      expect(r.status).toBe(500);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });
});
