import {
    _decorator,
    Component,
    Node,
    Input,
    input,
    EventTouch,
    Vec2,
    Vec3,
    PhysicsSystem,
    geometry,
    Camera,
} from 'cc';
import { CameraFollow } from './core/camera/CameraFollow';
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { WaveManager } from './gameplay/wave/WaveManager';
import { HUDManager } from './ui/HUDManager';
import { GameEvents } from './data/GameEvents';
import { UnitFactory } from './gameplay/units/UnitFactory';
import { UnitType } from './gameplay/units/Unit';
import { BuildingFactory } from './gameplay/buildings/BuildingFactory';
import { Building } from './gameplay/buildings/Building';
import { Base } from './gameplay/buildings/Base';
import { CoinFactory } from './gameplay/economy/CoinFactory';
import { GameConfig } from './data/GameConfig';
import { Unit } from './gameplay/units/Unit';
import { Hero } from './gameplay/units/Hero';
import { UIFactory } from './ui/UIFactory';
import { Joystick } from './ui/Joystick';
import { BuildingManager } from './gameplay/buildings/BuildingManager';
import { BuildingPad } from './gameplay/buildings/BuildingPad';
import { EffectManager } from './core/managers/EffectManager';
import { MapGenerator } from './gameplay/map/MapGenerator';

const { ccclass, property } = _decorator;

/**
 * 游戏主控制器 (组件化版本)
 * 职责: 协调各子系统，不包含具体业务逻辑
 * 目标: ~150 行
 *
 * NOTE: 扩展新系统时，尽量保持此处只做“装配/编排”。
 * 业务逻辑应放在对应的 Manager/Registry/Component 中，避免这里膨胀。
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

    // Map Generator
    private _mapGenerator: MapGenerator | null = null;

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - Modular Version               ║');
        console.log('╚════════════════════════════════════════════════════╝');

        this.setupContainers();
        this.setupUI();
        this.setupEventListeners();

        // Setup Map Generator
        const mapNode = new Node('MapGenerator');
        this._container?.addChild(mapNode);
        this._mapGenerator = mapNode.addComponent(MapGenerator);

        // 初始化 Managers
        GameManager.instance.initialize();
        // WaveManager initialized in Start() when Base is ready,
        // OR pass null/placeholder here first if needed.
        // Let's comment out here and do full init in start, OR split init.
        // Ideally: Set container in onLoad, Set Base in Start.
        // For now, let's keep it robust.
        // WaveManager.instance.initialize(this._enemyContainer!); // Removed, moved to start
        BuildingManager.instance.initialize(this._buildingContainer!, this._soldierContainer!);

        // 启用物理系统
        PhysicsSystem.instance.enable = true;

    }

    protected onDestroy(): void {
        EventManager.instance.offAllByTarget(this);
        GameManager.instance.cleanup();
        WaveManager.instance.cleanup();
        HUDManager.instance.cleanup();
        BuildingManager.instance.cleanup();
        EffectManager.instance.cleanup();
    }

    protected start(): void {
        GameManager.instance.startGame();

        // Generate Map
        if (this._mapGenerator) {
            // this._mapGenerator.generateTestMap();
            // this._mapGenerator.generateFromImage('cyberpunk_map');
            this._mapGenerator.generateProceduralMap();
        }

        // 创建初始实体
        // 创建初始实体
        // Spawn at Top-Left Area (Index 5,5 corresponds to roughly -9 in World space)
        const spawnX = GameConfig.MAP.BASE_SPAWN.x;
        const spawnZ = GameConfig.MAP.BASE_SPAWN.z;

        this._base = BuildingFactory.createBase(
            this._buildingContainer!,
            spawnX,
            spawnZ,
            GameConfig.BUILDING.BASE_START_HP
        );

        // Spawn Hero slightly offset from base
        this._hero = UnitFactory.createHero(
            this._soldierContainer!,
            spawnX + GameConfig.MAP.HERO_SPAWN_OFFSET.x,
            spawnZ + GameConfig.MAP.HERO_SPAWN_OFFSET.z
        );

        // Initialize WaveManager with Base
        // Note: We initialized WaveManager in onLoad without base.
        // We should explicitly set it or re-initialize logic.
        // Let's call a setter or re-init if allowed. Or just set it here.
        WaveManager.instance.initialize(this._enemyContainer!, this._base);

        // Setup Camera Follow
        const mainCamera = this.node.scene.getComponentInChildren(Camera);
        if (mainCamera) {
            let follow = mainCamera.node.getComponent(CameraFollow);
            if (!follow) {
                follow = mainCamera.node.addComponent(CameraFollow);
                // Adjust offset for isometric view
                follow.offset = new Vec3(0, 10, 8);
            }
            follow.target = this._hero;
            // Force snap to new start position immediately
            follow.snap();
        } else {
            console.warn('[GameController] Main Camera not found!');
        }

        // 设置英雄引用给建造管理器
        BuildingManager.instance.setHeroNode(this._hero);

        // 创建建造点 - Restore this
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
        WaveManager.instance.checkWaveComplete(bonus => {
            GameManager.instance.addCoins(bonus);

            // Loop forever
            const nextWave = WaveManager.instance.currentWave + 1;
            console.log(
                `[Game] Wave ${WaveManager.instance.currentWave} Complete. Next Wave: ${nextWave}`
            );
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
        // 建造点配置集中在 GameConfig，避免硬编码
        const padPositions = GameConfig.BUILDING.PADS;

        for (const pos of padPositions) {
            // TEST: Pre-spawn Frost Tower or Lightning Tower
            if (pos.type === 'frost_tower' || pos.type === 'lightning_tower') {
                BuildingFactory.createBuilding(this._buildingContainer!, pos.x, pos.z, pos.type);
                console.log(`[GameController] Pre-spawned ${pos.type} at (${pos.x}, 0, ${pos.z})`);
                continue; // Skip creating pad
            }

            const padNode = new Node(`BuildingPad_${pos.type}`);
            this._buildingContainer!.addChild(padNode);
            // Map y in config to z in world space for top-down view
            padNode.setPosition(pos.x, 0, pos.z);

            console.log(
                `[GameController] 创建建造点: type=${pos.type}, pos=(${pos.x}, 0, ${pos.z})`
            );

            const pad = padNode.addComponent(BuildingPad);
            pad.buildingTypeId = pos.type;

            BuildingManager.instance.registerPad(pad);
        }

        console.log(
            `[GameController] 创建了 ${padPositions.length} 个建造点, 父节点: ${this._buildingContainer!.name}`
        );
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

    private damageBase(damage: number): void {
        if (!this._base) return;

        const baseComp = this._base.getComponent(Base);
        if (baseComp && baseComp.isAlive) {
            baseComp.takeDamage(damage);
        }
    }

    // === 工具方法 ===

    private getDistance(a: Node, b: Node): number {
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z; // 3D logic
        return Math.sqrt(dx * dx + dz * dz);
    }
}
