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
        this.drawSignalInterference(node, color, intensity, 0);

        // 快速闪烁动画
        const peakOpacity = Math.floor(55 + intensity * 110);
        tween(opacity)
            .to(0.018, { opacity: peakOpacity })
            .call(() => this.drawSignalInterference(node, color, intensity, 1))
            .to(0.035, { opacity: Math.floor(peakOpacity * 0.35) })
            .call(() => this.drawSignalInterference(node, color, intensity, 2))
            .to(0.024, { opacity: Math.floor(peakOpacity * 0.9) })
            .call(() => this.drawSignalInterference(node, color, intensity, 3))
            .to(duration * 0.48, { opacity: Math.floor(peakOpacity * 0.45) })
            .to(duration * 0.32, { opacity: 0 })
            .call(() => {
                node.active = false;
                this._playing = false;
            })
            .start();

        // 同时做 XY 方向抖动（模拟信号漂移）
        const shakeAmp = 4 + intensity * 14;
        tween(node)
            .to(0.018, { position: new Vec3(shakeAmp * 0.7, shakeAmp, 0) })
            .to(0.018, { position: new Vec3(-shakeAmp * 0.8, -shakeAmp * 0.65, 0) })
            .to(0.018, { position: new Vec3(shakeAmp * 0.35, shakeAmp * 0.25, 0) })
            .to(0.024, { position: new Vec3(-shakeAmp * 0.2, 0, 0) })
            .to(0.03, { position: new Vec3(0, 0, 0) })
            .start();
    }

    private static getOrCreateOverlay(uiCanvas: Node, color: Color, intensity: number): Node {
        if (this._overlayNode && this._overlayNode.isValid) {
            this.resizeToCanvas(this._overlayNode, uiCanvas);
            this.drawSignalInterference(this._overlayNode, color, intensity, 0);
            return this._overlayNode;
        }

        const node = new Node('GlitchOverlay');
        node.layer = UI_LAYER;
        uiCanvas.addChild(node);

        node.addComponent(UITransform);
        this.resizeToCanvas(node, uiCanvas);

        node.addComponent(UIOpacity);
        this.drawSignalInterference(node, color, intensity, 0);

        this._overlayNode = node;
        return node;
    }

    private static resizeToCanvas(node: Node, uiCanvas: Node): void {
        const transform = node.getComponent(UITransform);
        if (!transform) return;

        const canvasTransform = uiCanvas.getComponent(UITransform);
        const width = canvasTransform ? Math.max(1, canvasTransform.width) : 1400;
        const height = canvasTransform ? Math.max(1, canvasTransform.height) : 900;

        transform.setContentSize(width, height);
        transform.setAnchorPoint(0.5, 0.5);
        node.setPosition(0, 0, 0);
    }

    private static drawSignalInterference(
        node: Node,
        color: Color,
        intensity: number,
        phase: number
    ): void {
        let g = node.getComponent(Graphics);
        if (!g) {
            g = node.addComponent(Graphics);
        }
        g.clear();

        const transform = node.getComponent(UITransform);
        const w = transform?.width ?? 1400;
        const h = transform?.height ?? 900;
        const halfW = w / 2;
        const halfH = h / 2;

        // 极淡底色，避免出现“整块蓝色面板”
        g.fillColor = new Color(color.r, color.g, color.b, Math.floor(4 + intensity * 10));
        g.rect(-halfW, -halfH, w, h);
        g.fill();

        // 主扫描线（带随机撕裂偏移）
        const lineCount = Math.floor(28 + intensity * 44);
        const lineSpacing = h / lineCount;
        for (let i = 0; i < lineCount; i++) {
            const y = -halfH + i * lineSpacing + (Math.random() - 0.5) * 1.5;
            const offsetX = (Math.random() - 0.5) * (10 + intensity * 30);
            const c = (i + phase) % 3;
            const lineColor =
                c === 0
                    ? new Color(color.r, Math.min(255, color.g + 20), color.b, 35 + intensity * 60)
                    : c === 1
                      ? new Color(
                            Math.min(255, color.r + 25),
                            color.g,
                            Math.min(255, color.b + 10),
                            22 + intensity * 45
                        )
                      : new Color(
                            Math.max(0, color.r - 25),
                            Math.min(255, color.g + 30),
                            Math.min(255, color.b + 18),
                            28 + intensity * 50
                        );
            g.strokeColor = lineColor;
            g.lineWidth = 0.8 + intensity * 0.8;
            g.moveTo(-halfW, y);
            g.lineTo(halfW + offsetX, y);
            g.stroke();
        }

        // 水平噪声条（信号干扰条纹）
        const bandCount = Math.floor(3 + intensity * 6);
        for (let i = 0; i < bandCount; i++) {
            const bw = w * (0.2 + Math.random() * 0.55);
            const bh = 1 + Math.random() * (3 + intensity * 4);
            const bx = -halfW + Math.random() * (w - bw);
            const by = -halfH + Math.random() * h;
            g.fillColor = new Color(
                Math.min(255, color.r + 35),
                Math.min(255, color.g + 20),
                Math.min(255, color.b + 15),
                Math.floor(16 + intensity * 42)
            );
            g.rect(bx, by, bw, bh);
            g.fill();
        }

        // 竖向同步毛刺
        const spikeCount = Math.floor(4 + intensity * 8);
        for (let i = 0; i < spikeCount; i++) {
            const x = -halfW + Math.random() * w;
            const spikeH = 28 + Math.random() * (110 + intensity * 90);
            const y0 = -halfH + Math.random() * (h - spikeH);
            g.strokeColor = new Color(
                Math.min(255, color.r + 30),
                Math.min(255, color.g + 35),
                Math.min(255, color.b + 35),
                Math.floor(20 + intensity * 40)
            );
            g.lineWidth = 1;
            g.moveTo(x, y0);
            g.lineTo(x, y0 + spikeH);
            g.stroke();
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
