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
            cost: 50,
            buildTime: 0,
            description: '生产士兵的建筑'
        });

        // 防御塔 - 远程攻击
        this.register({
            id: 'tower',
            name: '防御塔',
            cost: 80,
            buildTime: 0,
            description: '远程攻击敌人'
        });

        // 农场 - 产生金币
        this.register({
            id: 'farm',
            name: '农场',
            cost: 30,
            buildTime: 0,
            description: '定期产生金币'
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
