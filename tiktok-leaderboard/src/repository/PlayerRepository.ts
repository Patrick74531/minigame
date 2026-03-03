import type { Platform, Player } from '../domain/types';

export class PlayerRepository {
  constructor(private db: D1Database) {}

  async upsert(
    platform: Platform,
    platformUserId: string,
    displayName: string,
    avatarUrl: string,
  ): Promise<Player> {
    const now = new Date().toISOString();
    const id = `${platform}:${platformUserId}`;

    await this.db
      .prepare(
        `INSERT INTO players (id, platform, platform_user_id, display_name, avatar_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT (platform, platform_user_id)
         DO UPDATE SET display_name = ?4, avatar_url = ?5, updated_at = ?6`,
      )
      .bind(id, platform, platformUserId, displayName, avatarUrl, now)
      .run();

    return {
      id,
      platform,
      platformUserId,
      displayName,
      avatarUrl,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findById(id: string): Promise<Player | null> {
    const row = await this.db
      .prepare('SELECT * FROM players WHERE id = ?1')
      .bind(id)
      .first<Record<string, unknown>>();

    if (!row) return null;
    return this.toPlayer(row);
  }

  private toPlayer(row: Record<string, unknown>): Player {
    return {
      id: row['id'] as string,
      platform: row['platform'] as Platform,
      platformUserId: row['platform_user_id'] as string,
      displayName: row['display_name'] as string,
      avatarUrl: row['avatar_url'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
}
