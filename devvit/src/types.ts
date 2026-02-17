export interface LeaderboardEntry {
    rank: number;
    username: string;
    score: number;
    wave: number;
}

export interface InitPayload {
    username: string;
    isSubscribed: boolean;
    subredditName: string;
    leaderboard: LeaderboardEntry[];
}

export interface LeaderboardPayload {
    entries: LeaderboardEntry[];
}

export interface ScoreSubmittedPayload {
    rank: number;
    score: number;
    isNewBest: boolean;
}

export type WebViewMessage =
    | { type: 'INIT' }
    | { type: 'SUBMIT_SCORE'; payload: { score: number; wave: number } }
    | { type: 'GET_LEADERBOARD' }
    | { type: 'SUBSCRIBE' };

export type DevvitMessage =
    | { type: 'INIT_RESPONSE'; payload: InitPayload }
    | { type: 'LEADERBOARD_DATA'; payload: LeaderboardPayload }
    | { type: 'SCORE_SUBMITTED'; payload: ScoreSubmittedPayload }
    | { type: 'SUBSCRIPTION_RESULT'; payload: { success: boolean } }
    | { type: 'ERROR'; payload: { message: string } };
