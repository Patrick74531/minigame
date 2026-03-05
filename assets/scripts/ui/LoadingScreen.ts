import {
    _decorator,
    BlockInputEvents,
    Button,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    Label,
    Graphics,
    Color,
    UITransform,
    Widget,
    Texture2D,
    ImageAsset,
    resources,
    view,
    tween,
    Vec3,
    Layers,
} from 'cc';
import { Localization } from '../core/i18n/Localization';
import { applyGameLabelStyle } from './hud/HUDCommon';
import { UIResponsive } from './UIResponsive';

const { ccclass } = _decorator;

const TIP_KEYS = [
    'ui.loading.tip.move',
    'ui.loading.tip.build',
    'ui.loading.tip.tower',
    'ui.loading.tip.wall',
    'ui.loading.tip.levelup',
    'ui.loading.tip.boss',
    'ui.loading.tip.gooseshed',
    'ui.loading.tip.farm',
    'ui.loading.tip.spa',
    'ui.loading.tip.lanes',
];
const AUDIO_PROMPT_TITLE_KEY = 'ui.loading.audio_prompt.title';
const AUDIO_PROMPT_BODY_KEY = 'ui.loading.audio_prompt.body';
const AUDIO_PROMPT_ENABLE_KEY = 'ui.loading.audio_prompt.enable';
const AUDIO_PROMPT_DISABLE_KEY = 'ui.loading.audio_prompt.disable';

/**
 * LoadingScreen
 * 点击"开始"后显示的加载页：复用首页背景、游戏感进度条、滚动小贴士。
 * 通过 LoadingScreen.show(parent, onComplete) 创建。
 */
@ccclass('LoadingScreen')
export class LoadingScreen extends Component {
    private _bg: Node | null = null;
    private _barBg: Node | null = null;
    private _barFill: Node | null = null;
    private _barFillG: Graphics | null = null;
    private _tipLabel: Label | null = null;
    private _pctLabel: Label | null = null;

    private _progress = 0; // 0..1 actual loading ratio
    private _displayPct = 0; // 0..1 smooth display
    private _tipIdx = 0;
    private _tipTimer = 0;
    private _tipInterval = 3.5;

    private _onComplete: (() => void) | null = null;
    private _completeCalled = false;
    private _minDurationElapsed = false;
    private _readyToClose = false;
    private readonly MIN_DURATION = 1.5;
    private _elapsed = 0;

    private _uiLayer = Layers.Enum.UI_2D;
    private _audioPromptOverlay: Node | null = null;
    private _audioChoicePromise: Promise<boolean> | null = null;
    private _audioChoiceResolver: ((enabled: boolean) => void) | null = null;
    private _audioChoiceResolved = false;

    // ── Public API ─────────────────────────────────────────────────────────

    public static show(parent: Node, onComplete: () => void): LoadingScreen {
        const node = new Node('LoadingScreen');
        node.layer = parent.layer ?? Layers.Enum.UI_2D;
        parent.addChild(node);
        const screen = node.addComponent(LoadingScreen);
        screen._onComplete = onComplete;
        screen._uiLayer = node.layer;
        return screen;
    }

    /** Update progress bar display only — does NOT close the screen. */
    public setProgress(loaded: number, total: number): void {
        this._progress = total > 0 ? loaded / total : 1;
    }

    /**
     * Call this after startGame() has run and GPU warmup delay has elapsed.
     * Triggers the closing animation.
     */
    public signalReadyToClose(): void {
        this._readyToClose = true;
        this._tryComplete();
    }

