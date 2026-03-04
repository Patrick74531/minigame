import type {
    LeaderboardEntry,
    RedditBridgeCallback,
    RuntimePlatform,
    SocialBridge,
} from './RedditBridge';

type BridgeListener = (event: RedditBridgeCallback) => void;

interface TikTokLocalLeaderboardEntry {
    username: string;
    score: number;
    wave: number;
}

export class TikTokBridge implements SocialBridge {
    private static readonly API_TIMEOUT_MS = 8000;
    private static readonly DEFAULT_API_BASE =
        'https://tiktok-leaderboard-prod.mineskystudio.workers.dev/api/tiktok';
    private static readonly STORAGE_LEADERBOARD_KEY = 'gvr.tiktok.leaderboard.v1';
    private static readonly STORAGE_USERNAME_KEY = 'gvr.tiktok.username';
    private static readonly STORAGE_DIAMONDS_KEY = 'gvr.tiktok.diamonds.v1';

    public readonly platform: RuntimePlatform = 'tiktok';
    public readonly supportsSubscribe: boolean = false;

    private _listeners: BridgeListener[] = [];
    private _cachedLeaderboard: LeaderboardEntry[] = [];
    private _username: string = 'TikTokPlayer';
    private _submitInFlight: boolean = false;
    private _leaderboardInFlight: boolean = false;
    private _identityListenerBound: boolean = false;
    private _lastIdentityToken: string = '';

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
        this._ensureIdentityReadyListener();

        const injectedName = this._readInjectedTikTokName();
        if (injectedName) {
            this._username = injectedName;
            this._saveLocalUsername(injectedName);
        } else {
            this._username = this._loadLocalUsername() ?? this._username;
        }
        this._lastIdentityToken = this._readInjectedTikTokToken() ?? '';

