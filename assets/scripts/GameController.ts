import { _decorator, Component, Node, PhysicsSystem } from 'cc';
import { MapGenerator } from './gameplay/map/MapGenerator';
import { WaveLoop } from './gameplay/wave/WaveLoop';
import { Joystick } from './ui/Joystick';
import { ServiceRegistry } from './core/managers/ServiceRegistry';
import { SceneGraphBuilder } from './core/bootstrap/SceneGraphBuilder';
import { UIBootstrap } from './core/bootstrap/UIBootstrap';
import { ServiceRegistrar } from './core/bootstrap/ServiceRegistrar';
import { GameplayBootstrap } from './core/bootstrap/GameplayBootstrap';
import { RuntimeSystemsBootstrap } from './core/bootstrap/RuntimeSystemsBootstrap';
import { GameStartFlow } from './core/bootstrap/GameStartFlow';
import { ControllerServices } from './core/bootstrap/ControllerServices';
import { PlayerInputAdapter } from './core/input/PlayerInputAdapter';
import { WeaponBehaviorFactory } from './gameplay/weapons/WeaponBehaviorFactory';

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
    private _effectContainer: Node | null = null;
    private _uiCanvas: Node | null = null;

    // === 实体 ===
    private _base: Node | null = null;
    private _hero: Node | null = null;
    private _joystick: Joystick | null = null;
    private _inputAdapter: PlayerInputAdapter | null = null;
    private _services: ControllerServices = new ControllerServices();

    // === 生命周期 ===

    private _mapGenerator: MapGenerator | null = null;
    private _waveLoop: WaveLoop | null = null;

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - Modular Version               ║');
        console.log('╚════════════════════════════════════════════════════╝');

        this.setupContainers();
        this.setupUI();

        if (this._container) {
            const gameplay = GameplayBootstrap.build(this._container);
            this._mapGenerator = gameplay.mapGenerator;
            this._waveLoop = gameplay.waveLoop;
        }

        if (this._container) {
            const runtime = RuntimeSystemsBootstrap.build(this._container);
            this._inputAdapter = runtime.inputAdapter;
        }

        // WaveLoop created by GameplayBootstrap

        // 初始化 Managers
        this._services.gameManager.initialize();
        // WaveManager initialized in Start() when Base is ready,
        // OR pass null/placeholder here first if needed.
        // Let's comment out here and do full init in start, OR split init.
        // Ideally: Set container in onLoad, Set Base in Start.
        // For now, let's keep it robust.
        // WaveManager initialize moved to start
        this._services.buildingManager.initialize(
            this._buildingContainer!,
            this._soldierContainer!
        );

        // 启用物理系统
        PhysicsSystem.instance.enable = true;

        // Register core services for decoupled access
        ServiceRegistrar.registerCore();

        // Initialize roguelike card system
        this._services.buffCardService.initialize();

        // Initialize weapon system
        WeaponBehaviorFactory.initialize();
        this._services.heroWeaponManager.initialize();
        this._services.airdropService.initialize();
    }

    protected onDestroy(): void {
        this._services.gameManager.cleanup();
        this._services.waveManager.cleanup();
        this._services.hudManager.cleanup();
        this._services.buildingManager.cleanup();
        this._services.effectManager.cleanup();
        this._services.coinDropManager.cleanup();
        this._services.buffCardService.cleanup();
        this._services.buffCardUI.cleanup();
        this._services.heroWeaponManager.cleanup();
        this._services.airdropService.cleanup();
        this._services.weaponSelectUI.cleanup();
        this._services.weaponBarUI.cleanup();
        ServiceRegistry.clear();
    }

    protected start(): void {
        GameStartFlow.run({
            mapGenerator: this._mapGenerator,
            waveLoop: this._waveLoop,
            containers: {
                enemy: this._enemyContainer!,
                soldier: this._soldierContainer!,
                building: this._buildingContainer!,
            },
            onSpawned: (base, hero) => {
                this._base = base;
                this._hero = hero;
                if (this._inputAdapter) {
                    this._inputAdapter.setTarget(this._hero, this._joystick);
                }
            },
        });
    }

    // === 初始化 ===

    private setupContainers(): void {
        const nodes = SceneGraphBuilder.build(this.node);
        this._container = nodes.container;
        this._enemyContainer = nodes.enemyContainer;
        this._soldierContainer = nodes.soldierContainer;
        this._buildingContainer = nodes.buildingContainer;
        this._coinContainer = nodes.coinContainer;
        this._effectContainer = nodes.effectContainer;
    }

    private setupUI(): void {
        const ui = UIBootstrap.build(this.node);
        this._uiCanvas = ui.canvas;
        this._joystick = ui.joystick;
    }

    // === 建造系统 ===
    // === 金币拾取 (Removed) ===
    // Physics System handles this via Coin.onTriggerEnter or Hero.onTriggerEnter
}
