/**
 * WaveService
 * 提供统一的“波次数据快照”读取入口，避免 UI 直接依赖多个 WaveManager 实现。
 *
 * NOTE: 只读快照，不驱动逻辑。注册时不应改变现有波次逻辑。
 */
export type WaveSnapshot = {
    currentWave: number;
    totalWaves?: number;
    enemiesAlive?: number;
};

export type WaveProvider = {
    id: string;
    priority: number;
    isReady?: () => boolean;
    getSnapshot: () => WaveSnapshot;
};

export class WaveService {
    private static _instance: WaveService | null = null;
    private _providers: Map<string, WaveProvider> = new Map();

    public static get instance(): WaveService {
        if (!this._instance) {
            this._instance = new WaveService();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    public registerProvider(provider: WaveProvider): void {
        this._providers.set(provider.id, provider);
    }

    public unregisterProvider(id: string): void {
        this._providers.delete(id);
    }

    public getSnapshot(): WaveSnapshot {
        const providers = Array.from(this._providers.values());
        if (providers.length === 0) {
            return { currentWave: 0, enemiesAlive: 0 };
        }

        // Prefer ready providers with higher priority
        const readyProviders = providers.filter(p => (p.isReady ? p.isReady() : true));
        const candidates = readyProviders.length > 0 ? readyProviders : providers;

        candidates.sort((a, b) => b.priority - a.priority);
        return candidates[0].getSnapshot();
    }

    public get currentWave(): number {
        return this.getSnapshot().currentWave;
    }
}
