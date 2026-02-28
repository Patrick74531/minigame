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
    diamonds: number;
}

export type RedditBridgeCallback =
    | { type: 'init'; data: InitData }
    | { type: 'leaderboard'; entries: LeaderboardEntry[] }
    | { type: 'score_submitted'; rank: number; score: number; isNewBest: boolean }
    | {
          type: 'subscription_result';
          success: boolean;
          alreadySubscribed: boolean;
          diamondsGranted: number;
          newBalance: number;
      }
    | { type: 'error'; message: string };

type BridgeListener = (event: RedditBridgeCallback) => void;

let _instance: RedditBridge | null = null;

export class RedditBridge {
    private static readonly API_TIMEOUT_MS = 8000;
    private _listeners: BridgeListener[] = [];
    private _isRedditEnvironment: boolean = false;
    private _username: string = 'Anonymous';
    private _isSubscribed: boolean = false;
    private _subredditName: string = '';
    private _cachedLeaderboard: LeaderboardEntry[] = [];
    private _submitInFlight: boolean = false;
    private _leaderboardInFlight: boolean = false;

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
        // Always attempt — mobile Devvit WebView may have hostname='localhost'
        // (Devvit's embedded HTTP server) which static detection misclassifies as dev.
        // Confirm the environment on first successful response instead.
        this._fetchJson('/api/init', { bustCache: true })
            .then((data: unknown) => {
                this._isRedditEnvironment = true;
                const d = data as {
                    username?: string;
                    isSubscribed?: boolean;
                    subredditName?: string;
                    leaderboard?: LeaderboardEntry[];
                    diamonds?: number;
                };
                this._username = d.username ?? 'Anonymous';
                this._isSubscribed = !!d.isSubscribed;
                this._subredditName = d.subredditName ?? '';
                this._cachedLeaderboard = d.leaderboard ?? [];
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: this._isSubscribed,
                        subredditName: this._subredditName,
                        leaderboard: d.leaderboard ?? [],
                        diamonds: d.diamonds ?? 0,
                    },
                });
            })
            .catch((e: unknown) => {
                this._emit({ type: 'error', message: String(e) });
            });
    }

    public submitScore(score: number, wave: number): void {
        // Concurrent protection: drop duplicate calls while one is in-flight
        if (this._submitInFlight) {
            console.warn('[RedditBridge] submitScore skipped — request already in flight');
            return;
        }
        this._submitInFlight = true;

        // Always attempt — by game-over time, requestInit has confirmed the environment.
        // On non-Devvit environments fetch will fail and be caught gracefully.
        this._fetchJson('/api/submit-score', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score, wave }),
        })
            .then((data: unknown) => {
                const d = data as {
                    rank?: number;
                    score?: number;
                    isNewBest?: boolean;
                    leaderboard?: LeaderboardEntry[];
                };
                if (Array.isArray(d.leaderboard)) {
                    this._cachedLeaderboard = d.leaderboard;
                    this._emit({ type: 'leaderboard', entries: d.leaderboard });
                } else {
                    this.requestLeaderboard();
                }
                this._emit({
                    type: 'score_submitted',
                    rank: d.rank ?? 0,
                    score: d.score ?? score,
                    isNewBest: d.isNewBest ?? false,
                });
            })
            .catch((e: unknown) => {
                console.warn('[RedditBridge] submitScore failed:', e);
                this._emit({ type: 'error', message: String(e) });
            })
            .finally(() => {
                this._submitInFlight = false;
            });
    }

    public requestLeaderboard(): void {
        // Dedup: skip if already loading
        if (this._leaderboardInFlight) return;
        this._leaderboardInFlight = true;

        // Always attempt — same reason as requestInit: mobile may have hostname='localhost'
        // causing _isRedditEnvironment=false even though the server is reachable.
        // Fall back to cache only if the fetch actually fails.
        this._fetchJson('/api/leaderboard', { bustCache: true })
            .then((data: unknown) => {
                const d = data as { entries?: LeaderboardEntry[] };
                const entries = d.entries ?? [];
                this._cachedLeaderboard = entries;
                this._emit({ type: 'leaderboard', entries });
            })
            .catch(() => {
                // Graceful degradation: emit cached data so UI never stays on "loading"
                this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
            })
            .finally(() => {
                this._leaderboardInFlight = false;
            });
    }

    public get cachedLeaderboard(): LeaderboardEntry[] {
        return this._cachedLeaderboard;
    }

    public requestSubscribe(): void {
        if (!this._isRedditEnvironment) {
            this._emit({ type: 'error', message: 'SUBSCRIBE unavailable outside Devvit' });
            return;
        }
        this._fetchJson('/api/subscribe', { method: 'POST' })
            .then((data: unknown) => {
                const d = data as {
                    success?: boolean;
                    alreadySubscribed?: boolean;
                    diamondsGranted?: number;
                    newBalance?: number;
                };
                this._isSubscribed = true;
                this._emit({
                    type: 'subscription_result',
                    success: d.success ?? true,
                    alreadySubscribed: d.alreadySubscribed ?? false,
                    diamondsGranted: d.diamondsGranted ?? 0,
                    newBalance: d.newBalance ?? 0,
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
            // Only treat explicit local dev servers as non-Reddit.
            // Empty hostname (mobile WebView / file:// / devvit WebView) is NOT localhost.
            const isLocalHost =
                host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
            return (
                (embedded && !isLocalHost) ||
                host === '' ||
                host.includes('reddit.com') ||
                host.includes('redd.it') ||
                (window as unknown as Record<string, unknown>)['__devvit__'] !== undefined
            );
        } catch {
            return true;
        }
    }

    private _fetchJson(
        path: string,
        init: RequestInit = {},
        options: { bustCache?: boolean } = {}
    ): Promise<unknown> {
        const url = options.bustCache ? this._withCacheBust(path) : path;
        const headers = new Headers(init.headers ?? undefined);
        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
            ? globalThis.setTimeout(() => controller.abort(), RedditBridge.API_TIMEOUT_MS)
            : 0;

        return fetch(url, {
            ...init,
            headers,
            credentials: 'include',
            cache: 'no-store',
            signal: controller?.signal,
        })
            .then(r => {
                if (!r.ok) {
                    throw new Error(`HTTP ${r.status} ${r.statusText}`);
                }
                return r.json() as Promise<unknown>;
            })
            .finally(() => {
                if (timeoutId) {
                    globalThis.clearTimeout(timeoutId);
                }
            });
    }

    private _withCacheBust(path: string): string {
        const divider = path.includes('?') ? '&' : '?';
        return `${path}${divider}_ts=${Date.now()}`;
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
