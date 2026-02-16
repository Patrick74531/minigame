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
import { BuildingText } from './BuildingText';
import { CoinFactory } from '../economy/CoinFactory';
import { Coin } from '../economy/Coin';
import { resolveHeroModelConfig } from '../units/HeroModelConfig';

const { ccclass, property } = _decorator;

/** 建筑类型 */
export enum BuildingType {
    BARRACKS = 'barracks', // 兵营
    TOWER = 'tower', // 防御塔（后续扩展）
    FROST_TOWER = 'frost_tower', // 冰霜塔
    LIGHTNING_TOWER = 'lightning_tower', // 闪电塔
    WALL = 'wall', // 墙
    BASE = 'base', // 基地
    SPA = 'spa', // 温泉
    FARM = 'farm', // 农场
}

/** 建筑配置 */
export interface BuildingConfig {
    type: BuildingType;
    typeId?: string;
    nameKey?: string;
    cost: number;
    hp: number;
    spawnInterval: number;
    maxUnits: number;
    soldierPoolName: string;
    incomePerTick?: number;
    incomeInterval?: number;
    tauntRange?: number;
}

export interface BuildingUpgradeConfig {
    maxLevel: number;
    costMultiplier: number;
    statMultiplier: number;
    spawnIntervalMultiplier: number;
    maxUnitsPerLevel: number;
    spawnBatchPerLevel?: number;
    incomeMultiplier?: number;
}

/**
 * 建筑基类
 * 可放置在地图上，定期产生士兵
 */
@ccclass('Building')
export class Building extends BaseComponent implements IAttackable {
    private static _latestBaseLevel: number = 1;
    private static readonly FARM_STACK_BASE_POS: ReadonlyArray<{ x: number; z: number }> =
        GameConfig.BUILDING.FARM_STACK.BASE_POS;
    private static readonly FARM_STACK_BASE_Y = GameConfig.BUILDING.FARM_STACK.BASE_Y;
    private static readonly FARM_STACK_MAX_HEIGHT = GameConfig.BUILDING.FARM_STACK.MAX_HEIGHT;
    private static readonly FARM_COIN_VALUE = GameConfig.BUILDING.FARM_STACK.COIN_VALUE;

    @property
    public buildingType: BuildingType = BuildingType.BARRACKS;
    public buildingTypeId: string = BuildingType.BARRACKS;
    public displayNameKey: string = 'building.barracks.name';

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
    public spawnBatchPerLevel: number = 0;
    public incomeMultiplier: number = 1.2;

    @property
    public spawnInterval: number = 3;

    @property
    public maxUnits: number = 10;

    public tauntRange: number = 0;

    @property
    public soldierPoolName: string = 'soldier_basic';
    @property
    public incomePerTick: number = 1;
    @property
    public incomeInterval: number = 6;

    /** 当前存活的单位数量 */
    private _activeUnits: number = 0;

    /** 产兵计时器 */
    private _spawnTimer: number = 0;

    /** 产兵父节点 */
    private _unitContainer: Node | null = null;
    /** 当前已知的基地等级（用于兵营批量产兵） */
    private _baseLevel: number = 1;
    /** 农场产币计时器 */
    private _incomeTimer: number = 0;
    /** 农场金币堆（四摞） */
    private _farmStackCoins: Node[][] = [[], [], [], []];
    /** 农场金币堆叠视觉参数（对齐英雄头顶金币） */
    private _farmCoinStackHeight: number = 0.1;
    private _farmCoinStackScale: number = 0.5;

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
        if (!this.buildingTypeId) {
            this.buildingTypeId = this.buildingType;
        }
        if (!this.displayNameKey) {
            this.displayNameKey = BuildingText.resolveNameKey(this.buildingTypeId) ?? '';
        }

        this.currentHp = this.maxHp;
        this._activeUnits = 0;
        this._spawnTimer = 0;
        this._baseLevel = Building._latestBaseLevel;
        this._incomeTimer = 0;
        this._farmStackCoins = [[], [], [], []];
        const stackCfg = resolveHeroModelConfig();
        this._farmCoinStackHeight = Math.max(0.06, stackCfg.stackItemHeight);
        this._farmCoinStackScale = Math.max(0.2, stackCfg.stackItemScale);

        // Register Unit Died Event
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this.eventManager.on(GameEvents.BASE_UPGRADE_READY, this.onBaseUpgradeReady, this);

