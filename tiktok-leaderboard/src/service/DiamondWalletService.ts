import { MAX_WAVE } from '../config/constants';
import { ValidationError } from '../domain/errors';
import type { ApiResponse, Platform } from '../domain/types';
import type { PlatformIdentity } from '../platform/identity';
import { DiamondRepository } from '../repository/DiamondRepository';
import { PlayerRepository } from '../repository/PlayerRepository';

export interface SettleRunInput {
  runId: string;
  wave: number;
}

export interface BuyItemInput {
  itemId: string;
}

export class DiamondWalletService {
  constructor(
    private playerRepo: PlayerRepository,
    private diamondRepo: DiamondRepository,
  ) {}

  async getBalance(
    platform: Platform,
    identity: PlatformIdentity,
    requestId: string,
  ): Promise<ApiResponse<{ balance: number }>> {
    const player = await this.playerRepo.upsert(
      platform,
      identity.platformUserId,
      identity.displayName,
      identity.avatarUrl,
    );
    const balance = await this.diamondRepo.getBalance(player.id);
    return { ok: true, data: { balance }, requestId };
  }

  async settleRun(
    platform: Platform,
    identity: PlatformIdentity,
    input: SettleRunInput,
    requestId: string,
  ): Promise<ApiResponse<{ earned: number; balance: number; duplicate: boolean }>> {
    if (!input.runId || typeof input.runId !== 'string' || input.runId.length > 128) {
      throw new ValidationError('Invalid runId');
    }
    if (!Number.isInteger(input.wave) || input.wave < 0 || input.wave > MAX_WAVE) {
      throw new ValidationError(`Wave must be integer between 0 and ${MAX_WAVE}`);
    }

    const player = await this.playerRepo.upsert(
      platform,
      identity.platformUserId,
      identity.displayName,
      identity.avatarUrl,
    );
    const result = await this.diamondRepo.settleRun(player.id, input.runId, input.wave);
    return { ok: true, data: result, requestId };
  }

  async buyItem(
    platform: Platform,
    identity: PlatformIdentity,
    input: BuyItemInput,
    requestId: string,
  ): Promise<ApiResponse<{ success: boolean; itemId: string; price: number; balance: number }>> {
    if (!input.itemId || typeof input.itemId !== 'string' || input.itemId.length > 128) {
      throw new ValidationError('Invalid itemId');
    }

    const player = await this.playerRepo.upsert(
      platform,
      identity.platformUserId,
      identity.displayName,
      identity.avatarUrl,
    );
    const result = await this.diamondRepo.buyItem(player.id, input.itemId);
    if (!result.success) {
      throw new ValidationError(result.error ?? 'Purchase failed');
    }

    return {
      ok: true,
      data: {
        success: true,
        itemId: input.itemId,
        price: result.price,
        balance: result.balance,
      },
      requestId,
    };
  }
}
