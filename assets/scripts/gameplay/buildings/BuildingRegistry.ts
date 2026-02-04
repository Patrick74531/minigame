import { _decorator } from 'cc';

const { ccclass } = _decorator;

/**
 * 建筑类型配置
 */
export interface BuildingTypeConfig {
    /** 唯一标识 */
    id: string;
    /** 显示名称 */
    name: string;
    /** 所需金币数量 */
    cost: number;
    /** 建造时间（秒），0 表示立即完成 */
    buildTime: number;
    /** 描述 */
    description: string;

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
    };

    /** 特殊功能配置 */
    features?: {
        spawnInterval?: number;
        maxUnits?: number;
        // Bullet Visuals
        bulletColorHex?: string;
        bulletExplosionRadius?: number;
        bulletSlowPercent?: number;
        bulletSlowDuration?: number;

        // Chain Lightning
        chainCount?: number;
        chainRange?: number;
    };
}

/**
 * 建筑类型注册表
 * 存储所有建筑类型的配置，可扩展添加新类型
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
        // 兵营 - 生产士兵
        this.register({
            id: 'barracks',
            name: '兵营',
            cost: 5,
            buildTime: 0,
            description: '生产士兵的建筑',
            role: 'barracks',
            visual: {
                colorHex: '#64B464', // Green
                scale: { x: 0.45, y: 0.45, z: 0.45 },
            },
            stats: { hp: 100 },
            features: {
                spawnInterval: 5, // GameConfig.BUILDING.SPAWN_INTERVAL
                maxUnits: 3, // GameConfig.BUILDING.MAX_SOLDIERS_PER_BARRACKS
            },
        });

        // 防御塔 - 远程攻击
        this.register({
            id: 'tower',
            name: '防御塔',
            cost: 8,
            buildTime: 0,
            description: '远程攻击敌人',
            role: 'tower',
            visual: {
                colorHex: '#DCDC3C', // Yellow
                scale: { x: 0.4, y: 0.8, z: 0.4 },
            },
            stats: {
                hp: 300,
                attackRange: 25,
                attackDamage: 25,
                attackInterval: 0.5,
            },
        });

        // 冰霜塔 - 减速
        this.register({
            id: 'frost_tower',
            name: '冰霜塔',
            cost: 12,
            buildTime: 0,
            description: '范围减速',
            role: 'tower', // It's still a tower logic-wise
            visual: {
                colorHex: '#3C64DC', // Blue
                scale: { x: 0.4, y: 0.8, z: 0.4 },
            },
            stats: {
                hp: 300,
                attackRange: 22,
                attackDamage: 5,
                attackInterval: 0.8,
            },
            features: {
                bulletColorHex: '#0096FF',
                bulletExplosionRadius: 2.5,
                bulletSlowPercent: 0.5,
                bulletSlowDuration: 2.0,
            },
        });

        // 闪电塔 - 连锁攻击
        this.register({
            id: 'lightning_tower',
            name: '闪电塔',
            cost: 15,
            buildTime: 0,
            description: '攻击并在敌人间弹射',
            role: 'tower',
            visual: {
                colorHex: '#800080', // Purple
                scale: { x: 0.4, y: 0.8, z: 0.4 },
            },
            stats: {
                hp: 250,
                attackRange: 20,
                attackDamage: 15, // Damage per hit
                attackInterval: 1.0,
            },
            features: {
                chainCount: 3,
                chainRange: 8,
                bulletColorHex: '#A020F0',
            },
        });

        // 农场 - 产生金币 (Concept)
        this.register({
            id: 'farm',
            name: '农场',
            cost: 30,
            buildTime: 0,
            description: '定期产生金币',
            role: 'building',
            visual: {
                colorHex: '#8B4513', // Brown
                scale: { x: 0.6, y: 0.3, z: 0.6 },
            },
            stats: { hp: 50 },
            features: {}, // TODO: Income logic
        });

        // 墙 - 阻挡敌人
        this.register({
            id: 'wall',
            name: '坚固城墙',
            cost: 5,
            buildTime: 0,
            description: '阻挡敌人进攻，拥有高额生命值',
            role: 'building',
            visual: {
                colorHex: '#808080', // Gray
                scale: { x: 0.8, y: 0.8, z: 0.8 },
            },
            stats: { hp: 1000 },
            features: {},
        });

        console.log('[BuildingRegistry] 注册了', this._types.size, '种建筑类型');
    }

    /**
     * 注册新的建筑类型
     */
    public register(config: BuildingTypeConfig): void {
        this._types.set(config.id, config);
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
}
