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
    | { type: 'subscription_result'; success: boolean }
    | { type: 'error'; message: string };

type BridgeListener = (event: RedditBridgeCallback) => void;

let _instance: RedditBridge | null = null;

export class RedditBridge {
    private _listeners: BridgeListener[] = [];
    private _isRedditEnvironment: boolean = false;
    private _username: string = 'Anonymous';
    private _isSubscribed: boolean = false;
    private _subredditName: string = '';
    private _boundHandler: ((ev: MessageEvent) => void) | null = null;

    private constructor() {
        this._isRedditEnvironment = this._detectRedditEnvironment();
        if (this._isRedditEnvironment) {
            this._bindMessageListener();
        }
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
        if (this._isRedditEnvironment) {
            this._sendToDevvit({ type: 'INIT' });
        } else {
            this._emit({
                type: 'error',
                message: 'Reddit bridge is unavailable outside Reddit/Devvit environment',
            });
        }
    }

    public submitScore(score: number, wave: number): void {
        if (this._isRedditEnvironment) {
            this._sendToDevvit({ type: 'SUBMIT_SCORE', payload: { score, wave } });
        } else {
            this._emit({
                type: 'error',
                message: 'SUBMIT_SCORE is unavailable outside Reddit/Devvit environment',
            });
        }
    }

    public requestLeaderboard(): void {
        if (this._isRedditEnvironment) {
            this._sendToDevvit({ type: 'GET_LEADERBOARD' });
        } else {
            this._emit({
                type: 'error',
                message: 'GET_LEADERBOARD is unavailable outside Reddit/Devvit environment',
            });
        }
    }

    public requestSubscribe(): void {
        if (this._isRedditEnvironment) {
            this._sendToDevvit({ type: 'SUBSCRIBE' });
        } else {
            this._emit({
                type: 'error',
                message: 'SUBSCRIBE is unavailable outside Reddit/Devvit environment',
            });
        }
    }

    public destroy(): void {
        if (this._boundHandler) {
            window.removeEventListener('message', this._boundHandler);
            this._boundHandler = null;
        }
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

    private _bindMessageListener(): void {
        this._boundHandler = (ev: MessageEvent) => {
            this._handleDevvitMessage(ev);
        };
        window.addEventListener('message', this._boundHandler);
    }

    private _handleDevvitMessage(ev: MessageEvent): void {
        if (!ev.data || typeof ev.data !== 'object') return;

        const msg = ev.data as { type: string; payload?: unknown };

        switch (msg.type) {
            case 'INIT_RESPONSE': {
                const p = msg.payload as {
                    username: string;
                    isSubscribed: boolean;
                    subredditName: string;
                    leaderboard: LeaderboardEntry[];
                };
                this._username = p.username ?? 'Anonymous';
                this._isSubscribed = !!p.isSubscribed;
                this._subredditName = p.subredditName ?? '';
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: this._isSubscribed,
                        subredditName: this._subredditName,
                        leaderboard: p.leaderboard ?? [],
                    },
                });
                break;
            }

            case 'LEADERBOARD_DATA': {
                const p = msg.payload as { entries: LeaderboardEntry[] };
                this._emit({ type: 'leaderboard', entries: p.entries ?? [] });
                break;
            }

            case 'SCORE_SUBMITTED': {
                const p = msg.payload as {
                    rank: number;
                    score: number;
                    isNewBest: boolean;
                };
                this._emit({
                    type: 'score_submitted',
                    rank: p.rank,
                    score: p.score,
                    isNewBest: p.isNewBest,
                });
                break;
            }

            case 'SUBSCRIPTION_RESULT': {
                const p = msg.payload as { success: boolean };
                this._isSubscribed = true;
                this._emit({ type: 'subscription_result', success: p.success });
                break;
            }

            case 'ERROR': {
                const p = msg.payload as { message: string };
                this._emit({ type: 'error', message: p.message });
                break;
            }
        }
    }

    private _sendToDevvit(message: unknown): void {
        if (!this._isRedditEnvironment) return;
        try {
            window.parent.postMessage(message, '*');
        } catch (e) {
            console.warn('[RedditBridge] postMessage failed', e);
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
