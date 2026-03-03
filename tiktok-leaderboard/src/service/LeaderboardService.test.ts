import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService } from './LeaderboardService';

// Minimal mocks
function mockPlayerRepo() {
  return {
    upsert: vi.fn().mockResolvedValue({
      id: 'tiktok:user1',
      platform: 'tiktok',
      platformUserId: 'user1',
      displayName: 'TestUser',
      avatarUrl: '',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }),
    findById: vi.fn().mockResolvedValue(null),
  };
}

function mockSeasonRepo() {
  return {
    getActiveSeason: vi.fn().mockResolvedValue({
      id: 'season_default',
      name: 'Default Season',
      startAt: '2024-01-01T00:00:00Z',
      endAt: '2099-12-31T23:59:59Z',
      status: 'active',
    }),
    findById: vi.fn(),
  };
}

function mockScoreRepo() {
  return {
    insertScore: vi.fn().mockResolvedValue(true),
    upsertBest: vi.fn().mockResolvedValue(undefined),
    getLeaderboard: vi.fn().mockResolvedValue([]),
    getPlayerRank: vi.fn().mockResolvedValue(null),
  };
}

function mockIdempotencyRepo() {
  return {
    tryAcquire: vi.fn().mockResolvedValue({ acquired: true }),
    storeResult: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(0),
  };
}

const identity = {
  platformUserId: 'user1',
  displayName: 'TestUser',
  avatarUrl: '',
};

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let playerRepo: ReturnType<typeof mockPlayerRepo>;
  let seasonRepo: ReturnType<typeof mockSeasonRepo>;
  let scoreRepo: ReturnType<typeof mockScoreRepo>;
  let idempotencyRepo: ReturnType<typeof mockIdempotencyRepo>;

  beforeEach(() => {
    playerRepo = mockPlayerRepo();
    seasonRepo = mockSeasonRepo();
    scoreRepo = mockScoreRepo();
    idempotencyRepo = mockIdempotencyRepo();
    service = new LeaderboardService(
      playerRepo as any,
      scoreRepo as any,
      seasonRepo as any,
      idempotencyRepo as any,
    );
  });

  it('init returns player info and season', async () => {
    const result = await service.init('tiktok', identity, 'req-1');
    expect(result.ok).toBe(true);
    expect(result.data.playerId).toBe('tiktok:user1');
    expect(result.data.seasonId).toBe('season_default');
    expect(playerRepo.upsert).toHaveBeenCalledOnce();
  });

  it('submitScore inserts score and updates best', async () => {
    const result = await service.submitScore(
      'tiktok',
      identity,
      { score: 1000, wave: 5, runId: 'run-abc' },
      'req-2',
    );
    expect(result.ok).toBe(true);
    expect(result.data.accepted).toBe(true);
    expect(scoreRepo.insertScore).toHaveBeenCalledOnce();
    expect(scoreRepo.upsertBest).toHaveBeenCalledOnce();
    expect(idempotencyRepo.storeResult).toHaveBeenCalledOnce();
  });

  it('submitScore rejects negative score', async () => {
    await expect(
      service.submitScore('tiktok', identity, { score: -1, wave: 0, runId: 'r1' }, 'req-3'),
    ).rejects.toThrow('Score must be between');
  });

  it('submitScore rejects duplicate runId via idempotency', async () => {
    idempotencyRepo.tryAcquire.mockResolvedValueOnce({
      acquired: false,
      cachedResult: undefined,
    });
    await expect(
      service.submitScore('tiktok', identity, { score: 10, wave: 1, runId: 'dup' }, 'req-4'),
    ).rejects.toThrow('Duplicate');
  });

  it('getLeaderboard returns entries', async () => {
    scoreRepo.getLeaderboard.mockResolvedValueOnce([
      { rank: 1, playerId: 'p1', displayName: 'A', avatarUrl: '', bestScore: 999, bestWave: 10 },
    ]);
    const result = await service.getLeaderboard(1, 'req-5');
    expect(result.ok).toBe(true);
    expect(result.data.entries).toHaveLength(1);
    expect(result.data.entries[0]!.bestScore).toBe(999);
  });

  it('getMyRank returns null for new player', async () => {
    const result = await service.getMyRank('tiktok', identity, 'req-6');
    expect(result.ok).toBe(true);
    expect(result.data.rank).toBeNull();
  });
});
