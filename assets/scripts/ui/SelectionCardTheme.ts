import {
    Color,
    Graphics,
    Label,
    LabelOutline,
    LabelShadow,
    Node,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
} from 'cc';
import { UIResponsive } from './UIResponsive';

export type LabelThemeOptions = {
    fontSize?: number;
    lineHeight?: number;
    color?: Color;
    bold?: boolean;
    hAlign?: Label.HorizontalAlign;
    vAlign?: Label.VerticalAlign;
    outlineColor?: Color;
    outlineWidth?: number;
    shadowColor?: Color;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    shadowBlur?: number;
};

export type AdButtonOptions = {
    width?: number;
    height?: number;
    fontSize?: number;
    subtitle?: string;
    subtitleFontSize?: number;
};

export type GrantToken = {
    text: string;
    color?: Color;
};

export type GrantAnimationOptions = {
    message: string;
    tokens: GrantToken[];
    targetNodeName?: string;
    fallbackTarget?: { x: number; y: number };
};

export class SelectionCardTheme {
    public static isTikTokRuntime(): boolean {
        const g = globalThis as any;
        return g?.__GVR_PLATFORM__ === 'tiktok' || typeof g?.tt !== 'undefined';
    }

    /**
     * 创建广告按钮（游戏风格，带广告图标）。
     * 仅在 TikTok 环境下可见。
     * @param parent 父节点
     * @param text   按钮文字
     * @param pos    按钮中心位置
     * @param onTap  点击回调
     * @returns 按钮节点（可用于后续销毁），非 TikTok 环境返回 null
     */
    public static createAdButton(
        parent: Node,
        text: string,
        pos: { x: number; y: number },
        onTap: () => void,
        options?: AdButtonOptions
    ): Node | null {
        if (!this.isTikTokRuntime()) return null;

        const BTN_W = Math.round(Math.max(228, options?.width ?? 280));
        const subtitle = options?.subtitle?.trim() ?? '';
        const hasSubtitle = subtitle.length > 0;
        const BTN_H = Math.round(Math.max(hasSubtitle ? 78 : 60, options?.height ?? 60));
        const RADIUS = Math.round(Math.max(16, BTN_H * 0.32));
        const fontSize = Math.max(16, options?.fontSize ?? 17);
        const subtitleFontSize = Math.max(10, options?.subtitleFontSize ?? 11);

        const btn = new Node('AdButton');
        btn.layer = parent.layer;
        parent.addChild(btn);
        btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        btn.setPosition(pos.x, pos.y, 0);

        const haloNode = new Node('AdHalo');
        haloNode.layer = btn.layer;
        btn.addChild(haloNode);
        haloNode.addComponent(UITransform).setContentSize(BTN_W + 20, BTN_H + 18);
        const haloOpacity = haloNode.addComponent(UIOpacity);
        haloOpacity.opacity = 82;
        const haloGraphics = haloNode.addComponent(Graphics);
        this.drawAdButtonHalo(haloGraphics, BTN_W, BTN_H, RADIUS);

        const bgNode = new Node('AdSurface');
        bgNode.layer = btn.layer;
        btn.addChild(bgNode);
        bgNode.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const bgGraphics = bgNode.addComponent(Graphics);
        this.drawAdButtonSurface(bgGraphics, BTN_W, BTN_H, RADIUS);

        const iconNode = new Node('AdIconBadge');
        iconNode.layer = btn.layer;
        btn.addChild(iconNode);
        const iconSize = Math.round(Math.max(34, BTN_H * 0.62));
        iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
        iconNode.setPosition(-BTN_W / 2 + iconSize * 0.58 + 12, 0, 0);
        const iconGraphics = iconNode.addComponent(Graphics);
        this.drawAdButtonIcon(iconGraphics, iconSize);

        const iconLabelNode = new Node('AdIconLabel');
        iconLabelNode.layer = iconNode.layer;
        iconNode.addChild(iconLabelNode);
        iconLabelNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
        const iconLabel = iconLabelNode.addComponent(Label);
        iconLabel.string = '▶';
        iconLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        iconLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.applyLabelTheme(iconLabel, {
            fontSize: Math.max(16, fontSize + 1),
            lineHeight: Math.max(20, fontSize + 4),
            color: new Color(22, 84, 51, 255),
            bold: true,
            outlineWidth: 0,
        });

        const tagNode = new Node('AdTag');
        tagNode.layer = btn.layer;
        btn.addChild(tagNode);
        const tagW = 34;
        const tagH = 18;
        tagNode.addComponent(UITransform).setContentSize(tagW, tagH);
        tagNode.setPosition(BTN_W / 2 - tagW * 0.5 - 12, BTN_H / 2 - tagH * 0.5 - 8, 0);
        const tagGraphics = tagNode.addComponent(Graphics);
        this.drawAdButtonTag(tagGraphics, tagW, tagH);
        const tagLabelNode = new Node('AdTagLabel');
        tagLabelNode.layer = tagNode.layer;
        tagNode.addChild(tagLabelNode);
        tagLabelNode.addComponent(UITransform).setContentSize(tagW - 6, tagH - 2);
        const tagLabel = tagLabelNode.addComponent(Label);
        tagLabel.string = 'AD';
        tagLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        tagLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.applyLabelTheme(tagLabel, {
            fontSize: 10,
            lineHeight: 12,
            color: new Color(22, 84, 51, 255),
            bold: true,
            outlineWidth: 0,
        });

        const cueNode = new Node('AdCue');
        cueNode.layer = btn.layer;
        btn.addChild(cueNode);
        const cueSize = 18;
        cueNode.addComponent(UITransform).setContentSize(cueSize, cueSize);
        cueNode.setPosition(BTN_W / 2 - 24, hasSubtitle ? -3 : -1, 0);
        const cueGraphics = cueNode.addComponent(Graphics);
        this.drawAdButtonCue(cueGraphics, cueSize, new Color(255, 238, 188, 220));

        const contentLeft = -BTN_W * 0.5 + iconSize + 18;
        const contentRight = BTN_W * 0.5 - 42;
        const contentWidth = Math.max(110, Math.round(contentRight - contentLeft));
        const contentCenterX = Math.round((contentLeft + contentRight) * 0.5);
        const titleY = hasSubtitle ? Math.round(BTN_H * 0.16) : -1;
        const dividerY = hasSubtitle ? -2 : -BTN_H * 0.18;
        const subtitleY = Math.round(-BTN_H * 0.22);

        const titleNode = new Node('AdTitle');
        titleNode.layer = btn.layer;
        btn.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(contentWidth, Math.round(BTN_H * 0.3));
        titleNode.setPosition(contentCenterX, titleY, 0);
        const label = titleNode.addComponent(Label);
        label.string = text;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        this.applyLabelTheme(label, {
            fontSize,
            lineHeight: Math.max(22, fontSize + 4),
            color: new Color(248, 255, 238, 255),
            bold: true,
            outlineColor: new Color(10, 62, 34, 255),
            outlineWidth: 2,
            hAlign: Label.HorizontalAlign.LEFT,
            shadowColor: new Color(0, 0, 0, 120),
            shadowOffsetY: -1,
        });

        if (hasSubtitle) {
            const dividerNode = new Node('AdDivider');
            dividerNode.layer = btn.layer;
            btn.addChild(dividerNode);
            dividerNode.addComponent(UITransform).setContentSize(contentWidth, 4);
            dividerNode.setPosition(contentCenterX, dividerY, 0);
            const dividerGraphics = dividerNode.addComponent(Graphics);
            this.drawAdButtonDivider(dividerGraphics, contentWidth);

            const subtitleNode = new Node('AdSubtitle');
            subtitleNode.layer = btn.layer;
            btn.addChild(subtitleNode);
            subtitleNode
                .addComponent(UITransform)
                .setContentSize(contentWidth, Math.round(BTN_H * 0.22));
            subtitleNode.setPosition(contentCenterX, subtitleY, 0);
            const subtitleLabel = subtitleNode.addComponent(Label);
            subtitleLabel.string = subtitle;
            subtitleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
            subtitleLabel.verticalAlign = Label.VerticalAlign.CENTER;
            subtitleLabel.overflow = Label.Overflow.SHRINK;
            subtitleLabel.enableWrapText = false;
            this.applyLabelTheme(subtitleLabel, {
                fontSize: subtitleFontSize,
                lineHeight: subtitleFontSize + 4,
                color: new Color(228, 251, 208, 236),
                outlineColor: new Color(10, 62, 34, 255),
                outlineWidth: 1,
                hAlign: Label.HorizontalAlign.LEFT,
            });
        }

        // 按钮交互：允许重复点击（广告取消后可再次尝试）
        let tapping = false;
        btn.on(Node.EventType.TOUCH_START, () => {
            if (tapping) return;
            btn.setScale(0.97, 0.97, 1);
        });
        btn.on(Node.EventType.TOUCH_CANCEL, () => {
            if (tapping) return;
            btn.setScale(1, 1, 1);
        });
        btn.on(Node.EventType.TOUCH_END, () => {
            if (tapping) return;
            tapping = true;
            tween(btn)
                .to(0.08, { scale: new Vec3(1.04, 1.04, 1) })
                .to(0.08, { scale: new Vec3(1, 1, 1) })
                .call(() => {
                    try {
                        onTap();
                    } finally {
                        tapping = false;
                    }
                })
                .start();
        });

        tween(haloNode)
            .repeatForever(
                tween()
                    .to(
                        0.9,
                        { scale: new Vec3(1.05, 1.08, 1) },
                        { easing: 'sineInOut' }
                    )
                    .to(0.9, { scale: new Vec3(0.98, 1, 1) }, { easing: 'sineInOut' })
            )
            .start();
        tween(haloOpacity)
            .repeatForever(
                tween()
                    .to(0.9, { opacity: 48 }, { easing: 'sineInOut' })
                    .to(0.9, { opacity: 92 }, { easing: 'sineInOut' })
            )
            .start();

        // 入场动画
        btn.setScale(0, 0, 1);
        tween(btn)
            .delay(0.35)
            .to(0.22, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();

        return btn;
    }

    private static drawAdButtonHalo(g: Graphics, width: number, height: number, radius: number): void {
        g.clear();
        g.fillColor = new Color(131, 255, 173, 110);
        g.roundRect(
            -width * 0.5 - 6,
            -height * 0.5 - 4,
            width + 12,
            height + 8,
            radius + 8
        );
        g.fill();
    }

    private static drawAdButtonSurface(
        g: Graphics,
        width: number,
        height: number,
        radius: number
    ): void {
        g.clear();

        g.fillColor = new Color(7, 34, 22, 148);
        g.roundRect(-width * 0.5, -height * 0.5 - 3, width, height, radius);
        g.fill();

        g.fillColor = new Color(16, 92, 56, 255);
        g.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
        g.fill();

        g.fillColor = new Color(34, 187, 104, 255);
        g.roundRect(
            -width * 0.5 + 2,
            -height * 0.5 + 3,
            width - 4,
            height - 6,
            Math.max(10, radius - 2)
        );
        g.fill();

        const lowerBandHeight = Math.max(16, Math.round(height * 0.38));
        g.fillColor = new Color(12, 121, 66, 150);
        g.roundRect(
            -width * 0.5 + 2,
            -height * 0.5 + 3,
            width - 4,
            lowerBandHeight,
            Math.max(10, radius - 4)
        );
        g.fill();

        const sheenInset = 8;
        const sheenHeight = Math.max(14, Math.round(height * 0.34));
        g.fillColor = new Color(190, 255, 214, 56);
        g.roundRect(
            -width * 0.5 + sheenInset,
            Math.round(height * 0.02),
            width - sheenInset * 2,
            sheenHeight,
            Math.max(10, radius - 7)
        );
        g.fill();

        g.strokeColor = new Color(226, 255, 214, 214);
        g.lineWidth = 2;
        g.roundRect(
            -width * 0.5 + 1,
            -height * 0.5 + 1,
            width - 2,
            height - 2,
            Math.max(10, radius - 1)
        );
        g.stroke();

        g.strokeColor = new Color(255, 220, 126, 146);
        g.lineWidth = 1.5;
        g.moveTo(-width * 0.32, -height * 0.18);
        g.lineTo(width * 0.34, -height * 0.18);
        g.stroke();
    }

    private static drawAdButtonDivider(g: Graphics, width: number): void {
        g.clear();
        g.strokeColor = new Color(244, 231, 158, 190);
        g.lineWidth = 1.8;
        g.moveTo(-width * 0.5, 0);
        g.lineTo(width * 0.5, 0);
        g.stroke();
    }

    private static drawAdButtonIcon(g: Graphics, size: number): void {
        const radius = Math.max(10, Math.round(size * 0.28));
        g.clear();
        g.fillColor = new Color(255, 208, 96, 255);
        g.roundRect(-size * 0.5, -size * 0.5, size, size, radius);
        g.fill();

        g.fillColor = new Color(255, 243, 188, 92);
        g.roundRect(
            -size * 0.5 + 3,
            Math.round(size * 0.02),
            size - 6,
            Math.round(size * 0.3),
            Math.max(8, radius - 4)
        );
        g.fill();

        g.strokeColor = new Color(255, 249, 220, 232);
        g.lineWidth = 1.6;
        g.roundRect(-size * 0.5 + 1, -size * 0.5 + 1, size - 2, size - 2, Math.max(8, radius - 1));
        g.stroke();
    }

    private static drawAdButtonTag(g: Graphics, width: number, height: number): void {
        const radius = Math.max(8, Math.round(height * 0.48));
        g.clear();
        g.fillColor = new Color(255, 234, 166, 236);
        g.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
        g.fill();
        g.strokeColor = new Color(255, 249, 214, 220);
        g.lineWidth = 1.2;
        g.roundRect(
            -width * 0.5 + 0.6,
            -height * 0.5 + 0.6,
            width - 1.2,
            height - 1.2,
            Math.max(6, radius - 1)
        );
        g.stroke();
    }

    private static drawAdButtonCue(g: Graphics, size: number, color: Color): void {
        g.clear();
        g.strokeColor = color;
        g.lineWidth = 2.4;
        g.moveTo(-size * 0.22, -size * 0.26);
        g.lineTo(-size * 0.02, 0);
        g.lineTo(-size * 0.22, size * 0.26);
        g.stroke();
        g.moveTo(size * 0.02, -size * 0.26);
        g.lineTo(size * 0.22, 0);
        g.lineTo(size * 0.02, size * 0.26);
        g.stroke();
    }

    public static drawOverlayMask(bg: Graphics, width: number, height: number): void {
        bg.clear();
        const halfW = width * 0.5;
        const halfH = height * 0.5;
        const corner = Math.round(Math.max(42, Math.min(96, Math.min(width, height) * 0.1)));
        const inset = 20;

        // No fullscreen dim layer; only draw decorative frame corners.
        bg.strokeColor = new Color(102, 212, 255, 86);
        bg.lineWidth = 3;

        // top-left
        bg.moveTo(-halfW + inset, halfH - inset - corner);
        bg.lineTo(-halfW + inset, halfH - inset);
        bg.lineTo(-halfW + inset + corner, halfH - inset);
        bg.stroke();

        // top-right
        bg.moveTo(halfW - inset - corner, halfH - inset);
        bg.lineTo(halfW - inset, halfH - inset);
        bg.lineTo(halfW - inset, halfH - inset - corner);
        bg.stroke();

        // bottom-left
        bg.moveTo(-halfW + inset, -halfH + inset + corner);
        bg.lineTo(-halfW + inset, -halfH + inset);
        bg.lineTo(-halfW + inset + corner, -halfH + inset);
        bg.stroke();

        // bottom-right
        bg.moveTo(halfW - inset - corner, -halfH + inset);
        bg.lineTo(halfW - inset, -halfH + inset);
        bg.lineTo(halfW - inset, -halfH + inset + corner);
        bg.stroke();

        const centerLineW = Math.round(Math.max(140, Math.min(280, width * 0.24)));
        bg.strokeColor = new Color(255, 194, 102, 96);
        bg.lineWidth = 2;
        bg.moveTo(-centerLineW * 0.5, halfH - inset - 2);
        bg.lineTo(centerLineW * 0.5, halfH - inset - 2);
        bg.stroke();
        bg.moveTo(-centerLineW * 0.5, -halfH + inset + 2);
        bg.lineTo(centerLineW * 0.5, -halfH + inset + 2);
        bg.stroke();
    }

    public static drawCardBackground(
        bg: Graphics,
        width: number,
        height: number,
        accent: Color,
        headerHeight: number = 72
    ): void {
        const outerRadius = 18;
        const innerRadius = 14;
        const halfW = width * 0.5;
        const halfH = height * 0.5;
        const inset = 8;
        const edgeInset = 13;
        const headerBottomY = halfH - headerHeight;

        bg.clear();

        // Base armor plate.
        bg.fillColor = new Color(8, 16, 30, 248);
        bg.roundRect(-width * 0.5, -height * 0.5, width, height, outerRadius);
        bg.fill();

        // Inner body.
        bg.fillColor = new Color(14, 28, 48, 236);
        bg.roundRect(
            -width * 0.5 + inset,
            -height * 0.5 + inset,
            width - inset * 2,
            height - inset * 2,
            innerRadius
        );
        bg.fill();

        // Accent wash to avoid flat looking cards.
        bg.fillColor = new Color(
            Math.round(accent.r * 0.34),
            Math.round(accent.g * 0.34),
            Math.round(accent.b * 0.34),
            52
        );
        bg.roundRect(
            -width * 0.5 + edgeInset,
            -height * 0.5 + edgeInset,
            width - edgeInset * 2,
            height - edgeInset * 2,
            innerRadius - 2
        );
        bg.fill();

        // Outer frame.
        bg.strokeColor = this.blendColor(accent, new Color(255, 232, 184, 255), 0.22);
        bg.lineWidth = 3.2;
        bg.roundRect(-width * 0.5, -height * 0.5, width, height, outerRadius);
        bg.stroke();

        // Header strip.
        const headerColor = this.blendColor(accent, new Color(255, 176, 86, 255), 0.2);
        bg.fillColor = headerColor;
        bg.roundRect(-width * 0.5, height * 0.5 - headerHeight, width, headerHeight, outerRadius);
        bg.fill();
        bg.fillColor = headerColor;
        bg.rect(-width * 0.5, height * 0.5 - headerHeight, width, outerRadius);
        bg.fill();

        // Header divider.
        bg.strokeColor = this.blendColor(accent, new Color(255, 242, 210, 255), 0.35);
        bg.lineWidth = 2;
        bg.moveTo(-halfW + 16, headerBottomY);
        bg.lineTo(halfW - 16, headerBottomY);
        bg.stroke();

        // Inner frame.
        bg.strokeColor = new Color(255, 244, 214, 160);
        bg.lineWidth = 1.2;
        bg.roundRect(-width * 0.5 + 7, -height * 0.5 + 7, width - 14, height - 14, innerRadius);
        bg.stroke();

        // Corner trims.
        const trimLen = Math.min(24, Math.round(width * 0.1));
        bg.strokeColor = this.blendColor(accent, new Color(130, 236, 255, 255), 0.42);
        bg.lineWidth = 2;
        bg.moveTo(-halfW + 10, halfH - 10 - trimLen);
        bg.lineTo(-halfW + 10, halfH - 10);
        bg.lineTo(-halfW + 10 + trimLen, halfH - 10);
        bg.stroke();
        bg.moveTo(halfW - 10 - trimLen, halfH - 10);
        bg.lineTo(halfW - 10, halfH - 10);
        bg.lineTo(halfW - 10, halfH - 10 - trimLen);
        bg.stroke();
        bg.moveTo(-halfW + 10, -halfH + 10 + trimLen);
        bg.lineTo(-halfW + 10, -halfH + 10);
        bg.lineTo(-halfW + 10 + trimLen, -halfH + 10);
        bg.stroke();
        bg.moveTo(halfW - 10 - trimLen, -halfH + 10);
        bg.lineTo(halfW - 10, -halfH + 10);
        bg.lineTo(halfW - 10, -halfH + 10 + trimLen);
        bg.stroke();
    }

    public static applyLabelTheme(label: Label, options?: LabelThemeOptions): void {
        const isTikTok = this.isTikTokRuntime();
        // Prefer NONE cache for cross-platform stability (TikTok + Reddit).
        label.cacheMode = Label.CacheMode.NONE;
        label.useSystemFont = true;
        label.fontFamily = 'sans-serif';

        if (options?.fontSize !== undefined) {
            label.fontSize = options.fontSize;
        }
        if (options?.lineHeight !== undefined) {
            label.lineHeight = options.lineHeight;
        }
        if (options?.color) {
            label.color = options.color;
        }
        if (options?.bold !== undefined) {
            label.isBold = options.bold;
        }
        if (options?.hAlign !== undefined) {
            label.horizontalAlign = options.hAlign;
        }
        if (options?.vAlign !== undefined) {
            label.verticalAlign = options.vAlign;
        }

        const outline =
            label.node.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline);
        outline.color = options?.outlineColor ?? new Color(10, 18, 30, 255);
        outline.width = isTikTok ? 0 : (options?.outlineWidth ?? 3);
        outline.enabled = outline.width > 0;

        const shadow = label.node.getComponent(LabelShadow) ?? label.node.addComponent(LabelShadow);
        shadow.color = options?.shadowColor ?? new Color(0, 0, 0, 168);
        shadow.offset.set(options?.shadowOffsetX ?? 2, options?.shadowOffsetY ?? -2);
        shadow.blur = options?.shadowBlur ?? 2;
        shadow.enabled = !isTikTok;

        this.refreshLabelRender(label, isTikTok);
    }