        // Setup Physics (Obstacle)
        this.setupPhysics();

        // Setup Health Bar
        this.setupHealthBar();

        this.gameManager.activeBuildings.push(this.node);
    }

    private setupHealthBar(): void {
        this._healthBar = this.node.addComponent(HealthBar);
        this._healthBar.width = 60;
        this._healthBar.height = 6;
        this._healthBar.baseWorldScale = 0.012;
        this._healthBar.inheritOwnerScaleInWorldSpace = false;
        this._healthBar.autoDetectHeadAnchor = false;

        // Disable health bar immediately if building is full HP (default behavior)
        // or just let updateHealth handle it.
        // We want to set the name.
        this.updateHealthBarName();

        this.updateHealthBarOffset();
    }

    private updateHealthBarOffset(): void {
        if (!this._healthBar) return;
        if (this.buildingType === BuildingType.WALL) {
            this._healthBar.yOffset = 1.6;
            return;
        }
        this._healthBar.yOffset = 2.2;
    }

    private updateHealthBarName(): void {
        if (!this._healthBar) return;
        const localizedName = BuildingText.resolveName({
            id: this.buildingTypeId,
            nameKey: this.displayNameKey,
        });
        this._healthBar.setName(localizedName, this.level);
    }

    private setupPhysics(): void {
        let rb = this.node.getComponent(RigidBody);
        let col = this.node.getComponent(BoxCollider);

        // 仅墙体作为“敌人专用”阻挡：
        // - 敌人不能穿过（会被碰撞阻挡）
        // - 英雄/士兵可穿过（不与墙体碰撞）
        if (!this.shouldUseSolidObstaclePhysics()) {
            this.clearObstaclePhysics();
            return;
        }

        if (!rb) {
            rb = this.node.addComponent(RigidBody);
        }
        rb.type = RigidBody.Type.STATIC;
        rb.useGravity = false;

        if (!col) {
            col = this.node.addComponent(BoxCollider);
        }
        col.enabled = true;
        col.isTrigger = false;
        // 栅栏是横向长条模型，使用更宽的碰撞体覆盖主体长度。
        col.size = new Vec3(10, 2, 1);
        col.center = new Vec3(0, 1, 0);

        // 墙体保留在 DEFAULT 组；仅与 ENEMY 组碰撞。
        // Hero/Soldier（DEFAULT）因 mask 不匹配可直接穿过。
        col.setGroup(1 << 0);
        col.setMask(1 << 3);
    }

    private shouldUseSolidObstaclePhysics(): boolean {
        return this.buildingType === BuildingType.WALL;
    }

    private clearObstaclePhysics(): void {
        const col = this.node.getComponent(BoxCollider);
        if (col && col.isValid) {
            col.enabled = false;
            col.destroy();
        }

        const rb = this.node.getComponent(RigidBody);
        if (rb && rb.isValid) {
            rb.destroy();
        }
    }

    protected cleanup(): void {
        this.eventManager.offAllByTarget(this);
    }

    /**
     * 设置建筑配置
     * @param config 配置
     */
    public setConfig(config: Partial<BuildingConfig>): void {
        const oldType = this.buildingType;
        const oldTypeId = this.buildingTypeId;
        const oldNameKey = this.displayNameKey;
        if (config.type !== undefined) this.buildingType = config.type;
        if (config.typeId !== undefined) {
            this.buildingTypeId = config.typeId;
        } else if (config.type !== undefined) {
            this.buildingTypeId = config.type;
        }
        if (config.nameKey !== undefined) {
            this.displayNameKey = config.nameKey;
        } else if (!this.displayNameKey) {
            this.displayNameKey = BuildingText.resolveNameKey(this.buildingTypeId) ?? '';
        }
        if (config.hp !== undefined) {
            this.maxHp = config.hp;
            this.currentHp = config.hp;
        }
        if (config.spawnInterval !== undefined) this.spawnInterval = config.spawnInterval;
        if (config.maxUnits !== undefined) this.maxUnits = config.maxUnits;
        if (config.soldierPoolName !== undefined) this.soldierPoolName = config.soldierPoolName;
        if (config.incomePerTick !== undefined) {
            this.incomePerTick = Math.max(1, Math.floor(config.incomePerTick));
        }
        if (config.incomeInterval !== undefined) {
            this.incomeInterval = Math.max(0.5, config.incomeInterval);
        }
        if (config.tauntRange !== undefined) {
            this.tauntRange = Math.max(0, config.tauntRange);
        }

        const typeChanged = config.type !== undefined && config.type !== oldType;
        const typeIdChanged = this.buildingTypeId !== oldTypeId;
        const nameKeyChanged = this.displayNameKey !== oldNameKey;

        if (this._initialized && (typeChanged || typeIdChanged || nameKeyChanged)) {
            // Handle addComponent/setConfig lifecycle ordering differences in runtime.
            if (typeChanged) {
                this.setupPhysics();
                this.updateHealthBarOffset();
            }
            this.updateHealthBarName();
        }
    }

    public setUpgradeConfig(config: Partial<BuildingUpgradeConfig>): void {
        if (config.maxLevel !== undefined) this.maxLevel = config.maxLevel;
        if (config.costMultiplier !== undefined) this.upgradeCostMultiplier = config.costMultiplier;
        if (config.statMultiplier !== undefined) this.statMultiplier = config.statMultiplier;
        if (config.spawnIntervalMultiplier !== undefined)
            this.spawnIntervalMultiplier = config.spawnIntervalMultiplier;
        if (config.maxUnitsPerLevel !== undefined) this.maxUnitsPerLevel = config.maxUnitsPerLevel;
        if (config.spawnBatchPerLevel !== undefined) {
            this.spawnBatchPerLevel = Math.max(0, config.spawnBatchPerLevel);
        }
        if (config.incomeMultiplier !== undefined) {
            this.incomeMultiplier = Math.max(1.01, config.incomeMultiplier);
        }
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
        // Barracks upgrade should scale batch quantity, not spawn cadence.
        if (this.spawnInterval > 0 && this.buildingType !== BuildingType.BARRACKS) {
            this.spawnInterval = Math.max(0.5, this.spawnInterval * this.spawnIntervalMultiplier);
        }
        if (this.maxUnitsPerLevel > 0) {
            this.maxUnits += this.maxUnitsPerLevel;
        }
        if (this.buildingType === BuildingType.FARM && this.incomeInterval > 0) {
            this.incomeInterval = Math.max(0.35, this.incomeInterval / this.incomeMultiplier);
        }

        // Heal to full (bonus)
        this.currentHp = this.maxHp;

        if (this._healthBar) {
            this._healthBar.updateHealth(this.currentHp, this.maxHp);
            this.updateHealthBarName();
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

        if (this.buildingType === BuildingType.FARM) {
            this.updateFarmIncome(dt);
            return;
        }

        // 产兵逻辑
        if (this._activeUnits < this.maxUnits) {
            this._spawnTimer += dt;

            if (this._spawnTimer >= this.spawnInterval) {
                this._spawnTimer = 0;
                this.spawnSoldierBatch();
            }
        }
    }

    // === 产兵逻辑 ===

    private spawnSoldierBatch(): void {
        if (this.buildingType !== BuildingType.BARRACKS) return;
        const remainCapacity = this.maxUnits - this._activeUnits;
        if (remainCapacity <= 0) return;

        const batchCount = Math.min(this.resolveSpawnBatchCount(), remainCapacity);
        for (let i = 0; i < batchCount; i++) {
            this.spawnSoldier(i, batchCount);
        }
    }

    private spawnSoldier(slotIndex: number = 0, totalInBatch: number = 1): void {
        if (!this._unitContainer) {
            console.warn('[Building] Unit container not set');
            return;
        }

        let soldier = this.poolManager.spawn(this.soldierPoolName, this._unitContainer);
        let spawnedFromPool = !!soldier;

        const spawnOffset = this.resolveSpawnOffset(slotIndex, totalInBatch);

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
                this.node.position.x + spawnOffset.x,
                0, // 地面高度
                this.node.position.z + spawnOffset.z
            );
        }

        if (!soldier) return;

        // Ensure correct spawn position for fallback path too
        soldier.setPosition(
            this.node.position.x + spawnOffset.x,
            0, // 地面高度
            this.node.position.z + spawnOffset.z
        );

        // Track ownership for accurate unit counting
        const soldierComp = soldier.getComponent(Soldier);
        if (soldierComp) {
            soldierComp.ownerBuildingId = this.node.uuid;
            soldierComp.setSpawnSource(this.soldierPoolName, spawnedFromPool);
            soldierComp.applyBarracksLevel(this.level);
        }

        this._activeUnits++;

        this.eventManager.emit(GameEvents.UNIT_SPAWNED, {
            unitType: 'soldier',
            node: soldier,
        });
    }

    private resolveSpawnBatchCount(): number {
        const cfg = GameConfig.BUILDING.BASE_UPGRADE;
        const baseCount = Math.max(1, Math.floor(cfg.SOLDIER_BATCH_BASE));
        const perLevel = Math.max(0, Math.floor(cfg.SOLDIER_BATCH_BONUS_PER_LEVEL));
        const maxCount = Math.max(baseCount, Math.floor(cfg.SOLDIER_BATCH_MAX));
        const levelBonus = Math.max(0, this._baseLevel - 1);
        const barracksBonus =
            this.buildingType === BuildingType.BARRACKS
                ? Math.max(0, this.level - 1) * Math.max(0, Math.floor(this.spawnBatchPerLevel))
                : 0;
        const count = baseCount + levelBonus * perLevel + barracksBonus;
        return Math.min(maxCount, count);
    }

    private resolveSpawnOffset(slotIndex: number, totalInBatch: number): { x: number; z: number } {
        const baseX = 1.0;
        const baseZ = 1.0;
        if (totalInBatch <= 1) {
            return { x: baseX, z: baseZ };
        }

        const radius = 0.32 + Math.min(0.35, totalInBatch * 0.06);
        const angle = (Math.PI * 2 * slotIndex) / Math.max(1, totalInBatch);
        return {
            x: baseX + Math.cos(angle) * radius,
            z: baseZ + Math.sin(angle) * radius,
        };
    }

    private updateFarmIncome(dt: number): void {
        this._incomeTimer += dt;
        while (this._incomeTimer >= this.incomeInterval) {
            this._incomeTimer -= this.incomeInterval;
            for (let i = 0; i < this.incomePerTick; i++) {
                this.spawnFarmCoinOnPlatform();
            }
        }
    }

    private spawnFarmCoinOnPlatform(): void {
        const stackIndex = this.pickFarmStackIndex();
        if (stackIndex < 0) return;

        const stack = this._farmStackCoins[stackIndex];
        const y = Building.FARM_STACK_BASE_Y + stack.length * this._farmCoinStackHeight;
        const base = Building.FARM_STACK_BASE_POS[stackIndex];
        const coinNode = CoinFactory.createCoin(
            this.node,
            base.x,
            base.z,
            Building.FARM_COIN_VALUE
        );
        coinNode.setPosition(base.x, y, base.z);
        coinNode.setRotationFromEuler(90, Math.random() * 360, 0);

        coinNode.setScale(
            this._farmCoinStackScale,
            this._farmCoinStackScale,
            this._farmCoinStackScale
        );

        const coinComp = coinNode.getComponent(Coin);
        if (coinComp) {
            coinComp.value = Building.FARM_COIN_VALUE;
            coinComp.enableLifetime = false;
            coinComp.floatAmplitude = Math.max(GameConfig.ECONOMY.COIN_FLOAT_AMPLITUDE, 0.12);
            coinComp.floatPhase = Math.random() * Math.PI * 2;
        }

        stack.push(coinNode);
    }

    private pickFarmStackIndex(): number {
        this.compactFarmStacks();

        let bestIndex = -1;
        let minCount = Number.POSITIVE_INFINITY;

        for (let i = 0; i < this._farmStackCoins.length; i++) {
            const count = this._farmStackCoins[i].length;
            if (count >= Building.FARM_STACK_MAX_HEIGHT) continue;
            if (count < minCount) {
                minCount = count;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    private compactFarmStacks(): void {
        for (let i = 0; i < this._farmStackCoins.length; i++) {
            const stack = this._farmStackCoins[i];
            this._farmStackCoins[i] = stack.filter(
                coin => coin && coin.isValid && coin.parent === this.node
            );
        }
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
        // 保底：建筑销毁时立即移除物理阻挡，避免残留不可见碰撞。
        this.clearObstaclePhysics();

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

    private onBaseUpgradeReady(data: { baseLevel: number }): void {
        const nextLevel = Math.max(1, Math.floor(data?.baseLevel ?? 1));
        if (nextLevel <= 0) return;
        Building._latestBaseLevel = Math.max(Building._latestBaseLevel, nextLevel);
        this._baseLevel = Building._latestBaseLevel;
    }

    protected get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    protected get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    protected get poolManager(): PoolManager {
        return ServiceRegistry.get<PoolManager>('PoolManager') ?? PoolManager.instance;
    }
}
