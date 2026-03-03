import { Context, Next } from 'hono';

export async function structuredLogger(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const requestId: string = c.get('requestId') ?? '-';
  console.log(
    JSON.stringify({
      level: 'info',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: ms,
    }),
  );
}
