/**
 * DiamondService
 * 客户端钻石余额管理：通过当前平台后端 API 通信，
 * 本地维护缓存余额用于即时 UI 显示。
 */

export type DiamondChangeListener = (balance: number) => void;

const PENDING_SETTLE_KEY = 'gvr.pendingSettle';
const LOCAL_BALANCE_KEY = 'gvr.tiktok.diamonds.v1';
const TIKTOK_DEFAULT_API_BASE =
    'https://tiktok-leaderboard-prod.mineskystudio.workers.dev/api/tiktok';

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
        this._fetchApi(this._resolveDiamondPath(`/balance?_ts=${Date.now()}`), {})
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

        this._fetchApi(this._resolveDiamondPath('/settle-run'), {
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

        this._fetchApi(this._resolveDiamondPath('/buy-item'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
        })
            .then((data: unknown) => {
                const d = this._unwrapApiData(data) as { success?: boolean; balance?: number };
                if (d.success && typeof d.balance === 'number') {
                    this._balance = d.balance;
                    this._saveLocalBalance(this._balance);
                    this._notifyListeners();
                    onResult?.(true, this._balance);
                } else {
                    onResult?.(false, this._balance, 'Purchase failed');
                }
            })
            .catch((e: unknown) => {
                console.warn('[DiamondService] buyItem failed:', e);
                onResult?.(false, this._balance, String(e));
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

    private _resolveDiamondPath(path: string): string {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        if (!this._isTikTokRuntime()) {
            return `/api/diamond${normalizedPath}`;
        }

        const base = this._readTikTokApiBase();
        const normalizedBase = base.replace(/\/+$/, '');
        return `${normalizedBase}/diamond${normalizedPath}`;
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

    private _readTikTokApiBase(): string {
        const base = this._readRuntimeString('__GVR_TIKTOK_API_BASE__');
        return base ?? TIKTOK_DEFAULT_API_BASE;
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
