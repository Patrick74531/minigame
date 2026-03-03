/** Supported platforms — extend this union for new platforms */
export type Platform = 'tiktok' | 'douyin' | 'web';

export interface Player {
  id: string;
  platform: Platform;
  platformUserId: string;
  displayName: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface Score {
  id: string;
  playerId: string;
  seasonId: string;
  score: number;
  wave: number;
  runId: string;
  createdAt: string;
}

export interface Season {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  status: 'active' | 'upcoming' | 'archived';
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  avatarUrl: string;
  bestScore: number;
  bestWave: number;
}

export interface PlayerRank {
  rank: number;
  bestScore: number;
  bestWave: number;
  totalPlayers: number;
}

/** Standardised API error response */
export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
}

/** Standardised API success envelope */
export interface ApiResponse<T> {
  ok: true;
  data: T;
  requestId: string;
}
