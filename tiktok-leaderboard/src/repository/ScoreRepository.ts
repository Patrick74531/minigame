import type { LeaderboardEntry, PlayerRank, Score } from '../domain/types';

export class ScoreRepository {
  constructor(private db: D1Database) {}

  /**
   * Insert a new score row. Returns false if run_id already exists (idempotent).
   */
  async insertScore(
    id: string,
    playerId: string,
    seasonId: string,
    score: number,
    wave: number,
    runId: string,
  ): Promise<boolean> {
    try {
      await this.db
        .prepare(
          `INSERT INTO scores (id, player_id, season_id, score, wave, run_id, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`,
        )
        .bind(id, playerId, seasonId, score, wave, runId)
        .run();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE constraint failed')) {
        return false; // idempotent — duplicate run_id
      }
      throw e;
    }
  }

  /**
   * Upsert the player's personal best for a season.
   */
  async upsertBest(
    playerId: string,
    seasonId: string,
    score: number,
    wave: number,
    runId: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO leaderboard_best (player_id, season_id, best_score, best_wave, best_run_id, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT (player_id, season_id)
         DO UPDATE SET
           best_score  = MAX(best_score, ?3),
           best_wave   = CASE WHEN ?3 > best_score THEN ?4 ELSE best_wave END,
           best_run_id = CASE WHEN ?3 > best_score THEN ?5 ELSE best_run_id END,
           updated_at  = datetime('now')`,
      )
      .bind(playerId, seasonId, score, wave, runId)
      .run();
  }

  /**
   * Get top N leaderboard entries for a season.
   */
  async getLeaderboard(
    seasonId: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardEntry[]> {
    const rows = await this.db
      .prepare(
        `SELECT
           lb.player_id,
           p.display_name,
           p.avatar_url,
           lb.best_score,
           lb.best_wave
         FROM leaderboard_best lb
         JOIN players p ON p.id = lb.player_id
         WHERE lb.season_id = ?1
         ORDER BY lb.best_score DESC
         LIMIT ?2 OFFSET ?3`,
      )
      .bind(seasonId, limit, offset)
      .all<Record<string, unknown>>();

    return (rows.results ?? []).map((row, i) => ({
      rank: offset + i + 1,
      playerId: row['player_id'] as string,
      displayName: row['display_name'] as string,
      avatarUrl: row['avatar_url'] as string,
      bestScore: row['best_score'] as number,
      bestWave: row['best_wave'] as number,
    }));
  }

  /**
   * Get a specific player's rank within a season.
   */
  async getPlayerRank(
    playerId: string,
    seasonId: string,
  ): Promise<PlayerRank | null> {
    const best = await this.db
      .prepare(
        `SELECT best_score, best_wave FROM leaderboard_best
         WHERE player_id = ?1 AND season_id = ?2`,
      )
      .bind(playerId, seasonId)
      .first<Record<string, unknown>>();

    if (!best) return null;

    const bestScore = best['best_score'] as number;
    const bestWave = best['best_wave'] as number;

    const rankRow = await this.db
      .prepare(
        `SELECT COUNT(*) as rank FROM leaderboard_best
         WHERE season_id = ?1 AND best_score > ?2`,
      )
      .bind(seasonId, bestScore)
      .first<Record<string, unknown>>();

    const totalRow = await this.db
      .prepare(
        `SELECT COUNT(*) as total FROM leaderboard_best
         WHERE season_id = ?1`,
      )
      .bind(seasonId)
      .first<Record<string, unknown>>();

    const rank = ((rankRow?.['rank'] as number) ?? 0) + 1;
    const totalPlayers = (totalRow?.['total'] as number) ?? 0;

    return { rank, bestScore, bestWave, totalPlayers };
  }
}
