import { _decorator } from 'cc';
import { GameConfig } from '../../data/GameConfig';

const { ccclass } = _decorator;

/**
 * 建筑类型配置
 */
export interface BuildingTypeConfig {
    /** 唯一标识 */
    id: string;
    /** 显示名称 key（i18n） */
    nameKey: string;
    /** 描述 key（i18n） */
    descriptionKey: string;
    /** 所需金币数量 */
    cost: number;
    /** 建造时间（秒），0 表示立即完成 */
    buildTime: number;

    // --- V2 Architecture Extensions ---
    /** 视觉配置 */
    visual?: {
        colorHex: string; // e.g. '#FF0000'
        scale: { x: number; y: number; z: number };
    };

    /** 核心角色类型 */
    role?: 'building' | 'tower' | 'barracks';

    /** 基础属性 */
    stats?: {
        hp: number;
        attackRange?: number;
        attackDamage?: number;
        attackInterval?: number;
        tauntRange?: number;
    };

    /** 特殊功能配置 */
    features?: {
        spawnInterval?: number;
        maxUnits?: number;
        incomePerTick?: number;
        incomeInterval?: number;
        // Bullet Visuals
        bulletColorHex?: string;
        bulletExplosionRadius?: number;
        bulletSlowPercent?: number;
        bulletSlowDuration?: number;
        directRainCast?: boolean;
        rainRadiusPerLevel?: number;

        // Chain Lightning
        chainCount?: number;
        chainCountPerLevel?: number;
        chainRange?: number;
        useLaserVisual?: boolean;
    };

    /** 升级配置 */
    upgrades?: {
        maxLevel?: number; // default 3
        costMultiplier?: number; // default 1.5
        statMultiplier?: number; // default 1.2
        spawnIntervalMultiplier?: number;
        maxUnitsPerLevel?: number;
        spawnBatchPerLevel?: number;
        attackMultiplier?: number;
        rangeMultiplier?: number;
        intervalMultiplier?: number;
        chainRangePerLevel?: number;
        incomeMultiplier?: number;
    };
}

/**
 * 建筑类型注册表
 * 存储所有建筑类型的配置，可扩展添加新类型
 *
 * NOTE: 新建筑请先在此注册，再由 BuildingFactory 读取配置生成。
 * 避免在 GameController 或其他系统中硬编码建筑属性。
 */
@ccclass('BuildingRegistry')
export class BuildingRegistry {
    private static _instance: BuildingRegistry | null = null;
    private _types: Map<string, BuildingTypeConfig> = new Map();

    public static get instance(): BuildingRegistry {
        if (!this._instance) {
            this._instance = new BuildingRegistry();
            this._instance.registerDefaults();
        }
        return this._instance;
    }

    /**
     * 注册默认建筑类型
     */
    private registerDefaults(): void {
        const types = GameConfig.BUILDING.TYPES as Record<string, Omit<BuildingTypeConfig, 'id'>>;

        for (const [id, config] of Object.entries(types)) {
            this.register(this.normalizeTypeConfig(id, config));
        }

        console.log('[BuildingRegistry] 注册了', this._types.size, '种建筑类型');
    }

    /**
     * 注册新的建筑类型
     */
    public register(config: BuildingTypeConfig): void {
        this._types.set(config.id, this.normalizeTypeConfig(config.id, config));
    }

    /**
     * 获取建筑配置
     */
    public get(id: string): BuildingTypeConfig | undefined {
        return this._types.get(id);
    }

    /**
     * 获取所有建筑类型
     */
    public getAll(): BuildingTypeConfig[] {
        return Array.from(this._types.values());
    }

    /**
     * 获取建筑所需金币
     */
    public getCost(id: string): number {
        const config = this.get(id);
        return config ? config.cost : 0;
    }

    private normalizeTypeConfig(
        id: string,
        config: Partial<Omit<BuildingTypeConfig, 'id'>>
    ): BuildingTypeConfig {
        if (!config.nameKey) {
            throw new Error(`[BuildingRegistry] Missing nameKey for building type "${id}"`);
        }
        if (!config.descriptionKey) {
            throw new Error(`[BuildingRegistry] Missing descriptionKey for building type "${id}"`);
        }
        if (config.cost === undefined) {
            throw new Error(`[BuildingRegistry] Missing cost for building type "${id}"`);
        }
        if (config.buildTime === undefined) {
            throw new Error(`[BuildingRegistry] Missing buildTime for building type "${id}"`);
        }

        return {
            id,
            nameKey: config.nameKey,
            descriptionKey: config.descriptionKey,
            cost: config.cost,
            buildTime: config.buildTime,
            visual: config.visual,
            role: config.role,
            stats: config.stats,
            features: config.features,
            upgrades: config.upgrades,
        };
    }
}
