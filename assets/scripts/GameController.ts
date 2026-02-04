import { _decorator, Component, Node, Input, input, EventTouch, Vec2, Vec3, PhysicsSystem, geometry, Camera } from 'cc';
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { WaveManager } from './core/managers/WaveManager';
import { HUDManager } from './ui/HUDManager';
import { GameEvents } from './data/GameEvents';
import { UnitFactory } from './gameplay/units/UnitFactory';
import { UnitType } from './gameplay/units/Unit';
import { BuildingFactory } from './gameplay/buildings/BuildingFactory';
import { Building } from './gameplay/buildings/Building';
import { CoinFactory } from './gameplay/economy/CoinFactory';
import { GameConfig } from './data/GameConfig';
import { Unit } from './gameplay/units/Unit';
import { Hero } from './gameplay/units/Hero';
import { UIFactory } from './ui/UIFactory';
import { Joystick } from './ui/Joystick';
import { BuildingManager } from './gameplay/buildings/BuildingManager';
import { BuildingPad } from './gameplay/buildings/BuildingPad';
import { EffectManager } from './core/managers/EffectManager';

const { ccclass, property } = _decorator;

/**
 * 游戏主控制器 (组件化版本)
 * 职责: 协调各子系统，不包含具体业务逻辑
 * 目标: ~150 行
 */
@ccclass('GameController')
export class GameController extends Component {
    @property
    public maxWaves: number = 10;

    // === 容器 ===
    private _container: Node | null = null;
    private _enemyContainer: Node | null = null;
    private _soldierContainer: Node | null = null;
    private _buildingContainer: Node | null = null;
    private _coinContainer: Node | null = null;
    private _uiCanvas: Node | null = null;

    // === 实体 ===
    private _soldiers: Node[] = [];
    private _buildings: Node[] = [];
    private _coins: Node[] = [];
    private _base: Node | null = null;
    private _hero: Node | null = null;
    private _joystick: Joystick | null = null;

    // === 计时器 ===
    private _buildingTimer: number = 0;
    private _combatTimer: number = 0;
    private _coinTimer: number = 0;

    // === 生命周期 ===

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - Modular Version               ║');
        console.log('╚════════════════════════════════════════════════════╝');

        this.setupContainers();
        this.setupUI();
        this.setupEventListeners();

        // 初始化 Managers
        GameManager.instance.initialize();
        WaveManager.instance.initialize(this._enemyContainer!);
        HUDManager.instance.initialize(this._uiCanvas!);
        BuildingManager.instance.initialize(this._buildingContainer!, this._soldierContainer!);

