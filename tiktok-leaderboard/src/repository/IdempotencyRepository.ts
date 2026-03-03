import { IDEMPOTENCY_TTL_SECONDS } from '../config/constants';

export class IdempotencyRepository {
  constructor(private db: D1Database) {}

  /**
   * Try to acquire an idempotency lock for the given key+scope.
   * Returns { acquired: true } if this is the first call,
   * or { acquired: false, cachedResult } if a previous result exists.
   */
  async tryAcquire(
    key: string,
    scope: string,
  ): Promise<{ acquired: boolean; cachedResult?: string }> {
    const expiresAt = new Date(
      Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000,
    ).toISOString();

    try {
      await this.db
        .prepare(
          `INSERT INTO idempotency_keys (key, scope, result, created_at, expires_at)
           VALUES (?1, ?2, '', datetime('now'), ?3)`,
        )
        .bind(key, scope, expiresAt)
        .run();
      return { acquired: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE constraint failed')) {
        const existing = await this.db
          .prepare('SELECT result FROM idempotency_keys WHERE key = ?1')
          .bind(key)
          .first<Record<string, unknown>>();
        return {
          acquired: false,
          cachedResult: (existing?.['result'] as string) || undefined,
        };
      }
      throw e;
    }
  }

  /**
   * Store the result for a previously acquired idempotency key.
   */
  async storeResult(key: string, result: string): Promise<void> {
    await this.db
      .prepare('UPDATE idempotency_keys SET result = ?1 WHERE key = ?2')
      .bind(result, key)
      .run();
  }

  /**
   * Clean up expired idempotency keys. Call periodically.
   */
  async cleanup(): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare('DELETE FROM idempotency_keys WHERE expires_at < ?1')
      .bind(now)
      .run();
    return result.meta?.changes ?? 0;
  }
}
