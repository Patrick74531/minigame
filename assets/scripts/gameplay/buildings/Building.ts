import { _decorator, Vec2, Node, RigidBody, BoxCollider, Vec3 } from 'cc';
import { UnitFactory } from '../units/UnitFactory';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { PoolManager } from '../../core/managers/PoolManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';
import { HealthBar } from '../../ui/HealthBar';

const { ccclass, property } = _decorator;

/** 建筑类型 */
export enum BuildingType {
    BARRACKS = 'barracks', // 兵营
    TOWER = 'tower', // 防御塔（后续扩展）
    WALL = 'wall', // 墙
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

    /** 血条组件 */
    private _healthBar: HealthBar | null = null;

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

        // Register Unit Died Event
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);

        // Setup Physics (Obstacle)
        this.setupPhysics();

        // Setup Health Bar
        this.setupHealthBar();

        if (GameManager.instance) {
            GameManager.instance.activeBuildings.push(this.node);
        }
    }

    private setupHealthBar(): void {
        this._healthBar = this.node.addComponent(HealthBar);
        // Optional: Custom configurations based on building type
        if (this.buildingType === BuildingType.WALL) {
            this._healthBar.yOffset = 2.0;
        } else {
            this._healthBar.yOffset = 3.0;
        }
    }

    private setupPhysics(): void {
        let rb = this.node.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
            rb.type = RigidBody.Type.STATIC;
        }

        let col = this.node.getComponent(BoxCollider);
        if (!col) {
            col = this.node.addComponent(BoxCollider);
        }
        col.isTrigger = false; // Physical Obstacle
        col.size = new Vec3(1, 2, 1); // Standard Building Size (Approx)
        col.center = new Vec3(0, 1, 0);

        // Ensure it blocks Hero
        col.setGroup(1 << 0); // DEFAULT (Walls etc)
        col.setMask(0xffffffff);
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

        let soldier = PoolManager.instance.spawn(this.soldierPoolName, this._unitContainer);

        // 3D 坐标系：XZ平面为地面，Y轴向上
        const spawnOffsetX = 1.0;
        const spawnOffsetZ = 1.0;

        if (!soldier) {
            // Fallback to factory if pool empty/missing
            soldier = UnitFactory.createSoldier(
                this._unitContainer,
                this.node.position.x + spawnOffsetX,
                this.node.position.z + spawnOffsetZ
            );
        } else {
            soldier.setPosition(
                this.node.position.x + spawnOffsetX,
                0, // 地面高度
                this.node.position.z + spawnOffsetZ
            );
        }

        if (!soldier) return;

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

        if (this._healthBar) {
            this._healthBar.updateHealth(this.currentHp, this.maxHp);
        }

        if (this.currentHp <= 0) {
            this.onDestroyed();
        }
    }

    protected onDestroyed(): void {
        // Unregister from global list
        if (GameManager.instance) {
            const idx = GameManager.instance.activeBuildings.indexOf(this.node);
            if (idx !== -1) {
                GameManager.instance.activeBuildings.splice(idx, 1);
            }
        }

        EventManager.instance.emit(GameEvents.BUILDING_DESTROYED, {
            buildingId: this.node.uuid,
            building: this,
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
