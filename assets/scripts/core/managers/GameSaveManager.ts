const SAVE_KEY = 'gvr.save';
const SAVE_VERSION = 2;
const MAX_SAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SAVE_INTERVAL_MS = 5_000;

export interface WeaponSaveState {
    type: string;
    level: number;
}

export interface BuildingPadSaveState {
    padIndex: number;
    buildingTypeId: string;
    level: number;
    hpRatio: number;
    nextUpgradeCost: number;
}

export interface GameSaveDataV2 {
    version: 2;
    savedAt: number;
    waveNumber: number;
    baseLevel: number;
    baseHpRatio: number;
    coins: number;
    heroCoinCount: number;
    score: number;
    heroLevel: number;
    heroXp: number;
    weapons: WeaponSaveState[];
    activeWeaponType: string | null;
    buildings: BuildingPadSaveState[];
    buffCardIds: string[];
    nextOfferWave: number;
}

/** Legacy V1 shape (read-only, for migration) */
interface GameSaveDataV1 {
    version: 1;
    savedAt: number;
    waveNumber: number;
    baseLevel?: number;
    baseHpRatio: number;
    coins: number;
    score: number;
    heroLevel: number;
    heroXp: number;
}

export type GameSaveData = GameSaveDataV2;

/**
 * 游戏存档管理器 V2
 * 将完整游戏状态持久化到 localStorage。
 * 支持从 V1 自动升级。节流写入，原子性由 JS 单线程保证。
 */
export class GameSaveManager {
    private static _instance: GameSaveManager | null = null;

    public static get instance(): GameSaveManager {
        if (!this._instance) this._instance = new GameSaveManager();
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    private _lastSaveTime: number = 0;
    private _pendingTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Public API ────────────────────────────────────────────────

    public hasSave(): boolean {
        return this.load() !== null;
    }

    /**
     * 节流存档：距上次写入不足 MIN_SAVE_INTERVAL_MS 时 debounce 500ms 后写入。
     */
    public save(data: GameSaveDataV2): void {
        const now = Date.now();
        if (now - this._lastSaveTime >= MIN_SAVE_INTERVAL_MS) {
            this._writeNow(data);
        } else {
            if (this._pendingTimer !== null) clearTimeout(this._pendingTimer);
            this._pendingTimer = setTimeout(() => {
                this._pendingTimer = null;
                this._writeNow(data);
            }, 500);
        }
    }

    /** 立即写入（绕过节流，供切后台等关键时机使用）. */
    public saveImmediate(data: GameSaveDataV2): void {
        if (this._pendingTimer !== null) {
            clearTimeout(this._pendingTimer);
            this._pendingTimer = null;
        }
        this._writeNow(data);
    }

    public load(): GameSaveDataV2 | null {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as GameSaveDataV1 | GameSaveDataV2;
            if (!parsed) return null;

            if (Date.now() - (parsed.savedAt ?? 0) > MAX_SAVE_AGE_MS) {
                this.clear();
                return null;
            }

            if ((parsed as GameSaveDataV1).version === 1) {
                return this._migrateV1(parsed as GameSaveDataV1);
            }

            const v2 = parsed as GameSaveDataV2;
            if (v2.version !== SAVE_VERSION) return null;
            if (!v2.waveNumber || v2.waveNumber < 1) return null;
            if (!Number.isFinite(v2.baseLevel)) {
                v2.baseLevel = 1;
            } else {
                v2.baseLevel = Math.max(1, Math.floor(v2.baseLevel));
            }
            if (!Number.isFinite(v2.heroCoinCount)) {
                // Backward-compatible default for earlier V2 saves.
                v2.heroCoinCount = Math.max(0, Math.floor(v2.coins ?? 0));
            }
            return v2;
        } catch {
            return null;
        }
    }

    public clear(): void {
        if (this._pendingTimer !== null) {
            clearTimeout(this._pendingTimer);
            this._pendingTimer = null;
        }
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {
            // ignore storage errors
        }
    }

    // ── Private ───────────────────────────────────────────────────

    private _writeNow(data: GameSaveDataV2): void {
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(SAVE_KEY, serialized);
            this._lastSaveTime = Date.now();
        } catch (e) {
            console.warn('[GameSaveManager] Failed to save:', e);
        }
    }

    private _migrateV1(v1: GameSaveDataV1): GameSaveDataV2 {
        return {
            version: 2,
            savedAt: v1.savedAt,
            waveNumber: v1.waveNumber,
            baseLevel: Math.max(1, Math.floor(v1.baseLevel ?? 1)),
            baseHpRatio: v1.baseHpRatio,
            coins: v1.coins,
            heroCoinCount: Math.max(0, Math.floor(v1.coins)),
            score: v1.score,
            heroLevel: v1.heroLevel,
            heroXp: v1.heroXp,
            weapons: [],
            activeWeaponType: null,
            buildings: [],
            buffCardIds: [],
            nextOfferWave: 3,
        };
    }
}