    public waitForAudioChoice(): Promise<boolean> {
        return this._ensureAudioChoicePromise();
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    protected onLoad(): void {
        this._buildUI();
        this._shuffleTips();
        this._showTip(0);
        this._ensureAudioChoicePromise();
        this._buildAudioPrompt();
        this.scheduleOnce(() => {
            this._minDurationElapsed = true;
            this._tryComplete();
        }, this.MIN_DURATION);
    }

    protected onDestroy(): void {
        if (this._audioChoiceResolved) return;
        this._audioChoiceResolved = true;
        const resolver = this._audioChoiceResolver;
        this._audioChoiceResolver = null;
        resolver?.(false);
    }

    protected update(dt: number): void {
        this._elapsed += dt;

        // Smooth display progress towards actual
        const speed = 1.8;
        if (this._displayPct < this._progress) {
            this._displayPct = Math.min(this._progress, this._displayPct + speed * dt);
        }
        // Force to 100 when ready to close
        if (this._readyToClose && this._minDurationElapsed) {
            this._displayPct = 1;
        }
        this._redrawBar(this._displayPct);
        if (this._pctLabel) {
            this._pctLabel.string = `${Math.round(this._displayPct * 100)}%`;
        }

        // Tips cycling
        this._tipTimer += dt;
        if (this._tipTimer >= this._tipInterval) {
            this._tipTimer = 0;
            this._tipIdx = (this._tipIdx + 1) % TIP_KEYS.length;
            this._showTip(this._tipIdx);
        }
    }

    // ── Build UI ────────────────────────────────────────────────────────────

    private _buildUI(): void {
        const root = this.node;
        const rootTf = root.addComponent(UITransform);
        const sz = this._canvasSize();
        rootTf.setContentSize(sz.w, sz.h);

        const rootW = root.addComponent(Widget);
        rootW.isAlignTop = rootW.isAlignBottom = rootW.isAlignLeft = rootW.isAlignRight = true;
        rootW.top = rootW.bottom = rootW.left = rootW.right = 0;

        // Background (reuse homepage texture)
        this._bg = this._makeFullBg(root, sz);

        // Dark overlay for readability
        const overlay = new Node('Overlay');
        overlay.layer = this._uiLayer;
        root.addChild(overlay);
        overlay.addComponent(UITransform).setContentSize(sz.w * 2, sz.h * 2);
        const ovW = overlay.addComponent(Widget);
        ovW.isAlignHorizontalCenter = ovW.isAlignVerticalCenter = true;
        const ovG = overlay.addComponent(Graphics);
        ovG.fillColor = new Color(0, 0, 0, 140);
        ovG.rect(-sz.w, -sz.h, sz.w * 2, sz.h * 2);
        ovG.fill();

        // Progress bar at bottom third
        const barAreaY = -sz.h * 0.22;
        this._buildBar(root, sz, barAreaY);

        // Tip label
        this._buildTipLabel(root, sz, barAreaY);
    }

    private _makeFullBg(parent: Node, sz: { w: number; h: number }): Node {
        const bg = new Node('BG');
        bg.layer = this._uiLayer;
        parent.addChild(bg);
        const tf = bg.addComponent(UITransform);
        tf.setContentSize(sz.w, sz.h);
        const w = bg.addComponent(Widget);
        w.isAlignHorizontalCenter = w.isAlignVerticalCenter = true;
        w.horizontalCenter = w.verticalCenter = 0;

        const sprite = bg.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const defaultPath = 'ui/homepage';
        const preferredPath = UIResponsive.isTikTokPhonePortraitProfile()
            ? 'ui/homepage_tiktok_portrait'
            : defaultPath;

        this._loadBackgroundSpriteFrame(
            preferredPath,
            sf => {
                if (!bg.isValid) return;
                sprite.spriteFrame = sf;
            },
            err => {
                if (preferredPath === defaultPath) {
                    console.warn('[LoadingScreen] Failed to load homepage background', err);
                    return;
                }
                this._loadBackgroundSpriteFrame(
                    defaultPath,
                    sf => {
                        if (!bg.isValid) return;
                        sprite.spriteFrame = sf;
                    },
                    fallbackErr => {
                        console.warn(
                            '[LoadingScreen] Failed to load TikTok portrait background',
                            fallbackErr ?? err
                        );
                    }
                );
            }
        );

        return bg;
    }

    private _loadBackgroundSpriteFrame(
        path: string,
        onSuccess: (spriteFrame: SpriteFrame) => void,
        onFail: (err: unknown) => void
    ): void {
        resources.load(path, Texture2D, (textureErr, texture) => {
            if (!textureErr && texture) {
                const sf = new SpriteFrame();
                sf.texture = texture;
                onSuccess(sf);
                return;
            }

            resources.load(path, ImageAsset, (imageErr, imageAsset) => {
                if (!imageErr && imageAsset) {
                    const fallbackTexture = new Texture2D();
                    fallbackTexture.image = imageAsset;
                    const sf = new SpriteFrame();
                    sf.texture = fallbackTexture;
                    onSuccess(sf);
                    return;
                }
                onFail(imageErr ?? textureErr);
            });
        });
    }

    private _buildBar(parent: Node, sz: { w: number; h: number }, centerY: number): void {
        const barW = Math.round(UIResponsive.clamp(sz.w * 0.68, 320, 720));
        const barH = Math.round(UIResponsive.clamp(sz.h * 0.038, 18, 36));

        // Background track
        this._barBg = new Node('BarBg');
        this._barBg.layer = this._uiLayer;
        parent.addChild(this._barBg);
        const bgTf = this._barBg.addComponent(UITransform);
        bgTf.setContentSize(barW, barH);
        this._barBg.setPosition(0, centerY, 0);
        const bgW = this._barBg.addComponent(Widget);
        bgW.isAlignHorizontalCenter = true;
        bgW.horizontalCenter = 0;
        const bgG = this._barBg.addComponent(Graphics);
        const r = barH / 2;
        bgG.fillColor = new Color(0, 0, 0, 160);
        bgG.roundRect(-barW / 2, -barH / 2, barW, barH, r);
        bgG.fill();
        bgG.strokeColor = new Color(255, 255, 255, 60);
        bgG.lineWidth = 1;
        bgG.roundRect(-barW / 2, -barH / 2, barW, barH, r);
        bgG.stroke();

        // Fill
        this._barFill = new Node('BarFill');
        this._barFill.layer = this._uiLayer;
        parent.addChild(this._barFill);
        const fillTf = this._barFill.addComponent(UITransform);
        fillTf.setContentSize(barW, barH);
        this._barFill.setPosition(0, centerY, 0);
        const fillW = this._barFill.addComponent(Widget);
        fillW.isAlignHorizontalCenter = true;
        fillW.horizontalCenter = 0;
        this._barFillG = this._barFill.addComponent(Graphics);

        // Percentage label above bar
        const pctNode = new Node('PctLabel');
        pctNode.layer = this._uiLayer;
        parent.addChild(pctNode);
        pctNode.setPosition(0, centerY + barH + 14, 0);
        pctNode.addComponent(UITransform).setContentSize(120, 40);
        const pctW = pctNode.addComponent(Widget);
        pctW.isAlignHorizontalCenter = true;
        pctW.horizontalCenter = 0;
        const pctLbl = pctNode.addComponent(Label);
        pctLbl.fontSize = Math.round(UIResponsive.clamp(sz.h * 0.032, 18, 28));
        pctLbl.isBold = true;
        pctLbl.color = new Color(255, 220, 100, 255);
        pctLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        pctLbl.verticalAlign = Label.VerticalAlign.CENTER;
        pctLbl.string = '0%';
        applyGameLabelStyle(pctLbl, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 200) });
        this._pctLabel = pctLbl;

