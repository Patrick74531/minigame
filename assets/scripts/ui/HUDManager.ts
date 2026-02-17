import {
    Node,
    Label,
    Color,
    Canvas,
    UITransform,
    Widget,
    Graphics,
    UIOpacity,
    BlockInputEvents,
    Button,
    Prefab,
    Renderer,
    SkeletalAnimation,
    instantiate,
    resources,
    Tween,
    tween,
    Vec3,
    director,
    game,
    EventTouch,
    view,
    LabelOutline,
    LabelShadow,
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
import { Joystick } from './Joystick';
import { AudioSettingsManager } from '../core/managers/AudioSettingsManager';
import { WeaponSFXManager } from '../gameplay/weapons/WeaponSFXManager';
import { UIResponsive } from './UIResponsive';
import { BuildingManager } from '../gameplay/buildings/BuildingManager';
import { BuildingType } from '../gameplay/buildings/Building';

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
const HERO_RESPAWN_DIALOG_WIDTH = 920;
const HERO_RESPAWN_DIALOG_HEIGHT = 260;
const GAME_OVER_DIALOG_MAX_WIDTH = 760;
const GAME_OVER_DIALOG_MAX_HEIGHT = 350;
const GAME_OVER_DIALOG_MIN_WIDTH = 420;
const GAME_OVER_DIALOG_MIN_HEIGHT = 250;
const GAME_OVER_RESTART_BTN_MAX_WIDTH = 280;
const GAME_OVER_RESTART_BTN_MAX_HEIGHT = 86;
const GAME_OVER_RESTART_BTN_MIN_WIDTH = 190;
const GAME_OVER_RESTART_BTN_MIN_HEIGHT = 64;
const SETTINGS_PANEL_WIDTH = 500;
const SETTINGS_PANEL_HEIGHT = 400; // Increased to fit language row
const SETTINGS_SLIDER_WIDTH = 262;
const SETTINGS_BUTTON_WIDTH = 156;
const SETTINGS_BUTTON_HEIGHT = 58;
const SETTINGS_CLOSE_SIZE = 48;

type AudioSliderKey = 'bgm' | 'sfx';

type VolumeSliderView = {
    key: AudioSliderKey;
    hitNode: Node;
    fillGraphics: Graphics;
    knobNode: Node;
    valueLabel: Label;
    width: number;
};

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

    public static destroyInstance(): void {
        this._instance = null;
    }

    // === UI 元素 ===
    private _coinLabel: Label | null = null;
    private _waveLabel: Label | null = null;
    private _waveWidget: Widget | null = null;
    private _desktopMoveHintWidget: Widget | null = null;
    private _buildingInfoLabel: Label | null = null;
    private _baseHpLabel: Label | null = null;
    private _uiCanvas: Node | null = null;

    // === 经验条 UI ===
    private _xpBarBg: Graphics | null = null;
    private _xpBarFg: Graphics | null = null;
    private _levelLabel: Label | null = null;
    private _xpRootWidget: Widget | null = null;
    private _xpBarWidth: number = 320;
    private _xpBarHeight: number = 16;

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
    private _heroRespawnRoot: Node | null = null;
    private _heroRespawnCountdownLabel: Label | null = null;
    private _heroRespawnMessageLabel: Label | null = null;
    private _heroRespawnOpacity: UIOpacity | null = null;
    private _heroRespawnToken: number = 0;
    private _gameOverRoot: Node | null = null;
    private _gameOverTitleLabel: Label | null = null;
    private _gameOverMessageLabel: Label | null = null;
    private _gameOverButtonNode: Node | null = null;
    private _gameOverButton: Button | null = null;
    private _gameOverButtonLabel: Label | null = null;
    private _gameOverButtonBg: Graphics | null = null;
    private _gameOverPanelBg: Graphics | null = null;
    private _gameOverOpacity: UIOpacity | null = null;
    private _gameOverRestarting: boolean = false;
    private _gameOverDialogWidth: number = GAME_OVER_DIALOG_MAX_WIDTH;
    private _gameOverDialogHeight: number = GAME_OVER_DIALOG_MAX_HEIGHT;
    private _gameOverButtonWidth: number = GAME_OVER_RESTART_BTN_MAX_WIDTH;
    private _gameOverButtonHeight: number = GAME_OVER_RESTART_BTN_MAX_HEIGHT;
    private _joystickRef: Joystick | null = null;
    private _settingsButtonNode: Node | null = null;
    private _settingsPanelRoot: Node | null = null;
    private _settingsPanelOpacity: UIOpacity | null = null;
    private _settingsBgmSlider: VolumeSliderView | null = null;
    private _settingsSfxSlider: VolumeSliderView | null = null;

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
        uiCanvas.getChildByName('GameOverDialog')?.destroy();
        uiCanvas.getChildByName('SettingsButton')?.destroy();
        uiCanvas.getChildByName('SettingsPanelRoot')?.destroy();
        uiCanvas.getChildByName('UICamera')?.getChildByName('BossIntroModelStage')?.destroy();

        // 创建金币显示
        this._coinLabel = UIFactory.createCoinDisplay(uiCanvas);
        this._coinLabel.node.active = false;

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
        hpWidget.top = 48;

        this._baseHpLabel.fontSize = 30;
        this._baseHpLabel.lineHeight = 36;
        this._baseHpLabel.color = new Color(244, 245, 255, 255);
        this.applyGameLabelStyle(this._baseHpLabel, {
            outlineColor: new Color(8, 16, 28, 255),
            outlineWidth: 4,
        });
        this._baseHpLabel.node.active = false;

        // 创建建造点信息显示
        this.createBuildingInfoLabel(uiCanvas);

        // 创建波次显示（屏幕中间）
        this._waveLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.wave', { wave: 1 }),
            'WaveLabel'
        );

        // Position using Widget
        this._waveWidget = this._waveLabel.node.addComponent(Widget);

        this._waveLabel.fontSize = 40;
        this._waveLabel.lineHeight = 44;
        this._waveLabel.color = new Color(255, 215, 80, 255);
        this.applyGameLabelStyle(this._waveLabel, {
            outlineColor: new Color(40, 20, 0, 255),
            outlineWidth: 5,
            shadowColor: new Color(0, 0, 0, 205),
        });

        // 创建经验条 (Top Left)
        this.createXpBar(uiCanvas);
        this.createWaveForecastBanner(uiCanvas);
        this.createLaneUnlockDialog(uiCanvas);
        this.createBossIntroPanel(uiCanvas);
        this.createHeroRespawnDialog(uiCanvas);
        this.createGameOverDialog(uiCanvas);
        this.createSettingsUI(uiCanvas);
        this._desktopMoveHintWidget =
            uiCanvas.getChildByName('DesktopMoveHint')?.getComponent(Widget) ?? null;
        view.on('canvas-resize', this.onCanvasResize, this);
        this.applyHudEdgeLayout();

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
        widget.bottom = 174;

        this._buildingInfoLabel = node.addComponent(Label);
        this._buildingInfoLabel.string = '';
        this._buildingInfoLabel.fontSize = 40;
        this._buildingInfoLabel.lineHeight = 46;
        this._buildingInfoLabel.color = new Color(255, 244, 212, 255);
        this._buildingInfoLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.applyGameLabelStyle(this._buildingInfoLabel, {
            outlineColor: new Color(24, 16, 8, 255),
            outlineWidth: 4,
        });

        // 默认隐藏
        node.active = false;
    }

    private createSettingsUI(parent: Node): void {
        const buttonNode = new Node('SettingsButton');
        buttonNode.layer = UI_LAYER;
        parent.addChild(buttonNode);
        buttonNode
            .addComponent(UITransform)
            .setContentSize(SETTINGS_BUTTON_WIDTH, SETTINGS_BUTTON_HEIGHT);
        const buttonWidget = buttonNode.addComponent(Widget);
        buttonWidget.isAlignTop = true;
        buttonWidget.isAlignRight = true;
        buttonWidget.top = 12;
        buttonWidget.right = 16;

        const button = buttonNode.addComponent(Button);
        button.transition = Button.Transition.NONE;

        const buttonBg = buttonNode.addComponent(Graphics);
        this.drawSettingsButton(buttonBg);

        const buttonLabelNode = new Node('SettingsButtonLabel');
        buttonLabelNode.layer = UI_LAYER;
        buttonNode.addChild(buttonLabelNode);
        buttonLabelNode
            .addComponent(UITransform)
            .setContentSize(SETTINGS_BUTTON_WIDTH - 52, SETTINGS_BUTTON_HEIGHT - 8);
        buttonLabelNode.setPosition(14, 0, 0);
        const buttonLabel = buttonLabelNode.addComponent(Label);
        buttonLabel.string = Localization.instance.t('ui.settings.button');
        buttonLabel.fontSize = 28;
        buttonLabel.lineHeight = 32;
        buttonLabel.isBold = true;
        buttonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        buttonLabel.verticalAlign = Label.VerticalAlign.CENTER;
        buttonLabel.color = new Color(34, 19, 8, 255);
        this.applyGameLabelStyle(buttonLabel, {
            outlineColor: new Color(255, 238, 182, 228),
            outlineWidth: 1,
            shadowColor: new Color(0, 0, 0, 88),
            shadowOffsetX: 1,
            shadowOffsetY: -1,
            shadowBlur: 1,
        });

        const buttonIconNode = new Node('SettingsButtonIcon');
        buttonIconNode.layer = UI_LAYER;
        buttonNode.addChild(buttonIconNode);
        buttonIconNode.addComponent(UITransform).setContentSize(28, 28);
        buttonIconNode.setPosition(-SETTINGS_BUTTON_WIDTH * 0.3, 0, 0);
        const buttonIcon = buttonIconNode.addComponent(Graphics);
        this.drawSettingsGearIcon(buttonIcon);

        buttonNode.on(
            Button.EventType.CLICK,
            () => {
                this.toggleSettingsPanel();
            },
            this
        );

        const panelRoot = new Node('SettingsPanelRoot');
        panelRoot.layer = UI_LAYER;
        parent.addChild(panelRoot);
        panelRoot.addComponent(UITransform).setContentSize(1280, 720);
        const rootWidget = panelRoot.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;
        this._settingsPanelOpacity = panelRoot.addComponent(UIOpacity);
        this._settingsPanelOpacity.opacity = 0;

        const blocker = new Node('SettingsPanelBlocker');
        blocker.layer = UI_LAYER;
        panelRoot.addChild(blocker);
        blocker.addComponent(UITransform).setContentSize(1280, 720);
        const blockerWidget = blocker.addComponent(Widget);
        blockerWidget.isAlignTop = true;
        blockerWidget.isAlignBottom = true;
        blockerWidget.isAlignLeft = true;
        blockerWidget.isAlignRight = true;
        blocker.addComponent(BlockInputEvents);
        blocker.on(
            Node.EventType.TOUCH_END,
            () => {
                this.hideSettingsPanel();
            },
            this
        );

        const panel = new Node('SettingsPanel');
        panel.layer = UI_LAYER;
        panelRoot.addChild(panel);
        panel.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH, SETTINGS_PANEL_HEIGHT);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignTop = true;
        panelWidget.isAlignRight = true;
        panelWidget.top = 70;
        panelWidget.right = 16;

        const panelBg = panel.addComponent(Graphics);
        this.drawSettingsPanelBackground(panelBg);

        const titleNode = new Node('SettingsTitle');
        titleNode.layer = UI_LAYER;
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH - 132, 46);
        titleNode.setPosition(-56, 108, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.settings.title');
        titleLabel.fontSize = 32;
        titleLabel.lineHeight = 38;
        titleLabel.isBold = true;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(255, 228, 186, 255);
        this.applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(54, 26, 8, 255),
            outlineWidth: 3,
        });

        const closeBtnNode = new Node('SettingsCloseButton');
        closeBtnNode.layer = UI_LAYER;
        panel.addChild(closeBtnNode);
        closeBtnNode
            .addComponent(UITransform)
            .setContentSize(SETTINGS_CLOSE_SIZE, SETTINGS_CLOSE_SIZE);
        closeBtnNode.setPosition(SETTINGS_PANEL_WIDTH / 2 - 40, SETTINGS_PANEL_HEIGHT / 2 - 36, 0);
        const closeButton = closeBtnNode.addComponent(Button);
        closeButton.transition = Button.Transition.NONE;
        const closeBg = closeBtnNode.addComponent(Graphics);
        this.drawSettingsCloseButton(closeBg);

        const closeIconNode = new Node('SettingsCloseIcon');
        closeIconNode.layer = UI_LAYER;
        closeBtnNode.addChild(closeIconNode);
        closeIconNode.addComponent(UITransform).setContentSize(24, 24);
        const closeIcon = closeIconNode.addComponent(Graphics);
        this.drawSettingsCloseIcon(closeIcon);
        closeBtnNode.on(
            Button.EventType.CLICK,
            () => {
                this.hideSettingsPanel();
            },
            this
        );

        this._settingsBgmSlider = this.createVolumeSlider(
            panel,
            'SettingsBgmRow',
            'ui.settings.bgm',
            60,
            'bgm'
        );
        this._settingsSfxSlider = this.createVolumeSlider(
            panel,
            'SettingsSfxRow',
            'ui.settings.sfx',
            -20,
            'sfx'
        );

        this.createLanguageRow(panel, -100);

        this._settingsButtonNode = buttonNode;
        this._settingsPanelRoot = panelRoot;
        this.refreshSettingsPanelUI();
        panelRoot.active = false;
    }

    private createLanguageRow(parent: Node, posY: number): void {
        const row = new Node('SettingsLangRow');
        row.layer = UI_LAYER;
        parent.addChild(row);
        row.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH - 44, 80);
        row.setPosition(0, posY, 0);

        const titleNode = new Node('SettingsLangTitle');
        titleNode.layer = UI_LAYER;
        row.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(128, 36);
        titleNode.setPosition(-162, 18, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.settings.language');
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(238, 242, 252, 255);
        this.applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(8, 20, 34, 255),
            outlineWidth: 3,
        });

        // Add container for buttons
        const btnContainer = new Node('LangBtnContainer');
        btnContainer.layer = UI_LAYER;
        row.addChild(btnContainer);
        btnContainer.setPosition(60, 0, 0);

        this.createLanguageButton(btnContainer, 'zh', -70, 'ui.settings.lang.zh');
        this.createLanguageButton(btnContainer, 'en', 70, 'ui.settings.lang.en');
    }

    private createLanguageButton(
        parent: Node,
        langCode: string,
        posX: number,
        textKey: string
    ): void {
        const btnNode = new Node(`LangBtn_${langCode}`);
        btnNode.layer = UI_LAYER;
        parent.addChild(btnNode);
        btnNode.addComponent(UITransform).setContentSize(120, 48);
        btnNode.setPosition(posX, 0, 0);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        const bg = btnNode.addComponent(Graphics);
        this.drawLanguageButtonBg(bg, Localization.instance.currentLanguage === langCode);

        const labelNode = new Node('Label');
        labelNode.layer = UI_LAYER;
        btnNode.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.string = Localization.instance.t(textKey);
        label.fontSize = 24;
        label.lineHeight = 28;
        label.color = new Color(255, 255, 255, 255);
        this.applyGameLabelStyle(label);

        btnNode.on('click', () => {
            this.onLanguageSwitch(langCode as any);
        });
    }

    private drawLanguageButtonBg(bg: Graphics, isSelected: boolean): void {
        bg.clear();
        const w = 120;
        const h = 48;
        const r = 8;
        if (isSelected) {
            bg.fillColor = new Color(82, 214, 255, 255);
            bg.strokeColor = new Color(255, 255, 255, 255);
        } else {
            bg.fillColor = new Color(28, 42, 58, 255);
            bg.strokeColor = new Color(116, 194, 236, 150);
        }
        bg.lineWidth = 2;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.fill();
        bg.stroke();
    }

    private onLanguageSwitch(lang: 'zh' | 'en'): void {
        if (Localization.instance.currentLanguage === lang) return;

        Localization.instance.setLanguage(lang);
        this.refreshAllText();
    }

    private refreshAllText(): void {
        // Refresh HUD labels
        if (this._waveLabel) {
            this._waveLabel.string = Localization.instance.t('ui.hud.wave', {
                wave: WaveService.instance.currentWave,
            });
        }

        if (this._baseHpLabel) {
            // Need to fetch current HP if possible, or just refresh static text
            // Here we just refresh the format
            const baseBuilding = BuildingManager.instance.activeBuildings.find(
                b => b.buildingType === BuildingType.BASE
            );
            const currentHP = baseBuilding?.currentHp ?? GameConfig.BUILDING.BASE_START_HP;

            this._baseHpLabel.string = Localization.instance.t('ui.hud.baseHp', {
                current: Math.max(0, Math.ceil(currentHP)),
                max: GameConfig.BUILDING.BASE_START_HP,
            });
        }

        // Refresh Settings Panel
        const panel = this._settingsPanelRoot?.getChildByName('SettingsPanel');
        if (panel) {
            // Title
            const title = panel.getChildByName('SettingsTitle')?.getComponent(Label);
            if (title) title.string = Localization.instance.t('ui.settings.title');

            // Sliders
            const bgmRow = panel.getChildByName('SettingsBgmRow');
            if (bgmRow) {
                const l = bgmRow.getChildByName('SettingsBgmRow_Title')?.getComponent(Label);
                if (l) l.string = Localization.instance.t('ui.settings.bgm');
            }
            const sfxRow = panel.getChildByName('SettingsSfxRow');
            if (sfxRow) {
                const l = sfxRow.getChildByName('SettingsSfxRow_Title')?.getComponent(Label);
                if (l) l.string = Localization.instance.t('ui.settings.sfx');
            }
            // Language Row Title
            const langRow = panel.getChildByName('SettingsLangRow');
            if (langRow) {
                const l = langRow.getChildByName('SettingsLangTitle')?.getComponent(Label);
                if (l) l.string = Localization.instance.t('ui.settings.language');

                // Buttons state update
                const container = langRow.getChildByName('LangBtnContainer');
                if (container) {
                    ['zh', 'en'].forEach(code => {
                        const btn = container.getChildByName(`LangBtn_${code}`);
                        if (btn) {
                            const bg = btn.getComponent(Graphics);
                            if (bg) {
                                this.drawLanguageButtonBg(
                                    bg,
                                    Localization.instance.currentLanguage === code
                                );
                            }
                            const lb = btn.getChildByName('Label')?.getComponent(Label);
                            if (lb)
                                lb.string = Localization.instance.t(`ui.settings.lang.${code}`);
                        }
                    });
                }
            }
        }

        // Settings Button
        const btnLabel = this._settingsButtonNode
            ?.getChildByName('SettingsButtonLabel')
            ?.getComponent(Label);
        if (btnLabel) btnLabel.string = Localization.instance.t('ui.settings.button');

        // Refresh Desktop Move Hint
        if (this._desktopMoveHintWidget) {
            const hintLabel = this._desktopMoveHintWidget.node.getComponent(Label);
            if (hintLabel) {
                hintLabel.string = Localization.instance.t('ui.hud.desktopMoveHint');
            }
        }
    }

    private createVolumeSlider(
        parent: Node,
        rowName: string,
        titleKey: string,
        posY: number,
        key: AudioSliderKey
    ): VolumeSliderView {
        const row = new Node(rowName);
        row.layer = UI_LAYER;
        parent.addChild(row);
        row.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH - 44, 80);
        row.setPosition(0, posY, 0);

        const titleNode = new Node(`${rowName}_Title`);
        titleNode.layer = UI_LAYER;
        row.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(128, 36);
        titleNode.setPosition(-162, 18, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t(titleKey);
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(238, 242, 252, 255);
        this.applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(8, 20, 34, 255),
            outlineWidth: 3,
        });

        const trackNode = new Node(`${rowName}_Track`);
        trackNode.layer = UI_LAYER;
        row.addChild(trackNode);
        trackNode.addComponent(UITransform).setContentSize(SETTINGS_SLIDER_WIDTH, 18);
        trackNode.setPosition(-16, -10, 0);
        const trackBg = trackNode.addComponent(Graphics);
        trackBg.fillColor = new Color(28, 42, 58, 238);
        trackBg.roundRect(-SETTINGS_SLIDER_WIDTH / 2, -9, SETTINGS_SLIDER_WIDTH, 18, 9);
        trackBg.fill();
        trackBg.strokeColor = new Color(116, 194, 236, 220);
        trackBg.lineWidth = 2;
        trackBg.roundRect(-SETTINGS_SLIDER_WIDTH / 2, -9, SETTINGS_SLIDER_WIDTH, 18, 9);
        trackBg.stroke();

        const fillNode = new Node(`${rowName}_Fill`);
        fillNode.layer = UI_LAYER;
        trackNode.addChild(fillNode);
        fillNode.addComponent(UITransform).setContentSize(SETTINGS_SLIDER_WIDTH, 18);
        const fillGraphics = fillNode.addComponent(Graphics);

        const knobNode = new Node(`${rowName}_Knob`);
        knobNode.layer = UI_LAYER;
        trackNode.addChild(knobNode);
        knobNode.addComponent(UITransform).setContentSize(28, 28);
        const knobGraphics = knobNode.addComponent(Graphics);
        knobGraphics.fillColor = new Color(255, 246, 220, 255);
        knobGraphics.circle(0, 0, 11);
        knobGraphics.fill();
        knobGraphics.strokeColor = new Color(255, 186, 82, 255);
        knobGraphics.lineWidth = 2;
        knobGraphics.circle(0, 0, 11);
        knobGraphics.stroke();

        const hitNode = new Node(`${rowName}_Hit`);
        hitNode.layer = UI_LAYER;
        row.addChild(hitNode);
        hitNode.addComponent(UITransform).setContentSize(SETTINGS_SLIDER_WIDTH + 18, 34);
        hitNode.setPosition(-16, -10, 0);
        hitNode.on(
            Node.EventType.TOUCH_START,
            (event: EventTouch) => {
                this.onVolumeSliderTouch(key, event);
            },
            this
        );
        hitNode.on(
            Node.EventType.TOUCH_MOVE,
            (event: EventTouch) => {
                this.onVolumeSliderTouch(key, event);
            },
            this
        );

        const valueNode = new Node(`${rowName}_Value`);
        valueNode.layer = UI_LAYER;
        row.addChild(valueNode);
        valueNode.addComponent(UITransform).setContentSize(80, 36);
        valueNode.setPosition(168, 18, 0);
        const valueLabel = valueNode.addComponent(Label);
        valueLabel.string = '100%';
        valueLabel.fontSize = 24;
        valueLabel.lineHeight = 30;
        valueLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        valueLabel.verticalAlign = Label.VerticalAlign.CENTER;
        valueLabel.color = new Color(156, 228, 255, 255);
        this.applyGameLabelStyle(valueLabel, {
            outlineColor: new Color(10, 24, 34, 255),
            outlineWidth: 3,
        });

        return {
            key,
            hitNode,
            fillGraphics,
            knobNode,
            valueLabel,
            width: SETTINGS_SLIDER_WIDTH,
        };
    }

    private applyGameLabelStyle(
        label: Label,
        options?: {
            outlineColor?: Color;
            outlineWidth?: number;
            shadowColor?: Color;
            shadowOffsetX?: number;
            shadowOffsetY?: number;
            shadowBlur?: number;
        }
    ): void {
        const outline =
            label.node.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline);
        outline.color = options?.outlineColor ?? new Color(10, 16, 28, 255);
        outline.width = options?.outlineWidth ?? 3;

        const shadow = label.node.getComponent(LabelShadow) ?? label.node.addComponent(LabelShadow);
        shadow.color = options?.shadowColor ?? new Color(0, 0, 0, 180);
        shadow.offset.set(options?.shadowOffsetX ?? 2, options?.shadowOffsetY ?? -2);
        shadow.blur = options?.shadowBlur ?? 2;
    }

    private onVolumeSliderTouch(key: AudioSliderKey, event: EventTouch): void {
        const slider = key === 'bgm' ? this._settingsBgmSlider : this._settingsSfxSlider;
        if (!slider) return;

        const transform = slider.hitNode.getComponent(UITransform);
        if (!transform) return;
        const uiLocation = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
        const ratio = Math.max(0, Math.min(1, (local.x + slider.width * 0.5) / slider.width));

        if (key === 'bgm') {
            AudioSettingsManager.instance.setBgmVolume(ratio);
        } else {
            AudioSettingsManager.instance.setSfxVolume(ratio);
            WeaponSFXManager.refreshVolumes();
        }

        this.refreshSettingsPanelUI();
    }

    private refreshSettingsPanelUI(): void {
        if (this._settingsBgmSlider) {
            this.redrawVolumeSlider(
                this._settingsBgmSlider,
                AudioSettingsManager.instance.bgmVolume
            );
        }
        if (this._settingsSfxSlider) {
            this.redrawVolumeSlider(
                this._settingsSfxSlider,
                AudioSettingsManager.instance.sfxVolume
            );
        }
    }

    private redrawVolumeSlider(slider: VolumeSliderView, ratio: number): void {
        const clamped = Math.max(0, Math.min(1, ratio));
        const left = -slider.width / 2;
        const fillWidth = Math.max(0, Math.round(slider.width * clamped));

        slider.fillGraphics.clear();
        if (fillWidth > 0) {
            slider.fillGraphics.fillColor = new Color(82, 214, 255, 255);
            slider.fillGraphics.roundRect(left, -7, fillWidth, 14, 7);
            slider.fillGraphics.fill();
        }
        slider.knobNode.setPosition(left + slider.width * clamped, 0, 0);
        slider.valueLabel.string = `${Math.round(clamped * 100)}%`;
    }

    private drawSettingsButton(bg: Graphics): void {
        const tf = bg.node.getComponent(UITransform);
        const w = Math.round(tf?.contentSize.width ?? SETTINGS_BUTTON_WIDTH);
        const h = Math.round(tf?.contentSize.height ?? SETTINGS_BUTTON_HEIGHT);
        const radius = Math.max(12, Math.round(h * 0.3));
        bg.clear();
        bg.fillColor = new Color(255, 198, 88, 250);
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.fill();
        bg.fillColor = new Color(255, 236, 172, 120);
        bg.roundRect(-w / 2 + 4, h * 0.04, w - 8, h * 0.34, Math.max(8, radius - 5));
        bg.fill();
        bg.strokeColor = new Color(255, 246, 210, 255);
        bg.lineWidth = 3;
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.stroke();
    }

    private drawSettingsCloseButton(bg: Graphics): void {
        const tf = bg.node.getComponent(UITransform);
        const s = Math.round(tf?.contentSize.width ?? SETTINGS_CLOSE_SIZE);
        const r = Math.max(8, Math.round(s * 0.25));
        bg.clear();
        bg.fillColor = new Color(122, 42, 34, 255);
        bg.roundRect(-s / 2, -s / 2, s, s, r);
        bg.fill();
        bg.strokeColor = new Color(255, 182, 160, 255);
        bg.lineWidth = 2.5;
        bg.roundRect(-s / 2, -s / 2, s, s, r);
        bg.stroke();
    }

    private drawSettingsPanelBackground(bg: Graphics): void {
        bg.clear();
        bg.fillColor = new Color(10, 20, 34, 238);
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2,
            -SETTINGS_PANEL_HEIGHT / 2,
            SETTINGS_PANEL_WIDTH,
            SETTINGS_PANEL_HEIGHT,
            18
        );
        bg.fill();
        bg.fillColor = new Color(32, 46, 68, 155);
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2 + 10,
            SETTINGS_PANEL_HEIGHT * 0.14,
            SETTINGS_PANEL_WIDTH - 20,
            SETTINGS_PANEL_HEIGHT * 0.3,
            12
        );
        bg.fill();
        bg.strokeColor = new Color(255, 172, 88, 246);
        bg.lineWidth = 3.5;
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2,
            -SETTINGS_PANEL_HEIGHT / 2,
            SETTINGS_PANEL_WIDTH,
            SETTINGS_PANEL_HEIGHT,
            18
        );
        bg.stroke();
        bg.strokeColor = new Color(96, 204, 248, 140);
        bg.lineWidth = 1.5;
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2 + 10,
            -SETTINGS_PANEL_HEIGHT / 2 + 10,
            SETTINGS_PANEL_WIDTH - 20,
            SETTINGS_PANEL_HEIGHT - 20,
            14
        );
        bg.stroke();
    }

    private drawSettingsGearIcon(bg: Graphics): void {
        bg.clear();
        bg.strokeColor = new Color(62, 34, 8, 255);
        bg.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI / 4) * i;
            const outerX = Math.cos(angle) * 11;
            const outerY = Math.sin(angle) * 11;
            const innerX = Math.cos(angle) * 7;
            const innerY = Math.sin(angle) * 7;
            bg.moveTo(innerX, innerY);
            bg.lineTo(outerX, outerY);
            bg.stroke();
        }
        bg.fillColor = new Color(110, 62, 20, 255);
        bg.circle(0, 0, 7);
        bg.fill();
        bg.fillColor = new Color(255, 230, 168, 255);
        bg.circle(0, 0, 3.2);
        bg.fill();
    }

    private drawSettingsCloseIcon(bg: Graphics): void {
        bg.clear();
        bg.strokeColor = new Color(255, 236, 222, 255);
        bg.lineWidth = 3.5;
        bg.moveTo(-7, -7);
        bg.lineTo(7, 7);
        bg.stroke();
        bg.moveTo(-7, 7);
        bg.lineTo(7, -7);
        bg.stroke();
    }

    private toggleSettingsPanel(): void {
        if (this._settingsPanelRoot?.active) {
            this.hideSettingsPanel();
            return;
        }
        this.showSettingsPanel();
    }

    private showSettingsPanel(): void {
        if (!this._settingsPanelRoot || !this._settingsPanelOpacity) return;
        this.refreshSettingsPanelUI();

        this._settingsPanelRoot.active = true;
        const rootParent = this._settingsPanelRoot.parent;
        if (rootParent) {
            this._settingsPanelRoot.setSiblingIndex(rootParent.children.length - 1);
        }
        this._settingsPanelOpacity.opacity = 0;
        Tween.stopAllByTarget(this._settingsPanelOpacity);
        tween(this._settingsPanelOpacity).to(0.14, { opacity: 255 }).start();
    }

    private hideSettingsPanel(): void {
        if (!this._settingsPanelRoot || !this._settingsPanelOpacity) return;
        Tween.stopAllByTarget(this._settingsPanelOpacity);
        tween(this._settingsPanelOpacity)
            .to(0.12, { opacity: 0 })
            .call(() => {
                if (this._settingsPanelRoot) {
                    this._settingsPanelRoot.active = false;
                }
            })
            .start();
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
                this._baseHpLabel.color = new Color(255, 112, 112, 255);
            } else {
                this._baseHpLabel.color = new Color(244, 245, 255, 255);
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

    public showHeroRespawnCountdown(seconds: number): void {
        if (
            !this._heroRespawnRoot ||
            !this._heroRespawnCountdownLabel ||
            !this._heroRespawnMessageLabel ||
            !this._heroRespawnOpacity
        ) {
            return;
        }

        this._heroRespawnToken += 1;
        this._heroRespawnRoot.active = true;
        this._heroRespawnOpacity.opacity = 255;
        this._heroRespawnRoot.setScale(1, 1, 1);

        this._heroRespawnCountdownLabel.string = Localization.instance.t(
            'ui.hero.respawn.countdown.value',
            { seconds }
        );
        this._heroRespawnMessageLabel.string = Localization.instance.t(
            'ui.hero.respawn.countdown.message',
            { seconds }
        );

        Tween.stopAllByTarget(this._heroRespawnRoot);
        Tween.stopAllByTarget(this._heroRespawnOpacity);
    }

    public updateHeroRespawnCountdown(seconds: number): void {
        if (
            !this._heroRespawnRoot ||
            !this._heroRespawnRoot.active ||
            !this._heroRespawnCountdownLabel ||
            !this._heroRespawnMessageLabel
        ) {
            return;
        }

        this._heroRespawnCountdownLabel.string = Localization.instance.t(
            'ui.hero.respawn.countdown.value',
            { seconds }
        );
        this._heroRespawnMessageLabel.string = Localization.instance.t(
            'ui.hero.respawn.countdown.message',
            { seconds }
        );
    }

    public showHeroRespawnReadyPrompt(): void {
        if (
            !this._heroRespawnRoot ||
            !this._heroRespawnCountdownLabel ||
            !this._heroRespawnMessageLabel ||
            !this._heroRespawnOpacity
        ) {
            return;
        }

        this._heroRespawnToken += 1;
        const token = this._heroRespawnToken;

        this._heroRespawnRoot.active = true;
        this._heroRespawnOpacity.opacity = 255;
        this._heroRespawnRoot.setScale(1, 1, 1);
        this._heroRespawnCountdownLabel.string = Localization.instance.t(
            'ui.hero.respawn.ready.tag'
        );
        this._heroRespawnMessageLabel.string = Localization.instance.t(
            'ui.hero.respawn.ready.message'
        );

        Tween.stopAllByTarget(this._heroRespawnRoot);
        Tween.stopAllByTarget(this._heroRespawnOpacity);

        tween(this._heroRespawnRoot)
            .to(0.12, { scale: new Vec3(1.06, 1.06, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._heroRespawnOpacity)
            .delay(2.2)
            .to(0.24, { opacity: 0 })
            .call(() => {
                if (token !== this._heroRespawnToken) return;
                if (this._heroRespawnRoot) {
                    this._heroRespawnRoot.active = false;
                }
            })
            .start();
    }

    private createGameOverDialog(parent: Node): void {
        const root = new Node('GameOverDialog');
        root.layer = UI_LAYER;
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(1280, 720);
        const rootWidget = root.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;

        this._gameOverOpacity = root.addComponent(UIOpacity);
        this._gameOverOpacity.opacity = 0;

        // Separate input blocker: blocks gameplay UI outside panel without intercepting panel/button hits.
        const blocker = new Node('GameOverInputBlocker');
        blocker.layer = UI_LAYER;
        root.addChild(blocker);
        blocker.addComponent(UITransform).setContentSize(1280, 720);
        const blockerWidget = blocker.addComponent(Widget);
        blockerWidget.isAlignTop = true;
        blockerWidget.isAlignBottom = true;
        blockerWidget.isAlignLeft = true;
        blockerWidget.isAlignRight = true;
        blocker.addComponent(BlockInputEvents);

        const panel = new Node('GameOverPanel');
        panel.layer = UI_LAYER;
        root.addChild(panel);
        panel
            .addComponent(UITransform)
            .setContentSize(this._gameOverDialogWidth, this._gameOverDialogHeight);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignHorizontalCenter = true;
        panelWidget.isAlignVerticalCenter = true;

        const panelBg = panel.addComponent(Graphics);
        this._gameOverPanelBg = panelBg;
        this.drawGameOverPanelBackground(panelBg);

        const titleNode = new Node('GameOverTitle');
        titleNode.layer = UI_LAYER;
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(this._gameOverDialogWidth - 80, 72);
        titleNode.setPosition(0, 98, 0);
        this._gameOverTitleLabel = titleNode.addComponent(Label);
        this._gameOverTitleLabel.fontSize = 54;
        this._gameOverTitleLabel.lineHeight = 62;
        this._gameOverTitleLabel.isBold = true;
        this._gameOverTitleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverTitleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverTitleLabel.color = new Color(255, 224, 140, 255);

        const messageNode = new Node('GameOverMessage');
        messageNode.layer = UI_LAYER;
        panel.addChild(messageNode);
        messageNode.addComponent(UITransform).setContentSize(this._gameOverDialogWidth - 130, 116);
        messageNode.setPosition(0, 20, 0);
        this._gameOverMessageLabel = messageNode.addComponent(Label);
        this._gameOverMessageLabel.fontSize = 30;
        this._gameOverMessageLabel.lineHeight = 40;
        this._gameOverMessageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverMessageLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverMessageLabel.enableWrapText = true;
        this._gameOverMessageLabel.color = new Color(234, 245, 255, 255);

        const buttonNode = new Node('GameOverRestartButton');
        buttonNode.layer = UI_LAYER;
        panel.addChild(buttonNode);
        buttonNode
            .addComponent(UITransform)
            .setContentSize(this._gameOverButtonWidth, this._gameOverButtonHeight);
        buttonNode.setPosition(0, -108, 0);
        this._gameOverButton = buttonNode.addComponent(Button);
        this._gameOverButton.transition = Button.Transition.NONE;
        this._gameOverButtonBg = buttonNode.addComponent(Graphics);
        this._gameOverButtonNode = buttonNode;
        this.drawGameOverRestartButton(false);

        const buttonLabelNode = new Node('GameOverRestartButtonLabel');
        buttonLabelNode.layer = UI_LAYER;
        buttonNode.addChild(buttonLabelNode);
        buttonLabelNode
            .addComponent(UITransform)
            .setContentSize(this._gameOverButtonWidth - 24, this._gameOverButtonHeight - 10);
        this._gameOverButtonLabel = buttonLabelNode.addComponent(Label);
        this._gameOverButtonLabel.fontSize = 34;
        this._gameOverButtonLabel.lineHeight = 42;
        this._gameOverButtonLabel.isBold = true;
        this._gameOverButtonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverButtonLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverButtonLabel.color = new Color(30, 18, 8, 255);
        this._gameOverButtonLabel.string = Localization.instance.t('ui.gameOver.button.restart');

        buttonNode.on(
            Node.EventType.TOUCH_START,
            () => {
                if (this._gameOverRestarting) return;
                this.drawGameOverRestartButton(true);
                buttonNode.setScale(0.97, 0.97, 1);
            },
            this
        );
        buttonNode.on(
            Node.EventType.MOUSE_DOWN,
            () => {
                if (this._gameOverRestarting) return;
                this.drawGameOverRestartButton(true);
                buttonNode.setScale(0.97, 0.97, 1);
            },
            this
        );
        buttonNode.on(
            Node.EventType.TOUCH_CANCEL,
            () => {
                if (this._gameOverRestarting) return;
                this.drawGameOverRestartButton(false);
                buttonNode.setScale(1, 1, 1);
            },
            this
        );
        buttonNode.on(
            Node.EventType.MOUSE_LEAVE,
            () => {
                if (this._gameOverRestarting) return;
                this.drawGameOverRestartButton(false);
                buttonNode.setScale(1, 1, 1);
            },
            this
        );
        buttonNode.on(
            Node.EventType.TOUCH_END,
            () => {
                if (this._gameOverRestarting) return;
                this.drawGameOverRestartButton(false);
                buttonNode.setScale(1, 1, 1);
                this.onGameOverRestartPressed();
            },
            this
        );
        buttonNode.on(
            Node.EventType.MOUSE_UP,
            () => {
                if (this._gameOverRestarting) return;
                this.drawGameOverRestartButton(false);
                buttonNode.setScale(1, 1, 1);
                this.onGameOverRestartPressed();
            },
            this
        );
        buttonNode.on(
            Button.EventType.CLICK,
            () => {
                this.onGameOverRestartPressed();
            },
            this
        );

        this._gameOverRoot = root;
        this.updateGameOverDialogLayout();
        root.active = false;
    }

    private drawGameOverPanelBackground(bg: Graphics): void {
        const w = this._gameOverDialogWidth;
        const h = this._gameOverDialogHeight;
        const outerRadius = Math.max(14, Math.min(22, Math.round(Math.min(w, h) * 0.06)));
        const innerInset = Math.max(12, Math.round(Math.min(w, h) * 0.04));
        const titleInsetX = Math.max(18, Math.round(w * 0.03));
        const titleHeight = Math.max(42, Math.round(h * 0.165));
        const titleTopInset = Math.max(24, Math.round(h * 0.09));

        bg.clear();

        bg.fillColor = new Color(13, 18, 30, 238);
        bg.roundRect(-w / 2, -h / 2, w, h, outerRadius);
        bg.fill();

        bg.fillColor = new Color(80, 32, 12, 145);
        bg.roundRect(
            -w / 2 + titleInsetX,
            h / 2 - titleTopInset - titleHeight,
            w - titleInsetX * 2,
            titleHeight,
            Math.max(10, outerRadius - 6)
        );
        bg.fill();

        bg.strokeColor = new Color(255, 172, 72, 255);
        bg.lineWidth = 4;
        bg.roundRect(-w / 2, -h / 2, w, h, outerRadius);
        bg.stroke();

        bg.strokeColor = new Color(88, 225, 255, 168);
        bg.lineWidth = 2;
        bg.roundRect(
            -w / 2 + innerInset,
            -h / 2 + innerInset,
            w - innerInset * 2,
            h - innerInset * 2,
            Math.max(10, outerRadius - 4)
        );
        bg.stroke();
    }

    private drawGameOverRestartButton(pressed: boolean): void {
        if (!this._gameOverButtonBg) return;

        const bg = this._gameOverButtonBg;
        const w = this._gameOverButtonWidth;
        const h = this._gameOverButtonHeight;
        const outerRadius = Math.max(14, Math.round(h * 0.24));
        const innerRadius = Math.max(12, Math.round(h * 0.2));
        const restarting = this._gameOverRestarting;
        bg.clear();

        const base = restarting
            ? new Color(140, 140, 140, 255)
            : pressed
              ? new Color(255, 166, 74, 255)
              : new Color(255, 196, 84, 255);
        const glow = restarting
            ? new Color(70, 70, 78, 240)
            : pressed
              ? new Color(255, 120, 36, 220)
              : new Color(255, 146, 44, 220);

        bg.fillColor = glow;
        bg.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, outerRadius + 2);
        bg.fill();

        bg.fillColor = base;
        bg.roundRect(-w / 2, -h / 2, w, h, innerRadius);
        bg.fill();

        bg.strokeColor = restarting ? new Color(200, 200, 200, 220) : new Color(255, 238, 188, 255);
        bg.lineWidth = 3;
        bg.roundRect(-w / 2, -h / 2, w, h, innerRadius);
        bg.stroke();
    }

    private updateGameOverDialogLayout(): void {
        if (!this._gameOverRoot) return;

        const canvasTransform = this._uiCanvas?.getComponent(UITransform);
        const viewportW = Math.max(480, Math.round(canvasTransform?.contentSize.width ?? 1280));
        const viewportH = Math.max(320, Math.round(canvasTransform?.contentSize.height ?? 720));
        const compact = viewportW < 900;

        const dialogW = Math.round(
            Math.max(
                GAME_OVER_DIALOG_MIN_WIDTH,
                Math.min(GAME_OVER_DIALOG_MAX_WIDTH, viewportW * (compact ? 0.88 : 0.72))
            )
        );
        const dialogH = Math.round(
            Math.max(
                GAME_OVER_DIALOG_MIN_HEIGHT,
                Math.min(GAME_OVER_DIALOG_MAX_HEIGHT, viewportH * (compact ? 0.52 : 0.5))
            )
        );
        const buttonW = Math.round(
            Math.max(
                GAME_OVER_RESTART_BTN_MIN_WIDTH,
                Math.min(GAME_OVER_RESTART_BTN_MAX_WIDTH, dialogW * (compact ? 0.48 : 0.4))
            )
        );
        const buttonH = Math.round(
            Math.max(
                GAME_OVER_RESTART_BTN_MIN_HEIGHT,
                Math.min(GAME_OVER_RESTART_BTN_MAX_HEIGHT, dialogH * 0.24)
            )
        );

        this._gameOverDialogWidth = dialogW;
        this._gameOverDialogHeight = dialogH;
        this._gameOverButtonWidth = buttonW;
        this._gameOverButtonHeight = buttonH;

        this._gameOverRoot.getComponent(UITransform)?.setContentSize(viewportW, viewportH);

        const panelNode = this._gameOverPanelBg?.node;
        panelNode?.getComponent(UITransform)?.setContentSize(dialogW, dialogH);

        const titleNode = this._gameOverTitleLabel?.node;
        titleNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                dialogW - Math.round(dialogW * 0.18),
                Math.max(54, Math.round(dialogH * 0.21))
            );
        titleNode?.setPosition(0, Math.round(dialogH * 0.29), 0);
        if (this._gameOverTitleLabel) {
            this._gameOverTitleLabel.fontSize = Math.max(
                36,
                Math.min(54, Math.round(dialogH * 0.15))
            );
            this._gameOverTitleLabel.lineHeight = this._gameOverTitleLabel.fontSize + 8;
        }

        const messageNode = this._gameOverMessageLabel?.node;
        messageNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                dialogW - Math.round(dialogW * 0.24),
                Math.max(90, Math.round(dialogH * 0.34))
            );
        messageNode?.setPosition(0, Math.round(dialogH * 0.02), 0);
        if (this._gameOverMessageLabel) {
            this._gameOverMessageLabel.fontSize = Math.max(
                22,
                Math.min(30, Math.round(dialogH * 0.088))
            );
            this._gameOverMessageLabel.lineHeight = this._gameOverMessageLabel.fontSize + 10;
        }

        if (this._gameOverButtonNode) {
            this._gameOverButtonNode.getComponent(UITransform)?.setContentSize(buttonW, buttonH);
            this._gameOverButtonNode.setPosition(0, -Math.round(dialogH * 0.33), 0);
        }
        this._gameOverButtonLabel?.node
            .getComponent(UITransform)
            ?.setContentSize(buttonW - 24, buttonH - 10);
        if (this._gameOverButtonLabel) {
            this._gameOverButtonLabel.fontSize = Math.max(
                26,
                Math.min(34, Math.round(buttonH * 0.4))
            );
            this._gameOverButtonLabel.lineHeight = this._gameOverButtonLabel.fontSize + 8;
        }

        if (this._gameOverPanelBg) {
            this.drawGameOverPanelBackground(this._gameOverPanelBg);
        }
        this.drawGameOverRestartButton(false);
    }

    private showGameOverDialog(victory: boolean): void {
        if (
            !this._gameOverRoot ||
            !this._gameOverOpacity ||
            !this._gameOverTitleLabel ||
            !this._gameOverMessageLabel ||
            !this._gameOverButtonLabel
        ) {
            return;
        }

        this.updateGameOverDialogLayout();
        this.setJoystickInputEnabled(false);
        this._gameOverRestarting = false;
        this.drawGameOverRestartButton(false);

        this._gameOverTitleLabel.string = Localization.instance.t(
            victory ? 'ui.gameOver.title.victory' : 'ui.gameOver.title.defeat'
        );
        this._gameOverMessageLabel.string = Localization.instance.t(
            victory ? 'ui.gameOver.message.victory' : 'ui.gameOver.message.defeat'
        );
        this._gameOverButtonLabel.string = Localization.instance.t('ui.gameOver.button.restart');
        this._gameOverTitleLabel.color = victory
            ? new Color(160, 255, 204, 255)
            : new Color(255, 220, 146, 255);
        if (this._gameOverButton) {
            this._gameOverButton.interactable = true;
        }

        this._gameOverRoot.active = true;
        const rootParent = this._gameOverRoot.parent;
        if (rootParent) {
            this._gameOverRoot.setSiblingIndex(rootParent.children.length - 1);
        }
        this._gameOverRoot.setScale(0.92, 0.92, 1);
        this._gameOverOpacity.opacity = 0;

        Tween.stopAllByTarget(this._gameOverRoot);
        Tween.stopAllByTarget(this._gameOverOpacity);
        if (this._gameOverButtonNode) {
            Tween.stopAllByTarget(this._gameOverButtonNode);
            this._gameOverButtonNode.setScale(1, 1, 1);
        }

        tween(this._gameOverRoot)
            .to(0.16, { scale: new Vec3(1.03, 1.03, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._gameOverOpacity).to(0.16, { opacity: 255 }).start();

        if (this._gameOverButtonNode) {
            tween(this._gameOverButtonNode)
                .delay(0.24)
                .repeatForever(
                    tween(this._gameOverButtonNode)
                        .to(0.48, { scale: new Vec3(1.04, 1.04, 1) })
                        .to(0.48, { scale: new Vec3(1, 1, 1) })
                )
                .start();
        }
    }

    private onGameOverRestartPressed(): void {
        if (this._gameOverRestarting) return;
        this._gameOverRestarting = true;
        if (this._gameOverButton) {
            this._gameOverButton.interactable = false;
        }

        if (this._gameOverButtonLabel) {
            this._gameOverButtonLabel.string = Localization.instance.t(
                'ui.gameOver.button.restarting'
            );
        }
        this.drawGameOverRestartButton(false);

        if (this._gameOverButtonNode) {
            Tween.stopAllByTarget(this._gameOverButtonNode);
            this._gameOverButtonNode.setScale(1, 1, 1);
        }

        // Most stable path in browser preview: full page reload.
        if (this.tryReloadHostPage()) {
            return;
        }

        // Fallback path for non-browser runtime.
        this.sanitizeCanvasBeforeSceneReload();

        const startedPrimary = director.loadScene('scene');
        if (startedPrimary !== false) return;

        const startedBackup = director.loadScene('scene_recover');
        if (startedBackup !== false) return;

        if (this.tryRestartEngineProcess()) return;

        this.restoreRestartButtonState();
    }

    private tryReloadHostPage(): boolean {
        const maybeWindow = (globalThis as { window?: unknown }).window as
            | {
                  location?: {
                      reload?: () => void;
                  };
              }
            | undefined;
        const locationObj = maybeWindow?.location;
        const reload = locationObj?.reload;
        if (typeof reload !== 'function') return false;
        reload.call(locationObj);
        return true;
    }

    private tryRestartEngineProcess(): boolean {
        try {
            game.restart();
            return true;
        } catch {
            return false;
        }
    }

    private sanitizeCanvasBeforeSceneReload(): void {
        const scene = director.getScene();
        const canvases = scene?.getComponentsInChildren(Canvas) ?? [];
        for (const canvasComp of canvases) {
            if (canvasComp.cameraComponent) {
                canvasComp.cameraComponent = null;
            }
        }
    }

    private restoreRestartButtonState(): void {
        this._gameOverRestarting = false;
        if (this._gameOverButton) {
            this._gameOverButton.interactable = true;
        }
        if (this._gameOverButtonLabel) {
            this._gameOverButtonLabel.string = Localization.instance.t(
                'ui.gameOver.button.restart'
            );
        }
        this.drawGameOverRestartButton(false);
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
        if (!this._heroRespawnRoot || !this._heroRespawnOpacity) return;
        this._heroRespawnToken += 1;
        Tween.stopAllByTarget(this._heroRespawnRoot);
        Tween.stopAllByTarget(this._heroRespawnOpacity);
        this._heroRespawnOpacity.opacity = 0;
        this._heroRespawnRoot.active = false;
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

    private onGameOver(data: { victory: boolean }): void {
        this.showGameOverDialog(Boolean(data?.victory));
    }

    // === 经验条 ===

    private createXpBar(parent: Node): void {
        // 清理旧节点
        parent.getChildByName('XpBarRoot')?.destroy();

        const root = new Node('XpBarRoot');
        root.layer = UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._xpBarWidth + 90, this._xpBarHeight + 34);

        this._xpRootWidget = root.addComponent(Widget);

        // 等级标签
        const lvNode = new Node('LevelLabel');
        lvNode.layer = UI_LAYER;
        root.addChild(lvNode);
        lvNode.addComponent(UITransform);
        this._levelLabel = lvNode.addComponent(Label);
        this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level: 1 });
        this._levelLabel.fontSize = 26;
        this._levelLabel.lineHeight = 30;
        this._levelLabel.color = new Color(255, 231, 132, 255);
        this._levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.applyGameLabelStyle(this._levelLabel, {
            outlineColor: new Color(40, 24, 8, 255),
            outlineWidth: 4,
        });
        lvNode.setPosition(0, 14, 0);

        // 背景条
        const bgNode = new Node('XpBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._xpBarBg = bgNode.addComponent(Graphics);
        this._xpBarBg.fillColor = new Color(12, 22, 34, 210);
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            7
        );
        this._xpBarBg.fill();
        // 边框
        this._xpBarBg.strokeColor = new Color(82, 180, 236, 215);
        this._xpBarBg.lineWidth = 2;
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            7
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
        this._xpBarFg.fillColor = new Color(92, 220, 255, 255);
        this._xpBarFg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            w,
            this._xpBarHeight,
            7
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
        widget.top = 74;

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
        this._waveForecastLabel.fontSize = 30;
        this._waveForecastLabel.lineHeight = 36;
        this._waveForecastLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._waveForecastLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._waveForecastLabel.color = new Color(120, 235, 255, 255);
        this.applyGameLabelStyle(this._waveForecastLabel, {
            outlineColor: new Color(8, 24, 40, 255),
            outlineWidth: 4,
        });

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
        bg.fillColor = isBoss ? new Color(78, 20, 18, 236) : new Color(10, 30, 52, 232);
        bg.roundRect(-width / 2, -height / 2, width, height, 14);
        bg.fill();
        bg.strokeColor = isBoss ? new Color(255, 124, 124, 255) : new Color(96, 220, 255, 255);
        bg.lineWidth = 3.5;
        bg.roundRect(-width / 2, -height / 2, width, height, 14);
        bg.stroke();
        bg.strokeColor = isBoss ? new Color(255, 186, 162, 112) : new Color(164, 236, 255, 96);
        bg.lineWidth = 1.2;
        bg.roundRect(-width / 2 + 7, -height / 2 + 7, width - 14, height - 14, 10);
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
        this._laneUnlockDialogLabel.fontSize = 30;
        this._laneUnlockDialogLabel.lineHeight = 36;
        this._laneUnlockDialogLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._laneUnlockDialogLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._laneUnlockDialogLabel.color = new Color(255, 225, 176, 255);
        this.applyGameLabelStyle(this._laneUnlockDialogLabel, {
            outlineColor: new Color(34, 18, 8, 255),
            outlineWidth: 4,
        });

        this._laneUnlockDialogRoot = root;
        root.active = false;
    }

    private createHeroRespawnDialog(parent: Node): void {
        const root = new Node('HeroRespawnDialog');
        root.layer = UI_LAYER;
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(
            HERO_RESPAWN_DIALOG_WIDTH,
            HERO_RESPAWN_DIALOG_HEIGHT
        );
        const widget = root.addComponent(Widget);
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter = true;

        this._heroRespawnOpacity = root.addComponent(UIOpacity);
        this._heroRespawnOpacity.opacity = 0;

        const bgNode = new Node('HeroRespawnDialogBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = new Color(18, 12, 8, 232);
        bg.roundRect(
            -HERO_RESPAWN_DIALOG_WIDTH / 2,
            -HERO_RESPAWN_DIALOG_HEIGHT / 2,
            HERO_RESPAWN_DIALOG_WIDTH,
            HERO_RESPAWN_DIALOG_HEIGHT,
            16
        );
        bg.fill();
        bg.strokeColor = new Color(255, 136, 56, 255);
        bg.lineWidth = 4;
        bg.roundRect(
            -HERO_RESPAWN_DIALOG_WIDTH / 2,
            -HERO_RESPAWN_DIALOG_HEIGHT / 2,
            HERO_RESPAWN_DIALOG_WIDTH,
            HERO_RESPAWN_DIALOG_HEIGHT,
            16
        );
        bg.stroke();

        const countNode = new Node('HeroRespawnCount');
        countNode.layer = UI_LAYER;
        root.addChild(countNode);
        countNode
            .addComponent(UITransform)
            .setContentSize(HERO_RESPAWN_DIALOG_WIDTH - 60, HERO_RESPAWN_DIALOG_HEIGHT * 0.58);
        countNode.setPosition(0, 34, 0);
        this._heroRespawnCountdownLabel = countNode.addComponent(Label);
        this._heroRespawnCountdownLabel.string = '10';
        this._heroRespawnCountdownLabel.fontSize = 124;
        this._heroRespawnCountdownLabel.lineHeight = 132;
        this._heroRespawnCountdownLabel.isBold = true;
        this._heroRespawnCountdownLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._heroRespawnCountdownLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._heroRespawnCountdownLabel.color = new Color(255, 222, 130, 255);

        const msgNode = new Node('HeroRespawnText');
        msgNode.layer = UI_LAYER;
        root.addChild(msgNode);
        msgNode
            .addComponent(UITransform)
            .setContentSize(HERO_RESPAWN_DIALOG_WIDTH - 80, HERO_RESPAWN_DIALOG_HEIGHT * 0.44);
        msgNode.setPosition(0, -76, 0);
        this._heroRespawnMessageLabel = msgNode.addComponent(Label);
        this._heroRespawnMessageLabel.string = '';
        this._heroRespawnMessageLabel.fontSize = 34;
        this._heroRespawnMessageLabel.lineHeight = 42;
        this._heroRespawnMessageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._heroRespawnMessageLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._heroRespawnMessageLabel.enableWrapText = true;
        this._heroRespawnMessageLabel.color = new Color(255, 241, 210, 255);

        this._heroRespawnRoot = root;
        root.active = false;
    }

    private drawLaneUnlockDialogBackground(): void {
        if (!this._laneUnlockDialogBg) return;
        const bg = this._laneUnlockDialogBg;
        bg.clear();
        bg.fillColor = new Color(34, 20, 10, 236);
        bg.roundRect(
            -LANE_UNLOCK_DIALOG_WIDTH / 2,
            -LANE_UNLOCK_DIALOG_HEIGHT / 2,
            LANE_UNLOCK_DIALOG_WIDTH,
            LANE_UNLOCK_DIALOG_HEIGHT,
            14
        );
        bg.fill();
        bg.strokeColor = new Color(255, 186, 92, 255);
        bg.lineWidth = 3.5;
        bg.roundRect(
            -LANE_UNLOCK_DIALOG_WIDTH / 2,
            -LANE_UNLOCK_DIALOG_HEIGHT / 2,
            LANE_UNLOCK_DIALOG_WIDTH,
            LANE_UNLOCK_DIALOG_HEIGHT,
            14
        );
        bg.stroke();
        bg.strokeColor = new Color(255, 228, 182, 120);
        bg.lineWidth = 1.5;
        bg.roundRect(
            -LANE_UNLOCK_DIALOG_WIDTH / 2 + 8,
            -LANE_UNLOCK_DIALOG_HEIGHT / 2 + 8,
            LANE_UNLOCK_DIALOG_WIDTH - 16,
            LANE_UNLOCK_DIALOG_HEIGHT - 16,
            10
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
        view.off('canvas-resize', this.onCanvasResize, this);
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
        if (this._heroRespawnRoot) {
            Tween.stopAllByTarget(this._heroRespawnRoot);
        }
        if (this._heroRespawnOpacity) {
            Tween.stopAllByTarget(this._heroRespawnOpacity);
        }
        if (this._settingsPanelOpacity) {
            Tween.stopAllByTarget(this._settingsPanelOpacity);
        }
        if (this._settingsPanelRoot) {
            Tween.stopAllByTarget(this._settingsPanelRoot);
        }
        if (this._gameOverRoot) {
            Tween.stopAllByTarget(this._gameOverRoot);
        }
        if (this._gameOverOpacity) {
            Tween.stopAllByTarget(this._gameOverOpacity);
        }
        if (this._gameOverButtonNode) {
            Tween.stopAllByTarget(this._gameOverButtonNode);
        }
        this._coinLabel = null;
        this._waveLabel = null;
        this._waveWidget = null;
        this._desktopMoveHintWidget = null;
        this._buildingInfoLabel = null;
        this._baseHpLabel = null;
        this._xpRootWidget = null;
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
        this._heroRespawnRoot = null;
        this._heroRespawnCountdownLabel = null;
        this._heroRespawnMessageLabel = null;
        this._heroRespawnOpacity = null;
        this._settingsButtonNode = null;
        this._settingsPanelRoot = null;
        this._settingsPanelOpacity = null;
        this._settingsBgmSlider = null;
        this._settingsSfxSlider = null;
        this._gameOverRoot = null;
        this._gameOverTitleLabel = null;
        this._gameOverMessageLabel = null;
        this._gameOverButtonNode = null;
        this._gameOverButton = null;
        this._gameOverButtonLabel = null;
        this._gameOverButtonBg = null;
        this._gameOverPanelBg = null;
        this._gameOverOpacity = null;
        this._gameOverRestarting = false;
        this._joystickRef = null;
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

    private onCanvasResize(): void {
        this.applyHudEdgeLayout();
    }

    private applyHudEdgeLayout(): void {
        const padding = UIResponsive.getControlPadding();
        const topInset = Math.max(14, Math.round(padding.top * 0.86));
        const bottomInset = Math.max(20, Math.round(padding.bottom * 0.82));

        if (this._waveWidget) {
            this._waveWidget.isAlignTop = true;
            this._waveWidget.isAlignHorizontalCenter = true;
            this._waveWidget.isAlignLeft = false;
            this._waveWidget.isAlignRight = false;
            this._waveWidget.isAlignBottom = false;
            this._waveWidget.isAlignVerticalCenter = false;
            this._waveWidget.top = topInset;
            this._waveWidget.horizontalCenter = 0;
            this._waveWidget.updateAlignment();
        }

        if (this._xpRootWidget) {
            this._xpRootWidget.isAlignBottom = true;
            this._xpRootWidget.isAlignHorizontalCenter = true;
            this._xpRootWidget.isAlignTop = false;
            this._xpRootWidget.isAlignLeft = false;
            this._xpRootWidget.isAlignRight = false;
            this._xpRootWidget.isAlignVerticalCenter = false;
            this._xpRootWidget.bottom = bottomInset;
            this._xpRootWidget.horizontalCenter = 0;
            this._xpRootWidget.updateAlignment();
        }

        if (this._desktopMoveHintWidget) {
            this._desktopMoveHintWidget.isAlignBottom = true;
            this._desktopMoveHintWidget.isAlignHorizontalCenter = true;
            this._desktopMoveHintWidget.isAlignTop = false;
            this._desktopMoveHintWidget.isAlignLeft = false;
            this._desktopMoveHintWidget.isAlignRight = false;
            this._desktopMoveHintWidget.bottom = Math.max(2, bottomInset - 34);
            this._desktopMoveHintWidget.horizontalCenter = 0;
            this._desktopMoveHintWidget.updateAlignment();
        }
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
