export interface LeaderboardEntry {
    rank: number;
    username: string;
    score: number;
    wave: number;
}

export interface InitData {
    username: string;
    isSubscribed: boolean;
    subredditName: string;
    leaderboard: LeaderboardEntry[];
}

export type RedditBridgeCallback =
    | { type: 'init'; data: InitData }
    | { type: 'leaderboard'; entries: LeaderboardEntry[] }
    | { type: 'score_submitted'; rank: number; score: number; isNewBest: boolean }
    | { type: 'subscription_result'; success: boolean; alreadySubscribed: boolean }
    | { type: 'error'; message: string };

type BridgeListener = (event: RedditBridgeCallback) => void;

let _instance: RedditBridge | null = null;

export class RedditBridge {
    private _listeners: BridgeListener[] = [];
    private _isRedditEnvironment: boolean = false;
    private _username: string = 'Anonymous';
    private _isSubscribed: boolean = false;
    private _subredditName: string = '';

    private constructor() {
        this._isRedditEnvironment = this._detectRedditEnvironment();
    }

    public static get instance(): RedditBridge {
        if (!_instance) {
            _instance = new RedditBridge();
        }
        return _instance;
    }

    public get isRedditEnvironment(): boolean {
        return this._isRedditEnvironment;
    }

    public get username(): string {
        return this._username;
    }

    public get isSubscribed(): boolean {
        return this._isSubscribed;
    }

    public get subredditName(): string {
        return this._subredditName;
    }

    public addListener(listener: BridgeListener): void {
        this._listeners.push(listener);
    }

    public removeListener(listener: BridgeListener): void {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
    }

    public requestInit(): void {
        if (!this._isRedditEnvironment) {
            this._emit({ type: 'error', message: 'Reddit bridge is unavailable outside Devvit' });
            return;
        }
        fetch('/api/init')
            .then(r => r.json())
            .then((data: unknown) => {
                const d = data as {
                    username?: string;
                    isSubscribed?: boolean;
                    subredditName?: string;
                    leaderboard?: LeaderboardEntry[];
                };
                this._username = d.username ?? 'Anonymous';
                this._isSubscribed = !!d.isSubscribed;
                this._subredditName = d.subredditName ?? '';
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: this._isSubscribed,
                        subredditName: this._subredditName,
                        leaderboard: d.leaderboard ?? [],
                    },
                });
            })
            .catch((e: unknown) => {
                this._emit({ type: 'error', message: String(e) });
            });
    }

    public submitScore(score: number, wave: number): void {
        if (!this._isRedditEnvironment) {
            this._emit({ type: 'error', message: 'SUBMIT_SCORE unavailable outside Devvit' });
            return;
        }
        fetch('/api/submit-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score, wave }),
        })
            .then(r => r.json())
            .then((data: unknown) => {
                const d = data as { rank?: number; score?: number; isNewBest?: boolean };
                this._emit({
                    type: 'score_submitted',
                    rank: d.rank ?? 0,
                    score: d.score ?? score,
                    isNewBest: d.isNewBest ?? false,
                });
            })
            .catch((e: unknown) => {
                this._emit({ type: 'error', message: String(e) });
            });
    }

    public requestLeaderboard(): void {
        if (!this._isRedditEnvironment) {
            this._emit({ type: 'error', message: 'GET_LEADERBOARD unavailable outside Devvit' });
            return;
        }
        fetch('/api/leaderboard')
            .then(r => r.json())
            .then((data: unknown) => {
                const d = data as { entries?: LeaderboardEntry[] };
                this._emit({ type: 'leaderboard', entries: d.entries ?? [] });
            })
            .catch((e: unknown) => {
                this._emit({ type: 'error', message: String(e) });
            });
    }

    public requestSubscribe(): void {
        if (!this._isRedditEnvironment) {
            this._emit({ type: 'error', message: 'SUBSCRIBE unavailable outside Devvit' });
            return;
        }
        fetch('/api/subscribe', { method: 'POST' })
            .then(r => r.json())
            .then((data: unknown) => {
                const d = data as { success?: boolean };
                this._isSubscribed = true;
                this._emit({
                    type: 'subscription_result',
                    success: d.success ?? true,
                    alreadySubscribed: false,
                });
            })
            .catch((e: unknown) => {
                this._emit({ type: 'error', message: String(e) });
            });
    }

    public destroy(): void {
        this._listeners = [];
        _instance = null;
    }

    private _detectRedditEnvironment(): boolean {
        if (typeof window === 'undefined') return false;
        try {
            const host = window.location.hostname.toLowerCase();
            const embedded = window.self !== window.top;
            const isLocalHost =
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host.endsWith('.local') ||
                host === '';
            return (
                (embedded && !isLocalHost) ||
                host.includes('reddit.com') ||
                (window as unknown as Record<string, unknown>)['__devvit__'] !== undefined
            );
        } catch {
            return true;
        }
    }

    private _emit(event: RedditBridgeCallback): void {
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch (e) {
                console.warn('[RedditBridge] listener error', e);
            }
        }
    }
}
