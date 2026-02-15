import {
    Node,
    Label,
    Color,
    UITransform,
    Widget,
    Graphics,
    UIOpacity,
    Prefab,
    Renderer,
    SkeletalAnimation,
    instantiate,
    resources,
    Tween,
    tween,
    Vec3,
} from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameEvents } from '../data/GameEvents';
import { UIFactory } from './UIFactory';
import { GameConfig } from '../data/GameConfig';
import { WaveService } from '../core/managers/WaveService';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { Localization } from '../core/i18n/Localization';
import { CameraFollow } from '../core/camera/CameraFollow';
import { resolveBossDialogueProfile } from './BossIntroDialogue';

// UI_2D Layer
const UI_LAYER = 33554432;
const BOSS_INTRO_WIDTH = 880;
const BOSS_INTRO_HEIGHT = 218;
const BOSS_INTRO_DISPLAY_SECONDS = 3.55;
const BOSS_CINEMATIC_MOVE_SECONDS = 0.58;
const BOSS_CINEMATIC_HOLD_SECONDS = 2;
const BOSS_PREVIEW_STAGE_Z = -460;
const LANE_UNLOCK_DIALOG_WIDTH = 920;
const LANE_UNLOCK_DIALOG_HEIGHT = 84;
const LANE_UNLOCK_DEFAULT_SECONDS = 2.4;

type BossIntroPayload = {
    bossNode: Node;
    archetypeId?: string;
    modelPath?: string;
    lane?: 'top' | 'mid' | 'bottom';
};

