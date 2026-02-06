import { Node, Vec3, Camera } from 'cc';

/**
 * ScreenShake — 零开销屏幕震动
 *
 * 通过直接操作相机节点坐标实现抖动，不使用后处理。
 * 单例静态类，任何地方都可以调用 ScreenShake.shake()。
 *
 * NOTE: 不引用 CameraFollow 以避免循环依赖。
 * 通过 duck-typing 访问 offset: Vec3 属性。
 */

/** 鸭子类型：任何具有 offset: Vec3 的对象 */
interface HasOffset {
    offset: Vec3;
}

export class ScreenShake {
    private static _cameraNode: Node | null = null;
    private static _shaking: boolean = false;
    private static _elapsed: number = 0;
    private static _duration: number = 0;
    private static _intensity: number = 0;
    private static _originalOffset: Vec3 = new Vec3();
    private static _follow: HasOffset | null = null;

    /** 绑定相机节点（在 GameController 初始化时调用一次） */
    public static bind(sceneRoot: Node): void {
        const cam = sceneRoot.getComponentInChildren(Camera);
        if (cam) {
            this._cameraNode = cam.node;
            // 通过 getComponent('CameraFollow') 获取，避免 import 循环依赖
            const comp = cam.node.getComponent('CameraFollow') as unknown as HasOffset | null;
            this._follow = comp;
        }
    }

    /**
     * 触发屏幕震动
     * @param intensity 震动幅度（世界坐标单位）
     * @param duration  持续时间（秒）
     */
    public static shake(intensity: number = 0.3, duration: number = 0.2): void {
        if (!this._cameraNode) return;
        this._intensity = intensity;
        this._duration = duration;
        this._elapsed = 0;
        this._shaking = true;

        if (this._follow) {
            this._originalOffset.set(this._follow.offset);
        }
    }

    /**
     * 每帧更新（由 CameraFollow.lateUpdate 驱动）
     */
    public static update(dt: number): void {
        if (!this._shaking || !this._cameraNode) return;

        this._elapsed += dt;
        if (this._elapsed >= this._duration) {
            this._shaking = false;
            if (this._follow) {
                this._follow.offset.set(this._originalOffset);
            }
            return;
        }

        // 衰减因子
        const t = 1 - this._elapsed / this._duration;
        const amp = this._intensity * t;

        // 随机抖动偏移
        const dx = (Math.random() - 0.5) * 2 * amp;
        const dy = (Math.random() - 0.5) * 2 * amp * 0.5;
        const dz = (Math.random() - 0.5) * 2 * amp;

        if (this._follow) {
            this._follow.offset.set(
                this._originalOffset.x + dx,
                this._originalOffset.y + dy,
                this._originalOffset.z + dz
            );
        }
    }

    public static get isShaking(): boolean {
        return this._shaking;
    }
}