    private static refreshLabelRender(label: Label, isTikTok: boolean): void {
        const refresh = () => {
            if (!label?.isValid) return;
            if (typeof label.markForUpdateRenderData === 'function') {
                label.markForUpdateRenderData(true);
            } else if (typeof label.updateRenderData === 'function') {
                label.updateRenderData(true);
            }
        };
        refresh();
        setTimeout(refresh, 0);
        setTimeout(refresh, 120);
        if (isTikTok) {
            setTimeout(refresh, 450);
            setTimeout(refresh, 1200);
        }
    }

    public static createBadge(
        parent: Node,
        text: string,
        accent: Color,
        size: { w: number; h: number },
        pos: { x: number; y: number },
        textColor?: Color
    ): Node {
        const node = new Node('CardBadge');
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(size.w, size.h);
        node.setPosition(pos.x, pos.y, 0);

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(16, 30, 46, 244);
        g.roundRect(-size.w / 2, -size.h / 2, size.w, size.h, Math.max(8, size.h * 0.32));
        g.fill();
        g.strokeColor = accent;
        g.lineWidth = 2;
        g.roundRect(-size.w / 2, -size.h / 2, size.w, size.h, Math.max(8, size.h * 0.32));
        g.stroke();

        const labelNode = new Node('CardBadgeLabel');
        node.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(size.w - 6, size.h - 4);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        this.applyLabelTheme(label, {
            fontSize: Math.max(12, Math.round(size.h * 0.46)),
            lineHeight: Math.max(14, Math.round(size.h * 0.56)),
            color: textColor ?? new Color(170, 255, 194, 255),
            outlineColor: new Color(8, 20, 32, 255),
            outlineWidth: 2,
            shadowBlur: 1,
        });

        return node;
    }