        this._barW = barW;
        this._barH = barH;
        this._redrawBar(0);
    }

    private _barW = 400;
    private _barH = 24;

    private _redrawBar(ratio: number): void {
        const g = this._barFillG;
        if (!g) return;
        g.clear();
        const w = this._barW;
        const h = this._barH;
        const r = h / 2;
        const fillW = Math.max(0, (w - 2) * ratio);
        if (fillW < 2) return;
        // Glow-style fill: bright amber/orange gradient via layered draws
        const baseAlpha = 255;
        const colors: [number, number, number][] = [
            [255, 160, 30],
            [255, 200, 60],
            [255, 235, 130],
        ];
        for (let i = 0; i < colors.length; i++) {
            const [cr, cg, cb] = colors[i];
            const alpha = i === 0 ? baseAlpha : Math.round(baseAlpha * (1 - i * 0.3));
            const shrink = i * (h * 0.22);
            const fh = h - shrink * 2;
            const fy = -h / 2 + shrink;
            const fr = Math.max(2, r - shrink);
            const fw = Math.max(fr * 2, fillW - shrink);
            const fx = -w / 2 + 1;
            g.fillColor = new Color(cr, cg, cb, alpha);
            g.roundRect(fx, fy, fw, fh, fr);
            g.fill();
        }
    }

    private _buildTipLabel(parent: Node, sz: { w: number; h: number }, barCenterY: number): void {
        const tipNode = new Node('TipLabel');
        tipNode.layer = this._uiLayer;
        parent.addChild(tipNode);
        const tipW = Math.round(UIResponsive.clamp(sz.w * 0.78, 320, 800));
        const tipH = Math.round(UIResponsive.clamp(sz.h * 0.12, 60, 120));
        tipNode.addComponent(UITransform).setContentSize(tipW, tipH);
        tipNode.setPosition(0, barCenterY - this._barH / 2 - tipH / 2 - 16, 0);
        const tipWid = tipNode.addComponent(Widget);
        tipWid.isAlignHorizontalCenter = true;
        tipWid.horizontalCenter = 0;

        const lbl = tipNode.addComponent(Label);
        lbl.fontSize = Math.round(UIResponsive.clamp(sz.h * 0.028, 16, 26));
        lbl.color = new Color(240, 240, 220, 255);
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.RESIZE_HEIGHT;
        lbl.enableWrapText = true;
        applyGameLabelStyle(lbl, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 200) });
        this._tipLabel = lbl;
    }

    private _buildAudioPrompt(): void {
        if (this._audioPromptOverlay && this._audioPromptOverlay.isValid) return;

        const sz = this._canvasSize();
        const shortSide = Math.max(1, Math.min(sz.w, sz.h));
        const aspect = sz.w / Math.max(1, sz.h);
        const isPortrait = sz.h >= sz.w;
        const useVerticalButtons = isPortrait || aspect <= 1.25;

        const overlay = new Node('AudioPromptOverlay');
        overlay.layer = this._uiLayer;
        this.node.addChild(overlay);
        overlay.addComponent(UITransform).setContentSize(sz.w, sz.h);
        const ow = overlay.addComponent(Widget);
        ow.isAlignTop = ow.isAlignBottom = ow.isAlignLeft = ow.isAlignRight = true;
        ow.top = ow.bottom = ow.left = ow.right = 0;
        overlay.addComponent(BlockInputEvents);
        const og = overlay.addComponent(Graphics);
        og.fillColor = new Color(0, 0, 0, 188);
        og.rect(-sz.w / 2, -sz.h / 2, sz.w, sz.h);
        og.fill();
        this._audioPromptOverlay = overlay;

        const panel = new Node('AudioPromptPanel');
        panel.layer = this._uiLayer;
        overlay.addChild(panel);
        const panelW = Math.round(
            UIResponsive.clamp(isPortrait ? sz.w * 0.88 : shortSide * 0.92, 280, 720)
        );
        const panelH = Math.round(
            UIResponsive.clamp(isPortrait ? sz.h * 0.38 : sz.h * 0.46, 220, 400)
        );
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        panel.setPosition(0, 0, 0);
        const pg = panel.addComponent(Graphics);
        const radius = Math.max(14, Math.round(panelH * 0.1));
        pg.fillColor = new Color(20, 24, 40, 246);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
        pg.fill();
        pg.strokeColor = new Color(255, 214, 120, 220);
        pg.lineWidth = Math.max(2, Math.round(panelH * 0.01));
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
        pg.stroke();

        const titleNode = new Node('AudioPromptTitle');
        titleNode.layer = this._uiLayer;
        panel.addChild(titleNode);
        titleNode
            .addComponent(UITransform)
            .setContentSize(panelW - 42, Math.round(UIResponsive.clamp(panelH * 0.22, 46, 92)));
        titleNode.setPosition(0, Math.round(panelH * 0.28), 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t(AUDIO_PROMPT_TITLE_KEY);
        titleLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.06, 22, 44));
        titleLabel.lineHeight = titleLabel.fontSize + 6;
        titleLabel.isBold = true;
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(255, 236, 184, 255);
        titleLabel.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(titleLabel, { outlineWidth: 3, outlineColor: new Color(0, 0, 0, 180) });

        const bodyNode = new Node('AudioPromptBody');
        bodyNode.layer = this._uiLayer;
        panel.addChild(bodyNode);
        bodyNode
            .addComponent(UITransform)
            .setContentSize(panelW - 56, Math.round(UIResponsive.clamp(panelH * 0.35, 78, 180)));
        bodyNode.setPosition(0, Math.round(panelH * 0.03), 0);
        const bodyLabel = bodyNode.addComponent(Label);
        bodyLabel.string = Localization.instance.t(AUDIO_PROMPT_BODY_KEY);
        bodyLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.038, 15, 30));
        bodyLabel.lineHeight = bodyLabel.fontSize + 7;
        bodyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
        bodyLabel.color = new Color(236, 244, 255, 255);
        bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        bodyLabel.enableWrapText = true;
        applyGameLabelStyle(bodyLabel, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 172) });

        const btnHeight = Math.round(UIResponsive.clamp(shortSide * 0.09, 42, 72));
        if (useVerticalButtons) {
            const btnW = Math.round(UIResponsive.clamp(panelW * 0.8, 180, panelW - 30));
            const gap = Math.round(UIResponsive.clamp(shortSide * 0.03, 10, 20));
            const firstY = -Math.round(panelH * 0.2);
            this._createAudioPromptButton(
                panel,
                'EnableAudioBtn',
                Localization.instance.t(AUDIO_PROMPT_ENABLE_KEY),
                btnW,
                btnHeight,
                0,
                firstY,
                new Color(74, 198, 114, 255),
                () => this._resolveAudioChoice(true)
            );
            this._createAudioPromptButton(
                panel,
                'DisableAudioBtn',
                Localization.instance.t(AUDIO_PROMPT_DISABLE_KEY),
                btnW,
                btnHeight,
                0,
                firstY - btnHeight - gap,
                new Color(78, 92, 116, 255),
                () => this._resolveAudioChoice(false)
            );
            return;
        }

        const btnGap = Math.round(UIResponsive.clamp(panelW * 0.08, 20, 56));
        const btnW = Math.round((panelW - btnGap * 3) * 0.5);
        const btnY = -Math.round(panelH * 0.26);
        this._createAudioPromptButton(
            panel,
            'EnableAudioBtn',
            Localization.instance.t(AUDIO_PROMPT_ENABLE_KEY),
            btnW,
            btnHeight,
            -(btnW * 0.5 + btnGap * 0.5),
            btnY,
            new Color(74, 198, 114, 255),
            () => this._resolveAudioChoice(true)
        );
        this._createAudioPromptButton(
            panel,
            'DisableAudioBtn',
            Localization.instance.t(AUDIO_PROMPT_DISABLE_KEY),
            btnW,
            btnHeight,
            btnW * 0.5 + btnGap * 0.5,
            btnY,
            new Color(78, 92, 116, 255),
            () => this._resolveAudioChoice(false)
        );
    }

    private _createAudioPromptButton(
        parent: Node,
        name: string,
        text: string,
        width: number,
        height: number,
        x: number,
        y: number,
        bgColor: Color,
        onClick: () => void
    ): Node {
        const btn = new Node(name);
        btn.layer = this._uiLayer;
        parent.addChild(btn);
        btn.addComponent(UITransform).setContentSize(width, height);
        btn.setPosition(x, y, 0);

        const bg = btn.addComponent(Graphics);
        const radius = Math.max(10, Math.round(height * 0.24));
        bg.fillColor = bgColor;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 180);
        bg.lineWidth = Math.max(1.5, Math.round(height * 0.04));
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();

        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        btn.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(width - 10, height - 4);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = Math.round(UIResponsive.clamp(height * 0.4, 16, 30));
        label.lineHeight = label.fontSize + 4;
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(250, 250, 250, 255);
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 160) });

        const button = btn.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        btn.on(Button.EventType.CLICK, onClick, this);
        return btn;
    }

    private _ensureAudioChoicePromise(): Promise<boolean> {
        if (this._audioChoicePromise) return this._audioChoicePromise;
        this._audioChoicePromise = new Promise<boolean>(resolve => {
            this._audioChoiceResolver = resolve;
        });
        return this._audioChoicePromise;
    }

    private _resolveAudioChoice(enabled: boolean): void {
        if (this._audioChoiceResolved) return;
        this._audioChoiceResolved = true;
        const resolver = this._audioChoiceResolver;
        this._audioChoiceResolver = null;
        resolver?.(enabled);

        const overlay = this._audioPromptOverlay;
        this._audioPromptOverlay = null;
        if (!overlay || !overlay.isValid) return;
        tween(overlay)
            .to(0.14, { scale: new Vec3(1.02, 1.02, 1) })
            .call(() => {
                if (overlay.isValid) overlay.destroy();
            })
            .start();
    }

    private _shuffleTips(): void {
        // Fisher-Yates shuffle of tip keys array start index
        this._tipIdx = Math.floor(Math.random() * TIP_KEYS.length);
    }

    private _showTip(idx: number): void {
        if (!this._tipLabel) return;
        const key = TIP_KEYS[idx % TIP_KEYS.length];
        const text = Localization.instance.t(key);
        this._tipLabel.node.setScale(new Vec3(0.92, 0.92, 1));
        this._tipLabel.string = text;
        tween(this._tipLabel.node)
            .to(0.25, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private _tryComplete(): void {
        if (this._completeCalled) return;
        if (!this._readyToClose || !this._minDurationElapsed) return;
        this._completeCalled = true;
        // Brief "100% ready" hold, then fade out
        this._displayPct = 1;
        this.scheduleOnce(() => {
            tween(this.node)
                .to(0.35, { scale: new Vec3(1.04, 1.04, 1) })
                .call(() => {
                    this.node.destroy();
                    this._onComplete?.();
                })
                .start();
        }, 0.3);
    }

    private _canvasSize(): { w: number; h: number } {
        const vis = UIResponsive.getVisibleSize();
        if (vis.width > 1 && vis.height > 1) return { w: vis.width, h: vis.height };
        const frame = view.getFrameSize();
        if (frame.width > 1 && frame.height > 1) return { w: frame.width, h: frame.height };
        return { w: 1280, h: 720 };
    }
}
