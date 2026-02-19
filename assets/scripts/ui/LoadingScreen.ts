import {
    _decorator,
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
    private _loadDone = false;
    private readonly MIN_DURATION = 1.5; // at least 1.5 s so bar feels meaningful
    private _elapsed = 0;

    private _uiLayer = Layers.Enum.UI_2D;

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

    /** Call with loaded/total counts as Phase1 loads. */
    public setProgress(loaded: number, total: number): void {
        this._progress = total > 0 ? loaded / total : 1;
        if (loaded >= total) {
            this._loadDone = true;
            this._tryComplete();
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    protected onLoad(): void {
        this._buildUI();
        this._shuffleTips();
        this._showTip(0);
        this.scheduleOnce(() => {
            this._minDurationElapsed = true;
            this._tryComplete();
        }, this.MIN_DURATION);
    }

    protected update(dt: number): void {
        this._elapsed += dt;

        // Smooth display progress towards actual
        const speed = 1.8;
        if (this._displayPct < this._progress) {
            this._displayPct = Math.min(this._progress, this._displayPct + speed * dt);
        }
        // Force to 100 when fully done
        if (this._loadDone && this._minDurationElapsed) {
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

        // Load homepage background
        resources.load('ui/homepage', Texture2D, (err, tex) => {
            if (!err && tex && bg.isValid) {
                const sf = new SpriteFrame();
                sf.texture = tex;
                sprite.spriteFrame = sf;
            } else if (err) {
                resources.load('ui/homepage', ImageAsset, (err2, img) => {
                    if (err2 || !img || !bg.isValid) return;
                    const t = new Texture2D();
                    t.image = img;
                    const sf = new SpriteFrame();
                    sf.texture = t;
                    sprite.spriteFrame = sf;
                });
            }
        });

        return bg;
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
        if (!this._loadDone || !this._minDurationElapsed) return;
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
