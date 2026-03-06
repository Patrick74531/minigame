/**
 * DiamondService
 * 客户端钻石余额管理：通过当前平台后端 API 通信，
 * 本地维护缓存余额用于即时 UI 显示。
 */

export type DiamondChangeListener = (balance: number) => void;

const PENDING_SETTLE_KEY = 'gvr.pendingSettle';
const LOCAL_BALANCE_KEY = 'gvr.tiktok.diamonds.v1';
const TIKTOK_API_BASE_STORAGE_KEY = 'gvr.tiktok.api_base.v1';
const TIKTOK_DEFAULT_API_BASE =
    'https://tiktok-leaderboard-prod.mineskystudio.workers.dev/api/tiktok';
const TIKTOK_API_BASE_CANDIDATES = [
    'https://tiktok-leaderboard-prod.mineskystudio.workers.dev/api/tiktok',
    'https://tiktok-leaderboard-staging.mineskystudio.workers.dev/api/tiktok',
    'https://tiktok-leaderboard.mineskystudio.workers.dev/api/tiktok',
];

interface PendingSettle {
    runId: string;
    wave: number;
}

let _instance: DiamondService | null = null;

export class DiamondService {
    private _balance: number = 0;
    private _initialized: boolean = false;
    private _listeners: DiamondChangeListener[] = [];
    private _settleInFlight: boolean = false;
    private _buyInFlight: boolean = false;

    private constructor() {
        this._balance = this._loadLocalBalance();
        this._initialized = this._balance > 0;
    }

    public static get instance(): DiamondService {
        if (!_instance) {
            _instance = new DiamondService();
        }
        return _instance;
    }

    public get balance(): number {
        return this._balance;
    }

    public get initialized(): boolean {
        return this._initialized;
    }

    /** Called from HomePage bridge init callback with server-provided balance */
    public setInitialBalance(diamonds: number): void {
        this._balance = Math.max(0, Math.floor(diamonds));
        this._initialized = true;
        this._saveLocalBalance(this._balance);
        this._notifyListeners();
    }

    /** Refresh balance from server */
    public refreshBalance(): void {
        this._fetchDiamondApi(`/balance?_ts=${Date.now()}`, {})
            .then((data: unknown) => {
                const d = this._unwrapApiData(data) as { balance?: number };
                if (typeof d.balance === 'number') {
                    this._balance = d.balance;
                    this._initialized = true;
                    this._saveLocalBalance(this._balance);
                    this._notifyListeners();
                    console.log(`[DiamondService] refresh ok balance=${this._balance}`);
                }
            })
            .catch((e: unknown) => {
                console.warn('[DiamondService] refreshBalance failed:', e);
            });
    }

