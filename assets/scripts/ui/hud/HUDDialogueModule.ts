import {
    Color,
    Graphics,
    Label,
    Node,
    Tween,
    UIOpacity,
    UITransform,
    Widget,
    Vec3,
    tween,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import type { LocalizationParams } from '../../core/i18n/types';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { UIResponsive } from '../UIResponsive';
import { BuffCardUI } from '../BuffCardUI';
import { ItemCardUI } from '../ItemCardUI';
import { TowerSelectUI } from '../TowerSelectUI';
import { TowerUpgradeCardUI } from '../TowerUpgradeCardUI';
import { WeaponSelectUI } from '../WeaponSelectUI';
import { applyGameLabelStyle, HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

const DIALOG_MIN_WIDTH = 540;
const DIALOG_MAX_WIDTH = 1120;
const DIALOG_MIN_HEIGHT = 220;
const DIALOG_MAX_HEIGHT = 420;

export type HUDDialogueRequest = {
    titleKey?: string;
    titleFallback?: string;
    bodyKey: string;
    bodyFallback?: string;
    bodyParams?: LocalizationParams;
    continueKey?: string;
    continueFallback?: string;
    onConfirm?: () => void;
};

export class HUDDialogueModule implements HUDModule {
    private _uiCanvas: Node | null = null;
    private _root: Node | null = null;
    private _panelBg: Graphics | null = null;
    private _titleLabel: Label | null = null;
    private _bodyLabel: Label | null = null;
    private _continueLabel: Label | null = null;
    private _rootOpacity: UIOpacity | null = null;
    private _dialogWidth = 880;
    private _dialogHeight = 280;

    private _queue: HUDDialogueRequest[] = [];
    private _activeRequest: HUDDialogueRequest | null = null;
    private _pausedByDialogue = false;
    private _tapLocked = false;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.createDialogueRoot(uiCanvas);
        this.applyResponsiveLayout();
    }

    public cleanup(): void {
        this.releasePauseIfNeeded();
        this._queue = [];
        this._activeRequest = null;
        this.clearRetryTimer();

        if (this._root) {
            this._root.off(Node.EventType.TOUCH_END, this.onDialogTapped, this);
            this._root.off(Node.EventType.MOUSE_UP, this.onDialogTapped, this);
            Tween.stopAllByTarget(this._root);
        }
        if (this._rootOpacity) {
            Tween.stopAllByTarget(this._rootOpacity);
        }

        this._uiCanvas = null;
        this._root = null;
        this._panelBg = null;
        this._titleLabel = null;
        this._bodyLabel = null;
        this._continueLabel = null;
        this._rootOpacity = null;
    }

    public onCanvasResize(): void {
        this.applyResponsiveLayout();
    }

    public onLanguageChanged(): void {
        if (!this._activeRequest) return;
        this.renderRequest(this._activeRequest);
    }

    public isBusy(): boolean {
        return !!this._activeRequest || this._queue.length > 0;
    }

    public enqueue(request: HUDDialogueRequest): void {
        if (!request?.bodyKey) return;
        this._queue.push({ ...request });
        this.tryShowNext();
    }

    public enqueueSequence(requests: HUDDialogueRequest[], onComplete?: () => void): void {
        const valid = requests
            .filter(request => !!request?.bodyKey)
            .map(request => ({ ...request }));
        if (valid.length <= 0) {
            if (onComplete) onComplete();
            return;
        }

        if (onComplete) {
            const last = valid[valid.length - 1];
            const previousOnConfirm = last.onConfirm;
            last.onConfirm = () => {
                if (previousOnConfirm) previousOnConfirm();
                this.deferCallback(onComplete);
            };
        }

        for (const request of valid) {
            this._queue.push(request);
        }
        this.tryShowNext();
    }

    private tryShowNext(): void {
        if (this._activeRequest) return;
        if (this.isExternalModalShowing()) {
            this.scheduleRetry();
            return;
        }

        const next = this._queue.shift();
        if (!next) {
            this.hideAndReleasePause();
            return;
        }

        this.ensurePause();
        this._activeRequest = next;
        this._tapLocked = false;
        this.applyResponsiveLayout();
        this.renderRequest(next);

        if (!this._root || !this._rootOpacity) return;
        this._root.active = true;
        const parent = this._root.parent;
        if (parent) {
            this._root.setSiblingIndex(parent.children.length - 1);
        }
        this._rootOpacity.opacity = 0;
        const panel = this._root.getChildByName('HUDDialoguePanel');
        if (panel) {
            Tween.stopAllByTarget(panel);
            panel.setScale(0.96, 0.96, 1);
            tween(panel)
                .to(0.12, { scale: new Vec3(1.02, 1.02, 1) })
                .to(0.12, { scale: new Vec3(1, 1, 1) })
                .start();
        }
        Tween.stopAllByTarget(this._rootOpacity);
        tween(this._rootOpacity).to(0.12, { opacity: 255 }).start();
    }

    private onDialogTapped(): void {
        if (!this._activeRequest || this._tapLocked) return;
        if (this.isExternalModalShowing()) return;

        this._tapLocked = true;
        const request = this._activeRequest;
        this._activeRequest = null;

        if (request.onConfirm) {
            try {
                request.onConfirm();
            } catch (err) {
                console.error('[HUDDialogueModule] onConfirm failed:', err);
            }
        }

        this.tryShowNext();
    }

    private createDialogueRoot(parent: Node): void {
        const root = new Node('HUDDialogueRoot');
        root.layer = HUD_UI_LAYER;
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(1280, 720);
        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;

        this._rootOpacity = root.addComponent(UIOpacity);
        this._rootOpacity.opacity = 0;

        const panelNode = new Node('HUDDialoguePanel');
        panelNode.layer = HUD_UI_LAYER;
        root.addChild(panelNode);
        panelNode.addComponent(UITransform).setContentSize(this._dialogWidth, this._dialogHeight);
        const panelWidget = panelNode.addComponent(Widget);
        panelWidget.isAlignHorizontalCenter = true;
        panelWidget.isAlignVerticalCenter = true;

        const panelBgNode = new Node('HUDDialoguePanelBg');
        panelBgNode.layer = HUD_UI_LAYER;
        panelNode.addChild(panelBgNode);
        panelBgNode.addComponent(UITransform).setContentSize(this._dialogWidth, this._dialogHeight);
        this._panelBg = panelBgNode.addComponent(Graphics);
        this.drawPanelBackground();

        const titleNode = new Node('HUDDialogueTitle');
        titleNode.layer = HUD_UI_LAYER;
        panelNode.addChild(titleNode);
        titleNode
            .addComponent(UITransform)
            .setContentSize(this._dialogWidth - 80, Math.round(this._dialogHeight * 0.2));
        this._titleLabel = titleNode.addComponent(Label);
        this._titleLabel.string = '';
        this._titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._titleLabel.overflow = Label.Overflow.SHRINK;
        this._titleLabel.color = new Color(255, 220, 128, 255);
        applyGameLabelStyle(this._titleLabel, {
            outlineColor: new Color(40, 22, 8, 255),
            outlineWidth: 4,
        });

        const bodyNode = new Node('HUDDialogueBody');
        bodyNode.layer = HUD_UI_LAYER;
        panelNode.addChild(bodyNode);
        bodyNode
            .addComponent(UITransform)
            .setContentSize(this._dialogWidth - 96, Math.round(this._dialogHeight * 0.5));
        this._bodyLabel = bodyNode.addComponent(Label);
        this._bodyLabel.string = '';
        this._bodyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._bodyLabel.enableWrapText = true;
        this._bodyLabel.overflow = Label.Overflow.SHRINK;
        this._bodyLabel.color = new Color(230, 242, 255, 255);
        applyGameLabelStyle(this._bodyLabel, {
            outlineColor: new Color(10, 20, 34, 255),
            outlineWidth: 2,
        });

        const continueNode = new Node('HUDDialogueContinue');
        continueNode.layer = HUD_UI_LAYER;
        panelNode.addChild(continueNode);
        continueNode
            .addComponent(UITransform)
            .setContentSize(this._dialogWidth - 100, Math.round(this._dialogHeight * 0.18));
        this._continueLabel = continueNode.addComponent(Label);
        this._continueLabel.string = '';
        this._continueLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._continueLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._continueLabel.overflow = Label.Overflow.SHRINK;
        this._continueLabel.color = new Color(170, 218, 255, 255);
        applyGameLabelStyle(this._continueLabel, {
            outlineColor: new Color(10, 30, 48, 255),
            outlineWidth: 2,
        });

        root.on(Node.EventType.TOUCH_END, this.onDialogTapped, this);
        root.on(Node.EventType.MOUSE_UP, this.onDialogTapped, this);

        this._root = root;
        root.active = false;
    }

    private drawPanelBackground(): void {
        if (!this._panelBg) return;

        const width = this._dialogWidth;
        const height = this._dialogHeight;
        const halfW = width / 2;
        const halfH = height / 2;
        const corner = Math.max(16, Math.round(Math.min(width, height) * 0.08));

        const bg = this._panelBg;
        bg.clear();

        // Main translucent body
        bg.fillColor = new Color(8, 16, 30, 198);
        bg.moveTo(-halfW + corner, -halfH);
        bg.lineTo(halfW - corner, -halfH);
        bg.lineTo(halfW, -halfH + corner);
        bg.lineTo(halfW, halfH - corner);
        bg.lineTo(halfW - corner, halfH);
        bg.lineTo(-halfW + corner, halfH);
        bg.lineTo(-halfW, halfH - corner);
        bg.lineTo(-halfW, -halfH + corner);
        bg.close();
        bg.fill();

        // Outer frame
        bg.strokeColor = new Color(90, 208, 255, 240);
        bg.lineWidth = 3;
        bg.moveTo(-halfW + corner, -halfH);
        bg.lineTo(halfW - corner, -halfH);
        bg.lineTo(halfW, -halfH + corner);
        bg.lineTo(halfW, halfH - corner);
        bg.lineTo(halfW - corner, halfH);
        bg.lineTo(-halfW + corner, halfH);
        bg.lineTo(-halfW, halfH - corner);
        bg.lineTo(-halfW, -halfH + corner);
        bg.close();
        bg.stroke();

        // Inner frame
        const inset = Math.max(8, Math.round(corner * 0.45));
        bg.strokeColor = new Color(154, 232, 255, 90);
        bg.lineWidth = 1.4;
        bg.moveTo(-halfW + corner, -halfH + inset);
        bg.lineTo(halfW - corner, -halfH + inset);
        bg.lineTo(halfW - inset, -halfH + corner);
        bg.lineTo(halfW - inset, halfH - corner);
        bg.lineTo(halfW - corner, halfH - inset);
        bg.lineTo(-halfW + corner, halfH - inset);
        bg.lineTo(-halfW + inset, halfH - corner);
        bg.lineTo(-halfW + inset, -halfH + corner);
        bg.close();
        bg.stroke();

        // Header accent
        bg.strokeColor = new Color(255, 182, 74, 210);
        bg.lineWidth = Math.max(2, Math.round(height * 0.012));
        bg.moveTo(-halfW + corner + 20, halfH - inset - 6);
        bg.lineTo(halfW - corner - 20, halfH - inset - 6);
        bg.stroke();
    }

    private applyResponsiveLayout(): void {
        const viewport = UIResponsive.getLayoutViewportSize(480, 320, 'canvas');
        const viewportW = viewport.width;
        const viewportH = viewport.height;
        const isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();

        this._dialogWidth = Math.round(
            UIResponsive.clamp(
                viewportW * (isTikTokPortrait ? 0.9 : 0.78),
                isTikTokPortrait ? 240 : DIALOG_MIN_WIDTH,
                isTikTokPortrait ? 430 : DIALOG_MAX_WIDTH
            )
        );
        this._dialogHeight = Math.round(
            UIResponsive.clamp(
                viewportH * (isTikTokPortrait ? 0.34 : 0.4),
                isTikTokPortrait ? 180 : DIALOG_MIN_HEIGHT,
                isTikTokPortrait ? 320 : DIALOG_MAX_HEIGHT
            )
        );

        this._root?.getComponent(UITransform)?.setContentSize(viewportW, viewportH);
        const panelNode = this._root?.getChildByName('HUDDialoguePanel') ?? null;
        panelNode?.getComponent(UITransform)?.setContentSize(this._dialogWidth, this._dialogHeight);
        panelNode
            ?.getChildByName('HUDDialoguePanelBg')
            ?.getComponent(UITransform)
            ?.setContentSize(this._dialogWidth, this._dialogHeight);

        const titleNode = panelNode?.getChildByName('HUDDialogueTitle');
        titleNode
            ?.getComponent(UITransform)
            ?.setContentSize(this._dialogWidth - 80, Math.round(this._dialogHeight * 0.2));
        titleNode?.setPosition(0, Math.round(this._dialogHeight * 0.31), 0);

        const bodyNode = panelNode?.getChildByName('HUDDialogueBody');
        bodyNode
            ?.getComponent(UITransform)
            ?.setContentSize(this._dialogWidth - 96, Math.round(this._dialogHeight * 0.5));
        bodyNode?.setPosition(0, 0, 0);

        const continueNode = panelNode?.getChildByName('HUDDialogueContinue');
        continueNode
            ?.getComponent(UITransform)
            ?.setContentSize(this._dialogWidth - 100, Math.round(this._dialogHeight * 0.18));
        continueNode?.setPosition(0, -Math.round(this._dialogHeight * 0.34), 0);

        if (this._titleLabel) {
            this._titleLabel.fontSize = Math.max(
                isTikTokPortrait ? 20 : 24,
                Math.min(isTikTokPortrait ? 30 : 42, Math.round(this._dialogHeight * 0.14))
            );
            this._titleLabel.lineHeight = this._titleLabel.fontSize + 6;
        }
        if (this._bodyLabel) {
            this._bodyLabel.fontSize = Math.max(
                isTikTokPortrait ? 16 : 20,
                Math.min(isTikTokPortrait ? 24 : 32, Math.round(this._dialogHeight * 0.1))
            );
            this._bodyLabel.lineHeight = this._bodyLabel.fontSize + 10;
        }
        if (this._continueLabel) {
            this._continueLabel.fontSize = Math.max(
                isTikTokPortrait ? 12 : 16,
                Math.min(isTikTokPortrait ? 18 : 24, Math.round(this._dialogHeight * 0.075))
            );
            this._continueLabel.lineHeight = this._continueLabel.fontSize + 6;
        }

        this.drawPanelBackground();
    }

    private renderRequest(request: HUDDialogueRequest): void {
        if (!this._titleLabel || !this._bodyLabel || !this._continueLabel) return;

        this._titleLabel.string = this.resolveLocalizedByKey(
            request.titleKey,
            request.titleFallback ?? ''
        );
        this._bodyLabel.string = this.resolveLocalizedByKey(
            request.bodyKey,
            request.bodyFallback ?? request.bodyKey,
            request.bodyParams
        );
        this._continueLabel.string = this.resolveLocalizedByKey(
            request.continueKey ?? 'ui.dialog.tap_continue',
            request.continueFallback ?? 'Tap to continue'
        );
    }

    private hideAndReleasePause(): void {
        if (this._root) {
            this._root.active = false;
        }
        this.releasePauseIfNeeded();
        this._tapLocked = false;
    }

    private ensurePause(): void {
        if (this._pausedByDialogue) return;
        this.gameManager.pauseGame();
        this._pausedByDialogue = true;
    }

    private releasePauseIfNeeded(): void {
        if (!this._pausedByDialogue) return;
        this.gameManager.resumeGame();
        this._pausedByDialogue = false;
    }

    private resolveLocalizedByKey(
        key: string | undefined,
        fallback: string,
        params?: LocalizationParams
    ): string {
        if (!key) return fallback;
        const localized = Localization.instance.t(key, params);
        if (localized.startsWith('[[')) {
            return fallback;
        }
        return localized;
    }

    private scheduleRetry(): void {
        if (this._retryTimer !== null) return;
        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            this.tryShowNext();
        }, 80);
    }

    private clearRetryTimer(): void {
        if (this._retryTimer === null) return;
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
    }

    private deferCallback(callback: () => void): void {
        setTimeout(() => {
            try {
                callback();
            } catch (err) {
                console.error('[HUDDialogueModule] deferred callback failed:', err);
            }
        }, 0);
    }

    private isExternalModalShowing(): boolean {
        if (WeaponSelectUI.instance?.isShowing) return true;
        if (BuffCardUI.instance?.isShowing) return true;
        if (TowerUpgradeCardUI.instance?.isShowing) return true;
        if (ItemCardUI.instance?.isShowing) return true;
        if (TowerSelectUI.instance?.isShowing) return true;
        const hud = ServiceRegistry.get<{ isRevivalShowing?: () => boolean }>('HUDManager');
        if (hud?.isRevivalShowing?.()) return true;
        return false;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