type LaneUnlockImminentPayload = {
    lane: 'top' | 'mid' | 'bottom';
    focusPosition?: Vec3;
    padFocusPosition?: Vec3;
    remainSeconds?: number;
};

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

    // === UI 元素 ===
    private _coinLabel: Label | null = null;
    private _waveLabel: Label | null = null;
    private _buildingInfoLabel: Label | null = null;
    private _baseHpLabel: Label | null = null;
    private _uiCanvas: Node | null = null;

    // === 经验条 UI ===
    private _xpBarBg: Graphics | null = null;
    private _xpBarFg: Graphics | null = null;
    private _levelLabel: Label | null = null;
    private _xpBarWidth: number = 260;
    private _xpBarHeight: number = 14;

    // === 波前预告 UI ===
    private _waveForecastRoot: Node | null = null;
    private _waveForecastLabel: Label | null = null;
    private _waveForecastBg: Graphics | null = null;
    private _waveForecastOpacity: UIOpacity | null = null;
    private readonly _waveForecastWidth: number = 620;
    private readonly _waveForecastHeight: number = 66;
    private _laneUnlockDialogRoot: Node | null = null;
    private _laneUnlockDialogLabel: Label | null = null;
    private _laneUnlockDialogBg: Graphics | null = null;
    private _laneUnlockDialogOpacity: UIOpacity | null = null;
    private _laneUnlockDialogToken: number = 0;

    // === Boss 出场 UI / 演出 ===
    private _bossIntroRoot: Node | null = null;
    private _bossIntroTitleLabel: Label | null = null;
    private _bossIntroQuoteLabel: Label | null = null;
    private _bossIntroModelHost: Node | null = null;
    private _bossIntroModelStage: Node | null = null;
    private _bossIntroOpacity: UIOpacity | null = null;
    private _bossIntroToken: number = 0;
    private _bossPreviewMotionClock: { phase: number } | null = null;
    private _bossPreviewMotionTarget: Node | null = null;
    private _bossCinematicClock: Record<string, number> | null = null;
    private _bossCameraFollowRef: CameraFollow | null = null;
    private _bossCameraOriginalTarget: Node | null = null;
    private _bossCameraOriginalEnabled: boolean = true;
    private _bossCameraOriginalSmoothSpeed: number = 0.16;
    private _laneUnlockFocusToken: number = 0;

    /**
     * 初始化 HUD
     */
    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;

        // Cleanup duplicate UI nodes from previous sessions
        uiCanvas.getChildByName('CoinDisplay')?.destroy();
        uiCanvas.getChildByName('BaseHPLabel')?.destroy();
        uiCanvas.getChildByName('BuildingInfo')?.destroy();
        uiCanvas.getChildByName('WaveLabel')?.destroy();
        uiCanvas.getChildByName('WaveForecastBanner')?.destroy();
        uiCanvas.getChildByName('LaneUnlockDialog')?.destroy();
        uiCanvas.getChildByName('BossIntroPanel')?.destroy();
        uiCanvas.getChildByName('UICamera')?.getChildByName('BossIntroModelStage')?.destroy();

        // 创建金币显示
        this._coinLabel = UIFactory.createCoinDisplay(uiCanvas);

        // 创建基地 HP 显示
        this._baseHpLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.baseHp', {
                current: GameConfig.BUILDING.BASE_START_HP,
                max: GameConfig.BUILDING.BASE_START_HP,
            }),
            'BaseHPLabel'
        );
        // Position using Widget
        const hpWidget = this._baseHpLabel.node.addComponent(Widget);
        hpWidget.isAlignTop = true;
        hpWidget.isAlignHorizontalCenter = true;
        hpWidget.top = 20;

        this._baseHpLabel.fontSize = 24;

        // 创建建造点信息显示
        this.createBuildingInfoLabel(uiCanvas);

        // 创建波次显示 (Top Left)
        this._waveLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.wave', { wave: 1 }),
            'WaveLabel'
        );

        // Position using Widget
        const waveWidget = this._waveLabel.node.addComponent(Widget);
        waveWidget.isAlignTop = true;
        waveWidget.isAlignLeft = true;
        waveWidget.top = 20;
        waveWidget.left = 20;

        this._waveLabel.fontSize = 30;
        this._waveLabel.color = new Color(255, 215, 0, 255); // Gold color

        // 创建经验条 (Top Center)
        this.createXpBar(uiCanvas);
        this.createWaveForecastBanner(uiCanvas);
        this.createLaneUnlockDialog(uiCanvas);
        this.createBossIntroPanel(uiCanvas);

        // 监听事件
        this.setupEventListeners();
    }

    /**
     * 创建建造点信息标签
     */
    private createBuildingInfoLabel(parent: Node): void {
        const node = new Node('BuildingInfo');
        node.layer = UI_LAYER;
        parent.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0); // 锚点设为底部中心

        const widget = node.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 150;

        this._buildingInfoLabel = node.addComponent(Label);
        this._buildingInfoLabel.string = '';
        this._buildingInfoLabel.fontSize = 36;
        this._buildingInfoLabel.lineHeight = 40;
        this._buildingInfoLabel.color = new Color(255, 255, 255, 255); // 白色
        this._buildingInfoLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        // 默认隐藏
        node.active = false;
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
    }

    // === 公共接口 ===

    /**
     * 更新金币显示
     */
    public updateCoinDisplay(count: number): void {
        if (this._coinLabel) {
            this._coinLabel.string = Localization.instance.t('ui.hud.coins', { count });
        }
    }

    /**
     * 更新基地 HP
     */
    public updateBaseHp(current: number, max: number): void {
        if (this._baseHpLabel) {
            this._baseHpLabel.string = Localization.instance.t('ui.hud.baseHp', {
                current: Math.max(0, Math.floor(current)),
                max,
            });
            // 简单的变色逻辑
            if (current < max * 0.3) {
                this._baseHpLabel.color = new Color(255, 50, 50, 255);
            } else {
                this._baseHpLabel.color = new Color(255, 255, 255, 255);
            }
        }
    }

    /**
     * 更新波次显示
     */
    public updateWaveDisplay(wave: number): void {
        if (this._waveLabel) {
            this._waveLabel.string = Localization.instance.t('ui.hud.wave', { wave });
        }
    }

    /**
     * 显示建造点信息
     */
    public showBuildingInfo(title: string, requiredCoins: number, collectedCoins: number): void {
        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.string = Localization.instance.t('ui.building.infoProgress', {
                title,
                collected: collectedCoins,
                required: requiredCoins,
            });
            this._buildingInfoLabel.node.active = true;
        }
    }

    /**
     * 隐藏建造点信息
     */
    public hideBuildingInfo(): void {
        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.node.active = false;
        }
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

    private onWaveForecast(data: {
        wave?: number;
        archetypeId?: string;
        lane?: 'left' | 'center' | 'right';
        spawnType?: 'regular' | 'elite' | 'boss';
    }): void {
        const archetypeId = (data.archetypeId ?? '').trim();
        if (!archetypeId) return;

        const lane = data.lane ?? 'center';
        const spawnType = data.spawnType ?? 'regular';
        const enemyName = this.resolveForecastEnemyName(archetypeId);
        const laneName = Localization.instance.t(`ui.waveForecast.lane.${lane}`);
        const header = Localization.instance.t(
            spawnType === 'boss' ? 'ui.waveForecast.header.boss' : 'ui.waveForecast.header.normal'
        );
        const body = Localization.instance.t(
            spawnType === 'boss'
                ? 'ui.waveForecast.message.boss'
                : 'ui.waveForecast.message.normal',
            {
                enemy: enemyName,
                lane: laneName,
            }
        );
        this.showWaveForecastBanner(`${header} ${body}`, spawnType === 'boss');
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

    // === 经验条 ===

    private createXpBar(parent: Node): void {
        // 清理旧节点
        parent.getChildByName('XpBarRoot')?.destroy();

        const root = new Node('XpBarRoot');
        root.layer = UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._xpBarWidth + 80, this._xpBarHeight + 30);

        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 20;

        // 等级标签
        const lvNode = new Node('LevelLabel');
        lvNode.layer = UI_LAYER;
        root.addChild(lvNode);
        lvNode.addComponent(UITransform);
        this._levelLabel = lvNode.addComponent(Label);
        this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level: 1 });
        this._levelLabel.fontSize = 22;
        this._levelLabel.lineHeight = 26;
        this._levelLabel.color = new Color(255, 230, 140, 255);
        this._levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        lvNode.setPosition(0, 12, 0);

        // 背景条
        const bgNode = new Node('XpBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._xpBarBg = bgNode.addComponent(Graphics);
        this._xpBarBg.fillColor = new Color(40, 40, 40, 200);
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            4
        );
        this._xpBarBg.fill();
        // 边框
        this._xpBarBg.strokeColor = new Color(120, 120, 120, 180);
        this._xpBarBg.lineWidth = 1;
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            4
        );
        this._xpBarBg.stroke();
        bgNode.setPosition(0, -6, 0);

        // 前景条
        const fgNode = new Node('XpFg');
        fgNode.layer = UI_LAYER;
        root.addChild(fgNode);
        fgNode.addComponent(UITransform);
        this._xpBarFg = fgNode.addComponent(Graphics);
        fgNode.setPosition(0, -6, 0);
        this.drawXpFill(0);
    }

    private drawXpFill(ratio: number): void {
        if (!this._xpBarFg) return;
        this._xpBarFg.clear();
        const w = this._xpBarWidth * Math.max(0, Math.min(1, ratio));
        if (w < 1) return;
        this._xpBarFg.fillColor = new Color(80, 200, 255, 255);
        this._xpBarFg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            w,
            this._xpBarHeight,
            4
        );
        this._xpBarFg.fill();
    }

    public updateXpBar(currentXp: number, maxXp: number, level: number): void {
        const ratio = maxXp > 0 ? currentXp / maxXp : 0;
        this.drawXpFill(ratio);
        if (this._levelLabel) {
            this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level });
        }
    }

    private createWaveForecastBanner(parent: Node): void {
        const root = new Node('WaveForecastBanner');
        root.layer = UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._waveForecastWidth, this._waveForecastHeight);

        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 66;

        this._waveForecastOpacity = root.addComponent(UIOpacity);
        this._waveForecastOpacity.opacity = 0;

        const bgNode = new Node('WaveForecastBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._waveForecastBg = bgNode.addComponent(Graphics);

        const labelNode = new Node('WaveForecastText');
        labelNode.layer = UI_LAYER;
        root.addChild(labelNode);
        labelNode.addComponent(UITransform);
        this._waveForecastLabel = labelNode.addComponent(Label);
        this._waveForecastLabel.string = '';
        this._waveForecastLabel.fontSize = 28;
        this._waveForecastLabel.lineHeight = 34;
        this._waveForecastLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._waveForecastLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._waveForecastLabel.color = new Color(120, 235, 255, 255);

        this._waveForecastRoot = root;
        this.drawWaveForecastBackground(false);
        root.active = false;
    }

    private resolveForecastEnemyName(archetypeId: string): string {
        const key = `enemy.archetype.${archetypeId}`;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return archetypeId;
        }
        return localized;
    }

    private drawWaveForecastBackground(isBoss: boolean): void {
        if (!this._waveForecastBg) return;
        const bg = this._waveForecastBg;
        const width = this._waveForecastWidth;
        const height = this._waveForecastHeight;

        bg.clear();
        bg.fillColor = isBoss ? new Color(76, 18, 18, 235) : new Color(14, 34, 54, 225);
        bg.roundRect(-width / 2, -height / 2, width, height, 10);
        bg.fill();
        bg.strokeColor = isBoss ? new Color(255, 110, 110, 255) : new Color(80, 210, 255, 255);
        bg.lineWidth = 3;
        bg.roundRect(-width / 2, -height / 2, width, height, 10);
        bg.stroke();
    }

    private showWaveForecastBanner(text: string, isBoss: boolean): void {
        if (!this._waveForecastRoot || !this._waveForecastLabel || !this._waveForecastOpacity) {
            return;
        }

        this._waveForecastLabel.string = text;
        this._waveForecastLabel.color = isBoss
            ? new Color(255, 130, 130, 255)
            : new Color(120, 235, 255, 255);
        this.drawWaveForecastBackground(isBoss);

        Tween.stopAllByTarget(this._waveForecastRoot);
        Tween.stopAllByTarget(this._waveForecastOpacity);

        this._waveForecastRoot.active = true;
        this._waveForecastRoot.setScale(0.92, 0.92, 1);
        this._waveForecastOpacity.opacity = 0;

        tween(this._waveForecastRoot)
            .to(0.14, { scale: new Vec3(1.03, 1.03, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._waveForecastOpacity)
            .to(0.14, { opacity: 255 })
            .delay(2.2)
            .to(0.25, { opacity: 0 })
            .call(() => {
                if (this._waveForecastRoot) {
                    this._waveForecastRoot.active = false;
                }
            })
            .start();
    }

    private createLaneUnlockDialog(parent: Node): void {
        const root = new Node('LaneUnlockDialog');
        root.layer = UI_LAYER;
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(
            LANE_UNLOCK_DIALOG_WIDTH,
            LANE_UNLOCK_DIALOG_HEIGHT
        );
        const widget = root.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 22;

        this._laneUnlockDialogOpacity = root.addComponent(UIOpacity);
        this._laneUnlockDialogOpacity.opacity = 0;

        const bgNode = new Node('LaneUnlockDialogBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._laneUnlockDialogBg = bgNode.addComponent(Graphics);
        this.drawLaneUnlockDialogBackground();

        const textNode = new Node('LaneUnlockDialogText');
        textNode.layer = UI_LAYER;
        root.addChild(textNode);
        textNode
            .addComponent(UITransform)
            .setContentSize(LANE_UNLOCK_DIALOG_WIDTH - 56, LANE_UNLOCK_DIALOG_HEIGHT - 18);
        this._laneUnlockDialogLabel = textNode.addComponent(Label);
        this._laneUnlockDialogLabel.string = '';
        this._laneUnlockDialogLabel.fontSize = 27;
        this._laneUnlockDialogLabel.lineHeight = 34;
        this._laneUnlockDialogLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._laneUnlockDialogLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._laneUnlockDialogLabel.color = new Color(255, 225, 176, 255);

        this._laneUnlockDialogRoot = root;
        root.active = false;
    }

    private drawLaneUnlockDialogBackground(): void {
        if (!this._laneUnlockDialogBg) return;
        const bg = this._laneUnlockDialogBg;
        bg.clear();
        bg.fillColor = new Color(42, 26, 14, 232);
        bg.roundRect(
            -LANE_UNLOCK_DIALOG_WIDTH / 2,
            -LANE_UNLOCK_DIALOG_HEIGHT / 2,
            LANE_UNLOCK_DIALOG_WIDTH,
            LANE_UNLOCK_DIALOG_HEIGHT,
            12
        );
        bg.fill();
        bg.strokeColor = new Color(255, 176, 82, 255);
        bg.lineWidth = 3;
        bg.roundRect(
            -LANE_UNLOCK_DIALOG_WIDTH / 2,
            -LANE_UNLOCK_DIALOG_HEIGHT / 2,
            LANE_UNLOCK_DIALOG_WIDTH,
            LANE_UNLOCK_DIALOG_HEIGHT,
            12
        );
        bg.stroke();
    }

    private showLaneUnlockDialog(text: string, holdSeconds: number): void {
        if (
            !this._laneUnlockDialogRoot ||
            !this._laneUnlockDialogLabel ||
            !this._laneUnlockDialogOpacity
        ) {
            return;
        }
        this._laneUnlockDialogToken += 1;
        const token = this._laneUnlockDialogToken;
        this._laneUnlockDialogLabel.string = text;

        Tween.stopAllByTarget(this._laneUnlockDialogRoot);
        Tween.stopAllByTarget(this._laneUnlockDialogOpacity);
        this._laneUnlockDialogRoot.active = true;
        this._laneUnlockDialogRoot.setScale(0.95, 0.95, 1);
        this._laneUnlockDialogOpacity.opacity = 0;

        tween(this._laneUnlockDialogRoot)
            .to(0.16, { scale: new Vec3(1.01, 1.01, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._laneUnlockDialogOpacity)
            .to(0.16, { opacity: 255 })
            .delay(Math.max(0.8, holdSeconds))
            .to(0.22, { opacity: 0 })
            .call(() => {
                if (token !== this._laneUnlockDialogToken) return;
                if (this._laneUnlockDialogRoot) {
                    this._laneUnlockDialogRoot.active = false;
                }
            })
            .start();
    }

    private createBossIntroPanel(parent: Node): void {
        const root = new Node('BossIntroPanel');
        root.layer = UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(BOSS_INTRO_WIDTH, BOSS_INTRO_HEIGHT);

        const widget = root.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 14;

        this._bossIntroOpacity = root.addComponent(UIOpacity);
        this._bossIntroOpacity.opacity = 0;

        const bgNode = new Node('BossIntroBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = new Color(18, 23, 31, 230);
        bg.roundRect(
            -BOSS_INTRO_WIDTH / 2,
            -BOSS_INTRO_HEIGHT / 2,
            BOSS_INTRO_WIDTH,
            BOSS_INTRO_HEIGHT,
            14
        );
        bg.fill();
        bg.strokeColor = new Color(132, 222, 255, 235);
        bg.lineWidth = 3;
        bg.roundRect(
            -BOSS_INTRO_WIDTH / 2,
            -BOSS_INTRO_HEIGHT / 2,
            BOSS_INTRO_WIDTH,
            BOSS_INTRO_HEIGHT,
            14
        );
        bg.stroke();

        const modelFrame = new Node('BossIntroModelFrame');
        modelFrame.layer = UI_LAYER;
        root.addChild(modelFrame);
        modelFrame.setPosition(-BOSS_INTRO_WIDTH * 0.34, -2, 0);
        const modelFrameTf = modelFrame.addComponent(UITransform);
        modelFrameTf.setContentSize(210, 168);
        const modelFrameG = modelFrame.addComponent(Graphics);
        modelFrameG.fillColor = new Color(8, 16, 25, 220);
        modelFrameG.roundRect(-105, -84, 210, 168, 10);
        modelFrameG.fill();
        modelFrameG.strokeColor = new Color(88, 188, 232, 245);
        modelFrameG.lineWidth = 2;
        modelFrameG.roundRect(-105, -84, 210, 168, 10);
        modelFrameG.stroke();

        const modelHost = new Node('BossIntroModelHost');
        modelHost.layer = UI_LAYER;
        modelFrame.addChild(modelHost);
        modelHost.addComponent(UITransform).setContentSize(190, 150);
        this._bossIntroModelHost = modelHost;

        const uiCamera = parent.getChildByName('UICamera');
        if (uiCamera) {
            const stageRoot = new Node('BossIntroModelStage');
            stageRoot.layer = UI_LAYER;
            uiCamera.addChild(stageRoot);
            stageRoot.setPosition(-BOSS_INTRO_WIDTH * 0.34, -240, BOSS_PREVIEW_STAGE_Z);

            const stagePivot = new Node('BossIntroModelPivot');
            stagePivot.layer = UI_LAYER;
            stageRoot.addChild(stagePivot);

            this._bossIntroModelHost = stagePivot;
            this._bossIntroModelStage = stageRoot;
            stageRoot.active = false;
        }

        const titleNode = new Node('BossIntroTitle');
        titleNode.layer = UI_LAYER;
        root.addChild(titleNode);
        titleNode.setPosition(65, 58, 0);
        titleNode.addComponent(UITransform).setContentSize(500, 56);
        this._bossIntroTitleLabel = titleNode.addComponent(Label);
        this._bossIntroTitleLabel.fontSize = 34;
        this._bossIntroTitleLabel.lineHeight = 40;
        this._bossIntroTitleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._bossIntroTitleLabel.color = new Color(250, 228, 128, 255);

        const quoteNode = new Node('BossIntroQuote');
        quoteNode.layer = UI_LAYER;
        root.addChild(quoteNode);
        quoteNode.setPosition(66, -12, 0);
        quoteNode.addComponent(UITransform).setContentSize(510, 120);
        this._bossIntroQuoteLabel = quoteNode.addComponent(Label);
        this._bossIntroQuoteLabel.fontSize = 22;
        this._bossIntroQuoteLabel.lineHeight = 30;
        this._bossIntroQuoteLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._bossIntroQuoteLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._bossIntroQuoteLabel.color = new Color(236, 244, 255, 255);

        this._bossIntroRoot = root;
        root.active = false;
    }

    private onBossIntro(data: BossIntroPayload): void {
        if (!data?.bossNode || !data.bossNode.isValid) return;
        this._bossIntroToken += 1;
        const token = this._bossIntroToken;

        this.showBossIntroPanel(data, token);
        this.playBossCinematic(data.bossNode, token);
    }

    private onLaneUnlockImminent(data: LaneUnlockImminentPayload): void {
        if (!data?.lane) return;
        const laneName = this.resolveLocalizedByKey(`ui.laneRoute.${data.lane}`, data.lane);
        const text = Localization.instance.t('ui.laneUnlock.imminent', { lane: laneName });
        const holdSeconds = Math.max(0.8, data.remainSeconds ?? LANE_UNLOCK_DEFAULT_SECONDS);
        this.showLaneUnlockDialog(text, holdSeconds);

        if (data.focusPosition) {
            this.playLaneUnlockCinematic(data.focusPosition, data.padFocusPosition, holdSeconds);
        }
    }

    private showBossIntroPanel(payload: BossIntroPayload, token: number): void {
        if (
            !this._bossIntroRoot ||
            !this._bossIntroOpacity ||
            !this._bossIntroTitleLabel ||
            !this._bossIntroQuoteLabel
        ) {
            return;
        }

        const fallbackName = this.resolveForecastEnemyName(payload.archetypeId ?? 'boss');
        const profile = resolveBossDialogueProfile({
            archetypeId: payload.archetypeId,
            modelPath: payload.modelPath,
        });
        this._bossIntroTitleLabel.string = this.resolveLocalizedByKey(
            profile.nameKey,
            fallbackName
        );
        this._bossIntroQuoteLabel.string = this.resolveLocalizedByKey(
            profile.lineKey,
            Localization.instance.t('ui.bossIntro.line.default')
        );

        Tween.stopAllByTarget(this._bossIntroRoot);
        Tween.stopAllByTarget(this._bossIntroOpacity);

        this._bossIntroRoot.active = true;
        this._bossIntroRoot.setScale(0.94, 0.94, 1);
        this._bossIntroOpacity.opacity = 0;
        if (this._bossIntroModelStage) {
            this._bossIntroModelStage.active = true;
        }

        tween(this._bossIntroRoot)
            .to(0.16, { scale: new Vec3(1.015, 1.015, 1) })
            .to(0.2, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._bossIntroOpacity)
            .to(0.16, { opacity: 255 })
            .delay(BOSS_INTRO_DISPLAY_SECONDS)
            .to(0.24, { opacity: 0 })
            .call(() => {
                if (token !== this._bossIntroToken) return;
                if (this._bossIntroRoot) {
                    this._bossIntroRoot.active = false;
                }
                if (this._bossIntroModelStage) {
                    this._bossIntroModelStage.active = false;
                }
                this.stopBossPreviewMotion();
            })
            .start();

        void this.refreshBossPreviewModel(payload, token);
    }

    private async refreshBossPreviewModel(payload: BossIntroPayload, token: number): Promise<void> {
        const host = this._bossIntroModelHost;
        if (!host || !host.isValid) return;

        this.stopBossPreviewMotion();
        host.removeAllChildren();

        let preview = await this.instantiateBossPreviewFromModelPath(payload.modelPath);
        if (!preview) {
            preview = this.cloneBossVisualFromNode(payload.bossNode);
        }

        if (token !== this._bossIntroToken) {
            if (preview && preview.isValid) {
                preview.destroy();
            }
            return;
        }

        if (!host.isValid || !preview) {
            return;
        }

        preview.layer = UI_LAYER;
        this.applyLayerRecursive(preview, UI_LAYER);
        host.addChild(preview);
        preview.setPosition(0, -38, 0);
        const scale = this.resolvePreviewScale(payload.modelPath);
        preview.setScale(scale, scale, scale);
        preview.setRotationFromEuler(0, 205, 0);

        const anim =
            preview.getComponent(SkeletalAnimation) ??
            preview.getComponentInChildren(SkeletalAnimation);
        if (anim) {
            const clips = anim.clips;
            if (clips && clips.length > 0 && clips[0]) {
                anim.defaultClip = clips[0];
                anim.play(clips[0].name);
            }
        }

        this.startBossPreviewMotion(preview, scale);
    }

    private resolveLocalizedByKey(key: string, fallback: string): string {
        if (!key) return fallback;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return fallback;
        }
        return localized;
    }

    private startBossPreviewMotion(preview: Node, baseScale: number): void {
        this.stopBossPreviewMotion();

        const motion = { phase: 0 };
        this._bossPreviewMotionClock = motion;
        this._bossPreviewMotionTarget = preview;

        tween(motion)
            .repeatForever(
                tween(motion)
                    .to(
                        5.8,
                        { phase: 1 },
                        {
                            easing: 'linear',
                            onUpdate: () => {
                                if (!preview.isValid) return;
                                const t = motion.phase;
                                const breathe = 1 + Math.sin(t * Math.PI * 2) * 0.045;
                                preview.setScale(
                                    baseScale * breathe,
                                    baseScale * breathe,
                                    baseScale * breathe
                                );
                                preview.setRotationFromEuler(0, 205 + t * 360, 0);
                            },
                        }
                    )
                    .set({ phase: 0 })
            )
            .start();
    }

    private stopBossPreviewMotion(): void {
        if (this._bossPreviewMotionClock) {
            Tween.stopAllByTarget(this._bossPreviewMotionClock);
            this._bossPreviewMotionClock = null;
        }
        this._bossPreviewMotionTarget = null;
    }

    private cloneBossVisualFromNode(bossNode: Node | undefined): Node | null {
        if (!bossNode || !bossNode.isValid) return null;

        const queue: Node[] = [...bossNode.children];
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || !current.isValid) continue;
            if (
                current.getComponent(SkeletalAnimation) ||
                current.getComponentsInChildren(Renderer).length > 0
            ) {
                return instantiate(current);
            }
            queue.push(...current.children);
        }
        return null;
    }

    private async instantiateBossPreviewFromModelPath(modelPath?: string): Promise<Node | null> {
        const prefab = await this.loadBossModelPrefab(modelPath);
        if (!prefab) return null;
        return instantiate(prefab);
    }

    private loadBossModelPrefab(modelPath?: string): Promise<Prefab | null> {
        const raw = (modelPath ?? '').trim();
        if (!raw) return Promise.resolve(null);
        const normalized = raw.startsWith('enemies/') ? raw : `enemies/${raw}`;
        const tail = normalized.split('/').pop() ?? '';
        const candidates = tail ? [normalized, `${normalized}/${tail}`] : [normalized];

        return new Promise(resolve => {
            const tryLoad = (index: number): void => {
                if (index >= candidates.length) {
                    resolve(null);
                    return;
                }
                resources.load(candidates[index], Prefab, (err, prefab) => {
                    if (err || !prefab) {
                        tryLoad(index + 1);
                        return;
                    }
                    resolve(prefab);
                });
            };

            tryLoad(0);
        });
    }

    private resolvePreviewScale(modelPath?: string): number {
        const lower = (modelPath ?? '').toLowerCase();
        if (lower.includes('flying')) return 25;
        if (lower.includes('large')) return 18;
        if (lower.includes('mech')) return 20;
        return 19;
    }

    private applyLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) {
            this.applyLayerRecursive(child, layer);
        }
    }

    private playBossCinematic(bossNode: Node, token: number): void {
        const follow = this.resolveMainCameraFollow();
        if (!follow || !follow.node || !follow.node.isValid || !bossNode.isValid) return;

        this.stopBossCinematic(true);

        this._bossCameraFollowRef = follow;
        this._bossCameraOriginalTarget = follow.target;
        this._bossCameraOriginalEnabled = follow.enabled;
        this._bossCameraOriginalSmoothSpeed = follow.smoothSpeed;

        const camNode = follow.node;
        const from = camNode.getWorldPosition(new Vec3());
        const bossWorld = bossNode.getWorldPosition(new Vec3());
        const focusOffset = follow.offset.clone().multiplyScalar(0.78);
        const to = new Vec3(
            bossWorld.x + focusOffset.x,
            bossWorld.y + Math.max(2.4, focusOffset.y),
            bossWorld.z + focusOffset.z
        );

        follow.enabled = false;

        const clock = { value: 0 };
        this._bossCinematicClock = clock;
        const tempPos = new Vec3();
        const tempLook = new Vec3();

        tween(clock)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { value: 1 },
                {
                    onUpdate: () => {
                        if (!camNode.isValid || !bossNode.isValid) return;
                        Vec3.lerp(tempPos, from, to, clock.value);
                        camNode.setWorldPosition(tempPos);
                        bossNode.getWorldPosition(tempLook);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .delay(BOSS_CINEMATIC_HOLD_SECONDS)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { value: 0 },
                {
                    onUpdate: () => {
                        if (!camNode.isValid) return;
                        Vec3.lerp(tempPos, from, to, clock.value);
                        camNode.setWorldPosition(tempPos);
                        const target = this._bossCameraOriginalTarget;
                        if (target && target.isValid) {
                            target.getWorldPosition(tempLook);
                            camNode.lookAt(tempLook);
                        }
                    },
                }
            )
            .call(() => {
                if (token !== this._bossIntroToken) return;
                this.restoreBossCamera();
                this._bossCinematicClock = null;
            })
            .start();
    }

    private playLaneUnlockCinematic(
        focus: Vec3,
        padFocus: Vec3 | undefined,
        holdSeconds: number
    ): void {
        const follow = this.resolveMainCameraFollow();
        if (!follow || !follow.node || !follow.node.isValid) return;
        this._laneUnlockFocusToken += 1;
        const token = this._laneUnlockFocusToken;

        this.stopBossCinematic(true);

        this._bossCameraFollowRef = follow;
        this._bossCameraOriginalTarget = follow.target;
        this._bossCameraOriginalEnabled = follow.enabled;
        this._bossCameraOriginalSmoothSpeed = follow.smoothSpeed;

        const camNode = follow.node;
        const from = camNode.getWorldPosition(new Vec3());
        const focusOffset = follow.offset.clone().multiplyScalar(0.76);
        const toRoadEnd = new Vec3(
            focus.x + focusOffset.x,
            Math.max(focus.y + 2.4, focusOffset.y),
            focus.z + focusOffset.z
        );
        const padTarget = padFocus
            ? new Vec3(
                  padFocus.x + focusOffset.x,
                  Math.max(padFocus.y + 2.4, focusOffset.y),
                  padFocus.z + focusOffset.z
              )
            : toRoadEnd.clone();
        const endPauseSeconds = Math.max(0.28, Math.min(0.62, holdSeconds * 0.35));
        const padHoldSeconds = Math.max(0.6, holdSeconds - endPauseSeconds);

        follow.enabled = false;
        const cameraState = { x: from.x, y: from.y, z: from.z };
        this._bossCinematicClock = cameraState;
        const tempLook = new Vec3();

        tween(cameraState)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { x: toRoadEnd.x, y: toRoadEnd.y, z: toRoadEnd.z },
                {
                    onUpdate: () => {
                        if (token !== this._laneUnlockFocusToken || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        tempLook.set(focus.x, focus.y, focus.z);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .delay(endPauseSeconds)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS * 0.9,
                { x: padTarget.x, y: padTarget.y, z: padTarget.z },
                {
                    onUpdate: () => {
                        if (token !== this._laneUnlockFocusToken || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        const lookPad = padFocus ?? focus;
                        tempLook.set(lookPad.x, lookPad.y, lookPad.z);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .delay(padHoldSeconds)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { x: from.x, y: from.y, z: from.z },
                {
                    onUpdate: () => {
                        if (token !== this._laneUnlockFocusToken || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        const target = this._bossCameraOriginalTarget;
                        if (target && target.isValid) {
                            target.getWorldPosition(tempLook);
                            camNode.lookAt(tempLook);
                        }
                    },
                }
            )
            .call(() => {
                if (token !== this._laneUnlockFocusToken) return;
                this.restoreBossCamera();
                this._bossCinematicClock = null;
            })
            .start();
    }

    private stopBossCinematic(restoreCamera: boolean): void {
        if (this._bossCinematicClock) {
            Tween.stopAllByTarget(this._bossCinematicClock);
            this._bossCinematicClock = null;
        }
        if (restoreCamera) {
            this.restoreBossCamera();
        }
    }

    private restoreBossCamera(): void {
        const follow = this._bossCameraFollowRef;
        if (!follow || !follow.node || !follow.node.isValid) {
            this._bossCameraFollowRef = null;
            this._bossCameraOriginalTarget = null;
            return;
        }

        follow.smoothSpeed = this._bossCameraOriginalSmoothSpeed;
        if (this._bossCameraOriginalTarget && this._bossCameraOriginalTarget.isValid) {
            follow.target = this._bossCameraOriginalTarget;
        }
        follow.enabled = this._bossCameraOriginalEnabled;
        if (follow.enabled && follow.target && follow.target.isValid) {
            follow.snap();
        }

        this._bossCameraFollowRef = null;
        this._bossCameraOriginalTarget = null;
    }

    private resolveMainCameraFollow(): CameraFollow | null {
        if (this._bossCameraFollowRef && this._bossCameraFollowRef.node.isValid) {
            return this._bossCameraFollowRef;
        }
        const scene = this._uiCanvas?.scene;
        if (!scene) return null;

        this._bossCameraFollowRef = scene.getComponentInChildren(CameraFollow);
        return this._bossCameraFollowRef;
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        this.stopBossCinematic(true);
        this.stopBossPreviewMotion();
        if (this._waveForecastRoot) {
            Tween.stopAllByTarget(this._waveForecastRoot);
        }
        if (this._waveForecastOpacity) {
            Tween.stopAllByTarget(this._waveForecastOpacity);
        }
        if (this._bossIntroRoot) {
            Tween.stopAllByTarget(this._bossIntroRoot);
        }
        if (this._bossIntroOpacity) {
            Tween.stopAllByTarget(this._bossIntroOpacity);
        }
        if (this._laneUnlockDialogRoot) {
            Tween.stopAllByTarget(this._laneUnlockDialogRoot);
        }
        if (this._laneUnlockDialogOpacity) {
            Tween.stopAllByTarget(this._laneUnlockDialogOpacity);
        }
        this._coinLabel = null;
        this._waveLabel = null;
        this._buildingInfoLabel = null;
        this._baseHpLabel = null;
        this._xpBarBg = null;
        this._xpBarFg = null;
        this._levelLabel = null;
        this._waveForecastRoot = null;
        this._waveForecastLabel = null;
        this._waveForecastBg = null;
        this._waveForecastOpacity = null;
        this._laneUnlockDialogRoot = null;
        this._laneUnlockDialogLabel = null;
        this._laneUnlockDialogBg = null;
        this._laneUnlockDialogOpacity = null;
        this._bossIntroRoot = null;
        this._bossIntroTitleLabel = null;
        this._bossIntroQuoteLabel = null;
        this._bossIntroModelHost = null;
        this._bossIntroModelStage = null;
        this._bossIntroOpacity = null;
        this._bossPreviewMotionClock = null;
        this._bossPreviewMotionTarget = null;
        this._bossCinematicClock = null;
        this._uiCanvas = null;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
