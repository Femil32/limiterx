import express from 'express';
import request from 'supertest';
import { describe, it, expect, afterEach } from 'vitest';
import { rateLimitExpress } from '../../src/adapters/express.js';

describe('rateLimitExpress', () => {
  let app: express.Express;

  afterEach(() => {
    // No persistent server to close — supertest closes internally
  });

  it('sets RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers on success', async () => {
    app = express();
    app.use(rateLimitExpress({ max: 3, window: '1m' }));
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('returns 429 with body "Too many requests" and Retry-After header when limit exceeded', async () => {
    app = express();
    app.use(rateLimitExpress({ max: 2, window: '1m' }));
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    await request(app).get('/');
    const res = await request(app).get('/');

    expect(res.status).toBe(429);
    expect(res.text).toBe('Too many requests');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('rate limits by custom keyGenerator key', async () => {
    let callCount = 0;
    app = express();
    app.use(
      rateLimitExpress({
        max: 2,
        window: '1m',
        keyGenerator: () => {
          callCount++;
          return 'fixed-key';
        },
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    await request(app).get('/');
    const res = await request(app).get('/');

    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(res.status).toBe(429);
  });

  it('yields 500 (not 429) when keyGenerator throws (FR-019)', async () => {
    app = express();
    // Add error handler so Express returns 500 instead of default HTML error page
    app.use(
      rateLimitExpress({
        max: 3,
        window: '1m',
        keyGenerator: () => {
          throw new Error('key generation failed');
        },
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));
    app.use(
      (
        _err: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).send('Internal Server Error');
      },
    );

    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    expect(res.status).not.toBe(429);
  });

  it('decreases RateLimit-Remaining with each request', async () => {
    app = express();
    app.use(rateLimitExpress({ max: 5, window: '1m', keyGenerator: () => 'same-key' }));
    app.get('/', (_req, res) => res.send('ok'));

    const res1 = await request(app).get('/');
    const res2 = await request(app).get('/');
    const res3 = await request(app).get('/');

    const remaining1 = parseInt(res1.headers['ratelimit-remaining'] as string, 10);
    const remaining2 = parseInt(res2.headers['ratelimit-remaining'] as string, 10);
    const remaining3 = parseInt(res3.headers['ratelimit-remaining'] as string, 10);

    expect(remaining2).toBeLessThan(remaining1);
    expect(remaining3).toBeLessThan(remaining2);
  });

  it('uses custom string message on deny', async () => {
    app = express();
    app.use(
      rateLimitExpress({ max: 1, window: '1m', message: 'Slow down!', keyGenerator: () => 'msg-key' }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    const res = await request(app).get('/');

    expect(res.status).toBe(429);
    expect(res.text).toBe('Slow down!');
  });

  it('uses custom object message on deny', async () => {
    app = express();
    app.use(
      rateLimitExpress({
        max: 1,
        window: '1m',
        message: { error: 'rate limited', code: 429 },
        keyGenerator: () => 'obj-msg-key',
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    const res = await request(app).get('/');

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'rate limited', code: 429 });
  });

  it('uses custom statusCode on deny', async () => {
    app = express();
    app.use(
      rateLimitExpress({
        max: 1,
        window: '1m',
        statusCode: 503,
        keyGenerator: () => 'status-key',
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    const res = await request(app).get('/');

    expect(res.status).toBe(503);
  });

  describe('algorithm: sliding-window', () => {
    it('allows requests up to max and denies beyond', async () => {
      app = express();
      app.use(
        rateLimitExpress({
          max: 2,
          window: '1m',
          algorithm: 'sliding-window',
          keyGenerator: () => 'sw-key',
        }),
      );
      app.get('/', (_req, res) => res.send('ok'));

      const res1 = await request(app).get('/');
      const res2 = await request(app).get('/');
      const res3 = await request(app).get('/');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(429);
    });
  });

  describe('algorithm: token-bucket', () => {
    it('allows requests up to max and denies beyond', async () => {
      app = express();
      app.use(
        rateLimitExpress({
          max: 2,
          window: '1m',
          algorithm: 'token-bucket',
          keyGenerator: () => 'tb-key',
        }),
      );
      app.get('/', (_req, res) => res.send('ok'));

      const res1 = await request(app).get('/');
      const res2 = await request(app).get('/');
      const res3 = await request(app).get('/');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(429);
    });
  });
});
