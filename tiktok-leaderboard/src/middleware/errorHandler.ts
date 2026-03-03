import { Context } from 'hono';
import { AppError } from '../domain/errors';
import type { ApiErrorBody } from '../domain/types';

export function errorHandler(err: Error, c: Context): Response {
  const requestId: string = c.get('requestId') ?? 'unknown';

  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      code: err.code,
      message: err.message,
      requestId,
    };
    console.error(JSON.stringify({ level: 'warn', requestId, code: err.code, message: err.message }));
    return c.json(body, err.status as 400);
  }

  console.error(JSON.stringify({
    level: 'error',
    requestId,
    message: err.message,
    stack: err.stack,
  }));

  const body: ApiErrorBody = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    requestId,
  };
  return c.json(body, 500);
}
