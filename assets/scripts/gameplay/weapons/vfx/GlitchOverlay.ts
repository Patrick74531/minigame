import { Node, UITransform, Graphics, Color, tween, Vec3, UIOpacity } from 'cc';

/**
 * GlitchOverlay — UI层故障扫描线特效
 *
 * 在UI最上层盖一张半透明的"扫描线"图案，
 * 通过代码控制透明度和偏移来模拟全屏故障效果。
 * 性能开销几乎为零（只是UI层移动一张图）。
 *
 * 用法：GlitchOverlay.flash(uiCanvas, duration, intensity)
 */
const UI_LAYER = 33554432;

export class GlitchOverlay {
    private static _overlayNode: Node | null = null;
    private static _playing: boolean = false;

    /**
     * 播放故障闪屏效果
     * @param uiCanvas  UI画布节点
     * @param duration  持续时间（秒）
     * @param intensity 强度 0~1（控制不透明度和扫描线密度）
     * @param color     主色调
     */
    public static flash(
        uiCanvas: Node,
        duration: number = 0.4,
        intensity: number = 0.6,
        color: Color = new Color(0, 200, 255, 255)
    ): void {
        if (this._playing) return;
        this._playing = true;

        const node = this.getOrCreateOverlay(uiCanvas, color, intensity);
        node.active = true;

        const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        opacity.opacity = 0;

        // 快速闪烁动画
        const peakOpacity = Math.floor(80 + intensity * 120);
        tween(opacity)
            .to(0.03, { opacity: peakOpacity })
            .to(0.05, { opacity: Math.floor(peakOpacity * 0.3) })
            .to(0.03, { opacity: peakOpacity })
            .to(duration * 0.4, { opacity: Math.floor(peakOpacity * 0.5) })
            .to(duration * 0.3, { opacity: 0 })
            .call(() => {
                node.active = false;
                this._playing = false;
            })
            .start();

        // 同时做Y方向抖动（模拟扫描线偏移）
        const shakeAmp = 5 + intensity * 15;
        tween(node)
            .to(0.02, { position: new Vec3(0, shakeAmp, 0) })
            .to(0.02, { position: new Vec3(0, -shakeAmp * 0.7, 0) })
            .to(0.02, { position: new Vec3(0, shakeAmp * 0.4, 0) })
            .to(0.02, { position: new Vec3(0, -shakeAmp * 0.2, 0) })
            .to(0.03, { position: new Vec3(0, 0, 0) })
            .start();
    }

    private static getOrCreateOverlay(uiCanvas: Node, color: Color, intensity: number): Node {
        if (this._overlayNode && this._overlayNode.isValid) {
            // 重绘扫描线
            this.drawScanLines(this._overlayNode, color, intensity);
            return this._overlayNode;
        }

        const node = new Node('GlitchOverlay');
        node.layer = UI_LAYER;
        uiCanvas.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(1400, 900);
        transform.setAnchorPoint(0.5, 0.5);

        node.addComponent(UIOpacity);
        this.drawScanLines(node, color, intensity);

        this._overlayNode = node;
        return node;
    }

    private static drawScanLines(node: Node, color: Color, intensity: number): void {
        let g = node.getComponent(Graphics);
        if (!g) {
            g = node.addComponent(Graphics);
        }
        g.clear();

        const w = 1400;
        const h = 900;
        const halfW = w / 2;
        const halfH = h / 2;

        // 半透明底色
        g.fillColor = new Color(color.r, color.g, color.b, Math.floor(15 + intensity * 25));
        g.rect(-halfW, -halfH, w, h);
        g.fill();

        // 水平扫描线
        const lineCount = Math.floor(20 + intensity * 40);
        const lineSpacing = h / lineCount;
        g.strokeColor = new Color(color.r, color.g, color.b, Math.floor(30 + intensity * 50));
        g.lineWidth = 1 + intensity;

        for (let i = 0; i < lineCount; i++) {
            const y = -halfH + i * lineSpacing;
            g.moveTo(-halfW, y);
            g.lineTo(halfW, y);
        }
        g.stroke();

        // 随机亮块（故障方块）
        const blockCount = Math.floor(3 + intensity * 8);
        for (let i = 0; i < blockCount; i++) {
            const bx = (Math.random() - 0.5) * w;
            const by = (Math.random() - 0.5) * h;
            const bw = 30 + Math.random() * 200;
            const bh = 2 + Math.random() * 6;
            g.fillColor = new Color(
                Math.min(255, color.r + 50),
                Math.min(255, color.g + 50),
                color.b,
                Math.floor(20 + intensity * 40)
            );
            g.rect(bx, by, bw, bh);
            g.fill();
        }
    }

    public static cleanup(): void {
        if (this._overlayNode && this._overlayNode.isValid) {
            this._overlayNode.destroy();
        }
        this._overlayNode = null;
        this._playing = false;
    }
}
