import { _decorator, Component, Node, Vec2, Vec3, EventTouch, Input, input, view } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 动态虚拟摇杆
 * 点击屏幕左半部分时出现，松开时隐藏
 */
@ccclass('Joystick')
export class Joystick extends Component {
    @property(Node)
    public stick: Node | null = null;

    @property(Node)
    public background: Node | null = null;

    @property
    public maxRadius: number = 80;

    private _inputVector: Vec2 = new Vec2(0, 0);
    private _touchId: number | null = null;
    private _basePos: Vec3 = new Vec3();

    public get inputVector(): Vec2 {
        return this._inputVector;
    }

    protected onLoad(): void {
        this.hideVisuals();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private showVisuals(): void {
        if (this.background) this.background.active = true;
        if (this.stick) this.stick.active = true;
    }

    private hideVisuals(): void {
        if (this.background) this.background.active = false;
        if (this.stick) this.stick.active = false;
    }

    /**
     * 将屏幕坐标转换为 Canvas 本地坐标
     * Canvas 使用 1280x720 设计分辨率，锚点 (0.5, 0.5)
     */
    private screenToLocal(screenX: number, screenY: number): Vec3 {
        const size = view.getVisibleSize();
        // 计算相对于屏幕中心的偏移
        const localX = (screenX / size.width - 0.5) * 1280;
        const localY = (screenY / size.height - 0.5) * 720;
        return new Vec3(localX, localY, 0);
    }

    private onTouchStart(event: EventTouch): void {
        if (this._touchId !== null) return;

        const loc = event.getLocation();
        const size = view.getVisibleSize();

        // 只响应屏幕左半边
        if (loc.x > size.width * 0.5) return;

        this._touchId = event.touch!.getID();

        // 将触摸位置转为本地坐标
        const localPos = this.screenToLocal(loc.x, loc.y);
        this._basePos.set(localPos);

        // 移动摇杆到触摸位置
        if (this.background) this.background.setPosition(localPos);
        if (this.stick) this.stick.setPosition(localPos);

        this.showVisuals();
        this._inputVector.set(0, 0);
    }

    private onTouchMove(event: EventTouch): void {
        if (event.touch!.getID() !== this._touchId) return;

        const loc = event.getLocation();
        const currentPos = this.screenToLocal(loc.x, loc.y);

        // 计算相对于起点的偏移
        const dx = currentPos.x - this._basePos.x;
        const dy = currentPos.y - this._basePos.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        // 限制在最大半径内
        let clampedX = dx;
        let clampedY = dy;
        if (len > this.maxRadius) {
            const ratio = this.maxRadius / len;
            clampedX = dx * ratio;
            clampedY = dy * ratio;
        }

        // 移动摇杆头
        if (this.stick) {
            this.stick.setPosition(this._basePos.x + clampedX, this._basePos.y + clampedY, 0);
        }

        // 输出归一化向量 (-1 ~ 1)
        this._inputVector.set(clampedX / this.maxRadius, clampedY / this.maxRadius);
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.touch!.getID() !== this._touchId) return;

        this._touchId = null;
        this._inputVector.set(0, 0);
        this.hideVisuals();
    }
}
