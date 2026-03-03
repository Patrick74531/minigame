import { Context, Next } from 'hono';

/**
 * Attach a unique requestId to every request for tracing.
 * Stored in c.set('requestId', ...) and returned in response headers.
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  const id =
    c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', id);
  c.header('x-request-id', id);
  await next();
}
