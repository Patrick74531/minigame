import {
    BlockInputEvents,
    Button,
    Canvas,
    Color,
    director,
    game,
    Graphics,
    Label,
    Node,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { applyLayerRecursive, HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';
import { UIResponsive } from '../UIResponsive';

const GAME_OVER_DIALOG_MAX_WIDTH = 760;
const GAME_OVER_DIALOG_MAX_HEIGHT = 386;
const GAME_OVER_DIALOG_MIN_WIDTH = 420;
const GAME_OVER_DIALOG_MIN_HEIGHT = 286;
const GAME_OVER_RESTART_BTN_MAX_WIDTH = 280;
const GAME_OVER_RESTART_BTN_MAX_HEIGHT = 86;
const GAME_OVER_RESTART_BTN_MIN_WIDTH = 190;
const GAME_OVER_RESTART_BTN_MIN_HEIGHT = 64;

export class HUDGameOverModule implements HUDModule {
    private _uiCanvas: Node | null = null;
    private _gameOverRoot: Node | null = null;
    private _gameOverTitleLabel: Label | null = null;
    private _gameOverMessageLabel: Label | null = null;
    private _gameOverButtonNode: Node | null = null;
    private _gameOverButton: Button | null = null;
    private _gameOverButtonLabel: Label | null = null;
    private _gameOverButtonBg: Graphics | null = null;
    private _gameOverPanelBg: Graphics | null = null;
    private _gameOverOpacity: UIOpacity | null = null;
    private _gameOverWaveLabel: Label | null = null;
    private _gameOverDiamondLabel: Label | null = null;
    private _gameOverWave = 0;
    private _gameOverRestarting = false;
    private _gameOverDialogWidth = GAME_OVER_DIALOG_MAX_WIDTH;
    private _gameOverDialogHeight = GAME_OVER_DIALOG_MAX_HEIGHT;
    private _gameOverButtonWidth = GAME_OVER_RESTART_BTN_MAX_WIDTH;
    private _gameOverButtonHeight = GAME_OVER_RESTART_BTN_MAX_HEIGHT;

    // === Base Revival Dialog ===
    private _revivalRoot: Node | null = null;
    private _revivalPanelBg: Graphics | null = null;
    private _revivalTitleLabel: Label | null = null;
    private _revivalMessageLabel: Label | null = null;
    private _revivalRebuildBtnNode: Node | null = null;
    private _revivalRebuildBtnBg: Graphics | null = null;
    private _revivalRebuildBtnLabel: Label | null = null;
    private _revivalGiveUpBtnNode: Node | null = null;
    private _revivalGiveUpBtnBg: Graphics | null = null;
    private _revivalGiveUpBtnLabel: Label | null = null;
    private _revivalOpacity: UIOpacity | null = null;
    private _onRevivalRebuild: (() => void) | null = null;
    private _onRevivalGiveUp: (() => void) | null = null;

    // Callback invoked when player actually presses restart (for deferred settlement)
    private _onBeforeRestart: (() => void) | null = null;

    public get isRevivalShowing(): boolean {
        return !!this._revivalRoot?.active;
    }

    public constructor(private readonly _setInputEnabled: (enabled: boolean) => void) {}

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.createGameOverDialog(uiCanvas);
        this.createRevivalDialog(uiCanvas);
    }

    public cleanup(): void {
        if (this._gameOverRoot) {
            Tween.stopAllByTarget(this._gameOverRoot);
        }
        if (this._gameOverOpacity) {
            Tween.stopAllByTarget(this._gameOverOpacity);
        }
        if (this._gameOverButtonNode) {
            Tween.stopAllByTarget(this._gameOverButtonNode);
        }

        this._gameOverRoot = null;
        this._gameOverTitleLabel = null;
        this._gameOverMessageLabel = null;
        this._gameOverWaveLabel = null;
        this._gameOverDiamondLabel = null;
        this._gameOverButtonNode = null;
        this._gameOverButton = null;
        this._gameOverButtonLabel = null;
        this._gameOverButtonBg = null;
        this._gameOverPanelBg = null;
        this._gameOverOpacity = null;
        this._gameOverRestarting = false;

        if (this._revivalRoot) {
            Tween.stopAllByTarget(this._revivalRoot);
        }
        if (this._revivalOpacity) {
            Tween.stopAllByTarget(this._revivalOpacity);
        }
        this._revivalRoot = null;
        this._revivalPanelBg = null;
        this._revivalTitleLabel = null;
        this._revivalMessageLabel = null;
        this._revivalRebuildBtnNode = null;
        this._revivalRebuildBtnBg = null;
        this._revivalRebuildBtnLabel = null;
        this._revivalGiveUpBtnNode = null;
        this._revivalGiveUpBtnBg = null;
        this._revivalGiveUpBtnLabel = null;
        this._revivalOpacity = null;
        this._onRevivalRebuild = null;
        this._onRevivalGiveUp = null;

        this._uiCanvas = null;
    }

    public onCanvasResize(): void {
        this.updateGameOverDialogLayout();
        this.updateRevivalDialogLayout();
    }

    public onLanguageChanged(): void {
        if (!this._gameOverRoot?.active) return;

        if (this._gameOverWaveLabel) {
            this._gameOverWaveLabel.string = Localization.instance.t('ui.gameOver.wave', {
                wave: String(this._gameOverWave),
            });
        }
        // Diamond label text doesn't need re-translation (numeric); keep it as-is.
        if (this._gameOverButtonLabel) {
            this._gameOverButtonLabel.string = Localization.instance.t(
                this._gameOverRestarting
                    ? 'ui.gameOver.button.restarting'
                    : 'ui.gameOver.button.restart'
            );
        }
        this.updateGameOverDialogLayout();
    }

    /**
     * Called by HUDManager after DiamondService.settleRun() resolves.
     * Shows the earned diamond reward row in the game-over dialog.
     */
    public showDiamondReward(earned: number): void {
        if (!this._gameOverDiamondLabel) return;
        this._gameOverDiamondLabel.string = Localization.instance.t('ui.gameOver.diamonds', {
            earned: String(earned),
        });
        this._gameOverDiamondLabel.node.active = true;
    }

    /**
     * Register a callback that fires when the player actually clicks restart.
     * Used to defer score submission and diamond settlement.
     */
    public setOnBeforeRestart(cb: (() => void) | null): void {
        this._onBeforeRestart = cb;
    }

    public showGameOver(victory: boolean, wave: number = 0): void {
        if (
            !this._gameOverRoot ||
            !this._gameOverOpacity ||
            !this._gameOverTitleLabel ||
            !this._gameOverMessageLabel ||
            !this._gameOverButtonLabel
        ) {
            return;
        }

        this._gameOverWave = wave;
        this.updateGameOverDialogLayout();
        this._setInputEnabled(false);
        this._gameOverRestarting = false;
        this.drawGameOverRestartButton(false);

        // Reset diamond label so it's hidden until settleRun callback fires
        if (this._gameOverDiamondLabel) {
            this._gameOverDiamondLabel.node.active = false;
        }

        this._gameOverTitleLabel.string = Localization.instance.t(
            victory ? 'ui.gameOver.title.victory' : 'ui.gameOver.title.defeat'
        );
        if (this._gameOverWaveLabel) {
            this._gameOverWaveLabel.string = Localization.instance.t('ui.gameOver.wave', {
                wave: String(wave),
            });
            this._gameOverWaveLabel.node.active = wave > 0;
        }
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

    private createGameOverDialog(parent: Node): void {
        const root = new Node('GameOverDialog');
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(1280, 720);
        const rootWidget = root.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;

        this._gameOverOpacity = root.addComponent(UIOpacity);
        this._gameOverOpacity.opacity = 0;

        const blocker = new Node('GameOverInputBlocker');
        root.addChild(blocker);
        blocker.addComponent(UITransform).setContentSize(1280, 720);
        const blockerWidget = blocker.addComponent(Widget);
        blockerWidget.isAlignTop = true;
        blockerWidget.isAlignBottom = true;
        blockerWidget.isAlignLeft = true;
        blockerWidget.isAlignRight = true;
        blocker.addComponent(BlockInputEvents);

        const panel = new Node('GameOverPanel');
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
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(this._gameOverDialogWidth - 80, 72);
        titleNode.setPosition(0, 98, 0);
        this._gameOverTitleLabel = titleNode.addComponent(Label);
        this._gameOverTitleLabel.fontSize = 54;
        this._gameOverTitleLabel.lineHeight = 62;
        this._gameOverTitleLabel.isBold = true;
        this._gameOverTitleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverTitleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverTitleLabel.overflow = Label.Overflow.SHRINK;
        this._gameOverTitleLabel.color = new Color(255, 224, 140, 255);

        const waveNode = new Node('GameOverWaveLabel');
        panel.addChild(waveNode);
        waveNode.addComponent(UITransform).setContentSize(this._gameOverDialogWidth - 80, 44);
        waveNode.setPosition(0, 28, 0);
        this._gameOverWaveLabel = waveNode.addComponent(Label);
        this._gameOverWaveLabel.fontSize = 28;
        this._gameOverWaveLabel.lineHeight = 36;
        this._gameOverWaveLabel.isBold = true;
        this._gameOverWaveLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverWaveLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverWaveLabel.overflow = Label.Overflow.SHRINK;
        this._gameOverWaveLabel.color = new Color(255, 230, 100, 255);
        waveNode.active = false;

        const messageNode = new Node('GameOverMessage');
        panel.addChild(messageNode);
        messageNode.addComponent(UITransform).setContentSize(this._gameOverDialogWidth - 130, 96);
        messageNode.setPosition(0, -16, 0);
        this._gameOverMessageLabel = messageNode.addComponent(Label);
        this._gameOverMessageLabel.fontSize = 28;
        this._gameOverMessageLabel.lineHeight = 38;
        this._gameOverMessageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverMessageLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverMessageLabel.enableWrapText = true;
        this._gameOverMessageLabel.overflow = Label.Overflow.SHRINK;
        this._gameOverMessageLabel.color = new Color(234, 245, 255, 255);

        // Diamond reward row (hidden until DiamondService settleRun callback fires)
        const diamondNode = new Node('GameOverDiamondReward');
        panel.addChild(diamondNode);
        diamondNode.addComponent(UITransform).setContentSize(this._gameOverDialogWidth - 80, 38);
        diamondNode.setPosition(0, -70, 0);
        this._gameOverDiamondLabel = diamondNode.addComponent(Label);
        this._gameOverDiamondLabel.fontSize = 26;
        this._gameOverDiamondLabel.lineHeight = 34;
        this._gameOverDiamondLabel.isBold = true;
        this._gameOverDiamondLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._gameOverDiamondLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._gameOverDiamondLabel.overflow = Label.Overflow.SHRINK;
        this._gameOverDiamondLabel.color = new Color(160, 230, 255, 255);
        diamondNode.active = false;

        const buttonNode = new Node('GameOverRestartButton');
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
        this._gameOverButtonLabel.overflow = Label.Overflow.SHRINK;
        this._gameOverButtonLabel.color = new Color(30, 18, 8, 255);
        this._gameOverButtonLabel.string = Localization.instance.t('ui.gameOver.button.restart');

        this.bindButtonInteraction(buttonNode);
        applyLayerRecursive(root, HUD_UI_LAYER);

        this._gameOverRoot = root;
        this.updateGameOverDialogLayout();
        root.active = false;
    }

    private bindButtonInteraction(buttonNode: Node): void {
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

        const viewport = UIResponsive.getLayoutViewportSize(480, 320, 'canvas');
        const viewportW = viewport.width;
        const viewportH = viewport.height;
        const isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();
        const compact = isTikTokPortrait || viewportW < 900;
        const minDialogW = isTikTokPortrait ? 280 : GAME_OVER_DIALOG_MIN_WIDTH;
        const minDialogH = isTikTokPortrait ? 240 : GAME_OVER_DIALOG_MIN_HEIGHT;
        const minBtnW = isTikTokPortrait ? 156 : GAME_OVER_RESTART_BTN_MIN_WIDTH;
        const minBtnH = isTikTokPortrait ? 46 : GAME_OVER_RESTART_BTN_MIN_HEIGHT;

        const dialogW = Math.round(
            Math.max(
                minDialogW,
                Math.min(
                    GAME_OVER_DIALOG_MAX_WIDTH,
                    viewportW * (isTikTokPortrait ? 0.9 : compact ? 0.88 : 0.72)
                )
            )
        );
        const dialogH = Math.round(
            Math.max(
                minDialogH,
                Math.min(
                    GAME_OVER_DIALOG_MAX_HEIGHT,
                    viewportH * (isTikTokPortrait ? 0.44 : compact ? 0.52 : 0.5)
                )
            )
        );
        const buttonW = Math.round(
            Math.max(
                minBtnW,
                Math.min(
                    GAME_OVER_RESTART_BTN_MAX_WIDTH,
                    dialogW * (isTikTokPortrait ? 0.58 : compact ? 0.48 : 0.4)
                )
            )
        );
        const buttonH = Math.round(
            Math.max(
                minBtnH,
                Math.min(
                    GAME_OVER_RESTART_BTN_MAX_HEIGHT,
                    dialogH * (isTikTokPortrait ? 0.19 : 0.24)
                )
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
                dialogW - Math.round(dialogW * (isTikTokPortrait ? 0.16 : 0.18)),
                Math.max(
                    isTikTokPortrait ? 46 : 54,
                    Math.round(dialogH * (isTikTokPortrait ? 0.2 : 0.21))
                )
            );
        titleNode?.setPosition(0, Math.round(dialogH * (isTikTokPortrait ? 0.3 : 0.29)), 0);
        if (this._gameOverTitleLabel) {
            this._gameOverTitleLabel.fontSize = Math.max(
                isTikTokPortrait ? 22 : 36,
                Math.min(
                    isTikTokPortrait ? 34 : 54,
                    Math.round(dialogH * (isTikTokPortrait ? 0.105 : 0.15))
                )
            );
            this._gameOverTitleLabel.lineHeight =
                this._gameOverTitleLabel.fontSize + (isTikTokPortrait ? 6 : 8);
        }

        const waveNode = this._gameOverWaveLabel?.node;
        waveNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                dialogW - Math.round(dialogW * 0.14),
                Math.max(
                    isTikTokPortrait ? 32 : 36,
                    Math.round(dialogH * (isTikTokPortrait ? 0.13 : 0.14))
                )
            );
        waveNode?.setPosition(0, Math.round(dialogH * (isTikTokPortrait ? 0.12 : 0.1)), 0);
        if (this._gameOverWaveLabel) {
            this._gameOverWaveLabel.fontSize = Math.max(
                isTikTokPortrait ? 15 : 22,
                Math.min(
                    isTikTokPortrait ? 24 : 28,
                    Math.round(dialogH * (isTikTokPortrait ? 0.074 : 0.085))
                )
            );
            this._gameOverWaveLabel.lineHeight =
                this._gameOverWaveLabel.fontSize + (isTikTokPortrait ? 5 : 8);
        }

        const messageNode = this._gameOverMessageLabel?.node;
        messageNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                dialogW - Math.round(dialogW * (isTikTokPortrait ? 0.18 : 0.24)),
                Math.max(
                    isTikTokPortrait ? 66 : 72,
                    Math.round(dialogH * (isTikTokPortrait ? 0.24 : 0.26))
                )
            );
        messageNode?.setPosition(0, -Math.round(dialogH * (isTikTokPortrait ? 0.03 : 0.06)), 0);
        if (this._gameOverMessageLabel) {
            this._gameOverMessageLabel.fontSize = Math.max(
                isTikTokPortrait ? 13 : 18,
                Math.min(
                    isTikTokPortrait ? 18 : 26,
                    Math.round(dialogH * (isTikTokPortrait ? 0.062 : 0.072))
                )
            );
            this._gameOverMessageLabel.lineHeight =
                this._gameOverMessageLabel.fontSize + (isTikTokPortrait ? 6 : 10);
        }

        // Diamond reward row layout
        const diamondNode = this._gameOverDiamondLabel?.node;
        diamondNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                dialogW - Math.round(dialogW * 0.14),
                Math.max(
                    isTikTokPortrait ? 28 : 30,
                    Math.round(dialogH * (isTikTokPortrait ? 0.1 : 0.105))
                )
            );
        diamondNode?.setPosition(0, -Math.round(dialogH * (isTikTokPortrait ? 0.21 : 0.2)), 0);
        if (this._gameOverDiamondLabel) {
            this._gameOverDiamondLabel.fontSize = Math.max(
                isTikTokPortrait ? 13 : 18,
                Math.min(
                    isTikTokPortrait ? 18 : 26,
                    Math.round(dialogH * (isTikTokPortrait ? 0.064 : 0.074))
                )
            );
            this._gameOverDiamondLabel.lineHeight =
                this._gameOverDiamondLabel.fontSize + (isTikTokPortrait ? 5 : 8);
        }

        if (this._gameOverButtonNode) {
            this._gameOverButtonNode.getComponent(UITransform)?.setContentSize(buttonW, buttonH);
            this._gameOverButtonNode.setPosition(
                0,
                -Math.round(dialogH * (isTikTokPortrait ? 0.37 : 0.36)),
                0
            );
        }
        this._gameOverButtonLabel?.node
            .getComponent(UITransform)
            ?.setContentSize(
                buttonW - (isTikTokPortrait ? 18 : 24),
                buttonH - (isTikTokPortrait ? 6 : 10)
            );
        if (this._gameOverButtonLabel) {
            this._gameOverButtonLabel.fontSize = Math.max(
                isTikTokPortrait ? 20 : 26,
                Math.min(isTikTokPortrait ? 28 : 34, Math.round(buttonH * 0.42))
            );
            this._gameOverButtonLabel.lineHeight =
                this._gameOverButtonLabel.fontSize + (isTikTokPortrait ? 5 : 8);
        }

        if (this._gameOverPanelBg) {
            this.drawGameOverPanelBackground(this._gameOverPanelBg);
        }
        this.drawGameOverRestartButton(false);
    }

    private onGameOverRestartPressed(): void {
        if (this._gameOverRestarting) return;
        this._gameOverRestarting = true;

        // Deferred settlement: submit score + settle diamonds only now
        if (this._onBeforeRestart) {
            this._onBeforeRestart();
            this._onBeforeRestart = null;
        }

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
        if (this._gameOverRoot) {
            Tween.stopAllByTarget(this._gameOverRoot);
        }
        if (this._gameOverOpacity) {
            Tween.stopAllByTarget(this._gameOverOpacity);
        }

        if (this.isTikTokRuntime()) {
            this.sanitizeCanvasBeforeSceneReload();
            if (this.trySceneReloadToHome()) {
                return;
            }
            this.restoreRestartButtonState();
            return;
        }

        if (this.tryReloadHostPage()) {
            return;
        }

        this.sanitizeCanvasBeforeSceneReload();
        if (this.trySceneReloadToHome()) return;

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

    private isTikTokRuntime(): boolean {
        const g = globalThis as unknown as { __GVR_PLATFORM__?: unknown; tt?: unknown };
        return g.__GVR_PLATFORM__ === 'tiktok' || typeof g.tt !== 'undefined';
    }

    private trySceneReloadToHome(): boolean {
        setTimeout(() => {
            let launched = false;
            const markLaunched = () => {
                launched = true;
            };
            const tryLoad = (sceneName: string): boolean => {
                try {
                    const started = director.loadScene(sceneName, markLaunched);
                    return started !== false;
                } catch (err) {
                    console.warn(`[HUDGameOver] loadScene(${sceneName}) failed:`, err);
                    return false;
                }
            };

            const startedPrimary = tryLoad('scene');
            if (!startedPrimary) {
                const startedBackup = tryLoad('scene_recover');
                if (!startedBackup) {
                    this.restoreRestartButtonState();
                }
                return;
            }

            // Watchdog: if primary scene launch callback never fires, try recovery scene.
            setTimeout(() => {
                if (launched) return;
                const currentScene = director.getScene()?.name ?? '';
                if (currentScene === 'scene' || currentScene === 'scene_recover') return;
                const startedBackup = tryLoad('scene_recover');
                if (!startedBackup) {
                    this.restoreRestartButtonState();
                }
            }, 1500);
        }, 16);

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

    // ===================== Base Revival Dialog =====================

    public showBaseRevival(wave: number, onRebuild: () => void, onGiveUp: () => void): void {
        if (!this._revivalRoot || !this._revivalOpacity) return;

        this._onRevivalRebuild = onRebuild;
        this._onRevivalGiveUp = onGiveUp;
        this._setInputEnabled(false);

        if (this._revivalTitleLabel) {
            this._revivalTitleLabel.string = Localization.instance.t('ui.baseRevival.title');
        }
        if (this._revivalMessageLabel) {
            this._revivalMessageLabel.string = Localization.instance.t('ui.baseRevival.message', {
                wave: String(wave),
            });
        }
        if (this._revivalRebuildBtnLabel) {
            const rebuildKey = this.isTikTokRuntime()
                ? 'ui.baseRevival.rebuild_tiktok'
                : 'ui.baseRevival.rebuild';
            this._revivalRebuildBtnLabel.string = Localization.instance.t(rebuildKey);
        }
        if (this._revivalGiveUpBtnLabel) {
            this._revivalGiveUpBtnLabel.string = Localization.instance.t('ui.baseRevival.giveUp');
        }

        this.updateRevivalDialogLayout();

        this._revivalRoot.active = true;
        const rootParent = this._revivalRoot.parent;
        if (rootParent) {
            this._revivalRoot.setSiblingIndex(rootParent.children.length - 1);
        }
        this._revivalRoot.setScale(0.92, 0.92, 1);
        this._revivalOpacity.opacity = 0;

        Tween.stopAllByTarget(this._revivalRoot);
        Tween.stopAllByTarget(this._revivalOpacity);

        tween(this._revivalRoot)
            .to(0.16, { scale: new Vec3(1.03, 1.03, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(this._revivalOpacity).to(0.16, { opacity: 255 }).start();
    }

    public hideBaseRevival(): void {
        if (!this._revivalRoot) return;
        Tween.stopAllByTarget(this._revivalRoot);
        if (this._revivalOpacity) {
            Tween.stopAllByTarget(this._revivalOpacity);
        }
        this._revivalRoot.active = false;
        this._onRevivalRebuild = null;
        this._onRevivalGiveUp = null;
    }

    private createRevivalDialog(parent: Node): void {
        const root = new Node('BaseRevivalDialog');
        parent.addChild(root);
        root.addComponent(UITransform).setContentSize(1280, 720);
        const rootWidget = root.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;

        this._revivalOpacity = root.addComponent(UIOpacity);
        this._revivalOpacity.opacity = 0;

        const blocker = new Node('RevivalInputBlocker');
        root.addChild(blocker);
        blocker.addComponent(UITransform).setContentSize(1280, 720);
        const bw = blocker.addComponent(Widget);
        bw.isAlignTop = true;
        bw.isAlignBottom = true;
        bw.isAlignLeft = true;
        bw.isAlignRight = true;
        blocker.addComponent(BlockInputEvents);

        const panelW = 480;
        const panelH = 260;
        const panel = new Node('RevivalPanel');
        root.addChild(panel);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const pw = panel.addComponent(Widget);
        pw.isAlignHorizontalCenter = true;
        pw.isAlignVerticalCenter = true;

        const bg = panel.addComponent(Graphics);
        this._revivalPanelBg = bg;
        this.drawRevivalPanelBg(bg, panelW, panelH);

        // Title
        const titleNode = new Node('RevivalTitle');
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(panelW - 60, 52);
        titleNode.setPosition(0, 78, 0);
        this._revivalTitleLabel = titleNode.addComponent(Label);
        this._revivalTitleLabel.fontSize = 36;
        this._revivalTitleLabel.lineHeight = 44;
        this._revivalTitleLabel.isBold = true;
        this._revivalTitleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._revivalTitleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._revivalTitleLabel.overflow = Label.Overflow.SHRINK;
        this._revivalTitleLabel.color = new Color(255, 200, 80, 255);

        // Message
        const msgNode = new Node('RevivalMessage');
        panel.addChild(msgNode);
        msgNode.addComponent(UITransform).setContentSize(panelW - 60, 64);
        msgNode.setPosition(0, 18, 0);
        this._revivalMessageLabel = msgNode.addComponent(Label);
        this._revivalMessageLabel.fontSize = 22;
        this._revivalMessageLabel.lineHeight = 30;
        this._revivalMessageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._revivalMessageLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._revivalMessageLabel.enableWrapText = true;
        this._revivalMessageLabel.overflow = Label.Overflow.SHRINK;
        this._revivalMessageLabel.color = new Color(234, 245, 255, 240);

        // Rebuild button (green)
        const rebuildBtnW = 180;
        const rebuildBtnH = 56;
        const rebuildBtn = new Node('RevivalRebuildBtn');
        panel.addChild(rebuildBtn);
        rebuildBtn.addComponent(UITransform).setContentSize(rebuildBtnW, rebuildBtnH);
        rebuildBtn.setPosition(-100, -60, 0);
        rebuildBtn.addComponent(Button).transition = Button.Transition.SCALE;
        this._revivalRebuildBtnBg = rebuildBtn.addComponent(Graphics);
        this._revivalRebuildBtnNode = rebuildBtn;
        this.drawRevivalButton(this._revivalRebuildBtnBg, rebuildBtnW, rebuildBtnH, true);

        const rebuildLblNode = new Node('RebuildLabel');
        rebuildBtn.addChild(rebuildLblNode);
        rebuildLblNode.addComponent(UITransform).setContentSize(rebuildBtnW - 16, rebuildBtnH - 8);
        this._revivalRebuildBtnLabel = rebuildLblNode.addComponent(Label);
        this._revivalRebuildBtnLabel.fontSize = 24;
        this._revivalRebuildBtnLabel.lineHeight = 32;
        this._revivalRebuildBtnLabel.isBold = true;
        this._revivalRebuildBtnLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._revivalRebuildBtnLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._revivalRebuildBtnLabel.overflow = Label.Overflow.SHRINK;
        this._revivalRebuildBtnLabel.color = new Color(20, 10, 0, 255);
        this._revivalRebuildBtnLabel.string = '';

        rebuildBtn.on(
            Button.EventType.CLICK,
            () => {
                const cb = this._onRevivalRebuild;
                this.hideBaseRevival();
                this._setInputEnabled(true);
                cb?.();
            },
            this
        );

        // Give Up button (grey/red)
        const giveUpBtnW = 140;
        const giveUpBtnH = 48;
        const giveUpBtn = new Node('RevivalGiveUpBtn');
        panel.addChild(giveUpBtn);
        giveUpBtn.addComponent(UITransform).setContentSize(giveUpBtnW, giveUpBtnH);
        giveUpBtn.setPosition(100, -60, 0);
        giveUpBtn.addComponent(Button).transition = Button.Transition.SCALE;
        this._revivalGiveUpBtnBg = giveUpBtn.addComponent(Graphics);
        this._revivalGiveUpBtnNode = giveUpBtn;
        this.drawRevivalButton(this._revivalGiveUpBtnBg, giveUpBtnW, giveUpBtnH, false);

        const giveUpLblNode = new Node('GiveUpLabel');
        giveUpBtn.addChild(giveUpLblNode);
        giveUpLblNode.addComponent(UITransform).setContentSize(giveUpBtnW - 12, giveUpBtnH - 6);
        this._revivalGiveUpBtnLabel = giveUpLblNode.addComponent(Label);
        this._revivalGiveUpBtnLabel.fontSize = 20;
        this._revivalGiveUpBtnLabel.lineHeight = 28;
        this._revivalGiveUpBtnLabel.isBold = true;
        this._revivalGiveUpBtnLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._revivalGiveUpBtnLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._revivalGiveUpBtnLabel.overflow = Label.Overflow.SHRINK;
        this._revivalGiveUpBtnLabel.color = new Color(255, 230, 230, 255);
        this._revivalGiveUpBtnLabel.string = '';

        giveUpBtn.on(
            Button.EventType.CLICK,
            () => {
                const cb = this._onRevivalGiveUp;
                this.hideBaseRevival();
                cb?.();
            },
            this
        );

        applyLayerRecursive(root, HUD_UI_LAYER);
        this._revivalRoot = root;
        this.updateRevivalDialogLayout();
        root.active = false;
    }

    private updateRevivalDialogLayout(): void {
        if (!this._revivalRoot) return;

        const viewport = UIResponsive.getLayoutViewportSize(480, 320, 'canvas');
        const viewportW = viewport.width;
        const viewportH = viewport.height;
        const isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();
        const compact = isTikTokPortrait || viewportW < 900;

        const panelW = Math.round(
            Math.max(
                isTikTokPortrait ? 260 : 340,
                Math.min(480, viewportW * (isTikTokPortrait ? 0.88 : compact ? 0.72 : 0.48))
            )
        );
        const panelH = Math.round(
            Math.max(
                isTikTokPortrait ? 280 : 220,
                Math.min(
                    isTikTokPortrait ? 380 : 300,
                    viewportH * (isTikTokPortrait ? 0.38 : compact ? 0.36 : 0.4)
                )
            )
        );

        this._revivalRoot.getComponent(UITransform)?.setContentSize(viewportW, viewportH);

        const panel = this._revivalPanelBg?.node;
        panel?.getComponent(UITransform)?.setContentSize(panelW, panelH);
        if (this._revivalPanelBg) {
            this.drawRevivalPanelBg(this._revivalPanelBg, panelW, panelH);
        }

        // Title
        const titleNode = this._revivalTitleLabel?.node;
        titleNode?.getComponent(UITransform)?.setContentSize(panelW - 40, Math.round(panelH * 0.2));
        titleNode?.setPosition(0, Math.round(panelH * 0.32), 0);
        if (this._revivalTitleLabel) {
            this._revivalTitleLabel.fontSize = Math.max(
                isTikTokPortrait ? 20 : 28,
                Math.min(isTikTokPortrait ? 30 : 36, Math.round(panelH * 0.12))
            );
            this._revivalTitleLabel.lineHeight = this._revivalTitleLabel.fontSize + 8;
        }

        // Message
        const msgNode = this._revivalMessageLabel?.node;
        msgNode?.getComponent(UITransform)?.setContentSize(panelW - 40, Math.round(panelH * 0.24));
        msgNode?.setPosition(0, Math.round(panelH * 0.1), 0);
        if (this._revivalMessageLabel) {
            this._revivalMessageLabel.fontSize = Math.max(
                isTikTokPortrait ? 13 : 16,
                Math.min(isTikTokPortrait ? 18 : 22, Math.round(panelH * 0.08))
            );
            this._revivalMessageLabel.lineHeight = this._revivalMessageLabel.fontSize + 8;
        }

        // Buttons — narrow screens switch to stacked layout to guarantee no overlap.
        const stackButtons = isTikTokPortrait || panelW < 320;
        const btnSpacing = Math.round(Math.max(10, panelW * 0.03));
        const sideInset = Math.round(Math.max(14, panelW * 0.05));
        const singleRowBudget = panelW - sideInset * 2 - btnSpacing;

        const rowRebuildBtnW = Math.round(Math.max(108, singleRowBudget * 0.6));
        const rowGiveUpBtnW = Math.round(Math.max(86, singleRowBudget * 0.4));
        const stackBtnW = Math.max(120, panelW - sideInset * 2);
        const btnH = Math.round(Math.max(36, panelH * (stackButtons ? 0.14 : 0.18)));
        const rowBtnY = -Math.round(panelH * 0.31);

        // Stacked layout: compute from panel bottom up to guarantee buttons stay within bounds
        const bottomMargin = Math.max(12, Math.round(panelH * 0.05));
        const stackSpacingV = Math.max(8, Math.round(panelH * 0.03));
        const stackGiveUpY = -Math.round(panelH / 2) + bottomMargin + Math.round(btnH / 2);
        const stackRebuildY = stackGiveUpY + btnH + stackSpacingV;

        const rebuildBtnW = stackButtons ? stackBtnW : rowRebuildBtnW;
        const giveUpBtnW = stackButtons ? stackBtnW : rowGiveUpBtnW;
        const rebuildX = stackButtons
            ? 0
            : -((rebuildBtnW + giveUpBtnW + btnSpacing) / 2) + rebuildBtnW / 2;
        const giveUpX = stackButtons
            ? 0
            : (rebuildBtnW + giveUpBtnW + btnSpacing) / 2 - giveUpBtnW / 2;
        const rebuildY = stackButtons ? stackRebuildY : rowBtnY;
        const giveUpY = stackButtons ? stackGiveUpY : rowBtnY;

        if (this._revivalRebuildBtnNode) {
            this._revivalRebuildBtnNode
                .getComponent(UITransform)
                ?.setContentSize(rebuildBtnW, btnH);
            this._revivalRebuildBtnNode.setPosition(Math.round(rebuildX), rebuildY, 0);
            if (this._revivalRebuildBtnBg) {
                this.drawRevivalButton(this._revivalRebuildBtnBg, rebuildBtnW, btnH, true);
            }
            this._revivalRebuildBtnLabel?.node
                .getComponent(UITransform)
                ?.setContentSize(rebuildBtnW - 12, btnH - 6);
            if (this._revivalRebuildBtnLabel) {
                this._revivalRebuildBtnLabel.fontSize = Math.max(
                    isTikTokPortrait ? 15 : 18,
                    Math.min(24, Math.round(btnH * 0.42))
                );
                this._revivalRebuildBtnLabel.lineHeight = this._revivalRebuildBtnLabel.fontSize + 8;
            }
        }

        if (this._revivalGiveUpBtnNode) {
            this._revivalGiveUpBtnNode.getComponent(UITransform)?.setContentSize(giveUpBtnW, btnH);
            this._revivalGiveUpBtnNode.setPosition(Math.round(giveUpX), giveUpY, 0);
            if (this._revivalGiveUpBtnBg) {
                this.drawRevivalButton(this._revivalGiveUpBtnBg, giveUpBtnW, btnH, false);
            }
            this._revivalGiveUpBtnLabel?.node
                .getComponent(UITransform)
                ?.setContentSize(giveUpBtnW - 10, btnH - 4);
            if (this._revivalGiveUpBtnLabel) {
                this._revivalGiveUpBtnLabel.fontSize = Math.max(
                    isTikTokPortrait ? 13 : 15,
                    Math.min(20, Math.round(btnH * 0.4))
                );
                this._revivalGiveUpBtnLabel.lineHeight = this._revivalGiveUpBtnLabel.fontSize + 8;
            }
        }
    }

    private drawRevivalPanelBg(bg: Graphics, w: number, h: number): void {
        const r = Math.max(12, Math.round(Math.min(w, h) * 0.05));
        bg.clear();
        bg.fillColor = new Color(13, 18, 30, 230);
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.fill();
        bg.strokeColor = new Color(255, 180, 60, 255);
        bg.lineWidth = 3;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.stroke();
    }

    private drawRevivalButton(bg: Graphics, w: number, h: number, isPrimary: boolean): void {
        const r = Math.max(8, Math.round(h * 0.25));
        bg.clear();
        bg.fillColor = isPrimary ? new Color(72, 200, 96, 255) : new Color(120, 60, 60, 200);
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.fill();
        bg.strokeColor = isPrimary ? new Color(200, 255, 200, 200) : new Color(200, 140, 140, 160);
        bg.lineWidth = 2;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.stroke();
    }
}
