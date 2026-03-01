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

export type SocialBridgeCallback = RedditBridgeCallback;
export type RuntimePlatform = 'reddit' | 'tiktok';

export interface SocialBridge {
    readonly platform: RuntimePlatform;
    readonly supportsSubscribe: boolean;
    readonly cachedLeaderboard: LeaderboardEntry[];

    addListener(listener: BridgeListener): void;
    removeListener(listener: BridgeListener): void;
    requestInit(): void;
    submitScore(score: number, wave: number): void;
    requestLeaderboard(): void;
    requestSubscribe(): void;
}

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
        this._fetchJson('/api/init', {}, { bustCache: true })
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
        this._fetchJson('/api/leaderboard', {}, { bustCache: true })
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

interface TikTokLocalLeaderboardEntry {
    username: string;
    score: number;
    wave: number;
}

class TikTokBridge implements SocialBridge {
    private static readonly API_TIMEOUT_MS = 8000;
    private static readonly STORAGE_LEADERBOARD_KEY = 'gvr.tiktok.leaderboard.v1';
    private static readonly STORAGE_USERNAME_KEY = 'gvr.tiktok.username';

    public readonly platform: RuntimePlatform = 'tiktok';
    public readonly supportsSubscribe: boolean = false;

    private _listeners: BridgeListener[] = [];
    private _cachedLeaderboard: LeaderboardEntry[] = [];
    private _username: string = 'TikTokPlayer';
    private _submitInFlight: boolean = false;
    private _leaderboardInFlight: boolean = false;

    public get cachedLeaderboard(): LeaderboardEntry[] {
        return this._cachedLeaderboard;
    }

    public addListener(listener: BridgeListener): void {
        this._listeners.push(listener);
    }

    public removeListener(listener: BridgeListener): void {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
    }

    public requestInit(): void {
        const injectedName = this._readInjectedTikTokName();
        if (injectedName) {
            this._username = injectedName;
            this._saveLocalUsername(injectedName);
        } else {
            this._username = this._loadLocalUsername() ?? this._username;
        }

        this._fetchJson(this._withApiBase('/init'), {}, { bustCache: true })
            .then((data: unknown) => {
                const d = data as {
                    username?: string;
                    leaderboard?: LeaderboardEntry[];
                    diamonds?: number;
                };
                if (d.username) {
                    this._username = d.username;
                    this._saveLocalUsername(d.username);
                }
                this._cachedLeaderboard = Array.isArray(d.leaderboard)
                    ? d.leaderboard
                    : this._loadLocalLeaderboard();
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: false,
                        subredditName: 'tiktok',
                        leaderboard: this._cachedLeaderboard,
                        diamonds: d.diamonds ?? 0,
                    },
                });
            })
            .catch(() => {
                this._cachedLeaderboard = this._loadLocalLeaderboard();
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: false,
                        subredditName: 'tiktok',
                        leaderboard: this._cachedLeaderboard,
                        diamonds: 0,
                    },
                });
            });
    }

    public submitScore(score: number, wave: number): void {
        if (this._submitInFlight) return;
        this._submitInFlight = true;

        this._fetchJson(this._withApiBase('/submit-score'), {
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
                    this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
                } else {
                    const localResult = this._submitLocalScore(score, wave);
                    this._cachedLeaderboard = localResult.entries;
                    this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
                }
                this._emit({
                    type: 'score_submitted',
                    rank: d.rank ?? 0,
                    score: d.score ?? score,
                    isNewBest: d.isNewBest ?? false,
                });
            })
            .catch(() => {
                const localResult = this._submitLocalScore(score, wave);
                this._cachedLeaderboard = localResult.entries;
                this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
                this._emit({
                    type: 'score_submitted',
                    rank: localResult.rank,
                    score,
                    isNewBest: localResult.isNewBest,
                });
            })
            .finally(() => {
                this._submitInFlight = false;
            });
    }

    public requestLeaderboard(): void {
        if (this._leaderboardInFlight) return;
        this._leaderboardInFlight = true;

        this._fetchJson(this._withApiBase('/leaderboard'), {}, { bustCache: true })
            .then((data: unknown) => {
                const d = data as { entries?: LeaderboardEntry[] };
                if (Array.isArray(d.entries)) {
                    this._cachedLeaderboard = d.entries;
                } else {
                    this._cachedLeaderboard = this._loadLocalLeaderboard();
                }
                this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
            })
            .catch(() => {
                this._cachedLeaderboard = this._loadLocalLeaderboard();
                this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
            })
            .finally(() => {
                this._leaderboardInFlight = false;
            });
    }

    public requestSubscribe(): void {
        this._emit({ type: 'error', message: 'SUBSCRIBE unavailable on TikTok bridge' });
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
            ? globalThis.setTimeout(() => controller.abort(), TikTokBridge.API_TIMEOUT_MS)
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
                if (timeoutId) globalThis.clearTimeout(timeoutId);
            });
    }

    private _withApiBase(path: string): string {
        if (typeof window === 'undefined') return path;
        const w = window as unknown as Record<string, unknown>;
        const baseValue = w['__GVR_TIKTOK_API_BASE__'];
        const base = typeof baseValue === 'string' ? baseValue : '/api/tiktok';
        const normalizedBase = base.replace(/\/+$/, '');
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        if (!normalizedBase) return normalizedPath;
        return `${normalizedBase}${normalizedPath}`;
    }

    private _withCacheBust(path: string): string {
        const divider = path.includes('?') ? '&' : '?';
        return `${path}${divider}_ts=${Date.now()}`;
    }

    private _readInjectedTikTokName(): string | null {
        if (typeof window === 'undefined') return null;
        const w = window as unknown as Record<string, unknown>;
        const key = w['__GVR_TIKTOK_USERNAME__'];
        if (typeof key === 'string' && key.trim()) return key.trim();
        return null;
    }

    private _loadLocalLeaderboard(): LeaderboardEntry[] {
        try {
            const raw = localStorage.getItem(TikTokBridge.STORAGE_LEADERBOARD_KEY);
            if (!raw) return [];
            const list = JSON.parse(raw) as TikTokLocalLeaderboardEntry[];
            if (!Array.isArray(list)) return [];
            const clean = list
                .filter(
                    item =>
                        item &&
                        typeof item.username === 'string' &&
                        typeof item.score === 'number' &&
                        typeof item.wave === 'number'
                )
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (b.wave !== a.wave) return b.wave - a.wave;
                    return a.username.localeCompare(b.username);
                })
                .slice(0, 50);
            return clean.slice(0, 10).map((entry, index) => ({
                rank: index + 1,
                username: entry.username,
                score: entry.score,
                wave: entry.wave,
            }));
        } catch {
            return [];
        }
    }

    private _saveLocalLeaderboard(list: TikTokLocalLeaderboardEntry[]): void {
        try {
            localStorage.setItem(TikTokBridge.STORAGE_LEADERBOARD_KEY, JSON.stringify(list));
        } catch {
            // ignore
        }
    }

    private _loadLocalUsername(): string | null {
        try {
            const raw = localStorage.getItem(TikTokBridge.STORAGE_USERNAME_KEY);
            if (!raw) return null;
            const trimmed = raw.trim();
            return trimmed ? trimmed : null;
        } catch {
            return null;
        }
    }

    private _saveLocalUsername(name: string): void {
        try {
            localStorage.setItem(TikTokBridge.STORAGE_USERNAME_KEY, name);
        } catch {
            // ignore
        }
    }

    private _submitLocalScore(
        score: number,
        wave: number
    ): { entries: LeaderboardEntry[]; rank: number; isNewBest: boolean } {
        const username = this._username || 'TikTokPlayer';
        const currentRaw = this._loadLocalLeaderboardRaw();
        let current = currentRaw.slice(0);

        const existingIndex = current.findIndex(item => item.username === username);
        const previousBest = existingIndex >= 0 ? current[existingIndex].score : -1;
        const isNewBest = score > previousBest;

        if (existingIndex >= 0) {
            const existing = current[existingIndex];
            if (score > existing.score) {
                current[existingIndex] = { username, score, wave };
            } else if (score === existing.score && wave > existing.wave) {
                current[existingIndex] = { username, score, wave };
            }
        } else {
            current.push({ username, score, wave });
        }

        current = current
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.wave !== a.wave) return b.wave - a.wave;
                return a.username.localeCompare(b.username);
            })
            .slice(0, 50);
        this._saveLocalLeaderboard(current);

        const topEntries = current.slice(0, 10).map((entry, index) => ({
            rank: index + 1,
            username: entry.username,
            score: entry.score,
            wave: entry.wave,
        }));
        const rank = current.findIndex(item => item.username === username) + 1;
        return { entries: topEntries, rank: Math.max(rank, 0), isNewBest };
    }

    private _loadLocalLeaderboardRaw(): TikTokLocalLeaderboardEntry[] {
        try {
            const raw = localStorage.getItem(TikTokBridge.STORAGE_LEADERBOARD_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as TikTokLocalLeaderboardEntry[];
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(
                item =>
                    item &&
                    typeof item.username === 'string' &&
                    typeof item.score === 'number' &&
                    typeof item.wave === 'number'
            );
        } catch {
            return [];
        }
    }

    private _emit(event: RedditBridgeCallback): void {
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch (e) {
                console.warn('[TikTokBridge] listener error', e);
            }
        }
    }
}

