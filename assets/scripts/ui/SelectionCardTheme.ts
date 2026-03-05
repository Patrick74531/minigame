import {
    Color,
    Graphics,
    Label,
    LabelOutline,
    LabelShadow,
    Node,
    UITransform,
    Vec3,
    tween,
} from 'cc';

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

        const BTN_W = Math.round(Math.max(220, options?.width ?? 280));
        const BTN_H = Math.round(Math.max(46, options?.height ?? 52));
        const RADIUS = 14;
        const fontSize = Math.max(16, options?.fontSize ?? 18);

        const btn = new Node('AdButton');
        btn.layer = parent.layer;
        parent.addChild(btn);
        btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        btn.setPosition(pos.x, pos.y, 0);

        // 按钮背景
        const g = btn.addComponent(Graphics);
        const baseColor = new Color(46, 196, 88, 255);
        g.fillColor = baseColor;
        g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, RADIUS);
        g.fill();
        // 内发光边框
        g.strokeColor = new Color(140, 255, 170, 200);
        g.lineWidth = 2;
        g.roundRect(-BTN_W / 2 + 1, -BTN_H / 2 + 1, BTN_W - 2, BTN_H - 2, RADIUS - 1);
        g.stroke();
        // 外边框
        g.strokeColor = new Color(20, 80, 40, 220);
        g.lineWidth = 2.5;
        g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, RADIUS);
        g.stroke();

        // 广告图标 ▶
        const iconNode = new Node('AdIcon');
        iconNode.layer = btn.layer;
        btn.addChild(iconNode);
        iconNode.addComponent(UITransform).setContentSize(30, 30);
        iconNode.setPosition(-BTN_W / 2 + 28, 0, 0);
        const iconLabel = iconNode.addComponent(Label);
        iconLabel.string = '▶';
        iconLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        iconLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.applyLabelTheme(iconLabel, {
            fontSize: Math.max(16, fontSize - 1),
            lineHeight: Math.max(20, fontSize + 2),
            color: new Color(255, 255, 255, 255),
            outlineWidth: 0,
        });

        // 按钮文字
        const labelNode = new Node('AdLabel');
        labelNode.layer = btn.layer;
        btn.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(BTN_W - 60, BTN_H - 8);
        labelNode.setPosition(12, 0, 0);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        this.applyLabelTheme(label, {
            fontSize,
            lineHeight: Math.max(22, fontSize + 4),
            color: new Color(255, 255, 255, 255),
            bold: true,
            outlineColor: new Color(10, 60, 24, 255),
            outlineWidth: 2,
            shadowColor: new Color(0, 0, 0, 120),
            shadowOffsetY: -1,
        });

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

        // 入场动画
        btn.setScale(0, 0, 1);
        tween(btn)
            .delay(0.35)
            .to(0.22, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();

        return btn;
    }

    public static drawOverlayMask(bg: Graphics, width: number, height: number): void {
        bg.clear();
        bg.fillColor = new Color(5, 10, 18, 182);
        bg.rect(-width * 0.5, -height * 0.5, width, height);
        bg.fill();

        bg.strokeColor = new Color(108, 190, 244, 48);
        bg.lineWidth = 1.5;
        bg.rect(-width * 0.5 + 14, -height * 0.5 + 14, width - 28, height - 28);
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

        bg.clear();

        bg.fillColor = new Color(12, 20, 34, 244);
        bg.roundRect(-width * 0.5, -height * 0.5, width, height, outerRadius);
        bg.fill();

        bg.fillColor = new Color(30, 48, 70, 120);
        bg.roundRect(-width * 0.5 + 8, -height * 0.5 + 8, width - 16, height - 16, innerRadius);
        bg.fill();

        bg.strokeColor = this.blendColor(accent, new Color(255, 232, 184, 255), 0.22);
        bg.lineWidth = 3.2;
        bg.roundRect(-width * 0.5, -height * 0.5, width, height, outerRadius);
        bg.stroke();

        const headerColor = this.blendColor(accent, new Color(255, 176, 86, 255), 0.2);
        bg.fillColor = headerColor;
        bg.roundRect(-width * 0.5, height * 0.5 - headerHeight, width, headerHeight, outerRadius);
        bg.fill();
        bg.fillColor = headerColor;
        bg.rect(-width * 0.5, height * 0.5 - headerHeight, width, outerRadius);
        bg.fill();

        bg.strokeColor = new Color(255, 244, 214, 160);
        bg.lineWidth = 1.2;
        bg.roundRect(-width * 0.5 + 7, -height * 0.5 + 7, width - 14, height - 14, innerRadius);
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
}
