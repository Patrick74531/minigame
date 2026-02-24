import {
    Color,
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
import { UIResponsive } from '../UIResponsive';
import { resolveBossDialogueProfile } from '../BossIntroDialogue';
import { HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

const BOSS_INTRO_MIN_WIDTH = 640;
const BOSS_INTRO_MAX_WIDTH = 1020;
const BOSS_INTRO_MIN_HEIGHT = 200;
const BOSS_INTRO_MAX_HEIGHT = 320;
const BOSS_INTRO_DISPLAY_SECONDS = 3.55;

export type BossIntroPayload = {
    bossNode: Node;
    archetypeId?: string;
    modelPath?: string;
    lane?: 'top' | 'mid' | 'bottom';
};

export class HUDBossIntroModule implements HUDModule {
    private _uiCanvas: Node | null = null;
    private _bossIntroRoot: Node | null = null;
    private _bossIntroBg: Graphics | null = null;
    private _bossIntroTitleLabel: Label | null = null;
    private _bossIntroQuoteLabel: Label | null = null;
    private _bossIntroOpacity: UIOpacity | null = null;
    private _bossIntroToken = 0;
    private _bossIntroWidth = 880;
    private _bossIntroHeight = 218;
    private _lastPayload: BossIntroPayload | null = null;

    public initialize(parent: Node): void {
        this._uiCanvas = parent;
        this.createBossIntroPanel(parent);
        this.applyResponsiveLayout();
    }

    public onCanvasResize(): void {
        this.applyResponsiveLayout();
    }

    public onLanguageChanged(): void {
        if (this._lastPayload) {
            this.renderBossIntroText(this._lastPayload);
        }
    }

    public cleanup(): void {
        if (this._bossIntroRoot) {
            Tween.stopAllByTarget(this._bossIntroRoot);
        }
        if (this._bossIntroOpacity) {
            Tween.stopAllByTarget(this._bossIntroOpacity);
        }

        this._uiCanvas = null;
        this._bossIntroRoot = null;
        this._bossIntroBg = null;
        this._bossIntroTitleLabel = null;
        this._bossIntroQuoteLabel = null;
        this._bossIntroOpacity = null;
        this._lastPayload = null;
    }

    public showBossIntro(payload: BossIntroPayload, playCinematic: (bossNode: Node) => void): void {
        if (!payload?.bossNode || !payload.bossNode.isValid) return;

        this._bossIntroToken += 1;
        const token = this._bossIntroToken;
        this._lastPayload = payload;

        this.showBossIntroPanel(payload, token);
        playCinematic(payload.bossNode);
    }

    private createBossIntroPanel(parent: Node): void {
        const root = new Node('BossIntroPanel');
        root.layer = HUD_UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._bossIntroWidth, this._bossIntroHeight);

        const widget = root.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 14;

        this._bossIntroOpacity = root.addComponent(UIOpacity);
        this._bossIntroOpacity.opacity = 0;

        const bgNode = new Node('BossIntroBg');
        bgNode.layer = HUD_UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._bossIntroBg = bgNode.addComponent(Graphics);
        this.drawBossIntroBackground();

        const titleNode = new Node('BossIntroTitle');
        titleNode.layer = HUD_UI_LAYER;
        root.addChild(titleNode);
        titleNode.setPosition(0, 58, 0);
        titleNode.addComponent(UITransform).setContentSize(this._bossIntroWidth * 0.84, 56);
        this._bossIntroTitleLabel = titleNode.addComponent(Label);
        this._bossIntroTitleLabel.fontSize = 34;
        this._bossIntroTitleLabel.lineHeight = 40;
        this._bossIntroTitleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._bossIntroTitleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._bossIntroTitleLabel.overflow = Label.Overflow.SHRINK;
        this._bossIntroTitleLabel.color = new Color(250, 228, 128, 255);

        const quoteNode = new Node('BossIntroQuote');
        quoteNode.layer = HUD_UI_LAYER;
        root.addChild(quoteNode);
        quoteNode.setPosition(0, -12, 0);
        quoteNode.addComponent(UITransform).setContentSize(this._bossIntroWidth * 0.84, 120);
        this._bossIntroQuoteLabel = quoteNode.addComponent(Label);
        this._bossIntroQuoteLabel.fontSize = 22;
        this._bossIntroQuoteLabel.lineHeight = 30;
        this._bossIntroQuoteLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._bossIntroQuoteLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._bossIntroQuoteLabel.enableWrapText = true;
        this._bossIntroQuoteLabel.overflow = Label.Overflow.SHRINK;
        this._bossIntroQuoteLabel.color = new Color(236, 244, 255, 255);

        this._bossIntroRoot = root;
        root.active = false;
    }

    private drawBossIntroBackground(): void {
        if (!this._bossIntroBg) return;
        const bg = this._bossIntroBg;
        const w = this._bossIntroWidth;
        const h = this._bossIntroHeight;
        const radius = Math.max(12, Math.round(Math.min(w, h) * 0.06));

        bg.clear();
        bg.fillColor = new Color(18, 23, 31, 230);
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.fill();

        bg.strokeColor = new Color(132, 222, 255, 235);
        bg.lineWidth = 3;
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.stroke();
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

        this.applyResponsiveLayout();
        this.renderBossIntroText(payload);

        Tween.stopAllByTarget(this._bossIntroRoot);
        Tween.stopAllByTarget(this._bossIntroOpacity);

        this._bossIntroRoot.active = true;
        this._bossIntroRoot.setScale(0.94, 0.94, 1);
        this._bossIntroOpacity.opacity = 0;

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
            })
            .start();
    }

    private renderBossIntroText(payload: BossIntroPayload): void {
        if (!this._bossIntroTitleLabel || !this._bossIntroQuoteLabel) return;
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
    }

    private applyResponsiveLayout(): void {
        const canvasTransform = this._uiCanvas?.getComponent(UITransform);
        if (!canvasTransform) return;
        const viewportW = Math.max(480, Math.round(canvasTransform.contentSize.width));
        const viewportH = Math.max(320, Math.round(canvasTransform.contentSize.height));
        const compact = viewportW < 900 || viewportH < 620;
        const padding = UIResponsive.getControlPadding();

        this._bossIntroWidth = Math.round(
            UIResponsive.clamp(
                viewportW * (compact ? 0.88 : 0.72),
                BOSS_INTRO_MIN_WIDTH,
                BOSS_INTRO_MAX_WIDTH
            )
        );
        this._bossIntroHeight = Math.round(
            UIResponsive.clamp(
                viewportH * (compact ? 0.35 : 0.28),
                BOSS_INTRO_MIN_HEIGHT,
                BOSS_INTRO_MAX_HEIGHT
            )
        );

        const rootTransform = this._bossIntroRoot?.getComponent(UITransform);
        rootTransform?.setContentSize(this._bossIntroWidth, this._bossIntroHeight);
        const rootWidget = this._bossIntroRoot?.getComponent(Widget);
        if (rootWidget) {
            rootWidget.bottom = Math.max(10, Math.round(padding.bottom * 0.24));
            rootWidget.updateAlignment();
        }
        this.drawBossIntroBackground();

        const titleNode = this._bossIntroTitleLabel?.node;
        const quoteNode = this._bossIntroQuoteLabel?.node;
        const textWidth = Math.round(this._bossIntroWidth * 0.84);

        titleNode
            ?.getComponent(UITransform)
            ?.setContentSize(textWidth, Math.max(48, Math.round(this._bossIntroHeight * 0.25)));
        titleNode?.setPosition(0, Math.round(this._bossIntroHeight * 0.25), 0);
        if (this._bossIntroTitleLabel) {
            this._bossIntroTitleLabel.fontSize = Math.max(
                28,
                Math.min(42, Math.round(this._bossIntroHeight * 0.16))
            );
            this._bossIntroTitleLabel.lineHeight = this._bossIntroTitleLabel.fontSize + 6;
        }

        quoteNode
            ?.getComponent(UITransform)
            ?.setContentSize(textWidth, Math.max(94, Math.round(this._bossIntroHeight * 0.56)));
        quoteNode?.setPosition(0, -Math.round(this._bossIntroHeight * 0.09), 0);
        if (this._bossIntroQuoteLabel) {
            this._bossIntroQuoteLabel.fontSize = Math.max(
                20,
                Math.min(28, Math.round(this._bossIntroHeight * 0.11))
            );
            this._bossIntroQuoteLabel.lineHeight = this._bossIntroQuoteLabel.fontSize + 8;
        }
    }

    private resolveForecastEnemyName(archetypeId: string): string {
        const key = `enemy.archetype.${archetypeId}`;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return archetypeId;
        }
        return localized;
    }

    private resolveLocalizedByKey(key: string, fallback: string): string {
        if (!key) return fallback;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return fallback;
        }
        return localized;
    }
}
