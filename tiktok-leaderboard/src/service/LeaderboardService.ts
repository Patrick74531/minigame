import { LEADERBOARD_PAGE_SIZE, MAX_SCORE, MAX_WAVE } from '../config/constants';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type { ApiResponse, LeaderboardEntry, PlayerRank } from '../domain/types';
import type { PlatformIdentity } from '../platform/identity';
import type { Platform } from '../domain/types';
import { IdempotencyRepository } from '../repository/IdempotencyRepository';
import { PlayerRepository } from '../repository/PlayerRepository';
import { ScoreRepository } from '../repository/ScoreRepository';
import { SeasonRepository } from '../repository/SeasonRepository';
import { DiamondRepository } from '../repository/DiamondRepository';

export interface SubmitScoreInput {
  score: number;
  wave: number;
  runId: string;
}

export class LeaderboardService {
  constructor(
    private playerRepo: PlayerRepository,
    private scoreRepo: ScoreRepository,
    private seasonRepo: SeasonRepository,
    private idempotencyRepo: IdempotencyRepository,
    private diamondRepo?: DiamondRepository,
  ) {}

  /**
   * Init: upsert player, return player info + active season + current rank.
   */
  async init(
    platform: Platform,
    identity: PlatformIdentity,
    requestId: string,
  ): Promise<ApiResponse<{
    playerId: string;
    displayName: string;
    seasonId: string;
    seasonName: string;
    rank: PlayerRank | null;
    leaderboard: LeaderboardEntry[];
    diamonds: number;
  }>> {
    const player = await this.playerRepo.upsert(
      platform,
      identity.platformUserId,
      identity.displayName,
      identity.avatarUrl,
    );

    const season = await this.seasonRepo.getActiveSeason();
    if (!season) {
      throw new NotFoundError('No active season found');
    }

    const rank = await this.scoreRepo.getPlayerRank(player.id, season.id);
    const leaderboard = await this.scoreRepo.getLeaderboard(season.id, 10, 0);
    const diamonds = this.diamondRepo ? await this.diamondRepo.getBalance(player.id) : 0;

    return {
      ok: true,
      data: {
        playerId: player.id,
        displayName: player.displayName,
        seasonId: season.id,
        seasonName: season.name,
        rank,
        leaderboard,
        diamonds,
      },
      requestId,
    };
  }

  /**
   * Submit a score with idempotency and basic validation.
   */
  async submitScore(
    platform: Platform,
    identity: PlatformIdentity,
    input: SubmitScoreInput,
    requestId: string,
  ): Promise<ApiResponse<{
    accepted: boolean;
    newBest: boolean;
    rank: PlayerRank | null;
  }>> {
    // Validate
    if (input.score < 0 || input.score > MAX_SCORE) {
      throw new ValidationError(`Score must be between 0 and ${MAX_SCORE}`);
    }
    if (input.wave < 0 || input.wave > MAX_WAVE) {
      throw new ValidationError(`Wave must be between 0 and ${MAX_WAVE}`);
    }
    if (!input.runId || input.runId.length > 128) {
      throw new ValidationError('runId is required and must be <= 128 chars');
    }

    // Idempotency check
    const idemKey = `submit:${input.runId}`;
    const idem = await this.idempotencyRepo.tryAcquire(idemKey, 'submit-score');
    if (!idem.acquired) {
      if (idem.cachedResult) {
        return JSON.parse(idem.cachedResult);
      }
      throw new ConflictError('Duplicate submission for this runId');
    }

    // Upsert player
    const player = await this.playerRepo.upsert(
      platform,
      identity.platformUserId,
      identity.displayName,
      identity.avatarUrl,
    );

    // Active season
    const season = await this.seasonRepo.getActiveSeason();
    if (!season) {
      throw new NotFoundError('No active season found');
    }

    // Get current best before insert
    const prevRank = await this.scoreRepo.getPlayerRank(player.id, season.id);
    const prevBest = prevRank?.bestScore ?? 0;

    // Insert score
    const scoreId = crypto.randomUUID();
    const inserted = await this.scoreRepo.insertScore(
      scoreId,
      player.id,
      season.id,
      input.score,
      input.wave,
      input.runId,
    );

    if (!inserted) {
      throw new ConflictError('Duplicate submission for this runId');
    }

    // Update personal best
    await this.scoreRepo.upsertBest(
      player.id,
      season.id,
      input.score,
      input.wave,
      input.runId,
    );

    const newBest = input.score > prevBest;
    const rank = await this.scoreRepo.getPlayerRank(player.id, season.id);

    const result: ApiResponse<{ accepted: boolean; newBest: boolean; rank: PlayerRank | null }> = {
      ok: true,
      data: { accepted: true, newBest, rank },
      requestId,
    };

    // Cache result for idempotency
    await this.idempotencyRepo.storeResult(idemKey, JSON.stringify(result));

    return result;
  }

  /**
   * Get leaderboard for the active season.
   */
  async getLeaderboard(
    page: number,
    requestId: string,
  ): Promise<ApiResponse<{
    seasonId: string;
    seasonName: string;
    entries: LeaderboardEntry[];
    page: number;
    pageSize: number;
  }>> {
    const season = await this.seasonRepo.getActiveSeason();
    if (!season) {
      throw new NotFoundError('No active season found');
    }

    const offset = (page - 1) * LEADERBOARD_PAGE_SIZE;
    const entries = await this.scoreRepo.getLeaderboard(
      season.id,
      LEADERBOARD_PAGE_SIZE,
      offset,
    );

    return {
      ok: true,
      data: {
        seasonId: season.id,
        seasonName: season.name,
        entries,
        page,
        pageSize: LEADERBOARD_PAGE_SIZE,
      },
      requestId,
    };
  }

  /**
   * Get a specific player's rank.
   */
  async getMyRank(
    platform: Platform,
    identity: PlatformIdentity,
    requestId: string,
  ): Promise<ApiResponse<{ rank: PlayerRank | null }>> {
    const playerId = `${platform}:${identity.platformUserId}`;

    const season = await this.seasonRepo.getActiveSeason();
    if (!season) {
      throw new NotFoundError('No active season found');
    }

    const rank = await this.scoreRepo.getPlayerRank(playerId, season.id);

    return {
      ok: true,
      data: { rank },
      requestId,
    };
  }
}