    public static playCardReveal(card: Node, index: number): void {
        const opacity = card.getComponent('cc.UIOpacity');
        if (opacity && typeof opacity.destroy === 'function') {
            opacity.destroy();
        }
        card.setScale(0.82, 0.82, 1);

        tween(card)
            .delay(index * 0.1)
            .to(0.25, { scale: new Vec3(1.03, 1.03, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    public static bindCardClick(node: Node, onSelect: () => void): void {
        let triggered = false;

        node.on(Node.EventType.TOUCH_START, () => {
            if (triggered) return;
            node.setScale(0.97, 0.97, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => {
            if (triggered) return;
            node.setScale(1, 1, 1);
        });
        node.on(Node.EventType.TOUCH_END, () => {
            if (triggered) return;
            triggered = true;
            tween(node)
                .to(0.08, { scale: new Vec3(1.04, 1.04, 1) })
                .to(0.08, { scale: new Vec3(1, 1, 1) })
                .call(onSelect)
                .start();
        });
    }

    public static blendColor(a: Color, b: Color, t: number): Color {
        const clamped = Math.max(0, Math.min(1, t));
        return new Color(
            Math.round(a.r + (b.r - a.r) * clamped),
            Math.round(a.g + (b.g - a.g) * clamped),
            Math.round(a.b + (b.b - a.b) * clamped),
            Math.round(a.a + (b.a - a.a) * clamped)
        );
    }

    public static playGrantAnimation(parent: Node, options: GrantAnimationOptions): void {
        if (!parent?.isValid || !options || options.tokens.length <= 0) return;
        const parentTf = parent.getComponent(UITransform);
        const width = parentTf?.contentSize.width ?? 1280;
        const height = parentTf?.contentSize.height ?? 720;
        const isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();
        const padding = UIResponsive.getControlPadding();

        const overlay = new Node('GrantAnimOverlay');
        overlay.layer = parent.layer;
        parent.addChild(overlay);
        overlay.addComponent(UITransform).setContentSize(width, height);
        overlay.addComponent(UIOpacity).opacity = 255;

        const messageNode = new Node('GrantAnimMessage');
        messageNode.layer = overlay.layer;
        overlay.addChild(messageNode);
        const messageWidth = Math.round(
            Math.max(
                isTikTokPortrait ? 300 : 360,
                Math.min(
                    width - padding.left - padding.right - (isTikTokPortrait ? 20 : 48),
                    width * (isTikTokPortrait ? 0.9 : 0.72)
                )
            )
        );
        const messageHeight = isTikTokPortrait ? 110 : 68;
        messageNode.addComponent(UITransform).setContentSize(messageWidth, messageHeight);
        const topOffset = Math.round(
            Math.max(
                padding.top + (isTikTokPortrait ? 20 : 16),
                height * (isTikTokPortrait ? 0.065 : 0.1)
            )
        );
        messageNode.setPosition(0, Math.round(height * 0.5 - topOffset - messageHeight * 0.5), 0);
        const messageLabel = messageNode.addComponent(Label);
        messageLabel.string = options.message;
        messageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        messageLabel.verticalAlign = Label.VerticalAlign.CENTER;
        messageLabel.enableWrapText = true;
        messageLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        this.applyLabelTheme(messageLabel, {
            fontSize: isTikTokPortrait ? 20 : 24,
            lineHeight: isTikTokPortrait ? 26 : 30,
            color: new Color(255, 244, 214, 255),
            bold: true,
            outlineColor: new Color(10, 18, 30, 255),
            outlineWidth: 2,
        });

        const target = this.resolveGrantTarget(parent, options, width, height);
        const centerY = Math.round(height * -0.03);
        const startSpan = Math.min(240, 76 * Math.max(1, options.tokens.length - 1));
        const baseX = -startSpan * 0.5;

        options.tokens.forEach((token, index) => {
            const tokenNode = new Node(`GrantToken_${index}`);
            tokenNode.layer = overlay.layer;
            overlay.addChild(tokenNode);
            tokenNode.addComponent(UITransform).setContentSize(54, 54);
            tokenNode.setScale(0.2, 0.2, 1);
            tokenNode.setPosition(
                baseX + (startSpan * index) / Math.max(1, options.tokens.length - 1),
                centerY,
                0
            );

            const g = tokenNode.addComponent(Graphics);
            const accent = token.color ?? new Color(255, 205, 96, 255);
            g.fillColor = new Color(18, 24, 38, 244);
            g.roundRect(-27, -27, 54, 54, 14);
            g.fill();
            g.strokeColor = accent;
            g.lineWidth = 2;
            g.roundRect(-27, -27, 54, 54, 14);
            g.stroke();

            const textNode = new Node('TokenText');
            textNode.layer = overlay.layer;
            tokenNode.addChild(textNode);
            textNode.addComponent(UITransform).setContentSize(48, 48);
            const textLabel = textNode.addComponent(Label);
            textLabel.string = token.text;
            textLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            textLabel.verticalAlign = Label.VerticalAlign.CENTER;
            textLabel.overflow = Label.Overflow.SHRINK;
            this.applyLabelTheme(textLabel, {
                fontSize: 22,
                lineHeight: 26,
                color: new Color(255, 255, 255, 255),
                bold: true,
                outlineColor: new Color(8, 12, 24, 255),
                outlineWidth: 1,
            });

            const jitterX = (index - (options.tokens.length - 1) * 0.5) * 8;
            const jitterY = ((index % 2) * 2 - 1) * 8;
            tween(tokenNode)
                .delay(index * 0.06)
                .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .to(
                    0.42,
                    {
                        position: new Vec3(target.x + jitterX, target.y + jitterY, 0),
                        scale: new Vec3(0.26, 0.26, 1),
                    },
                    { easing: 'quadIn' }
                )
                .call(() => tokenNode.destroy())
                .start();
        });

        tween(overlay)
            .delay(1.1)
            .call(() => {
                if (!overlay.isValid) return;
                overlay.destroy();
            })
            .start();
    }

    private static resolveGrantTarget(
        parent: Node,
        options: GrantAnimationOptions,
        width: number,
        height: number
    ): { x: number; y: number } {
        if (options.fallbackTarget) {
            const fallback = options.fallbackTarget;
            if (!options.targetNodeName) {
                return { x: fallback.x, y: fallback.y };
            }
        }

        if (options.targetNodeName) {
            const targetNode = this.findNodeByName(parent, options.targetNodeName);
            const parentTf = parent.getComponent(UITransform);
            if (targetNode && targetNode.isValid && parentTf) {
                const world = targetNode.worldPosition;
                const local = parentTf.convertToNodeSpaceAR(world);
                return { x: local.x, y: local.y };
            }
        }

        if (options.fallbackTarget) return options.fallbackTarget;
        return { x: 0, y: -height * 0.32 + Math.min(120, width * 0.06) };
    }

    private static findNodeByName(root: Node, targetName: string): Node | null {
        if (!root?.isValid) return null;
        if (root.name === targetName) return root;
        const children = root.children;
        for (const child of children) {
            const found = this.findNodeByName(child, targetName);
            if (found) return found;
        }
        return null;
    }
}
