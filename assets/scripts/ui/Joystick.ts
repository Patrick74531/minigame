import {
    _decorator,
    Component,
    EventMouse,
    Node,
    Size,
    UITransform,
    Vec2,
    Vec3,
    Widget,
    EventTouch,
    Input,
    input,
    view,
} from 'cc';
import { ScreenBounds, UIResponsive } from './UIResponsive';

const { ccclass, property } = _decorator;
const JOYSTICK_BG_RADIUS = 70;
const JOYSTICK_ZONE_WIDTH_RATIO = 0.5;
const JOYSTICK_ZONE_HEIGHT_RATIO = 0.6;

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
    private _defaultPos: Vec3 = new Vec3();
    private _movementBounds: ScreenBounds | null = null;
    private _effectiveRadius: number = 80;
    private _desktopMode: boolean = false;
    private _mouseActive: boolean = false;
    private _inputEnabled: boolean = true;

    public get inputVector(): Vec2 {
        return this._inputVector;
    }

    public setInputEnabled(enabled: boolean): void {
        if (this._inputEnabled === enabled) return;
        this._inputEnabled = enabled;
        if (!enabled) {
            this._touchId = null;
            this._mouseActive = false;
            this.endInput();
        }
    }

    protected onLoad(): void {
        this._desktopMode = !UIResponsive.shouldUseTouchControls();
        if (this._desktopMode) {
            this.hideVisuals();
        } else {
            this.showVisuals();
        }

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);

        this.node.getComponent(Widget)?.updateAlignment();
        view.on('canvas-resize', this.onResize, this);
        this.updateDefaultPosition();
        this.scheduleOnce(() => this.updateDefaultPosition(), 0);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        view.off('canvas-resize', this.onResize, this);
    }

    private onResize(): void {
        this._desktopMode = !UIResponsive.shouldUseTouchControls();
        this.updateDefaultPosition();
        if (this._touchId === null && !this._mouseActive) {
            if (this._desktopMode) {
                this.hideVisuals();
            } else {
                this.showVisuals();
                this.resetPosition();
            }
        }
    }

    private updateDefaultPosition(): void {
        const scale = UIResponsive.getControlScale();
        this._effectiveRadius = Math.max(1, this.maxRadius * scale);
        this.background?.setScale(scale, scale, 1);
        this.stick?.setScale(scale, scale, 1);

        const area = this.getControlAreaSize();
        const halfW = area.width * 0.5;
        const halfH = area.height * 0.5;

        const padding = UIResponsive.getControlPadding();
        const visualRadius = Math.max(
            JOYSTICK_BG_RADIUS * scale,
            this._effectiveRadius + 12 * scale
        );

        this._movementBounds = {
            left: -halfW + padding.left + visualRadius,
            right: halfW - padding.right - visualRadius,
            bottom: -halfH + padding.bottom + visualRadius,
            top: halfH - padding.top - visualRadius,
        };

        if (!this._movementBounds) return;
        const x = this._movementBounds.left;
        const y = this._movementBounds.bottom;
        this._defaultPos.set(x, y, 0);

        if (this._touchId === null) {
            this._basePos.set(this._defaultPos);
            this.resetPosition();
        }
    }

    private resetPosition(): void {
        if (this.background) this.background.setPosition(this._defaultPos);
        if (this.stick) this.stick.setPosition(this._defaultPos);
    }

    private showVisuals(): void {
        if (this.background) this.background.active = true;
        if (this.stick) this.stick.active = true;
    }

    private hideVisuals(): void {
        if (this.background) this.background.active = false;
        if (this.stick) this.stick.active = false;
    }

    private screenToLocal(screenX: number, screenY: number): Vec3 {
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) {
            const area = this.getControlAreaSize();
            return new Vec3(screenX - area.width * 0.5, screenY - area.height * 0.5, 0);
        }

        const worldPos = new Vec3(screenX, screenY, 0);
        return uiTransform.convertToNodeSpaceAR(worldPos);
    }

    private onTouchStart(event: EventTouch): void {
        if (!this._inputEnabled) return;
        if (this._mouseActive) return;
        if (!this.tryBeginInput(event.getUILocation().x, event.getUILocation().y)) return;
        this._touchId = event.touch!.getID();
    }

    private onTouchMove(event: EventTouch): void {
        if (!this._inputEnabled) return;
        if (event.touch!.getID() !== this._touchId) return;
        this.applyInputMove(event.getUILocation().x, event.getUILocation().y);
    }

    private onTouchEnd(event: EventTouch): void {
        if (!this._inputEnabled) return;
        if (event.touch!.getID() !== this._touchId) return;

        this._touchId = null;
        this.endInput();
    }

    private onMouseDown(event: EventMouse): void {
        if (!this._inputEnabled) return;
        if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
        if (this._touchId !== null || this._mouseActive) return;
        const loc = event.getLocation();
        if (!this.tryBeginInput(loc.x, loc.y)) return;
        this._mouseActive = true;
    }

    private onMouseMove(event: EventMouse): void {
        if (!this._inputEnabled) return;
        if (!this._mouseActive) return;
        const loc = event.getLocation();
        this.applyInputMove(loc.x, loc.y);
    }

    private onMouseUp(event: EventMouse): void {
        if (!this._inputEnabled) return;
        if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
        if (!this._mouseActive) return;
        this._mouseActive = false;
        this.endInput();
    }

    private clampToMovementBounds(pos: Vec3): Vec3 {
        if (!this._movementBounds) return pos;
        return UIResponsive.clampVec3ToBounds(pos, this._movementBounds);
    }

    private tryBeginInput(screenX: number, screenY: number): boolean {
        if (!this._inputEnabled) return false;
        if (!this.isInJoystickZone(screenX, screenY)) return false;

        const localPos = this.clampToMovementBounds(this.screenToLocal(screenX, screenY));
        this._basePos.set(localPos.x, localPos.y, 0);

        if (this.background) this.background.setPosition(localPos);
        if (this.stick) this.stick.setPosition(localPos);

        this.showVisuals();
        this._inputVector.set(0, 0);
        return true;
    }

    private applyInputMove(screenX: number, screenY: number): void {
        const currentPos = this.screenToLocal(screenX, screenY);

        const dx = currentPos.x - this._basePos.x;
        const dy = currentPos.y - this._basePos.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        let clampedX = dx;
        let clampedY = dy;
        if (len > this._effectiveRadius) {
            const ratio = this._effectiveRadius / len;
            clampedX = dx * ratio;
            clampedY = dy * ratio;
        }

        if (this.stick) {
            this.stick.setPosition(this._basePos.x + clampedX, this._basePos.y + clampedY, 0);
        }

        this._inputVector.set(clampedX / this._effectiveRadius, clampedY / this._effectiveRadius);
    }

    private isInJoystickZone(screenX: number, screenY: number): boolean {
        const local = this.screenToLocal(screenX, screenY);
        const area = this.getControlAreaSize();
        const halfW = area.width * 0.5;
        const halfH = area.height * 0.5;
        const zoneRight = -halfW + area.width * JOYSTICK_ZONE_WIDTH_RATIO;
        const zoneTop = -halfH + area.height * JOYSTICK_ZONE_HEIGHT_RATIO;

        return local.x >= -halfW && local.x <= zoneRight && local.y >= -halfH && local.y <= zoneTop;
    }

    private endInput(): void {
        this._inputVector.set(0, 0);
        if (this._desktopMode) {
            this.hideVisuals();
        } else {
            this.resetPosition();
        }
    }

    private getControlAreaSize(): Size {
        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            const size = uiTransform.contentSize;
            if (size.width > 0 && size.height > 0) {
                return size;
            }
        }

        return UIResponsive.getVisibleSize();
    }
}
