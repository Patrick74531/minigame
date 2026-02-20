import { Node, view } from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameEvents } from '../data/GameEvents';
import { WaveService } from '../core/managers/WaveService';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { Joystick } from './Joystick';
import { HUDStatusModule } from './hud/HUDStatusModule';
import { HUDSettingsModule } from './hud/HUDSettingsModule';
import {
    HUDWaveNoticeModule,
    type LaneUnlockImminentPayload as HUDLaneUnlockImminentPayload,
    type WaveForecastPayload,
} from './hud/HUDWaveNoticeModule';
import { HUDGameOverModule } from './hud/HUDGameOverModule';
import {
    HUDBossIntroModule,
    type BossIntroPayload as HUDBossIntroPayload,
} from './hud/HUDBossIntroModule';
import { HUDCameraCinematicService } from './hud/HUDCameraCinematicService';
import { RedditBridge } from '../core/reddit/RedditBridge';

/**
 * HUD 管理器
 * 负责游戏内 UI 的更新
 *
 * NOTE: 当前运行主要由 HUDManager 驱动。
 */
export class HUDManager {
    private static _instance: HUDManager | null = null;

    public static get instance(): HUDManager {
        if (!this._instance) {
            this._instance = new HUDManager();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    private _uiCanvas: Node | null = null;
    private _joystickRef: Joystick | null = null;

    // === 模块化拆分后的内部模块 ===
    private readonly _statusModule = new HUDStatusModule();
    private readonly _settingsModule = new HUDSettingsModule(() => {
        this.refreshAllText();
    });
    private readonly _waveNoticeModule = new HUDWaveNoticeModule();
    private readonly _gameOverModule = new HUDGameOverModule(enabled => {
        this.setJoystickInputEnabled(enabled);
    });
    private readonly _bossIntroModule = new HUDBossIntroModule();
    private readonly _cameraCinematicService = new HUDCameraCinematicService();

    /**
     * 初始化 HUD
     */
    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;

        this.destroyLegacyHudNodes(uiCanvas);

        this._cameraCinematicService.initialize(uiCanvas);
        this._statusModule.initialize(uiCanvas);
        this._waveNoticeModule.initialize(uiCanvas);
        this._bossIntroModule.initialize(uiCanvas);
        this._gameOverModule.initialize(uiCanvas);
        this._settingsModule.initialize(uiCanvas);
        this._settingsModule.show();

        view.on('canvas-resize', this.onCanvasResize, this);
        this.onCanvasResize();

        // 监听事件
        this.setupEventListeners();
    }

    public setVisible(visible: boolean): void {
        this._statusModule.setVisible(visible);
        // We might want to keep settings module accessible or managed separately?
        // The user says "hide wave and exp bar", so status module is key.
        // What about wave notice?
        this._waveNoticeModule.setVisible(visible);
        // Boss intro?
        // this._bossIntroModule.setVisible(visible); // Usually hidden anyway

        // If other modules have built-in visibility logic, we might not need to force them.
        // But StatusModule definitely needs to be hidden.
    }

    private refreshAllText(): void {
        this._statusModule.onLanguageChanged?.();
        this._settingsModule.onLanguageChanged?.();
        this._waveNoticeModule.onLanguageChanged?.();
        this._gameOverModule.onLanguageChanged?.();
        this._bossIntroModule.onLanguageChanged();
    }

    private destroyLegacyHudNodes(uiCanvas: Node): void {
        uiCanvas.getChildByName('CoinDisplay')?.destroy();
        uiCanvas.getChildByName('BaseHPLabel')?.destroy();
        uiCanvas.getChildByName('BuildingInfo')?.destroy();
        uiCanvas.getChildByName('WaveLabel')?.destroy();
        uiCanvas.getChildByName('WaveForecastBanner')?.destroy();
        uiCanvas.getChildByName('LaneUnlockDialog')?.destroy();
        uiCanvas.getChildByName('HeroRespawnDialog')?.destroy();
        uiCanvas.getChildByName('BossIntroPanel')?.destroy();
        uiCanvas.getChildByName('GameOverDialog')?.destroy();
        uiCanvas.getChildByName('SettingsButton')?.destroy();
        uiCanvas.getChildByName('SettingsPanelRoot')?.destroy();
        uiCanvas.getChildByName('XpBarRoot')?.destroy();
        uiCanvas.getChildByName('UICamera')?.getChildByName('BossIntroModelStage')?.destroy();
    }

    private setupEventListeners(): void {
        // 监听波次开始
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.WAVE_FORECAST, this.onWaveForecast, this);
        this.eventManager.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
        // 监听英雄经验变化
        this.eventManager.on(GameEvents.HERO_XP_GAINED, this.onXpGained, this);
        this.eventManager.on(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);
        this.eventManager.on(GameEvents.BOSS_INTRO, this.onBossIntro, this);
        this.eventManager.on(GameEvents.LANE_UNLOCK_IMMINENT, this.onLaneUnlockImminent, this);
        this.eventManager.on(GameEvents.GAME_OVER, this.onGameOver, this);
        this.eventManager.on(GameEvents.LANGUAGE_CHANGED, this.onLanguageChanged, this);
    }

