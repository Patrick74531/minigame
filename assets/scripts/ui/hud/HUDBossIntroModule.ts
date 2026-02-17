import {
    Color,
    Graphics,
    instantiate,
    Label,
    Node,
    Prefab,
    Renderer,
    resources,
    SkeletalAnimation,
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
const BOSS_PREVIEW_STAGE_Z = -460;

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
    private _bossIntroModelFrame: Node | null = null;
    private _bossIntroModelFrameBg: Graphics | null = null;
    private _bossIntroModelHost: Node | null = null;
    private _bossIntroModelStage: Node | null = null;
    private _bossIntroOpacity: UIOpacity | null = null;
    private _bossIntroToken = 0;
    private _bossPreviewMotionClock: { phase: number } | null = null;
    private _bossPreviewMotionTarget: Node | null = null;
    private _previewRawScale = 0;
    private _previewScaleFactor = 1;
    private _bossIntroWidth = 880;
    private _bossIntroHeight = 218;
    private _modelFrameWidth = 210;
    private _modelFrameHeight = 168;
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
        this.stopBossPreviewMotion();

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
        this._bossIntroModelFrame = null;
        this._bossIntroModelFrameBg = null;
        this._bossIntroModelHost = null;
        this._bossIntroModelStage = null;
        this._bossIntroOpacity = null;
        this._lastPayload = null;
        this._previewRawScale = 0;
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

        const modelFrame = new Node('BossIntroModelFrame');
        modelFrame.layer = HUD_UI_LAYER;
        root.addChild(modelFrame);
        modelFrame.setPosition(-this._bossIntroWidth * 0.34, -2, 0);
        modelFrame
            .addComponent(UITransform)
            .setContentSize(this._modelFrameWidth, this._modelFrameHeight);
        this._bossIntroModelFrameBg = modelFrame.addComponent(Graphics);
        this.drawBossModelFrame();
        this._bossIntroModelFrame = modelFrame;

        const modelHost = new Node('BossIntroModelHost');
        modelHost.layer = HUD_UI_LAYER;
        modelFrame.addChild(modelHost);
        modelHost
            .addComponent(UITransform)
            .setContentSize(this._modelFrameWidth - 20, this._modelFrameHeight - 18);
        this._bossIntroModelHost = modelHost;

        const uiCamera = parent.getChildByName('UICamera');
        if (uiCamera) {
            const stageRoot = new Node('BossIntroModelStage');
            stageRoot.layer = HUD_UI_LAYER;
            uiCamera.addChild(stageRoot);
            stageRoot.setPosition(-this._bossIntroWidth * 0.34, -240, BOSS_PREVIEW_STAGE_Z);

            const stagePivot = new Node('BossIntroModelPivot');
            stagePivot.layer = HUD_UI_LAYER;
            stageRoot.addChild(stagePivot);

            this._bossIntroModelHost = stagePivot;
            this._bossIntroModelStage = stageRoot;
            stageRoot.active = false;
        }

        const titleNode = new Node('BossIntroTitle');
        titleNode.layer = HUD_UI_LAYER;
        root.addChild(titleNode);
        titleNode.setPosition(65, 58, 0);
        titleNode.addComponent(UITransform).setContentSize(500, 56);
        this._bossIntroTitleLabel = titleNode.addComponent(Label);
        this._bossIntroTitleLabel.fontSize = 34;
        this._bossIntroTitleLabel.lineHeight = 40;
        this._bossIntroTitleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._bossIntroTitleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._bossIntroTitleLabel.overflow = Label.Overflow.SHRINK;
        this._bossIntroTitleLabel.color = new Color(250, 228, 128, 255);

        const quoteNode = new Node('BossIntroQuote');
        quoteNode.layer = HUD_UI_LAYER;
        root.addChild(quoteNode);
        quoteNode.setPosition(66, -12, 0);
        quoteNode.addComponent(UITransform).setContentSize(510, 120);
        this._bossIntroQuoteLabel = quoteNode.addComponent(Label);
        this._bossIntroQuoteLabel.fontSize = 22;
        this._bossIntroQuoteLabel.lineHeight = 30;
        this._bossIntroQuoteLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
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

    private drawBossModelFrame(): void {
        if (!this._bossIntroModelFrameBg) return;
        const g = this._bossIntroModelFrameBg;
        const w = this._modelFrameWidth;
        const h = this._modelFrameHeight;
        const radius = Math.max(10, Math.round(Math.min(w, h) * 0.07));
        g.clear();
        g.fillColor = new Color(8, 16, 25, 220);
        g.roundRect(-w / 2, -h / 2, w, h, radius);
        g.fill();
        g.strokeColor = new Color(88, 188, 232, 245);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, radius);
        g.stroke();
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

        preview.layer = HUD_UI_LAYER;
        this.applyLayerRecursive(preview, HUD_UI_LAYER);
        host.addChild(preview);
        preview.setPosition(0, -Math.round(this._modelFrameHeight * 0.23), 0);
        this._previewRawScale = this.resolvePreviewScale(payload.modelPath);
        const scale = this._previewRawScale * this._previewScaleFactor;
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

        this._modelFrameWidth = Math.round(
            UIResponsive.clamp(this._bossIntroWidth * 0.24, 170, 260)
        );
        this._modelFrameHeight = Math.round(
            UIResponsive.clamp(this._bossIntroHeight * 0.77, 140, 220)
        );
        this._previewScaleFactor = this._modelFrameHeight / 168;

        const frameX = -Math.round(this._bossIntroWidth * 0.34);
        const frameY = -Math.round(this._bossIntroHeight * 0.02);

        this._bossIntroModelFrame?.setPosition(frameX, frameY, 0);
        this._bossIntroModelFrame
            ?.getComponent(UITransform)
            ?.setContentSize(this._modelFrameWidth, this._modelFrameHeight);
        this.drawBossModelFrame();

        const modelHostUi = this._bossIntroModelFrame?.getChildByName('BossIntroModelHost');
        modelHostUi
            ?.getComponent(UITransform)
            ?.setContentSize(this._modelFrameWidth - 20, this._modelFrameHeight - 18);

        const titleNode = this._bossIntroTitleLabel?.node;
        const quoteNode = this._bossIntroQuoteLabel?.node;
        const textWidth =
            this._bossIntroWidth - this._modelFrameWidth - Math.round(this._bossIntroWidth * 0.11);
        const textX = Math.round(this._bossIntroWidth * 0.08);

        titleNode
            ?.getComponent(UITransform)
            ?.setContentSize(textWidth, Math.max(48, Math.round(this._bossIntroHeight * 0.25)));
        titleNode?.setPosition(textX, Math.round(this._bossIntroHeight * 0.25), 0);
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
        quoteNode?.setPosition(textX, -Math.round(this._bossIntroHeight * 0.09), 0);
        if (this._bossIntroQuoteLabel) {
            this._bossIntroQuoteLabel.fontSize = Math.max(
                20,
                Math.min(28, Math.round(this._bossIntroHeight * 0.11))
            );
            this._bossIntroQuoteLabel.lineHeight = this._bossIntroQuoteLabel.fontSize + 8;
        }

        if (this._bossIntroModelStage) {
            const stageY =
                -viewportH / 2 + (rootWidget?.bottom ?? 14) + this._bossIntroHeight / 2 + frameY;
            this._bossIntroModelStage.setPosition(frameX, stageY, BOSS_PREVIEW_STAGE_Z);
        }

        if (this._bossPreviewMotionTarget?.isValid && this._previewRawScale > 0) {
            this._bossPreviewMotionTarget.setPosition(
                0,
                -Math.round(this._modelFrameHeight * 0.23),
                0
            );
            const newScale = this._previewRawScale * this._previewScaleFactor;
            this.startBossPreviewMotion(this._bossPreviewMotionTarget, newScale);
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