        this._fetchJson(this._withApiBase('/init'), {}, { bustCache: true })
            .then((data: unknown) => {
                const d = this._unwrapApiData(data);
                const username = this._extractString(d, ['username', 'displayName']);
                if (username) {
                    this._username = username;
                    this._saveLocalUsername(username);
                }

                const normalizedEntries = this._normalizeLeaderboardEntries(
                    d['leaderboard'] ?? d['entries']
                );
                this._cachedLeaderboard = normalizedEntries ?? this._loadLocalLeaderboard();

                const diamonds = this._extractNumber(d, ['diamonds', 'balance']) ?? 0;
                this._saveLocalDiamonds(diamonds);
                console.log(
                    `[TikTokBridge] init ok username=${this._username} diamonds=${diamonds} entries=${this._cachedLeaderboard.length}`
                );
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: false,
                        subredditName: 'tiktok',
                        leaderboard: this._cachedLeaderboard,
                        diamonds,
                    },
                });
                this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
            })
            .catch((e: unknown) => {
                console.warn('[TikTokBridge] requestInit failed:', e);
                this._cachedLeaderboard = this._loadLocalLeaderboard();
                this._emit({
                    type: 'init',
                    data: {
                        username: this._username,
                        isSubscribed: false,
                        subredditName: 'tiktok',
                        leaderboard: this._cachedLeaderboard,
                        diamonds: this._loadLocalDiamonds(),
                    },
                });
                this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
            });
    }

    public submitScore(score: number, wave: number): void {
        if (this._submitInFlight) return;
        this._submitInFlight = true;
        const runId = this._generateRunId();

        this._fetchJson(this._withApiBase('/submit-score'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score, wave, runId }),
        })
            .then((data: unknown) => {
                const d = this._unwrapApiData(data);
                const normalizedEntries = this._normalizeLeaderboardEntries(
                    d['leaderboard'] ?? d['entries']
                );
                if (normalizedEntries) {
                    this._cachedLeaderboard = normalizedEntries;
                    this._emit({ type: 'leaderboard', entries: this._cachedLeaderboard });
                } else {
                    // Cloud response may omit full leaderboard; fetch it explicitly.
                    this.requestLeaderboard();
                }

                const rankRaw = d['rank'];
                const rank =
                    typeof rankRaw === 'number'
                        ? rankRaw
                        : typeof rankRaw === 'object' &&
                            rankRaw !== null &&
                            typeof (rankRaw as Record<string, unknown>)['rank'] === 'number'
                          ? ((rankRaw as Record<string, unknown>)['rank'] as number)
                          : 0;
                const apiScore = this._extractNumber(d, ['score']);
                const isNewBest = this._extractBoolean(d, ['isNewBest', 'newBest']) ?? false;
                console.log(
                    `[TikTokBridge] submit ok rank=${rank} score=${apiScore ?? score} isNewBest=${isNewBest}`
                );
                this._emit({
                    type: 'score_submitted',
                    rank,
                    score: apiScore ?? score,
                    isNewBest,
                });
            })
            .catch((e: unknown) => {
                console.warn('[TikTokBridge] submitScore failed:', e);
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
                const d = this._unwrapApiData(data);
                const normalizedEntries = this._normalizeLeaderboardEntries(
                    d['entries'] ?? d['leaderboard']
                );
                if (normalizedEntries) {
                    this._cachedLeaderboard = normalizedEntries;
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
        this._applyTikTokAuthHeaders(headers);
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
            ? globalThis.setTimeout(() => controller.abort(), TikTokBridge.API_TIMEOUT_MS)
            : 0;

        return fetch(url, {
            ...init,
            headers,
            credentials: 'omit',
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
        const baseValue = this._readRuntimeString('__GVR_TIKTOK_API_BASE__');
        const base =
            typeof baseValue === 'string' && baseValue.trim()
                ? baseValue.trim()
                : TikTokBridge.DEFAULT_API_BASE;
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
        return this._readRuntimeString('__GVR_TIKTOK_USERNAME__');
    }

    private _readInjectedTikTokUserId(): string | null {
        return this._readRuntimeString('__GVR_TIKTOK_USER_ID__');
    }

    private _readInjectedTikTokToken(): string | null {
        return this._readRuntimeString('__GVR_TIKTOK_TOKEN__');
    }

    private _readRuntimeString(key: string): string | null {
        try {
            const g = globalThis as unknown as Record<string, unknown>;
            const gv = g[key];
            if (typeof gv === 'string' && gv.trim()) return gv.trim();
        } catch {
            // continue
        }

        if (typeof window !== 'undefined') {
            const w = window as unknown as Record<string, unknown>;
            const wv = w[key];
            if (typeof wv === 'string' && wv.trim()) return wv.trim();
        }

        return null;
    }

    private _ensureIdentityReadyListener(): void {
        if (this._identityListenerBound) return;
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        this._identityListenerBound = true;
        window.addEventListener('gvr:tiktok-identity-ready', () => {
            const token = this._readInjectedTikTokToken() ?? '';
            if (!token || token === this._lastIdentityToken) return;
            this._lastIdentityToken = token;
            this.requestInit();
        });
    }

    private _generateRunId(): string {
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 10);
        return `tt-${ts}-${rand}`;
    }

    private _applyTikTokAuthHeaders(headers: Headers): void {
        if (headers.has('X-TikTok-Token')) return;

        const injectedToken = this._readInjectedTikTokToken();
        if (injectedToken) {
            headers.set('X-TikTok-Token', injectedToken);
            return;
        }

        const injectedUserId = this._readInjectedTikTokUserId();
        if (!injectedUserId) return;
        const displayName = this._readInjectedTikTokName() ?? this._username ?? 'TikTokPlayer';
        const token = this._buildIdentityToken(injectedUserId, displayName);
        if (token) {
            headers.set('X-TikTok-Token', token);
        }
    }

    private _buildIdentityToken(userId: string, displayName: string): string | null {
        const payload = JSON.stringify({
            userId,
            displayName: displayName || 'TikTokPlayer',
            avatarUrl: '',
        });
        const encoded = this._base64EncodeUtf8(payload);
        return encoded && encoded.trim() ? encoded : null;
    }

    private _base64EncodeUtf8(input: string): string | null {
        try {
            if (typeof btoa === 'function') {
                const bytes = encodeURIComponent(input).replace(
                    /%([0-9A-F]{2})/g,
                    (_m, p1: string) => String.fromCharCode(parseInt(p1, 16))
                );
                return btoa(bytes);
            }
        } catch {
            // continue
        }
        try {
            const g = globalThis as unknown as {
                Buffer?: {
                    from: (v: string, enc: string) => { toString: (enc: string) => string };
                };
            };
            if (g.Buffer) {
                return g.Buffer.from(input, 'utf8').toString('base64');
            }
        } catch {
            // continue
        }
        return null;
    }

    private _unwrapApiData(input: unknown): Record<string, unknown> {
        if (!input || typeof input !== 'object') return {};
        const outer = input as Record<string, unknown>;
        if (outer['ok'] === true && outer['data'] && typeof outer['data'] === 'object') {
            return outer['data'] as Record<string, unknown>;
        }
        return outer;
    }

    private _extractString(obj: Record<string, unknown>, keys: string[]): string | null {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return null;
    }

    private _extractNumber(obj: Record<string, unknown>, keys: string[]): number | null {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'number' && Number.isFinite(value)) return value;
        }
        return null;
    }

    private _extractBoolean(obj: Record<string, unknown>, keys: string[]): boolean | null {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'boolean') return value;
        }
        return null;
    }

    private _normalizeLeaderboardEntries(raw: unknown): LeaderboardEntry[] | null {
        if (!Array.isArray(raw)) return null;
        const out: LeaderboardEntry[] = [];
        for (let i = 0; i < raw.length; i += 1) {
            const item = raw[i] as Record<string, unknown>;
            if (!item || typeof item !== 'object') continue;

            const username =
                (typeof item['username'] === 'string' && item['username'].trim()) ||
                (typeof item['displayName'] === 'string' && item['displayName'].trim()) ||
                (typeof item['playerId'] === 'string' && item['playerId'].trim()) ||
                'TikTokPlayer';

            const scoreRaw =
                typeof item['score'] === 'number'
                    ? item['score']
                    : typeof item['bestScore'] === 'number'
                      ? item['bestScore']
                      : 0;
            const waveRaw =
                typeof item['wave'] === 'number'
                    ? item['wave']
                    : typeof item['bestWave'] === 'number'
                      ? item['bestWave']
                      : 0;
            const rankRaw = typeof item['rank'] === 'number' ? item['rank'] : i + 1;

            out.push({
                rank: Math.max(1, Math.floor(rankRaw)),
                username: username.trim(),
                score: Math.max(0, Math.floor(scoreRaw)),
                wave: Math.max(0, Math.floor(waveRaw)),
            });
        }
        return out;
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

    private _loadLocalDiamonds(): number {
        try {
            const raw = localStorage.getItem(TikTokBridge.STORAGE_DIAMONDS_KEY);
            if (!raw) return 0;
            const parsed = parseInt(raw, 10);
            return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        } catch {
            return 0;
        }
    }

    private _saveLocalDiamonds(balance: number): void {
        try {
            localStorage.setItem(
                TikTokBridge.STORAGE_DIAMONDS_KEY,
                String(Math.max(0, Math.floor(balance)))
            );
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

