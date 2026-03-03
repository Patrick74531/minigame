import type { Season } from '../domain/types';

export class SeasonRepository {
  constructor(private db: D1Database) {}

  async getActiveSeason(): Promise<Season | null> {
    const now = new Date().toISOString();
    const row = await this.db
      .prepare(
        `SELECT * FROM seasons
         WHERE status = 'active' AND start_at <= ?1 AND end_at >= ?1
         ORDER BY start_at DESC LIMIT 1`,
      )
      .bind(now)
      .first<Record<string, unknown>>();

    if (!row) return null;
    return this.toSeason(row);
  }

  async findById(id: string): Promise<Season | null> {
    const row = await this.db
      .prepare('SELECT * FROM seasons WHERE id = ?1')
      .bind(id)
      .first<Record<string, unknown>>();

    if (!row) return null;
    return this.toSeason(row);
  }

  private toSeason(row: Record<string, unknown>): Season {
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      startAt: row['start_at'] as string,
      endAt: row['end_at'] as string,
      status: row['status'] as Season['status'],
    };
  }
}
