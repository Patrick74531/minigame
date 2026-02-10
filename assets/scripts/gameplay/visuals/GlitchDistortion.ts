import { _decorator, Component, Sprite, Color, Vec3, tween } from 'cc';
const { ccclass } = _decorator;

/**
 * GlitchDistortion — 纯代码视觉扭曲效果
 *
 * 在敌人身上产生"信号干扰"视觉：
 * - 色彩闪变（RGB 通道偏移模拟）
 * - 缩放抖动
 * - 位置微震
 *
 * 无需自定义 Shader，兼容性最好。
 */
@ccclass('GlitchDistortion')
export class GlitchDistortion extends Component {
    private _sprites: Sprite[] = [];
    private _originalColors: Color[] = [];
    private _originalScale: Vec3 = new Vec3();
    private _originalPos: Vec3 = new Vec3();
    private _elapsed: number = 0;
    private _duration: number = 0.6;
    private _maxStrength: number = 1.0;
    private _active: boolean = false;

    public init(duration: number, maxStrength: number): void {
        this._duration = duration;
        this._maxStrength = maxStrength;
        this._elapsed = 0;

        // 收集所有 Sprite（含子节点 paper-doll 部件）
        this._sprites = this.node.getComponentsInChildren(Sprite);
        this._originalColors = this._sprites.map(s => s.color.clone());
        this._originalScale.set(this.node.scale);
        this._originalPos.set(this.node.position);
        this._active = true;
    }

    protected update(dt: number): void {
        if (!this._active) return;

        this._elapsed += dt;
        if (this._elapsed >= this._duration) {
            this.removeEffect();
            return;
        }

        // 强度曲线：快起慢落
        const t = this._elapsed / this._duration;
        const envelope = t < 0.2
            ? t / 0.2                           // ramp up
            : 1.0 - (t - 0.2) / 0.8;           // ramp down
        const strength = envelope * this._maxStrength;

        // === 色彩闪变 ===
        for (let i = 0; i < this._sprites.length; i++) {
            const sprite = this._sprites[i];
            if (!sprite || !sprite.isValid) continue;
            const orig = this._originalColors[i];

            // 模拟 RGB 通道偏移：随机偏移 R/G/B
            const flicker = Math.sin(this._elapsed * 40 + i) * 0.5 + 0.5;
            const rShift = Math.round(strength * 60 * flicker);
            const gShift = Math.round(strength * -30 * (1 - flicker));
            const bShift = Math.round(strength * 40 * (1 - flicker));

            sprite.color = new Color(
                Math.max(0, Math.min(255, orig.r + rShift)),
                Math.max(0, Math.min(255, orig.g + gShift)),
                Math.max(0, Math.min(255, orig.b + bShift)),
                orig.a
            );
        }

        // === 缩放抖动 ===
        const scaleJitter = 1.0 + Math.sin(this._elapsed * 35) * strength * 0.08;
        this.node.setScale(
            this._originalScale.x * scaleJitter,
            this._originalScale.y * (2.0 - scaleJitter), // 反向抖动产生失真感
            this._originalScale.z
        );

        // === 位置微震 ===
        const shakeX = (Math.random() - 0.5) * strength * 0.06;
        const shakeZ = (Math.random() - 0.5) * strength * 0.06;
        this.node.setPosition(
            this._originalPos.x + shakeX,
            this._originalPos.y,
            this._originalPos.z + shakeZ
        );
    }

    private removeEffect(): void {
        // 还原所有 Sprite 颜色
        for (let i = 0; i < this._sprites.length; i++) {
            const sprite = this._sprites[i];
            if (!sprite || !sprite.isValid) continue;
            sprite.color = this._originalColors[i];
        }
        // 还原缩放和位置
        this.node.setScale(this._originalScale);
        this.node.setPosition(this._originalPos);
        this._active = false;
        this.destroy();
    }

    protected onDestroy(): void {
        if (this._active) {
            // 确保清理
            for (let i = 0; i < this._sprites.length; i++) {
                const sprite = this._sprites[i];
                if (sprite && sprite.isValid && this._originalColors[i]) {
                    sprite.color = this._originalColors[i];
                }
            }
            this.node.setScale(this._originalScale);
            this.node.setPosition(this._originalPos);
        }
    }
}
