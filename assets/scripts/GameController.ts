import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    PhysicsSystem,
    UITransform,
    Widget,
    director,
} from 'cc';
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
import { Base } from './gameplay/buildings/Base';
import { BuildingManager } from './gameplay/buildings/BuildingManager';
import { AirdropService } from './gameplay/airdrop/AirdropService';
import { BuffCardService } from './gameplay/roguelike/BuffCardService';
import { HeroWeaponManager } from './gameplay/weapons/HeroWeaponManager';
import { Hero } from './gameplay/units/Hero';
import { GameState } from './core/managers/GameManager';
import { ItemService } from './gameplay/items/ItemService';
import { SoloRuntime } from './core/runtime/SoloRuntime';
import { CoopRuntime } from './core/runtime/CoopRuntime';
import type { IGameRuntime } from './core/runtime/IGameRuntime';
import { CoopStartFlow } from './core/runtime/CoopStartFlow';
import type { CoopMatchState } from './core/runtime/CoopNetManager';
import { applyLayerRecursive, HUD_UI_LAYER } from './ui/hud/HUDCommon';

const { ccclass, property } = _decorator;
const COOP_CREATE_MATCH_SENTINEL = '__create__';

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

    // === 自动存档 ===
    private _autosaveIntervalId: ReturnType<typeof setInterval> | null = null;

    // === 运行时 ===
    private _runtime: IGameRuntime | null = null;
    private _coopWaitingOverlay: Node | null = null;
    private _coopWaitingHintLabel: Label | null = null;
    private _coopStartInFlight: boolean = false;

    // === 实体 ===
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

        console.debug('╔════════════════════════════════════════════════════╗');
        console.debug('║       KingShit MVP - Modular Version               ║');
        console.debug('╚════════════════════════════════════════════════════╝');

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

        // Initialize game runtime (sets up HeroQuery provider)
        // Mode routing: CoopRuntime when coop mode is requested, SoloRuntime otherwise.
        // TODO(coop): wire mode selection from HomePage/lobby UI
        this._runtime = this._resolveRuntime();
        this._runtime.initialize();

        // Register core services for decoupled access
        ServiceRegistrar.registerCore();

        // Initialize roguelike card system
        this._services.buffCardService.initialize();

        // Initialize item system (boss chest drops)
        this._services.itemService.initialize();
        this._services.chestDropManager.initialize(this._coinContainer!, null);

        // Initialize weapon system
        WeaponVFX.initialize();
        AudioSettingsManager.instance.initialize(this.node);
        WeaponSFXManager.initialize(this.node);
        WeaponBehaviorFactory.initialize();
        this._services.heroWeaponManager.initialize();
        this._services.airdropService.initialize();

        // Bind ScreenShake to camera (will find camera in scene)
        ScreenShake.bind(this.node);

        // 切Tab/息屏时暂停游戏，回来时自动恢复
        this._visibilityHandler = () => {
            if (document.hidden) {
                const gm = this._services.gameManager;
                if (gm.isPlaying || gm.gameState === GameState.PAUSED) {
                    const snap = this.collectSnapshot();
                    if (snap) GameSaveManager.instance.saveImmediate(snap);
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
    }

    protected update(dt: number): void {
        this._services.chestDropManager.update(dt);
        // Drive coop runtime tick (remote hero interpolation + dual camera)
        if (this._runtime && this._runtime.mode === 'coop') {
            (this._runtime as CoopRuntime).tick(dt);
        }
    }

    protected onDestroy(): void {
        if (this._autosaveIntervalId !== null) {
            clearInterval(this._autosaveIntervalId);
            this._autosaveIntervalId = null;
        }
        this.evtMgr.off(GameEvents.GAME_START, this.onGameStart, this);
        this.evtMgr.off(GameEvents.GAME_OVER, this.onGameOverClearSave, this);
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
        this._services.itemService.cleanup();
        this._services.chestDropManager.cleanup();
        this._services.itemCardUI.cleanup();
        this._services.itemBarUI.cleanup();
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
        this._hideCoopWaitingOverlay();
        this._runtime?.cleanup();
        this._runtime = null;
        SystemReset.shutdown();
    }

    protected start(): void {
        this.evtMgr.on(GameEvents.GAME_START, this.onGameStart, this);
        this.evtMgr.on(GameEvents.GAME_OVER, this.onGameOverClearSave, this);

        if (this._runtime?.mode === 'coop') {
            this.startCoopGame().catch(err => {
                this._logCoopStartFailure('startup', err);
                this._notifyCoopStartFailure(err);
                this._runtime?.cleanup();
                this._runtime = new SoloRuntime();
                this._runtime.initialize();
                this.startSoloGame();
            });
            return;
        }

        this.startSoloGame();
    }

    private startSoloGame(): void {
        const ctx: StartContext = {
            mapGenerator: this._mapGenerator,
            waveLoop: this._waveLoop,
            containers: {
                enemy: this._enemyContainer!,
                soldier: this._soldierContainer!,
                building: this._buildingContainer!,
                ui: this._uiCanvas!,
            },
            onSpawned: (_base: Node, hero: Node) => {
                this._hero = hero;
                if (this._inputAdapter) {
                    this._inputAdapter.setTarget(this._hero, this._joystick);
                }
                HeroLevelSystem.instance.initialize(hero);
                this.evtMgr.on(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);

                // Wire item system with hero reference
                this._services.chestDropManager.setHeroNode(hero);
                this._services.itemCardUI.initialize(this._uiCanvas!);
                this._services.itemBarUI.initialize(this._uiCanvas!);
            },
            onCoopRequested: (matchId: string) => {
                this.startCoopFromHome(matchId).catch(err => {
                    this._logCoopStartFailure('from_home', err);
                    this._notifyCoopStartFailure(err);
                    this._runtime?.cleanup();
                    this._runtime = new SoloRuntime();
                    this._runtime.initialize();
                    this.startSoloGame();
                });
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

    // === 自动存档 ===

    private onGameStart(): void {
        if (this._autosaveIntervalId !== null) clearInterval(this._autosaveIntervalId);
        this._autosaveIntervalId = setInterval(() => {
            const snap = this.collectSnapshot();
            if (snap) GameSaveManager.instance.save(snap);
        }, 10_000);
    }

    private onGameOverClearSave(): void {
        if (this._autosaveIntervalId !== null) {
            clearInterval(this._autosaveIntervalId);
            this._autosaveIntervalId = null;
        }
        GameSaveManager.instance.clear();
    }

    private collectSnapshot(): import('./core/managers/GameSaveManager').GameSaveDataV2 | null {
        const gm = this._services.gameManager;
        if (!gm.isPlaying && gm.gameState !== GameState.PAUSED) return null;

        // During inter-wave countdown, currentWave is the completed wave (N).
        // Save nextWaveNumber (N+1) so restore starts at the correct wave.
        let waveNumber = this._services.waveManager.currentWave;
        if (this._waveLoop?.isPendingNextWave && this._waveLoop.nextWaveNumber > waveNumber) {
            waveNumber = this._waveLoop.nextWaveNumber;
        }
        if (!waveNumber || waveNumber < 1) return null;

        const base = this._buildingContainer?.children.find(n => n.getComponent(Base));
        const baseComp = base ? base.getComponent(Base) : null;
        const baseHpRatio = baseComp
            ? Math.max(0, baseComp.currentHp / Math.max(1, baseComp.maxHp))
            : 1;
        const baseLevel = baseComp ? Math.max(1, Math.floor(baseComp.level)) : 1;

        const heroLevel = HeroLevelSystem.instance.level;
        const heroXp = HeroLevelSystem.instance.currentXp;
        const heroNode = this._hero && this._hero.isValid ? this._hero : gm.hero;
        const heroComp = heroNode?.getComponent(Hero) ?? null;
        const heroCoinCount = heroComp ? heroComp.coinCount : 0;

        const weaponMgr = HeroWeaponManager.instance;
        const weapons = Array.from(weaponMgr.inventory.values()).map(w => ({
            type: w.type as string,
            level: w.level,
        }));
        const activeWeaponType = weaponMgr.activeWeaponType as string | null;

        const buildings = BuildingManager.instance.getSnapshot();

        const buffIds = BuffCardService.instance.pickedHistory.map(c => c.id);

        const nextOfferWave = AirdropService.instance.nextOfferWave;

        const items = ItemService.instance.getSnapshot();

        return {
            version: 2,
            savedAt: Date.now(),
            waveNumber,
            baseLevel,
            baseHpRatio,
            coins: gm.coins,
            heroCoinCount,
            score: gm.score,
            heroLevel,
            heroXp,
            weapons,
            activeWeaponType,
            buildings,
            buffCardIds: buffIds,
            nextOfferWave,
            items,
        };
    }

    // === 升级 VFX ===

    private onHeroLevelUp(data: { level: number; heroNode: Node; quiet?: boolean }): void {
        if (data.quiet) return;
        if (this._uiCanvas) {
            LevelUpVFX.play(this._uiCanvas, data.heroNode, data.level);
        }
    }

    private async startCoopGame(preferredMatchId: string = ''): Promise<void> {
        const runtime = this._runtime as CoopRuntime;
        const net = runtime.netManager;
        this._services.hudManager.setVisible(false);

        const normalizedPreferredMatchId = preferredMatchId.trim();
        const forceCreate = normalizedPreferredMatchId === COOP_CREATE_MATCH_SENTINEL;
        const matchIdParam = forceCreate
            ? ''
            : normalizedPreferredMatchId ||
              this._getQueryParam('matchId') ||
              this._getLocalStorageValue('KS_COOP_MATCH_ID');
        let state: CoopMatchState;
        if (matchIdParam) {
            try {
                state = await net.joinMatch(matchIdParam);
            } catch (error) {
                const msg = this._extractErrorMessage(error);
                if (msg.includes('already_joined') || msg.includes('match_not_waiting')) {
                    state = await net.rejoinMatch(matchIdParam);
                } else {
                    throw error;
                }
            }
        } else {
            const created = await net.createMatch();
            state = created.state;
            if (typeof window !== 'undefined') {
                try {
                    window.localStorage?.setItem('KS_COOP_MATCH_ID', created.matchId);
                } catch {
                    // ignore localStorage write failure
                }
            }
            const joinUrl = this._buildCoopJoinUrl(created.matchId);
            this._showCoopWaitingOverlay(created.matchId, joinUrl);
            try {
                state = await this.waitForSecondPlayer(net.matchId, state);
            } finally {
                this._hideCoopWaitingOverlay();
            }
        }

        const localPlayerId = net.localPlayerId;
        if (!localPlayerId) {
            throw new Error('localPlayerId is missing after match setup');
        }
        const remotePlayer = state.players.find(p => p.playerId !== localPlayerId);
        if (!remotePlayer) {
            throw new Error('remote player missing (players < 2)');
        }

        // Determine host/guest: slot 0 = host (match creator)
        const isHost = state.players[0]?.playerId === localPlayerId;
        runtime.setHostMode(isHost);

        this._services.hudManager.setVisible(true);
        if (this._mapGenerator) {
            this._mapGenerator.generateProceduralMap();
        }

        await net.connect(localPlayerId);

        const spawned = CoopStartFlow.spawn(
            {
                enemy: this._enemyContainer!,
                soldier: this._soldierContainer!,
                building: this._buildingContainer!,
            },
            runtime,
            localPlayerId,
            remotePlayer.playerId
        );

        const localHero = runtime.players.find(p => p.isLocal)?.heroNode ?? spawned.heroes[0];
        this._hero = localHero;
        if (this._inputAdapter) {
            this._inputAdapter.setTarget(localHero, this._joystick);
        }

        this.evtMgr.on(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);
        this._services.chestDropManager.setHeroNode(localHero);
        this._services.itemCardUI.initialize(this._uiCanvas!);
        this._services.itemBarUI.initialize(this._uiCanvas!);

        CoopStartFlow.startWaves(this._waveLoop);
        this._services.gameManager.startGame();
    }

    private async waitForSecondPlayer(
        matchId: string,
        initialState: CoopMatchState
    ): Promise<CoopMatchState> {
        const timeoutMs = 120_000;
        const startedAt = Date.now();
        let state = initialState;
        while (Date.now() - startedAt < timeoutMs) {
            // Some backend edge cases can lag status updates; player count is the
            // authoritative condition for starting 2P scene bootstrap.
            if (state.players.length >= 2) {
                return state;
            }
            await new Promise<void>(resolve => setTimeout(resolve, 1000));
            state = await (this._runtime as CoopRuntime).netManager.getMatchState(matchId);
        }
        throw new Error('wait_second_player_timeout');
    }

    private _getQueryParam(key: string): string {
        if (typeof window === 'undefined') return '';
        try {
            return new URLSearchParams(window.location.search).get(key)?.trim() ?? '';
        } catch {
            return '';
        }
    }

    private _getLocalStorageValue(key: string): string {
        if (typeof window === 'undefined') return '';
        try {
            return window.localStorage?.getItem(key)?.trim() ?? '';
        } catch {
            return '';
        }
    }

    private _buildCoopJoinUrl(matchId: string): string {
        if (typeof window === 'undefined')
            return `?mode=coop&matchId=${encodeURIComponent(matchId)}`;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('mode', 'coop');
            url.searchParams.set('matchId', matchId);
            return url.toString();
        } catch {
            return `${window.location.origin}${window.location.pathname}?mode=coop&matchId=${encodeURIComponent(matchId)}`;
        }
    }

    private _showCoopWaitingOverlay(matchId: string, joinUrl: string): void {
        if (!this._uiCanvas || this._coopWaitingOverlay) return;

        const canvasTf = this._uiCanvas.getComponent(UITransform);
        const width = Math.max(1, canvasTf?.contentSize.width ?? 1280);
        const height = Math.max(1, canvasTf?.contentSize.height ?? 720);
        const shortSide = Math.min(width, height);

        const overlay = new Node('CoopWaitingOverlay');
        this._uiCanvas.addChild(overlay);
        overlay.addComponent(UITransform).setContentSize(width, height);
        const overlayWidget = overlay.addComponent(Widget);
        overlayWidget.isAlignTop = true;
        overlayWidget.isAlignBottom = true;
        overlayWidget.isAlignLeft = true;
        overlayWidget.isAlignRight = true;
        overlayWidget.top = 0;
        overlayWidget.bottom = 0;
        overlayWidget.left = 0;
        overlayWidget.right = 0;

        const mask = overlay.addComponent(Graphics);
        mask.fillColor = new Color(8, 12, 20, 210);
        mask.rect(-width * 0.5, -height * 0.5, width, height);
        mask.fill();

        overlay.addComponent(Button).transition = Button.Transition.NONE;
        overlay.on(Button.EventType.CLICK, () => {
            // Block underlying interactions while waiting.
        });

        const panel = new Node('CoopWaitingPanel');
        overlay.addChild(panel);
        panel.addComponent(UITransform);
        panel.addComponent(Graphics);

        const panelW = Math.round(Math.min(width * 0.86, 560));
        const panelH = Math.round(Math.min(height * 0.62, 420));
        panel.getComponent(UITransform)?.setContentSize(panelW, panelH);
        panel.setPosition(0, -Math.round(shortSide * 0.03), 0);

        const panelBg = panel.getComponent(Graphics);
        if (panelBg) {
            const radius = Math.max(16, Math.round(panelH * 0.08));
            panelBg.fillColor = new Color(26, 36, 60, 248);
            panelBg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
            panelBg.fill();
            panelBg.strokeColor = new Color(255, 214, 116, 220);
            panelBg.lineWidth = Math.max(2, Math.round(panelH * 0.012));
            panelBg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
            panelBg.stroke();
        }

        const title = this._createOverlayText(
            panel,
            'WaitingTitle',
            '房间已创建，等待好友加入',
            panelW - 56,
            Math.round(panelH * 0.11),
            new Color(255, 233, 145, 255),
            true
        );
        title.node.getComponent(UITransform)?.setContentSize(panelW - 56, 62);
        title.node.setPosition(0, Math.round(panelH * 0.31), 0);
        title.fontSize = Math.round(Math.max(30, panelH * 0.09));
        title.lineHeight = title.fontSize + 8;

        const subtitle = this._createOverlayText(
            panel,
            'WaitingSubtitle',
            '把邀请码发给好友，好友输入后即可一起开始',
            panelW - 72,
            Math.round(panelH * 0.12),
            new Color(228, 236, 255, 255)
        );
        subtitle.node.setPosition(0, Math.round(panelH * 0.17), 0);
        subtitle.fontSize = Math.round(Math.max(20, panelH * 0.052));
        subtitle.lineHeight = subtitle.fontSize + 6;

        const codeLabel = this._createOverlayText(
            panel,
            'CodeLabel',
            `邀请码：${matchId}`,
            panelW - 72,
            Math.round(panelH * 0.14),
            new Color(255, 246, 180, 255),
            true
        );
        codeLabel.node.setPosition(0, Math.round(panelH * 0.01), 0);
        codeLabel.fontSize = Math.round(Math.max(24, panelH * 0.064));
        codeLabel.lineHeight = codeLabel.fontSize + 6;

        const copyCodeBtn = this._createOverlayButton(panel, 'CopyCodeBtn', '复制邀请码', () => {
            this._copyToClipboard(matchId).then(ok => {
                this._setCoopWaitingHint(ok ? '邀请码已复制' : '复制失败，请手动长按复制');
            });
        });
        const shareBtn = this._createOverlayButton(panel, 'ShareBtn', '邀请朋友', () => {
            this._shareInvite(joinUrl, matchId).then(ok => {
                this._setCoopWaitingHint(
                    ok ? '已打开分享窗口' : '无法打开分享窗口，请先复制邀请码'
                );
            });
        });
        const copyLinkBtn = this._createOverlayButton(panel, 'CopyLinkBtn', '复制链接', () => {
            this._copyToClipboard(joinUrl).then(ok => {
                this._setCoopWaitingHint(ok ? '邀请链接已复制' : '复制失败，请手动复制链接');
            });
        });

        const actionBtnW = Math.round((panelW - 86) * 0.5);
        const actionBtnH = Math.round(Math.max(48, panelH * 0.14));
        copyCodeBtn.getComponent(UITransform)?.setContentSize(actionBtnW, actionBtnH);
        copyCodeBtn.setPosition(-Math.round(actionBtnW * 0.52), -Math.round(panelH * 0.23), 0);
        this._drawOverlayButton(copyCodeBtn, new Color(72, 192, 96, 255), Color.WHITE);

        shareBtn.getComponent(UITransform)?.setContentSize(actionBtnW, actionBtnH);
        shareBtn.setPosition(Math.round(actionBtnW * 0.52), -Math.round(panelH * 0.23), 0);
        this._drawOverlayButton(shareBtn, new Color(255, 198, 88, 255), Color.WHITE);

        const linkBtnW = Math.round(Math.min(panelW * 0.46, 220));
        const linkBtnH = Math.round(Math.max(42, panelH * 0.12));
        copyLinkBtn.getComponent(UITransform)?.setContentSize(linkBtnW, linkBtnH);
        copyLinkBtn.setPosition(0, -Math.round(panelH * 0.38), 0);
        this._drawOverlayButton(
            copyLinkBtn,
            new Color(86, 98, 128, 255),
            new Color(240, 244, 255, 255)
        );

        const hintLabel = this._createOverlayText(
            panel,
            'HintLabel',
            '',
            panelW - 56,
            Math.round(panelH * 0.09),
            new Color(180, 255, 204, 255)
        );
        hintLabel.node.setPosition(0, -Math.round(panelH * 0.08), 0);
        hintLabel.fontSize = Math.round(Math.max(18, panelH * 0.046));
        hintLabel.lineHeight = hintLabel.fontSize + 6;

        this._coopWaitingOverlay = overlay;
        this._coopWaitingHintLabel = hintLabel;
        this._setCoopWaitingHint('等待好友输入邀请码...');
        applyLayerRecursive(overlay, HUD_UI_LAYER);
    }

    private _hideCoopWaitingOverlay(): void {
        if (this._coopWaitingOverlay && this._coopWaitingOverlay.isValid) {
            this._coopWaitingOverlay.destroy();
        }
        this._coopWaitingOverlay = null;
        this._coopWaitingHintLabel = null;
    }

    private _createOverlayText(
        parent: Node,
        name: string,
        text: string,
        width: number,
        height: number,
        color: Color,
        bold: boolean = false
    ): Label {
        const node = new Node(name);
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private _createOverlayButton(
        parent: Node,
        name: string,
        text: string,
        onClick: () => void
    ): Node {
        const btnNode = new Node(name);
        parent.addChild(btnNode);
        btnNode.addComponent(UITransform).setContentSize(200, 56);
        btnNode.addComponent(Graphics);
        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.96;

        const labelNode = new Node('Label');
        btnNode.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(176, 48);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.fontSize = 28;
        label.lineHeight = 34;

        btnNode.on(Button.EventType.CLICK, onClick, this);
        return btnNode;
    }

    private _drawOverlayButton(btnNode: Node, fill: Color, textColor: Color): void {
        const tf = btnNode.getComponent(UITransform);
        const bg = btnNode.getComponent(Graphics);
        const label = btnNode.getChildByName('Label')?.getComponent(Label);
        if (!tf || !bg) return;

        const width = tf.contentSize.width;
        const height = tf.contentSize.height;
        const radius = Math.max(10, Math.round(height * 0.24));
        bg.clear();
        bg.fillColor = fill;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 185);
        bg.lineWidth = Math.max(2, Math.round(height * 0.06));
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();
        if (label) {
            label.color = textColor;
            label.fontSize = Math.round(Math.max(20, height * 0.44));
            label.lineHeight = label.fontSize + 6;
            label.node
                .getComponent(UITransform)
                ?.setContentSize(Math.max(88, width - 24), height - 8);
        }
    }

    private _setCoopWaitingHint(text: string): void {
        if (!this._coopWaitingHintLabel || !this._coopWaitingHintLabel.isValid) return;
        this._coopWaitingHintLabel.string = text;
    }

    private async _copyToClipboard(text: string): Promise<boolean> {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return false;
        }
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }

    private async _shareInvite(joinUrl: string, matchId: string): Promise<boolean> {
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    title: 'Granny vs Robot 双人邀请',
                    text: `来一起联机！邀请码：${matchId}`,
                    url: joinUrl,
                });
                return true;
            } catch {
                // fallthrough to mailto fallback
            }
        }
        if (typeof window !== 'undefined') {
            try {
                const text = encodeURIComponent(
                    `来一起联机！邀请码：${matchId}\n加入链接：${joinUrl}`
                );
                window.open(
                    `mailto:?subject=${encodeURIComponent('Granny vs Robot 双人邀请')}&body=${text}`
                );
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }

    private _extractErrorMessage(error: unknown): string {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message ?? '';
        return '';
    }

    private async startCoopFromHome(matchId: string): Promise<void> {
        if (this._coopStartInFlight) return;
        this._coopStartInFlight = true;
        try {
            const normalizedMatchId = matchId.trim();
            const forceCreate = normalizedMatchId === COOP_CREATE_MATCH_SENTINEL;
            if (typeof window !== 'undefined') {
                try {
                    window.localStorage?.setItem('KS_RUNTIME_MODE', 'coop');
                    if (normalizedMatchId && !forceCreate) {
                        window.localStorage?.setItem('KS_COOP_MATCH_ID', normalizedMatchId);
                    } else {
                        window.localStorage?.removeItem('KS_COOP_MATCH_ID');
                    }
                } catch {
                    // ignore localStorage failures
                }
            }
            this._runtime?.cleanup();
            this._runtime = new CoopRuntime();
            this._runtime.initialize();
            await this.startCoopGame(forceCreate ? COOP_CREATE_MATCH_SENTINEL : normalizedMatchId);
        } finally {
            this._coopStartInFlight = false;
        }
    }

    private _notifyCoopStartFailure(error: unknown): void {
        if (typeof window === 'undefined') return;
        const message =
            error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        if (!message) return;

        let hint = '';
        if (message.includes('match_not_found')) {
            hint = '房间不存在或已过期，请让好友重新发送邀请链接。';
        } else if (message.includes('match_full')) {
            hint = '房间已满，请创建新房间。';
        } else if (message.includes('match_not_waiting')) {
            hint = '房间已开始或不可加入，请创建新房间。';
        } else if (message.includes('wait_second_player_timeout')) {
            hint = '等待好友加入超时，请稍后重试。';
        }
        if (!hint) return;

        try {
            window.alert(hint);
        } catch {
            // ignore alert failures
        }
    }

    private _logCoopStartFailure(scope: 'startup' | 'from_home', error: unknown): void {
        const message = this._extractErrorMessage(error);
        const expectedErrors = [
            'wait_second_player_timeout',
            'match_not_found',
            'match_full',
            'match_not_waiting',
            'already_joined',
            'player_not_in_match',
        ];
        if (expectedErrors.some(code => message.includes(code))) {
            console.warn(`[GameController] Coop start ${scope} warning: ${message || 'unknown'}`);
            return;
        }
        console.error(`[GameController] Coop start ${scope} failed:`, error);
    }

    private _resolveRuntime(): IGameRuntime {
        const mode = this._getQueryParam('mode').toLowerCase();
        const coopFlag = this._getQueryParam('coop').toLowerCase();
        let persistedMode = '';
        if (typeof window !== 'undefined') {
            try {
                persistedMode =
                    window.localStorage?.getItem('KS_RUNTIME_MODE')?.trim().toLowerCase() ?? '';
            } catch {
                persistedMode = '';
            }
        }
        if (
            mode === 'coop' ||
            coopFlag === '1' ||
            coopFlag === 'true' ||
            persistedMode === 'coop'
        ) {
            return new CoopRuntime();
        }
        return new SoloRuntime();
    }

    private get evtMgr(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