        // 启用物理系统
        PhysicsSystem.instance.enable = true;
        // PhysicsSystem.instance.debugDrawFlags = PhysicsSystem.DebugDrawFlags.SHOW_ALL_COLLIDER; // For Debug
    }

    protected onDestroy(): void {
        EventManager.instance.offAllByTarget(this);
        WaveManager.instance.cleanup();
        HUDManager.instance.cleanup();
        BuildingManager.instance.cleanup();
    }

    protected start(): void {
        GameManager.instance.startGame();

        // 创建初始实体
        this._base = BuildingFactory.createBase(this._buildingContainer!, 0, 0, 100);
        
        const b1 = BuildingFactory.createBarracks(this._buildingContainer!, -2.5, 1);
        b1.getComponent(Building)?.setUnitContainer(this._soldierContainer!);
        this._buildings.push(b1);

        const b2 = BuildingFactory.createBarracks(this._buildingContainer!, 2.5, 1);
        b2.getComponent(Building)?.setUnitContainer(this._soldierContainer!);
        this._buildings.push(b2);

        // Test Tower
        const t1 = BuildingFactory.createTower(this._buildingContainer!, 0, 3);
        this._buildings.push(t1);

        this._hero = UnitFactory.createHero(this._soldierContainer!, 0, -1.5);

        // 设置英雄引用给建造管理器
        BuildingManager.instance.setHeroNode(this._hero);

        // 创建建造点
        this.createBuildingPads();

        console.log(`[Game] 💰 初始金币: ${GameManager.instance.coins}`);

        // 开始第一波
        this.scheduleOnce(() => WaveManager.instance.startWave(1), 2);
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 输入处理
        this.processInput();

        // 波次生成
        WaveManager.instance.update(dt);

        // 金币拾取检测 (Physics System handles this now)
        // this.updateCoinPickup(dt);

        // 建造系统更新
        BuildingManager.instance.update(dt);

        // 波次完成检查
        WaveManager.instance.checkWaveComplete((bonus) => {
            GameManager.instance.addCoins(bonus);
            
            // Loop forever
            const nextWave = WaveManager.instance.currentWave + 1;
            console.log(`[Game] Wave ${WaveManager.instance.currentWave} Complete. Next Wave: ${nextWave}`);
            this.scheduleOnce(() => WaveManager.instance.startWave(nextWave), 3);
        });
    }

    // === 初始化 ===

    private setupContainers(): void {
        // Prevent duplicate containers on scene/script reload
        const old = this.node.getChildByName('GameContainer');
        if (old) {
            old.destroy();
        }

        this._container = new Node('GameContainer');
        this.node.addChild(this._container);

        this._enemyContainer = new Node('Enemies');
        this._soldierContainer = new Node('Soldiers');
        this._buildingContainer = new Node('Buildings');
        this._coinContainer = new Node('Coins');

        this._container.addChild(this._enemyContainer);
        this._container.addChild(this._soldierContainer);
        this._container.addChild(this._buildingContainer);
        this._container.addChild(this._coinContainer);
        
        // Effects Container (Overlay)
        const effectContainer = new Node('Effects');
        this._container.addChild(effectContainer);
        
        // Init Effect Manager
        EffectManager.instance.initialize(effectContainer);
    }

    private setupUI(): void {
        this._uiCanvas = UIFactory.createUICanvas();
        this.node.addChild(this._uiCanvas);
        this._joystick = UIFactory.createJoystick(this._uiCanvas);
        
        // 初始化 HUD
        HUDManager.instance.initialize(this._uiCanvas);
    }

    private setupEventListeners(): void {
        EventManager.instance.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    private onEnemyReachedBase(data: any): void {
        const damage = data.damage || 10;
        this.damageBase(damage);

        // Fix: Remove from WaveManager so wave can complete
        if (data.enemy) {
            WaveManager.instance.removeEnemy(data.enemy);
        }
    }

    private onUnitDied(data: any): void {
        if (data.unitType === UnitType.ENEMY) {
            // Remove from manager
            if (data.node) {
                WaveManager.instance.removeEnemy(data.node);
            }

            // Drop Coin
            if (data.position && this._coinContainer) {
                const value = 5 + Math.floor(Math.random() * 5);
                CoinFactory.createCoin(
                    this._coinContainer,
                    data.position.x,
                    data.position.z, // Use Z for 3D logic
                    value
                );
            }
            // Note: data.node is destroyed by Unit.die() -> onDeath() -> destroy()?
            // Enemy.ts onDeath is empty now. Unit.die() emits event then onDeath().
            // It does NOT destroy node automatically unless I call it.
            if (data.node && data.node.isValid) {
                 data.node.destroy();
            }
        }
    }

    // === 建造系统 ===

    private createBuildingPads(): void {
        // 创建几个建造点
        const padPositions = [
            { x: -4, y: 3, type: 'barracks' },
            { x: 4, y: 3, type: 'lightning_tower' }, // Changed from barracks to test lightning
            { x: -4, y: -3, type: 'frost_tower' },
            { x: 4, y: -3, type: 'tower' },
        ];

        for (const pos of padPositions) {
            // TEST: Pre-spawn Frost Tower or Lightning Tower
            if (pos.type === 'frost_tower' || pos.type === 'lightning_tower') {
                 BuildingFactory.createBuilding(
                    this._buildingContainer!,
                    pos.x,
                    pos.y,
                    pos.type
                 );
                 console.log(`[GameController] Pre-spawned ${pos.type} at (${pos.x}, 0, ${pos.y})`);
                 continue; // Skip creating pad
            }

            const padNode = new Node(`BuildingPad_${pos.type}`);
            this._buildingContainer!.addChild(padNode);
            // Map y in config to z in world space for top-down view
            padNode.setPosition(pos.x, 0, pos.y);

            console.log(`[GameController] 创建建造点: type=${pos.type}, pos=(${pos.x}, 0, ${pos.y})`);

            const pad = padNode.addComponent(BuildingPad);
            pad.buildingTypeId = pos.type;

            BuildingManager.instance.registerPad(pad);
        }

        console.log(`[GameController] 创建了 ${padPositions.length} 个建造点, 父节点: ${this._buildingContainer!.name}`);
    }

    // === 输入处理 ===

    private processInput(): void {
        if (this._joystick && this._hero) {
            const heroComp = this._hero.getComponent(Hero);
            if (heroComp) {
                heroComp.setInput(this._joystick.inputVector);
            }
        }
    }

    // === 金币拾取 (Removed) ===
    // Physics System handles this via Coin.onTriggerEnter or Hero.onTriggerEnter

    // === 基地伤害 ===

    // === 基地伤害 ===

    private damageBase(damage: number): void {
        if (!this._base) return;

        const data = (this._base as any).baseData;
        if (!data) return;

        data.hp -= damage;
        // Update HUD
        HUDManager.instance.updateBaseHp(data.hp, data.maxHp);

        if (data.hp <= 0) {
            HUDManager.instance.updateBaseHp(0, data.maxHp);
            GameManager.instance.pause();
        }
    }

    // === 工具方法 ===

    private getDistance(a: Node, b: Node): number {
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z; // 3D logic
        return Math.sqrt(dx * dx + dz * dz);
    }

}
