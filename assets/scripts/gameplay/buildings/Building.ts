import { _decorator, Node, RigidBody, BoxCollider, Vec3 } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { PoolManager } from '../../core/managers/PoolManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';
import { HealthBar } from '../../ui/HealthBar';
import { IAttackable } from '../../core/interfaces/IAttackable';
import { DamageNumberFactory, type DamageNumberStyle } from '../effects/DamageNumberFactory';
import { Soldier } from '../units/Soldier';

const { ccclass, property } = _decorator;

/** 建筑类型 */
export enum BuildingType {
    BARRACKS = 'barracks', // 兵营
    TOWER = 'tower', // 防御塔（后续扩展）
    WALL = 'wall', // 墙
    BASE = 'base', // 基地
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

export interface BuildingUpgradeConfig {
    maxLevel: number;
    costMultiplier: number;
    statMultiplier: number;
    spawnIntervalMultiplier: number;
    maxUnitsPerLevel: number;
}

/**
 * 建筑基类
 * 可放置在地图上，定期产生士兵
 */
@ccclass('Building')
export class Building extends BaseComponent implements IAttackable {
    @property
    public buildingType: BuildingType = BuildingType.BARRACKS;

    @property
    public maxHp: number = 500;

    @property
    public currentHp: number = 500;

    @property
    public level: number = 1;

    public maxLevel: number = GameConfig.BUILDING.DEFAULT_MAX_LEVEL;
    public upgradeCostMultiplier: number = GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER;
    public statMultiplier: number = 1.2;
    public spawnIntervalMultiplier: number = 0.93;
    public maxUnitsPerLevel: number = 0;

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
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);

        // Setup Physics (Obstacle)
        this.setupPhysics();

        // Setup Health Bar
        this.setupHealthBar();

        this.gameManager.activeBuildings.push(this.node);
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
        this.eventManager.offAllByTarget(this);
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

    public setUpgradeConfig(config: Partial<BuildingUpgradeConfig>): void {
        if (config.maxLevel !== undefined) this.maxLevel = config.maxLevel;
        if (config.costMultiplier !== undefined) this.upgradeCostMultiplier = config.costMultiplier;
        if (config.statMultiplier !== undefined) this.statMultiplier = config.statMultiplier;
        if (config.spawnIntervalMultiplier !== undefined)
            this.spawnIntervalMultiplier = config.spawnIntervalMultiplier;
        if (config.maxUnitsPerLevel !== undefined) this.maxUnitsPerLevel = config.maxUnitsPerLevel;
    }

    /**
     * 升级建筑
     */
    public upgrade(): boolean {
        if (!this.isAlive || this.level >= this.maxLevel) {
            return false;
        }

        const oldHp = this.maxHp;
        this.level++;

        // Scale core stats
        this.maxHp = Math.floor(this.maxHp * this.statMultiplier);
        if (this.spawnInterval > 0) {
            this.spawnInterval = Math.max(0.5, this.spawnInterval * this.spawnIntervalMultiplier);
        }
        if (this.maxUnitsPerLevel > 0) {
            this.maxUnits += this.maxUnitsPerLevel;
        }

        // Heal to full (bonus)
        this.currentHp = this.maxHp;

        if (this._healthBar) {
            this._healthBar.updateHealth(this.currentHp, this.maxHp);
        }

        console.log(`[Building] Upgraded to Level ${this.level}. HP: ${oldHp} -> ${this.maxHp}`);

        this.eventManager.emit(GameEvents.BUILDING_UPGRADED, {
            buildingId: this.node.uuid,
            level: this.level,
        });

        return true;
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
        if (!this.gameManager.isPlaying) return;

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

        let soldier = this.poolManager.spawn(this.soldierPoolName, this._unitContainer);
        let spawnedFromPool = !!soldier;

        // 3D 坐标系：XZ平面为地面，Y轴向上
        const spawnOffsetX = 1.0;
        const spawnOffsetZ = 1.0;

        if (!soldier) {
            console.warn(
                `[Building] Pool missing for: ${this.soldierPoolName}. Using fallback spawner.`
            );
            const fallback =
                ServiceRegistry.get<(parent: Node, x: number, z: number) => Node>('SoldierSpawner');
            if (fallback) {
                soldier = fallback(this._unitContainer, 0, 0);
                spawnedFromPool = false;
            } else {
                console.warn('[Building] SoldierSpawner not registered, cannot spawn soldier.');
                return;
            }
        } else {
            soldier.setPosition(
                this.node.position.x + spawnOffsetX,
                0, // 地面高度
                this.node.position.z + spawnOffsetZ
            );
        }

        if (!soldier) return;

        // Ensure correct spawn position for fallback path too
        soldier.setPosition(
            this.node.position.x + spawnOffsetX,
            0, // 地面高度
            this.node.position.z + spawnOffsetZ
        );

        // Track ownership for accurate unit counting
        const soldierComp = soldier.getComponent(Soldier);
        if (soldierComp) {
            soldierComp.ownerBuildingId = this.node.uuid;
            soldierComp.setSpawnSource(this.soldierPoolName, spawnedFromPool);
        }

        this._activeUnits++;

        this.eventManager.emit(GameEvents.UNIT_SPAWNED, {
            unitType: 'soldier',
            node: soldier,
        });
    }

    // === 伤害处理 ===

    public getWorldPosition(): Vec3 {
        return this.node.worldPosition;
    }

    /**
     * 受到伤害
     * @param damage 伤害值
     * @param _attacker 攻击者
     * @param isCrit 是否暴击
     */
    public takeDamage(damage: number, _attacker?: any, isCrit: boolean = false): void {
        if (!this.isAlive) return;
        damage = Math.floor(damage);
        if (damage <= 0) return;

        this.currentHp = Math.max(0, this.currentHp - damage);

        // 显示浮动伤害数字
        const parent = this.node.parent;
        if (parent) {
            const style: DamageNumberStyle =
                _attacker && _attacker.unitType === 'enemy' ? 'enemyHit' : 'default';
            DamageNumberFactory.show(
                parent,
                this.node.worldPosition,
                damage,
                isCrit,
                this.node,
                style
            );
        }

        if (this._healthBar) {
            this._healthBar.updateHealth(this.currentHp, this.maxHp);
        }

        if (this.currentHp <= 0) {
            this.onDestroyed();
        }
    }

    protected onDestroyed(): void {
        // Unregister from global list
        const idx = this.gameManager.activeBuildings.indexOf(this.node);
        if (idx !== -1) {
            this.gameManager.activeBuildings.splice(idx, 1);
        }

        this.eventManager.emit(GameEvents.BUILDING_DESTROYED, {
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
            const soldier = data.node?.getComponent(Soldier);
            if (soldier && soldier.ownerBuildingId !== this.node.uuid) return;
            this._activeUnits = Math.max(0, this._activeUnits - 1);
        }
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private get poolManager(): PoolManager {
        return ServiceRegistry.get<PoolManager>('PoolManager') ?? PoolManager.instance;
    }
}