    // === 公共接口 ===

    /**
     * 更新金币显示
     */
    public updateCoinDisplay(count: number): void {
        this._statusModule.updateCoinDisplay(count);
    }

    /**
     * 更新基地 HP
     */
    public updateBaseHp(current: number, max: number): void {
        this._statusModule.updateBaseHp(current, max);
    }

    /**
     * 更新波次显示
     */
    public updateWaveDisplay(wave: number): void {
        this._statusModule.updateWaveDisplay(wave);
    }

    /**
     * 显示建造点信息
     */
    public showBuildingInfo(title: string, requiredCoins: number, collectedCoins: number): void {
        this._statusModule.showBuildingInfo(title, requiredCoins, collectedCoins);
    }

    /**
     * 隐藏建造点信息
     */
    public hideBuildingInfo(): void {
        this._statusModule.hideBuildingInfo();
    }

    public showHeroRespawnCountdown(seconds: number): void {
        this._waveNoticeModule.showHeroRespawnCountdown(seconds);
    }

    public updateHeroRespawnCountdown(seconds: number): void {
        this._waveNoticeModule.updateHeroRespawnCountdown(seconds);
    }

    public showHeroRespawnReadyPrompt(): void {
        this._waveNoticeModule.showHeroRespawnReadyPrompt();
    }

    public updateXpBar(currentXp: number, maxXp: number, level: number): void {
        this._statusModule.updateXpBar(currentXp, maxXp, level);
    }

    private setJoystickInputEnabled(enabled: boolean): void {
        if (!this._uiCanvas) return;
        if (!this._joystickRef || !this._joystickRef.node || !this._joystickRef.node.isValid) {
            const joystickNode = this._uiCanvas.getChildByName('JoystickArea');
            this._joystickRef = joystickNode?.getComponent(Joystick) ?? null;
        }
        this._joystickRef?.setInputEnabled(enabled);
    }

    public hideHeroRespawnCountdown(): void {
        this._waveNoticeModule.hideHeroRespawnCountdown();
    }

    // === 事件处理 ===

    private onWaveStart(data: { wave?: number }): void {
        // console.log(`[HUD] 波次 ${data.wave} 开始`);
        const snapshot = this.waveService.getSnapshot();
        const wave = snapshot.currentWave || data.wave || 1;
        this.updateWaveDisplay(wave);
    }

    private onWaveComplete(_data: { wave?: number; bonus?: number }): void {
        // 可以在这里显示波次完成的提示
    }

    private onWaveForecast(data: WaveForecastPayload): void {
        this._waveNoticeModule.showWaveForecast(data);
    }

    private onXpGained(data: {
        xp: number;
        currentXp: number;
        maxXp: number;
        level: number;
    }): void {
        this.updateXpBar(data.currentXp, data.maxXp, data.level);
    }

    private onHeroLevelUp(data: { level: number }): void {
        this.updateXpBar(0, 1, data.level);
    }

    private onGameOver(data: { victory: boolean }): void {
        const wave = WaveService.instance.currentWave;
        this._gameOverModule.showGameOver(Boolean(data?.victory), wave);
        RedditBridge.instance.submitScore(wave * 100, wave);
    }

    private onBossIntro(data: HUDBossIntroPayload): void {
        this._bossIntroModule.showBossIntro(data, bossNode => {
            this._cameraCinematicService.playBossCinematic(bossNode);
        });
    }

    private onLaneUnlockImminent(data: HUDLaneUnlockImminentPayload): void {
        this._waveNoticeModule.showLaneUnlockImminent(data, (focus, padFocus, holdSeconds) => {
            this._cameraCinematicService.playLaneUnlockCinematic(focus, padFocus, holdSeconds);
        });
    }

    private onLanguageChanged(): void {
        this.refreshAllText();
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        view.off('canvas-resize', this.onCanvasResize, this);
        this._settingsModule.cleanup();
        this._gameOverModule.cleanup();
        this._bossIntroModule.cleanup();
        this._waveNoticeModule.cleanup();
        this._statusModule.cleanup();
        this._cameraCinematicService.cleanup();

        this._joystickRef = null;
        this._uiCanvas = null;
    }

    private onCanvasResize(): void {
        this._statusModule.onCanvasResize?.();
        this._settingsModule.onCanvasResize?.();
        this._waveNoticeModule.onCanvasResize?.();
        this._bossIntroModule.onCanvasResize?.();
        this._gameOverModule.onCanvasResize?.();
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
