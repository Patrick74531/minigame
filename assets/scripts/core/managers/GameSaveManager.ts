const SAVE_KEY = 'gvr.save';
const SAVE_VERSION = 1;
const MAX_SAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface GameSaveData {
    version: number;
    savedAt: number;
    waveNumber: number;
    baseHpRatio: number;
    coins: number;
    score: number;
    heroLevel: number;
    heroXp: number;
}

/**
 * 游戏存档管理器
 * 将关键游戏状态持久化到 localStorage，用于继续游戏功能
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

    public hasSave(): boolean {
        return this.load() !== null;
    }

    public save(data: GameSaveData): void {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[GameSaveManager] Failed to save:', e);
        }
    }

    public load(): GameSaveData | null {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw) as GameSaveData;
            if (!data || data.version !== SAVE_VERSION) return null;
            if (Date.now() - data.savedAt > MAX_SAVE_AGE_MS) {
                this.clear();
                return null;
            }
            if (!data.waveNumber || data.waveNumber < 1) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    public clear(): void {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch (e) {
            // ignore storage errors
        }
    }
}
