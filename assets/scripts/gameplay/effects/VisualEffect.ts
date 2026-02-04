import { _decorator, Component, Node, Tween, tween, Vec3, UIOps } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';

const { ccclass, property } = _decorator;

/**
 * 视觉特效组件
 * 负责特效的生命周期管理（自动销毁、动画播放）
 */
@ccclass('VisualEffect')
export class VisualEffect extends BaseComponent {
    @property
    public duration: number = 1.0;

    @property
    public autoDestroy: boolean = true;

    private _elapsed: number = 0;

    protected initialize(): void {
        this._elapsed = 0;
    }

    protected update(dt: number): void {
        this._elapsed += dt;
        if (this.autoDestroy && this._elapsed >= this.duration) {
            this.despawn();
        }
    }

    /**
     * 手动播放缩放动画
     * @param targetScale 目标缩放大小
     * @param duration 持续时间
     */
    public playScaleAnim(targetScale: number, duration: number): void {
        this.node.setScale(0.1, 0.1, 0.1);
        tween(this.node)
            .to(duration, { scale: new Vec3(targetScale, targetScale, targetScale) }, { easing: 'quartOut' })
            .to(0.3, { scale: new Vec3(0, 0, 0) }) // Shrink out
            .start();
    }

    /**
     * 销毁或回收到对象池
     */
    private despawn(): void {
        // TODO: Integrate with PoolManager
        if (this.node && this.node.isValid) {
            this.node.destroy();
        }
    }
}
