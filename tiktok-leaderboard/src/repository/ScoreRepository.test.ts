import { describe, it, expect, vi } from 'vitest';
import { ScoreRepository } from './ScoreRepository';

/**
 * Lightweight unit test for ScoreRepository using a mock D1Database.
 * Verifies SQL delegation patterns without an actual database.
 */
function createMockDb() {
  const first = vi.fn().mockResolvedValue(null);
  const all = vi.fn().mockResolvedValue({ results: [] });
  const run = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
  const bind = vi.fn().mockReturnValue({ first, all, run });
  const prepare = vi.fn().mockReturnValue({ bind });

  return { prepare, bind, first, all, run } as any;
}

describe('ScoreRepository', () => {
  it('insertScore calls prepare + bind + run with correct params', async () => {
    const db = createMockDb();
    const repo = new ScoreRepository(db);

    await repo.insertScore('id-1', 'player-1', 'season-1', 500, 3, 'run-1');

    expect(db.prepare).toHaveBeenCalledOnce();
    expect(db.bind).toHaveBeenCalledWith('id-1', 'player-1', 'season-1', 500, 3, 'run-1');
    expect(db.run).toHaveBeenCalledOnce();
  });

  it('insertScore returns false on UNIQUE constraint failure', async () => {
    const db = createMockDb();
    db.run.mockRejectedValueOnce(new Error('UNIQUE constraint failed: scores.run_id'));
    const repo = new ScoreRepository(db);

    const result = await repo.insertScore('id-2', 'p-2', 's-1', 100, 1, 'dup-run');
    expect(result).toBe(false);
  });

  it('getLeaderboard returns mapped entries', async () => {
    const db = createMockDb();
    db.all.mockResolvedValueOnce({
      results: [
        { player_id: 'p1', display_name: 'Alice', avatar_url: '', best_score: 999, best_wave: 10 },
        { player_id: 'p2', display_name: 'Bob', avatar_url: '', best_score: 500, best_wave: 5 },
      ],
    });
    const repo = new ScoreRepository(db);

    const entries = await repo.getLeaderboard('season-1', 50, 0);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.rank).toBe(1);
    expect(entries[0]!.displayName).toBe('Alice');
    expect(entries[1]!.rank).toBe(2);
    expect(entries[1]!.bestScore).toBe(500);
  });

  it('getPlayerRank returns null when no best exists', async () => {
    const db = createMockDb();
    const repo = new ScoreRepository(db);

    const rank = await repo.getPlayerRank('p-unknown', 'season-1');
    expect(rank).toBeNull();
  });
});