    /**
     * 游戏结束结算：按 wave × 10 获得钻石
     * @param wave 坚持的波数
     * @param runId 唯一本局 ID（幂等防刷）
     * @param onResult 结算回调
     */
    public settleRun(
        wave: number,
        runId: string,
        onResult?: (earned: number, balance: number) => void
    ): void {
        if (this._settleInFlight) return;
        this._settleInFlight = true;

        // Persist to localStorage first so scene-reload can't lose the settlement
        DiamondService.savePendingSettlement(runId, wave);

        this._fetchDiamondApi('/settle-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId, wave }),
        })
            .then((data: unknown) => {
                const d = this._unwrapApiData(data) as { earned?: number; balance?: number };
                const earned = d.earned ?? 0;
                if (typeof d.balance === 'number') {
                    this._balance = d.balance;
                } else {
                    this._balance += earned;
                }
                this._initialized = true;
                this._saveLocalBalance(this._balance);
                this._notifyListeners();
                console.log(
                    `[DiamondService] settleRun ok runId=${runId} wave=${wave} earned=${earned} balance=${this._balance}`
                );
                DiamondService.clearPendingSettlement(); // success — no retry needed
                onResult?.(earned, this._balance);
            })
            .catch((e: unknown) => {
                console.warn('[DiamondService] settleRun failed:', e);
                // Optimistic local credit (will be confirmed when pending-settle drains)
                const earned = Math.max(0, wave * 10);
                this._balance += earned;
                this._saveLocalBalance(this._balance);
                this._notifyListeners();
                onResult?.(earned, this._balance);
                // Do NOT clear pending settlement — leave it for next init drain
            })
            .finally(() => {
                this._settleInFlight = false;
            });
    }

    /**
     * 购买道具
     * @param itemId 道具 ID
     * @param onResult 结果回调
     */
    public buyItem(
        itemId: string,
        onResult?: (success: boolean, balance: number, error?: string) => void
    ): void {
        if (this._buyInFlight) {
            onResult?.(false, this._balance, 'Purchase in progress');
            return;
        }

        const price = 100;
        if (this._balance < price) {
            onResult?.(false, this._balance, 'Insufficient diamonds');
            return;
        }

        this._buyInFlight = true;

        this._fetchDiamondApi('/buy-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
        })
            .then((data: unknown) => {
                const d = this._unwrapApiData(data) as {
                    success?: unknown;
                    ok?: unknown;
                    purchased?: unknown;
                    balance?: unknown;
                    newBalance?: unknown;
                    error?: unknown;
                    message?: unknown;
                };
                const success = d.success === true || d.ok === true || d.purchased === true;

                let nextBalance: number | null = null;
                if (typeof d.balance === 'number' && Number.isFinite(d.balance)) {
                    nextBalance = d.balance;
                } else if (typeof d.newBalance === 'number' && Number.isFinite(d.newBalance)) {
                    nextBalance = d.newBalance;
                }

                if (success) {
                    this._balance =
                        nextBalance !== null
                            ? nextBalance
                            : Math.max(0, this._balance - Math.max(0, price));
                    this._saveLocalBalance(this._balance);
                    this._notifyListeners();
                    onResult?.(true, this._balance);
                    return;
                }

                // Server returned non-success — optimistic local deduct so offline/dev env works
                this._balance = Math.max(0, this._balance - price);
                this._saveLocalBalance(this._balance);
                this._notifyListeners();
                onResult?.(true, this._balance);
            })
            .catch((_e: unknown) => {
                // Network/fetch error — optimistic local deduct
                this._balance = Math.max(0, this._balance - price);
                this._saveLocalBalance(this._balance);
                this._notifyListeners();
                onResult?.(true, this._balance);
            })
            .finally(() => {
                this._buyInFlight = false;
            });
    }

    public addListener(listener: DiamondChangeListener): void {
        this._listeners.push(listener);
    }

    public removeListener(listener: DiamondChangeListener): void {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
    }

    /** Generate a unique run ID for settlement idempotency */
    public static generateRunId(): string {
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(36).substring(2, 10);
        return `${ts}-${rand}`;
    }

    /** Save a pending settlement to localStorage (survives scene reload) */
    public static savePendingSettlement(runId: string, wave: number): void {
        try {
            const data: PendingSettle = { runId, wave };
            localStorage.setItem(PENDING_SETTLE_KEY, JSON.stringify(data));
        } catch {
            /* ignore */
        }
    }

    /** Drain the pending settlement from localStorage (returns null if none) */
    public static drainPendingSettlement(): PendingSettle | null {
        try {
            const raw = localStorage.getItem(PENDING_SETTLE_KEY);
            if (!raw) return null;
            localStorage.removeItem(PENDING_SETTLE_KEY);
            return JSON.parse(raw) as PendingSettle;
        } catch {
            return null;
        }
    }

    /** Clear any pending settlement (call after confirmed server success) */
    public static clearPendingSettlement(): void {
        try {
            localStorage.removeItem(PENDING_SETTLE_KEY);
        } catch {
            /* ignore */
        }
    }

    private _fetchApi(path: string, init: RequestInit): Promise<unknown> {
        const headers = new Headers(init.headers ?? undefined);
        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }
        this._applyTikTokAuthHeaders(headers);

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), 8000) : 0;

        return fetch(path, {
            ...init,
            headers,
            credentials: this._isTikTokRuntime() ? 'omit' : 'include',
            cache: 'no-store',
            signal: controller?.signal,
        })
            .catch((e: unknown) => {
                throw new Error(`[DiamondService] fetch failed: ${path} :: ${String(e)}`);
            })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} @ ${path}`);
                return r.json() as Promise<unknown>;
            })
            .finally(() => {
                if (timeoutId) globalThis.clearTimeout(timeoutId);
            });
    }

    private _fetchDiamondApi(path: string, init: RequestInit): Promise<unknown> {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        if (!this._isTikTokRuntime()) {
            return this._fetchApi(`/api/diamond${normalizedPath}`, init);
        }

        const candidates = this._resolveTikTokApiBaseCandidates();
        const tryFetch = (index: number): Promise<unknown> => {
            if (index >= candidates.length) {
                throw new Error(`[DiamondService] no API base candidates for ${normalizedPath}`);
            }

            const base = candidates[index];
            const url = `${base}/diamond${normalizedPath}`;
            return this._fetchApi(url, init)
                .then(data => {
                    this._savePreferredTikTokApiBase(base);
                    return data;
                })
                .catch((err: unknown) => {
                    if (this._isDomainListBlockedError(err) && index + 1 < candidates.length) {
                        console.warn(
                            `[DiamondService] domain blocked, fallback ${base} -> ${candidates[index + 1]}`
                        );
                        return tryFetch(index + 1);
                    }
                    throw err;
                });
        };

        return tryFetch(0);
    }

    private _isTikTokRuntime(): boolean {
        try {
            const g = globalThis as unknown as Record<string, unknown>;
            if (g['tt'] !== undefined) return true;
            if (typeof window === 'undefined') return false;
            const w = window as unknown as Record<string, unknown>;
            return w['__GVR_PLATFORM__'] === 'tiktok';
        } catch {
            return false;
        }
    }

    private _resolveTikTokApiBaseCandidates(): string[] {
        const out: string[] = [];
        this._appendUniqueApiBase(out, this._readRuntimeString('__GVR_TIKTOK_API_BASE__'));
        this._appendUniqueApiBase(out, this._loadPreferredTikTokApiBase());

        const runtimeCandidates = this._readRuntimeString('__GVR_TIKTOK_API_BASE_CANDIDATES__');
        if (runtimeCandidates) {
            const parts = runtimeCandidates
                .split(/[\n,;\s]+/g)
                .map(item => item.trim())
                .filter(Boolean);
            for (const part of parts) {
                this._appendUniqueApiBase(out, part);
            }
        }

        for (const candidate of TIKTOK_API_BASE_CANDIDATES) {
            this._appendUniqueApiBase(out, candidate);
        }
        if (out.length === 0) {
            this._appendUniqueApiBase(out, TIKTOK_DEFAULT_API_BASE);
        }
        return out;
    }

    private _appendUniqueApiBase(list: string[], input: string | null): void {
        const normalized = this._normalizeApiBase(input);
        if (!normalized) return;
        if (list.includes(normalized)) return;
        list.push(normalized);
    }

    private _normalizeApiBase(input: string | null): string | null {
        if (!input) return null;
        const trimmed = input.trim();
        if (!trimmed) return null;
        if (!/^https?:\/\//i.test(trimmed)) return null;

        try {
            const parsed = new URL(trimmed);
            const pathname = parsed.pathname || '';
            const lowerPath = pathname.toLowerCase();
            const apiRoot = '/api/tiktok';
            const apiIndex = lowerPath.indexOf(apiRoot);
            const normalizedPath =
                apiIndex >= 0
                    ? pathname.slice(0, apiIndex + apiRoot.length)
                    : pathname && pathname !== '/'
                      ? pathname.replace(/\/+$/, '')
                      : apiRoot;
            return `${parsed.origin}${normalizedPath}`.replace(/\/+$/, '');
        } catch {
            return trimmed.replace(/\/+$/, '');
        }
    }

    private _loadPreferredTikTokApiBase(): string | null {
        try {
            const raw = localStorage.getItem(TIKTOK_API_BASE_STORAGE_KEY);
            return this._normalizeApiBase(raw);
        } catch {
            return null;
        }
    }

    private _savePreferredTikTokApiBase(base: string): void {
        const normalized = this._normalizeApiBase(base);
        if (!normalized) return;
        try {
            localStorage.setItem(TIKTOK_API_BASE_STORAGE_KEY, normalized);
        } catch {
            // ignore
        }
    }

    private _isDomainListBlockedError(err: unknown): boolean {
        const texts = this._collectErrorTexts(err);
        for (const text of texts) {
            if (text.includes('url not in domain list') || text.includes('domain list')) {
                return true;
            }
        }
        return false;
    }

    private _collectErrorTexts(err: unknown): string[] {
        const texts: string[] = [];
        const push = (value: unknown): void => {
            if (typeof value !== 'string') return;
            const normalized = value.trim().toLowerCase();
            if (!normalized) return;
            if (!texts.includes(normalized)) texts.push(normalized);
        };

        push(String(err ?? ''));
        if (!err || typeof err !== 'object') return texts;

        const root = err as Record<string, unknown>;
        push(root['message']);
        push(root['errMsg']);
        push(root['errorMessage']);
        push(root['stack']);

        const nested = root['error'];
        if (nested && typeof nested === 'object') {
            const nestedRoot = nested as Record<string, unknown>;
            push(nestedRoot['message']);
            push(nestedRoot['errMsg']);
            push(nestedRoot['errorMessage']);
            push(nestedRoot['stack']);
        }

        try {
            push(JSON.stringify(err));
        } catch {
            // ignore
        }
        return texts;
    }

    private _readInjectedTikTokToken(): string | null {
        return this._readRuntimeString('__GVR_TIKTOK_TOKEN__');
    }

    private _readInjectedTikTokUserId(): string | null {
        return this._readRuntimeString('__GVR_TIKTOK_USER_ID__');
    }

    private _readInjectedTikTokName(): string {
        return this._readRuntimeString('__GVR_TIKTOK_USERNAME__') ?? 'TikTokPlayer';
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

    private _applyTikTokAuthHeaders(headers: Headers): void {
        if (!this._isTikTokRuntime()) return;
        if (headers.has('X-TikTok-Token')) return;

        const token = this._readInjectedTikTokToken();
        if (token) {
            headers.set('X-TikTok-Token', token);
            return;
        }

        const userId = this._readInjectedTikTokUserId();
        if (!userId) return;
        const fallbackToken = this._buildIdentityToken(userId, this._readInjectedTikTokName());
        if (fallbackToken) {
            headers.set('X-TikTok-Token', fallbackToken);
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

    private _notifyListeners(): void {
        for (const listener of this._listeners) {
            try {
                listener(this._balance);
            } catch (e) {
                console.warn('[DiamondService] listener error', e);
            }
        }
    }

    private _loadLocalBalance(): number {
        try {
            const raw = localStorage.getItem(LOCAL_BALANCE_KEY);
            if (!raw) return 0;
            const parsed = parseInt(raw, 10);
            if (!Number.isFinite(parsed)) return 0;
            return Math.max(0, parsed);
        } catch {
            return 0;
        }
    }

    private _saveLocalBalance(balance: number): void {
        try {
            localStorage.setItem(LOCAL_BALANCE_KEY, String(Math.max(0, Math.floor(balance))));
        } catch {
            // ignore
        }
    }
}
