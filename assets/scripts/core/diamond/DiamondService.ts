/**
 * DiamondService
 * 客户端钻石余额管理：通过当前平台后端 API 通信，
 * 本地维护缓存余额用于即时 UI 显示。
 */

export type DiamondChangeListener = (balance: number) => void;

const PENDING_SETTLE_KEY = 'gvr.pendingSettle';

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

    private constructor() {}

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
        this._notifyListeners();
    }

    /** Refresh balance from server */
    public refreshBalance(): void {
        this._fetchApi(`/api/diamond/balance?_ts=${Date.now()}`, {})
            .then((data: unknown) => {
                const d = data as { balance?: number };
                if (typeof d.balance === 'number') {
                    this._balance = d.balance;
                    this._initialized = true;
                    this._notifyListeners();
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

        this._fetchApi('/api/diamond/settle-run', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId, wave }),
        })
            .then((data: unknown) => {
                const d = data as { earned?: number; balance?: number };
                const earned = d.earned ?? 0;
                if (typeof d.balance === 'number') {
                    this._balance = d.balance;
                } else {
                    this._balance += earned;
                }
                this._initialized = true;
                this._notifyListeners();
                DiamondService.clearPendingSettlement(); // success — no retry needed
                onResult?.(earned, this._balance);
            })
            .catch((e: unknown) => {
                console.warn('[DiamondService] settleRun failed:', e);
                // Optimistic local credit (will be confirmed when pending-settle drains)
                const earned = Math.max(0, wave * 10);
                this._balance += earned;
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

        this._fetchApi('/api/diamond/buy-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
        })
            .then((data: unknown) => {
                const d = data as { success?: boolean; balance?: number };
                if (d.success && typeof d.balance === 'number') {
                    this._balance = d.balance;
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

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), 8000) : 0;

        return fetch(path, {
            ...init,
            headers,
            credentials: 'include',
            cache: 'no-store',
            signal: controller?.signal,
        })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
                return r.json() as Promise<unknown>;
            })
            .finally(() => {
                if (timeoutId) globalThis.clearTimeout(timeoutId);
            });
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
}
