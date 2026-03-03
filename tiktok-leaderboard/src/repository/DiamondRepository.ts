import {
  DIAMOND_DAILY_CAP,
  DIAMOND_INITIAL_BALANCE,
  DIAMOND_ITEM_PRICE,
  DIAMOND_PER_WAVE,
} from '../config/constants';

export interface DiamondSettlementResult {
  earned: number;
  balance: number;
  duplicate: boolean;
}

export interface DiamondPurchaseResult {
  success: boolean;
  balance: number;
  price: number;
  error?: string;
}

export class DiamondRepository {
  constructor(private db: D1Database) {}

  async getBalance(playerId: string): Promise<number> {
    const existing = await this.db
      .prepare('SELECT balance FROM diamond_wallets WHERE player_id = ?1')
      .bind(playerId)
      .first<Record<string, unknown>>();

    if (existing) {
      return this.toInt(existing['balance']);
    }

    await this.db
      .prepare(
        `INSERT INTO diamond_wallets (player_id, balance, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(player_id) DO NOTHING`,
      )
      .bind(playerId, DIAMOND_INITIAL_BALANCE)
      .run();

    return DIAMOND_INITIAL_BALANCE;
  }

  async settleRun(playerId: string, runId: string, wave: number): Promise<DiamondSettlementResult> {
    const existing = await this.db
      .prepare(
        `SELECT earned, balance_after
         FROM diamond_settlements
         WHERE player_id = ?1 AND run_id = ?2`,
      )
      .bind(playerId, runId)
      .first<Record<string, unknown>>();

    if (existing) {
      return {
        earned: this.toInt(existing['earned']),
        balance: this.toInt(existing['balance_after']),
        duplicate: true,
      };
    }

    const today = this.todayKeyUtc();
    const dailyRow = await this.db
      .prepare(
        `SELECT earned
         FROM diamond_daily
         WHERE player_id = ?1 AND day_key = ?2`,
      )
      .bind(playerId, today)
      .first<Record<string, unknown>>();

    const dailyUsed = this.toInt(dailyRow?.['earned']);
    const targetEarned = Math.max(0, Math.floor(wave) * DIAMOND_PER_WAVE);
    const cappedEarned = Math.min(targetEarned, Math.max(0, DIAMOND_DAILY_CAP - dailyUsed));

    const currentBalance = await this.getBalance(playerId);
    const newBalance = currentBalance + cappedEarned;

    try {
      await this.db
        .prepare(
          `INSERT INTO diamond_settlements (player_id, run_id, wave, earned, balance_after, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`,
        )
        .bind(playerId, runId, Math.max(0, Math.floor(wave)), cappedEarned, newBalance)
        .run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE constraint failed')) {
        const settled = await this.db
          .prepare(
            `SELECT earned, balance_after
             FROM diamond_settlements
             WHERE player_id = ?1 AND run_id = ?2`,
          )
          .bind(playerId, runId)
          .first<Record<string, unknown>>();
        return {
          earned: this.toInt(settled?.['earned']),
          balance: settled ? this.toInt(settled?.['balance_after']) : currentBalance,
          duplicate: true,
        };
      }
      throw e;
    }

    await this.db
      .prepare(
        `INSERT INTO diamond_wallets (player_id, balance, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(player_id)
         DO UPDATE SET balance = ?2, updated_at = datetime('now')`,
      )
      .bind(playerId, newBalance)
      .run();

    await this.db
      .prepare(
        `INSERT INTO diamond_daily (player_id, day_key, earned, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(player_id, day_key)
         DO UPDATE SET earned = diamond_daily.earned + ?3, updated_at = datetime('now')`,
      )
      .bind(playerId, today, cappedEarned)
      .run();

    return {
      earned: cappedEarned,
      balance: newBalance,
      duplicate: false,
    };
  }

  async buyItem(playerId: string, itemId: string): Promise<DiamondPurchaseResult> {
    const currentBalance = await this.getBalance(playerId);
    if (currentBalance < DIAMOND_ITEM_PRICE) {
      return {
        success: false,
        balance: currentBalance,
        price: DIAMOND_ITEM_PRICE,
        error: 'Insufficient diamonds',
      };
    }

    const newBalance = currentBalance - DIAMOND_ITEM_PRICE;
    await this.db
      .prepare(
        `UPDATE diamond_wallets
         SET balance = ?2, updated_at = datetime('now')
         WHERE player_id = ?1`,
      )
      .bind(playerId, newBalance)
      .run();

    await this.db
      .prepare(
        `INSERT INTO diamond_purchases (id, player_id, item_id, price, balance_after, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`,
      )
      .bind(crypto.randomUUID(), playerId, itemId, DIAMOND_ITEM_PRICE, newBalance)
      .run();

    return {
      success: true,
      balance: newBalance,
      price: DIAMOND_ITEM_PRICE,
    };
  }

  private todayKeyUtc(): string {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  private toInt(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }
}
