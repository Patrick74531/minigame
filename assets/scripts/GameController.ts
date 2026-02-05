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
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { WaveManager } from './gameplay/wave/WaveManager';
import { HUDManager } from './ui/HUDManager';
import { UnitFactory } from './gameplay/units/UnitFactory';
import { BuildingFactory } from './gameplay/buildings/BuildingFactory';
import { GameConfig } from './data/GameConfig';
import { Hero } from './gameplay/units/Hero';
import { UIFactory } from './ui/UIFactory';
import { Joystick } from './ui/Joystick';
import { BuildingManager } from './gameplay/buildings/BuildingManager';
import { EffectManager } from './core/managers/EffectManager';
import { MapGenerator } from './gameplay/map/MapGenerator';
import { CombatSystem } from './gameplay/combat/CombatSystem';
import { ServiceRegistry } from './core/managers/ServiceRegistry';
import { WaveService } from './core/managers/WaveService';
import { PoolManager } from './core/managers/PoolManager';
import { CoinDropManager } from './gameplay/economy/CoinDropManager';
import { WaveLoop } from './gameplay/wave/WaveLoop';
import { BuildingPadSpawner } from './gameplay/buildings/BuildingPadSpawner';
import { CameraRig } from './core/camera/CameraRig';

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
    private _base: Node | null = null;
    private _hero: Node | null = null;
    private _joystick: Joystick | null = null;

    // === 生命周期 ===

    // Map Generator
    private _mapGenerator: MapGenerator | null = null;
    private _waveLoop: WaveLoop | null = null;

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - Modular Version               ║');
        console.log('╚════════════════════════════════════════════════════╝');

        this.setupContainers();
        this.setupUI();

        // Setup Map Generator
        const mapNode = new Node('MapGenerator');
        this._container?.addChild(mapNode);
        this._mapGenerator = mapNode.addComponent(MapGenerator);

        // Setup Combat System (Centralized targeting)
        // NOTE: Soldier auto-targeting depends on CombatSystem. If you remove it, add a fallback.
        const combatNode = new Node('CombatSystem');
        this._container?.addChild(combatNode);
        combatNode.addComponent(CombatSystem);

        const waveNode = new Node('WaveLoop');
        this._container?.addChild(waveNode);
        this._waveLoop = waveNode.addComponent(WaveLoop);

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

        // Register core services for decoupled access
        this.registerCoreServices();

    }

    protected onDestroy(): void {
        GameManager.instance.cleanup();
        WaveManager.instance.cleanup();
        HUDManager.instance.cleanup();
        BuildingManager.instance.cleanup();
        EffectManager.instance.cleanup();
        CoinDropManager.instance.cleanup();
        ServiceRegistry.clear();
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
        CameraRig.setupFollow(this.node.scene, this._hero, new Vec3(0, 10, 8));

        // 设置英雄引用给建造管理器
        BuildingManager.instance.setHeroNode(this._hero);

        // 创建建造点 - Restore this
        BuildingPadSpawner.spawnPads(this._buildingContainer!, BuildingManager.instance);

        console.log(`[Game] 💰 初始金币: ${GameManager.instance.coins}`);

        // 开始第一波
        if (this._waveLoop) {
            this._waveLoop.initialize(WaveManager.instance, GameManager.instance, 2);
        }
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 输入处理
        this.processInput();

        // 建造系统更新
        BuildingManager.instance.update(dt);
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

        CoinDropManager.instance.initialize(this._coinContainer);

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

    /**
     * 统一注册全局服务入口，方便后续扩展与统一清理。
     * NOTE: 仅注册“全局/长生命周期”服务，避免短生命周期对象进入 Registry。
     */
    private registerCoreServices(): void {
        // NOTE: Use ServiceRegistry.get(...) for new code to reduce hard dependencies.
        ServiceRegistry.register('EventManager', EventManager.instance);
        ServiceRegistry.register('GameManager', GameManager.instance);
        ServiceRegistry.register('HUDManager', HUDManager.instance);
        ServiceRegistry.register('BuildingManager', BuildingManager.instance);
        ServiceRegistry.register('EffectManager', EffectManager.instance);
        ServiceRegistry.register('WaveManager', WaveManager.instance);
        ServiceRegistry.register('WaveRuntime', WaveManager.instance);
        ServiceRegistry.register('WaveService', WaveService.instance);
        ServiceRegistry.register('PoolManager', PoolManager.instance);
        // Fallback spawner when soldier pool is not registered
        ServiceRegistry.register('SoldierSpawner', (parent: Node, x: number, z: number) =>
            UnitFactory.createSoldier(parent, x, z)
        );
    }

    // === 建造系统 ===
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
}
