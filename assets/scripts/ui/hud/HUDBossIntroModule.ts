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
import { resolveBossDialogueProfile } from '../BossIntroDialogue';
import { HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

const BOSS_INTRO_WIDTH = 880;
const BOSS_INTRO_HEIGHT = 218;
const BOSS_INTRO_DISPLAY_SECONDS = 3.55;
const BOSS_PREVIEW_STAGE_Z = -460;

export type BossIntroPayload = {
    bossNode: Node;
    archetypeId?: string;
    modelPath?: string;
    lane?: 'top' | 'mid' | 'bottom';
};

export class HUDBossIntroModule implements HUDModule {
    private _bossIntroRoot: Node | null = null;
    private _bossIntroTitleLabel: Label | null = null;
    private _bossIntroQuoteLabel: Label | null = null;
    private _bossIntroModelHost: Node | null = null;
    private _bossIntroModelStage: Node | null = null;
    private _bossIntroOpacity: UIOpacity | null = null;
    private _bossIntroToken = 0;
    private _bossPreviewMotionClock: { phase: number } | null = null;
    private _bossPreviewMotionTarget: Node | null = null;

    public initialize(parent: Node): void {
        this.createBossIntroPanel(parent);
    }

    public onLanguageChanged(): void {}

    public cleanup(): void {
        this.stopBossPreviewMotion();

        if (this._bossIntroRoot) {
            Tween.stopAllByTarget(this._bossIntroRoot);
        }
        if (this._bossIntroOpacity) {
            Tween.stopAllByTarget(this._bossIntroOpacity);
        }

        this._bossIntroRoot = null;
        this._bossIntroTitleLabel = null;
        this._bossIntroQuoteLabel = null;
        this._bossIntroModelHost = null;
        this._bossIntroModelStage = null;
        this._bossIntroOpacity = null;
    }

    public showBossIntro(payload: BossIntroPayload, playCinematic: (bossNode: Node) => void): void {
        if (!payload?.bossNode || !payload.bossNode.isValid) return;

        this._bossIntroToken += 1;
        const token = this._bossIntroToken;

        this.showBossIntroPanel(payload, token);
        playCinematic(payload.bossNode);
    }

    private createBossIntroPanel(parent: Node): void {
        const root = new Node('BossIntroPanel');
        root.layer = HUD_UI_LAYER;
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
        bgNode.layer = HUD_UI_LAYER;
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
        modelFrame.layer = HUD_UI_LAYER;
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
        modelHost.layer = HUD_UI_LAYER;
        modelFrame.addChild(modelHost);
        modelHost.addComponent(UITransform).setContentSize(190, 150);
        this._bossIntroModelHost = modelHost;

        const uiCamera = parent.getChildByName('UICamera');
        if (uiCamera) {
            const stageRoot = new Node('BossIntroModelStage');
            stageRoot.layer = HUD_UI_LAYER;
            uiCamera.addChild(stageRoot);
            stageRoot.setPosition(-BOSS_INTRO_WIDTH * 0.34, -240, BOSS_PREVIEW_STAGE_Z);

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
        this._bossIntroQuoteLabel.color = new Color(236, 244, 255, 255);

        this._bossIntroRoot = root;
        root.active = false;
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

        preview.layer = HUD_UI_LAYER;
        this.applyLayerRecursive(preview, HUD_UI_LAYER);
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
