import { _decorator, Vec2, Node } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { PoolManager } from '../../core/managers/PoolManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';

const { ccclass, property } = _decorator;

/** 建筑类型 */
export enum BuildingType {
    BARRACKS = 'barracks', // 兵营
    TOWER = 'tower', // 防御塔（后续扩展）
}

/** 建筑配置 */
export interface BuildingConfig {
    type: BuildingType;
    cost: number;
    hp: number;
    spawnInterval: number;
    maxUnits: number;
    soldierPoolName: string;
}

/**
 * 建筑基类
 * 可放置在地图上，定期产生士兵
 */
@ccclass('Building')
export class Building extends BaseComponent {
    @property
    public buildingType: BuildingType = BuildingType.BARRACKS;

    @property
    public maxHp: number = 500;

    @property
    public currentHp: number = 500;

    @property
    public spawnInterval: number = 3;

    @property
    public maxUnits: number = 10;

    @property
    public soldierPoolName: string = 'soldier_basic';

    /** 当前存活的单位数量 */
    private _activeUnits: number = 0;

    /** 产兵计时器 */
    private _spawnTimer: number = 0;

    /** 产兵父节点 */
    private _unitContainer: Node | null = null;

    // === 访问器 ===

    public get isAlive(): boolean {
        return this.currentHp > 0;
    }

    public get activeUnits(): number {
        return this._activeUnits;
    }

    // === 初始化 ===

    protected initialize(): void {
        this.currentHp = this.maxHp;
        this._activeUnits = 0;
        this._spawnTimer = 0;

        // 注册单位死亡事件
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    protected cleanup(): void {
        EventManager.instance.offAllByTarget(this);
    }

    /**
     * 设置建筑配置
     * @param config 配置
     */
    public setConfig(config: Partial<BuildingConfig>): void {
        if (config.type !== undefined) this.buildingType = config.type;
        if (config.hp !== undefined) {
            this.maxHp = config.hp;
            this.currentHp = config.hp;
        }
        if (config.spawnInterval !== undefined) this.spawnInterval = config.spawnInterval;
        if (config.maxUnits !== undefined) this.maxUnits = config.maxUnits;
        if (config.soldierPoolName !== undefined) this.soldierPoolName = config.soldierPoolName;
    }

    /**
     * 设置单位容器节点
     * @param container 容器节点
     */
    public setUnitContainer(container: Node): void {
        this._unitContainer = container;
    }

    // === 更新循环 ===

    protected update(dt: number): void {
        if (!this.isAlive) return;

        // 产兵逻辑
        if (this._activeUnits < this.maxUnits) {
            this._spawnTimer += dt;

            if (this._spawnTimer >= this.spawnInterval) {
                this._spawnTimer = 0;
                this.spawnSoldier();
            }
        }
    }

    // === 产兵逻辑 ===

    private spawnSoldier(): void {
        if (!this._unitContainer) {
            console.warn('[Building] Unit container not set');
            return;
        }

        const soldier = PoolManager.instance.spawn(this.soldierPoolName, this._unitContainer);
        if (!soldier) return;

        // 设置士兵位置（建筑前方）
        const spawnOffset = new Vec2(50, 0); // 后续可配置
        soldier.setPosition(
            this.node.position.x + spawnOffset.x,
            this.node.position.y + spawnOffset.y,
            0
        );

        this._activeUnits++;

        EventManager.instance.emit(GameEvents.UNIT_SPAWNED, {
            unitType: 'soldier',
            node: soldier,
        });
    }

    // === 伤害处理 ===

    /**
     * 受到伤害
     * @param damage 伤害值
     */
    public takeDamage(damage: number): void {
        if (!this.isAlive) return;

        this.currentHp = Math.max(0, this.currentHp - damage);

        if (this.currentHp <= 0) {
            this.onDestroyed();
        }
    }

    private onDestroyed(): void {
        EventManager.instance.emit(GameEvents.BUILDING_DESTROYED, {
            buildingId: this.node.uuid,
        });

        // TODO: 播放销毁动画
        this.node.active = false;
    }

    // === 事件处理 ===

    private onUnitDied(data: { unitType: string; node: Node }): void {
        // 只统计自己产出的士兵
        // TODO: 需要更精确的所有权追踪
        if (data.unitType === 'soldier') {
            this._activeUnits = Math.max(0, this._activeUnits - 1);
        }
    }
}
