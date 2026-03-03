import { Hono } from 'hono';
import type { Env } from './config/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { structuredLogger } from './middleware/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { createTikTokRouter } from './router/tiktok';

type HonoEnv = { Bindings: Env; Variables: { requestId: string } };

const app = new Hono<HonoEnv>();

// ── Global middleware ──
app.use('*', requestIdMiddleware);
app.use('*', corsMiddleware);
app.use('*', structuredLogger);

// ── Error handler ──
app.onError(errorHandler);

// ── Health check ──
app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENV || 'dev', ts: new Date().toISOString() }),
);

// ── TikTok routes ──
app.route('/api/tiktok', createTikTokRouter());

// ── 404 fallback ──
app.notFound((c) => {
  const requestId: string = c.get('requestId') ?? 'unknown';
  return c.json({ code: 'NOT_FOUND', message: 'Route not found', requestId }, 404);
});

export default app;
