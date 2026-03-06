import { Node, Vec3, view } from 'cc';
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
import { HUDMinimapModule } from './hud/HUDMinimapModule';
import { HUDDialogueModule, type HUDDialogueRequest } from './hud/HUDDialogueModule';
import { getSocialBridge, type SocialBridge } from '../core/reddit/RedditBridge';
import { DiamondService } from '../core/diamond/DiamondService';
import { GameManager } from '../core/managers/GameManager';
import { Hero } from '../gameplay/units/Hero';
import { PendingScoreSubmissionStore } from '../core/settlement/PendingScoreSubmissionStore';
import { Localization } from '../core/i18n/Localization';
import { UIResponsive } from './UIResponsive';
import { TikTokAdService } from '../core/ads/TikTokAdService';

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
    private readonly _minimapModule = new HUDMinimapModule();
    private readonly _dialogueModule = new HUDDialogueModule();
    private readonly _cameraCinematicService = new HUDCameraCinematicService();
    private readonly _socialBridge: SocialBridge = getSocialBridge();
    private _runSettled: boolean = false;
    private _revivalDecisionPending: boolean = false;
    private _revivalWave: number = 0;
    private _storyIntroShown: boolean = false;
    private _weaponGuideShown: boolean = false;
    private _coinBuildGuideShown: boolean = false;
    private _moreTowersGuideShown: boolean = false;
    private _controlGuideShown: boolean = false;
    private _midSupportGuideShown: boolean = false;

    /**
     * 初始化 HUD
     */
    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this._runSettled = false;
        this.clearRevivalDecisionState();
        this.resetTutorialFlags();

        this.destroyLegacyHudNodes(uiCanvas);

        this._cameraCinematicService.initialize(uiCanvas);
        this._dialogueModule.initialize(uiCanvas);
        this._statusModule.initialize(uiCanvas);
        this._waveNoticeModule.initialize(uiCanvas);
        this._bossIntroModule.initialize(uiCanvas);
        this._gameOverModule.initialize(uiCanvas);
        this._settingsModule.initialize(uiCanvas);
        this._settingsModule.show();
        this._minimapModule.setSettingsButtonRef(this._settingsModule.settingsButtonNode);
        this._minimapModule.initialize(uiCanvas);

        view.on('canvas-resize', this.onCanvasResize, this);
        this.onCanvasResize();

        // 监听事件
        this.setupEventListeners();
    }

    public setVisible(visible: boolean): void {
        this._statusModule.setVisible(visible);
        this._waveNoticeModule.setVisible(visible);
        this._minimapModule.setVisible(visible);
        this._settingsModule.setVisible(visible);
    }

    private refreshAllText(): void {
        this.safeRefresh('status', () => this._statusModule.onLanguageChanged?.());
        this.safeRefresh('settings', () => this._settingsModule.onLanguageChanged?.());
        this.safeRefresh('waveNotice', () => this._waveNoticeModule.onLanguageChanged?.());
        this.safeRefresh('gameOver', () => this._gameOverModule.onLanguageChanged?.());
        this.safeRefresh('bossIntro', () => this._bossIntroModule.onLanguageChanged());
        this.safeRefresh('dialogue', () => this._dialogueModule.onLanguageChanged?.());
    }

    private safeRefresh(name: string, fn: () => void): void {
        try {
            fn();
        } catch (err) {
            console.error(`[HUDManager] language refresh failed in ${name}:`, err);
        }
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
        uiCanvas.getChildByName('MinimapRoot')?.destroy();
        uiCanvas.getChildByName('HUDDialogueRoot')?.destroy();
        uiCanvas.getChildByName('UICamera')?.getChildByName('BossIntroModelStage')?.destroy();
    }

    private setupEventListeners(): void {
        // 监听波次开始
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.WAVE_FORECAST, this.onWaveForecast, this);
        this.eventManager.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
        this.eventManager.on(GameEvents.WAVE_COUNTDOWN, this.onWaveCountdown, this);
        // 监听英雄经验变化
        this.eventManager.on(GameEvents.HERO_XP_GAINED, this.onXpGained, this);
        this.eventManager.on(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);
        this.eventManager.on(GameEvents.BOSS_INTRO, this.onBossIntro, this);
        this.eventManager.on(GameEvents.LANE_UNLOCK_IMMINENT, this.onLaneUnlockImminent, this);
        this.eventManager.on(
            GameEvents.MID_SUPPORT_REVEAL_CINEMATIC,
            this.onMidSupportRevealCinematic,
            this
        );
        this.eventManager.on(GameEvents.GAME_OVER, this.onGameOver, this);
        this.eventManager.on(GameEvents.BASE_REVIVAL_AVAILABLE, this.onBaseRevivalAvailable, this);
        this.eventManager.on(GameEvents.COIN_COLLECTED, this.onCoinCollected, this);
        this.eventManager.on(GameEvents.COIN_CHANGED, this.onCoinChanged, this);
        this.eventManager.on(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        this.eventManager.on(GameEvents.TOWER_PADS_EXPANDED, this.onTowerPadsExpanded, this);
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
     * 更新波次倒计时
     */
    public updateWaveCountdown(seconds: number): void {
        this._statusModule.updateWaveCountdown(seconds);
    }

    private onWaveCountdown(data: { seconds: number }): void {
        this.updateWaveCountdown(data.seconds);
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

    public runWeaponOfferPrelude(onContinue: () => void): void {
        const requests: HUDDialogueRequest[] = [];
        const isEarlyRun = this.waveService.currentWave <= 1;

        if (isEarlyRun && !this._storyIntroShown) {
            this._storyIntroShown = true;
            requests.push(
                {
                    titleKey: 'ui.dialog.title.story',
                    bodyKey: 'ui.story.intro.1',
                },
                {
                    titleKey: 'ui.dialog.title.story',
                    bodyKey: 'ui.story.intro.2',
                }
            );
        }

        if (isEarlyRun && !this._weaponGuideShown) {
            this._weaponGuideShown = true;
            requests.push({
                titleKey: 'ui.dialog.title.tutorial',
                bodyKey: 'ui.tutorial.weapon_pick',
            });
        }

        if (requests.length <= 0) {
            onContinue();
            return;
        }

        this._dialogueModule.enqueueSequence(requests, onContinue);
    }

    public isDialogueBusy(): boolean {
        return this._dialogueModule.isBusy();
    }

    public isRevivalShowing(): boolean {
        return this._gameOverModule.isRevivalShowing;
    }

    /**
     * Continue-from-save should not replay early run tutorials.
     * Keep combat warning dialogs (boss/lane) unaffected.
     */
    public suppressBasicTutorialDialogsForContinue(): void {
        this._storyIntroShown = true;
        this._weaponGuideShown = true;
        this._coinBuildGuideShown = true;
        this._moreTowersGuideShown = true;
        this._controlGuideShown = true;
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

    public hasPendingBaseRevivalDecision(): boolean {
        return this._revivalDecisionPending;
    }

    public finalizePendingRevivalAsGiveUp(): void {
        if (!this._revivalDecisionPending) return;
        this._gameOverModule.hideBaseRevival();
        this.finalizeRevivalAsGiveUp(true);
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

    private onCoinCollected(_data: { amount: number }): void {
        if (!this._weaponGuideShown) return;
        if (this._coinBuildGuideShown) return;
        if (this.waveService.currentWave > 3) return;

        this._coinBuildGuideShown = true;
        this._dialogueModule.enqueue({
            titleKey: 'ui.dialog.title.tutorial',
            bodyKey: 'ui.tutorial.coin_build',
        });
    }

    private onCoinChanged(data: { current: number }): void {
        this._statusModule.updateCoinDisplay(data.current);
    }

    private onWeaponPicked(): void {
        if (this._controlGuideShown) return;
        this._controlGuideShown = true;

        const isTouch = UIResponsive.shouldUseTouchControls();
        this._dialogueModule.enqueue({
            titleKey: 'ui.dialog.title.tutorial',
            bodyKey: isTouch ? 'ui.tutorial.controls.touch' : 'ui.tutorial.controls.desktop',
        });
    }

    private onTowerPadsExpanded(data: { count: number }): void {
        if (!this._weaponGuideShown) return;
        if (!data || data.count <= 0) return;
        if (this._moreTowersGuideShown) return;

        this._moreTowersGuideShown = true;
        this._dialogueModule.enqueue({
            titleKey: 'ui.dialog.title.tutorial',
            bodyKey: 'ui.tutorial.more_towers',
        });
    }

    private onGameOver(data: { victory: boolean }): void {
        if (this._revivalDecisionPending) {
            this._gameOverModule.hideBaseRevival();
            this.clearRevivalDecisionState();
        }

        const wave = this.resolveWaveForSettlement(undefined, 0);
        this._gameOverModule.showGameOver(Boolean(data?.victory), wave);

        if (this._runSettled) {
            this._gameOverModule.setOnBeforeRestart(null);
            return;
        }

        // Deferred settlement: submit score + settle diamonds when player clicks restart.
        this._gameOverModule.setOnBeforeRestart(() => {
            if (this._runSettled) return;
            this.settleCurrentRun(wave);
        });
    }

    private onBaseRevivalAvailable(data: { wave: number }): void {
        this._revivalDecisionPending = true;
        this._revivalWave = this.resolveWaveForSettlement(data.wave, 1);

        const tryRebuild = () => {
            if (this._socialBridge.platform !== 'tiktok') {
                this.applyBaseRebuild();
                return;
            }
            TikTokAdService.showRewardedAd('rebuild').then(rewarded => {
                if (rewarded) {
                    this.applyBaseRebuild();
                    return;
                }
                if (TikTokAdService.wasLastAdCancelled()) {
                    TikTokAdService.showToast(Localization.instance.t('ui.ad.not_rewarded'));
                }
                if (!this._revivalDecisionPending) return;
                this._gameOverModule.showBaseRevival(this._revivalWave, tryRebuild, giveUp);
            });
        };

        const giveUp = () => {
            this.finalizeRevivalAsGiveUp(true);
        };

        this._gameOverModule.showBaseRevival(this._revivalWave, tryRebuild, giveUp);
    }

    private applyBaseRebuild(): void {
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        this.resumeGameFully(gm);
        const heroNode = gm.hero;
        const hero = heroNode?.isValid ? heroNode.getComponent(Hero) : null;
        hero?.forceReviveAtInitialSpawn();

        // Rebuild: emit BASE_REVIVED (Base listens and restores HP + buildings)
        this.clearRevivalDecisionState();
        this.eventManager.emit(GameEvents.BASE_REVIVED);
        this.setJoystickInputEnabled(true);
    }

    private finalizeRevivalAsGiveUp(triggerGameOver: boolean): void {
        const wave = this.resolveWaveForSettlement(this._revivalWave, 1);
        this.settleCurrentRun(wave);

        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        this.resumeGameFully(gm);
        this.clearRevivalDecisionState();
        if (triggerGameOver) {
            gm.gameOver(false);
        }
    }

    private settleCurrentRun(wave: number): void {
        if (this._runSettled) return;
        this._runSettled = true;
        const runId = DiamondService.generateRunId();
        const score = wave * 100;
        PendingScoreSubmissionStore.save({
            platform: this._socialBridge.platform,
            runId,
            score,
            wave,
        });
        this._socialBridge.submitScore(score, wave, runId);
        DiamondService.instance.settleRun(wave, runId, (earned, _balance) => {
            if (earned > 0) {
                this._gameOverModule.showDiamondReward(earned);
            }
        });
    }

    private resolveWaveForSettlement(preferredWave?: number, minimum: number = 0): number {
        const preferred = Math.max(0, Math.floor(preferredWave ?? 0));
        const fromService = Math.max(0, Math.floor(this.waveService.currentWave));
        return Math.max(minimum, preferred, fromService);
    }

    private clearRevivalDecisionState(): void {
        this._revivalDecisionPending = false;
        this._revivalWave = 0;
    }

    private resetTutorialFlags(): void {
        this._storyIntroShown = false;
        this._weaponGuideShown = false;
        this._coinBuildGuideShown = false;
        this._moreTowersGuideShown = false;
        this._controlGuideShown = false;
        this._midSupportGuideShown = false;
    }

    private resolveLocalizedByKey(key: string, fallback: string): string {
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return fallback;
        }
        return localized;
    }

    private resumeGameFully(gm: GameManager): void {
        for (let i = 0; i < 6 && !gm.isPlaying; i++) {
            gm.resumeGame();
        }
    }

    private onBossIntro(data: HUDBossIntroPayload): void {
        this._dialogueModule.enqueue({
            titleKey: 'ui.dialog.title.warning',
            bodyKey: 'ui.tutorial.boss_drop',
            onConfirm: () => {
                this._bossIntroModule.showBossIntro(data, bossNode => {
                    this._cameraCinematicService.playBossCinematic(bossNode);
                });
            },
        });
    }

    private onLaneUnlockImminent(data: HUDLaneUnlockImminentPayload): void {
        const laneName = this.resolveLocalizedByKey(`ui.laneRoute.${data.lane}`, data.lane);
        const holdSeconds = Math.max(0.8, data.remainSeconds ?? 2.4);
        this._dialogueModule.enqueue({
            titleKey: 'ui.dialog.title.warning',
            bodyKey: 'ui.tutorial.lane_unlock',
            bodyParams: { lane: laneName },
            onConfirm: () => {
                if (!data.focusPosition) return;
                this._cameraCinematicService.playLaneUnlockCinematic(
                    data.focusPosition,
                    data.padFocusPosition,
                    holdSeconds
                );
            },
        });
    }

    private onMidSupportRevealCinematic(data: { focusPosition: Vec3; holdSeconds?: number }): void {
        const focus = data?.focusPosition;
        if (!focus) {
            this.eventManager.emit(GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FINISHED);
            return;
        }
        const holdSeconds = Math.max(0, data?.holdSeconds ?? 3);
        const playCinematic = () => {
            this._cameraCinematicService.playFocusCinematic(
                focus,
                holdSeconds,
                () => {
                    this.eventManager.emit(GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FINISHED);
                },
                () => {
                    this.eventManager.emit(GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FOCUS_REACHED);
                }
            );
        };

        if (this._midSupportGuideShown) {
            playCinematic();
            return;
        }

        this._midSupportGuideShown = true;
        this._dialogueModule.enqueueSequence(
            [
                {
                    titleKey: 'ui.dialog.title.tutorial',
                    bodyKey: 'ui.tutorial.farm_barracks_upgrade',
                },
            ],
            playCinematic
        );
    }

    private onLanguageChanged(): void {
        console.log('[HUDManager] onLanguageChanged');
        this.refreshAllText();
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        view.off('canvas-resize', this.onCanvasResize, this);
        this._settingsModule.cleanup();
        this._minimapModule.cleanup();
        this._gameOverModule.cleanup();
        this._bossIntroModule.cleanup();
        this._waveNoticeModule.cleanup();
        this._statusModule.cleanup();
        this._dialogueModule.cleanup();
        this._cameraCinematicService.cleanup();

        this._joystickRef = null;
        this._uiCanvas = null;
        this.clearRevivalDecisionState();
        this.resetTutorialFlags();
        this._runSettled = false;
    }

    private onCanvasResize(): void {
        this._statusModule.onCanvasResize?.();
        this._settingsModule.onCanvasResize?.();
        this._waveNoticeModule.onCanvasResize?.();
        this._bossIntroModule.onCanvasResize?.();
        this._gameOverModule.onCanvasResize?.();
        this._minimapModule.onCanvasResize?.();
        this._dialogueModule.onCanvasResize?.();
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