class RedditBridgeAdapter implements SocialBridge {
    public readonly platform: RuntimePlatform = 'reddit';
    public readonly supportsSubscribe: boolean = true;

    public get cachedLeaderboard(): LeaderboardEntry[] {
        return RedditBridge.instance.cachedLeaderboard;
    }

    public addListener(listener: BridgeListener): void {
        RedditBridge.instance.addListener(listener);
    }

    public removeListener(listener: BridgeListener): void {
        RedditBridge.instance.removeListener(listener);
    }

    public requestInit(): void {
        RedditBridge.instance.requestInit();
    }

    public submitScore(score: number, wave: number): void {
        RedditBridge.instance.submitScore(score, wave);
    }

    public requestLeaderboard(): void {
        RedditBridge.instance.requestLeaderboard();
    }

    public requestSubscribe(): void {
        RedditBridge.instance.requestSubscribe();
    }
}

let _socialBridgeInstance: SocialBridge | null = null;

export function detectRuntimePlatform(): RuntimePlatform {
    if (typeof window === 'undefined') return 'reddit';

    try {
        const w = window as unknown as Record<string, unknown>;
        const forced = w['__GVR_PLATFORM__'];
        if (forced === 'tiktok' || forced === 'reddit') {
            return forced;
        }

        const queryPlatform = new URLSearchParams(window.location.search).get('platform');
        if (queryPlatform === 'tiktok' || queryPlatform === 'reddit') {
            return queryPlatform;
        }

        const host = window.location.hostname.toLowerCase();
        if (
            w['__devvit__'] !== undefined ||
            host === '' ||
            host.includes('reddit.com') ||
            host.includes('redd.it')
        ) {
            return 'reddit';
        }
    } catch {
        // keep fallback
    }

    return 'reddit';
}

export function getSocialBridge(): SocialBridge {
    if (_socialBridgeInstance) return _socialBridgeInstance;

    const platform = detectRuntimePlatform();
    _socialBridgeInstance = platform === 'reddit' ? new RedditBridgeAdapter() : new TikTokBridge();
    return _socialBridgeInstance;
}
