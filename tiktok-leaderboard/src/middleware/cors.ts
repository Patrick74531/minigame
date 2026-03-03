import { Context, Next } from 'hono';
import { getAllowedOrigins, Env } from '../config/env';

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origins = getAllowedOrigins(c.env);
  const origin = c.req.header('origin') || '';

  const allowed =
    origins.includes('*') || origins.includes(origin);

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-TikTok-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (allowed) {
    c.header('Access-Control-Allow-Origin', origin || '*');
  }
}
