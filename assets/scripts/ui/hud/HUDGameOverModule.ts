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

const GAME_OVER_DIALOG_MAX_WIDTH = 760;
const GAME_OVER_DIALOG_MAX_HEIGHT = 350;
const GAME_OVER_DIALOG_MIN_WIDTH = 420;
const GAME_OVER_DIALOG_MIN_HEIGHT = 250;
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
    private _gameOverRestarting = false;
    private _gameOverDialogWidth = GAME_OVER_DIALOG_MAX_WIDTH;
    private _gameOverDialogHeight = GAME_OVER_DIALOG_MAX_HEIGHT;
    private _gameOverButtonWidth = GAME_OVER_RESTART_BTN_MAX_WIDTH;
    private _gameOverButtonHeight = GAME_OVER_RESTART_BTN_MAX_HEIGHT;

    public constructor(private readonly _setInputEnabled: (enabled: boolean) => void) {}

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.createGameOverDialog(uiCanvas);
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
        this._gameOverButtonNode = null;
        this._gameOverButton = null;
        this._gameOverButtonLabel = null;
        this._gameOverButtonBg = null;
        this._gameOverPanelBg = null;
        this._gameOverOpacity = null;
        this._gameOverRestarting = false;
        this._uiCanvas = null;
    }

    public onCanvasResize(): void {
        this.updateGameOverDialogLayout();
    }

    public onLanguageChanged(): void {
        if (!this._gameOverRoot?.active) return;

        if (this._gameOverButtonLabel) {
            this._gameOverButtonLabel.string = Localization.instance.t(
                this._gameOverRestarting
                    ? 'ui.gameOver.button.restarting'
                    : 'ui.gameOver.button.restart'
            );
        }
    }

    public showGameOver(victory: boolean): void {
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
        this._setInputEnabled(false);
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
        this._gameOverTitleLabel.color = new Color(255, 224, 140, 255);

        const messageNode = new Node('GameOverMessage');
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

        if (this.tryReloadHostPage()) {
            return;
        }

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
}
