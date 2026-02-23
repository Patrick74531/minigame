import { _decorator, Component, Node, PhysicsSystem, director } from 'cc';
import { MapGenerator } from './gameplay/map/MapGenerator';
import { WaveLoop } from './gameplay/wave/WaveLoop';
import { Joystick } from './ui/Joystick';
import { ServiceRegistry } from './core/managers/ServiceRegistry';
import { SceneGraphBuilder } from './core/bootstrap/SceneGraphBuilder';
import { UIBootstrap } from './core/bootstrap/UIBootstrap';
import { ServiceRegistrar } from './core/bootstrap/ServiceRegistrar';
import { GameplayBootstrap } from './core/bootstrap/GameplayBootstrap';
import { RuntimeSystemsBootstrap } from './core/bootstrap/RuntimeSystemsBootstrap';
import { GameStartFlow, StartContext } from './core/bootstrap/GameStartFlow';
import { ControllerServices } from './core/bootstrap/ControllerServices';
import { PlayerInputAdapter } from './core/input/PlayerInputAdapter';
import { WeaponBehaviorFactory } from './gameplay/weapons/WeaponBehaviorFactory';
import { WeaponVFX } from './gameplay/weapons/WeaponVFX';
import { WeaponSFXManager } from './gameplay/weapons/WeaponSFXManager';
import { ScreenShake } from './gameplay/weapons/vfx/ScreenShake';
import { HeroLevelSystem } from './gameplay/units/HeroLevelSystem';
import { LevelUpVFX } from './gameplay/effects/LevelUpVFX';
import { GameEvents } from './data/GameEvents';
import { EventManager } from './core/managers/EventManager';
import { ResourcePreloader } from './core/bootstrap/ResourcePreloader';
import { CoinFactory } from './gameplay/economy/CoinFactory';
import { SystemReset } from './core/bootstrap/SystemReset';
import { applyCanvasOnDisableSafetyPatch } from './core/engine/CanvasSafetyPatch';
import { AudioSettingsManager } from './core/managers/AudioSettingsManager';
import { GameSaveManager } from './core/managers/GameSaveManager';
import type { GameSaveData } from './core/managers/GameSaveManager';
import { Base } from './gameplay/buildings/Base';
import { GameState } from './core/managers/GameManager';

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

    // === 可见性暂停 ===

    private _pausedByVisibility: boolean = false;
    private _visibilityHandler: (() => void) | null = null;

    // === 存档 ===

    private _autoSaveTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly AUTO_SAVE_INTERVAL_MS = 10_000;

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
        applyCanvasOnDisableSafetyPatch();

        // 预加载关键资源（贴图/Prefab/动画），避免首波帧率抖动
        ResourcePreloader.preloadAll();
        CoinFactory.loadResources();

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
        WeaponVFX.initialize();
        AudioSettingsManager.instance.initialize(this.node);
        WeaponSFXManager.initialize(this.node);
        WeaponBehaviorFactory.initialize();
        this._services.heroWeaponManager.initialize();
        this._services.airdropService.initialize();

        // Bind ScreenShake to camera (will find camera in scene)
        ScreenShake.bind(this.node);

        // 切Tab/息屏时暂停游戏+保存状态，回来时自动恢复
        this._visibilityHandler = () => {
            if (document.hidden) {
                const gm = this._services.gameManager;
                if (gm.isPlaying || gm.gameState === GameState.PAUSED) {
                    const snap = this.collectSnapshot();
                    if (snap) GameSaveManager.instance.save(snap);
                }
                director.pause();
                if (gm.isPlaying) {
                    gm.pauseGame();
                    this._pausedByVisibility = true;
                }
            } else {
                director.resume();
                if (this._pausedByVisibility) {
                    this._pausedByVisibility = false;
                    this._services.gameManager.resumeGame();
                }
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        // 游戏开始时启动定时存档
        this.evtMgr.on(GameEvents.GAME_START, this.onGameStartSave, this);
        // 游戏结束时清除存档（基地被摧毁 = 正常死亡，不应继续）
        this.evtMgr.on(GameEvents.GAME_OVER, this.onGameOverClearSave, this);
    }

    protected onDestroy(): void {
        // 1. Cleanup all services (unregister events, stop timers, etc.)
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
        HeroLevelSystem.instance.cleanup();
        this.evtMgr.off(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);
        AudioSettingsManager.instance.cleanup();
        WeaponSFXManager.cleanup();
        WeaponVFX.cleanup();
        ServiceRegistry.clear();

        // 2. Destroy ALL singleton instances so scene reload creates fresh ones.
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        this.evtMgr.off(GameEvents.GAME_START, this.onGameStartSave, this);
        this.evtMgr.off(GameEvents.GAME_OVER, this.onGameOverClearSave, this);
        if (this._autoSaveTimer !== null) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
        SystemReset.shutdown();
    }

    protected start(): void {
        const ctx: StartContext = {
            mapGenerator: this._mapGenerator,
            waveLoop: this._waveLoop,
            containers: {
                enemy: this._enemyContainer!,
                soldier: this._soldierContainer!,
                building: this._buildingContainer!,
                ui: this._uiCanvas!,
            },
            onSpawned: (base: Node, hero: Node) => {
                this._base = base;
                this._hero = hero;
                if (this._inputAdapter) {
                    this._inputAdapter.setTarget(this._hero, this._joystick);
                }
                HeroLevelSystem.instance.initialize(hero);
                this.evtMgr.on(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);
                // Restore base HP from save data (ctx.saveData is set before onSpawned fires)
                if (ctx.saveData) {
                    const baseComp = base.getComponent(Base);
                    if (baseComp) {
                        baseComp.currentHp = Math.max(
                            1,
                            Math.floor(ctx.saveData.baseHpRatio * baseComp.maxHp)
                        );
                    }
                }
            },
        };
        GameStartFlow.run(ctx);
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

    // === 升级 VFX ===

    private onHeroLevelUp(data: { level: number; heroNode: Node; quiet?: boolean }): void {
        if (!data.quiet && this._uiCanvas) {
            LevelUpVFX.play(this._uiCanvas, data.heroNode, data.level);
        }
    }

    // === 存档逻辑 ===

    private collectSnapshot(): GameSaveData | null {
        const gm = this._services.gameManager;
        if (gm.currentWave < 1) return null;
        const baseComp = this._base?.getComponent(Base);
        const hls = HeroLevelSystem.instance;
        return {
            version: 1,
            savedAt: Date.now(),
            waveNumber: gm.currentWave,
            baseHpRatio: baseComp
                ? Math.max(0, baseComp.currentHp / Math.max(1, baseComp.maxHp))
                : 1,
            coins: gm.coins,
            score: gm.score,
            heroLevel: hls.level,
            heroXp: hls.currentXp,
        };
    }

    private onGameStartSave(): void {
        if (this._autoSaveTimer !== null) return;
        this._autoSaveTimer = setInterval(() => {
            const gm = this._services.gameManager;
            if (!gm.isPlaying) return;
            const snap = this.collectSnapshot();
            if (snap) GameSaveManager.instance.save(snap);
        }, GameController.AUTO_SAVE_INTERVAL_MS);
    }

    private onGameOverClearSave(): void {
        GameSaveManager.instance.clear();
        if (this._autoSaveTimer !== null) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    }

    private get evtMgr(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
