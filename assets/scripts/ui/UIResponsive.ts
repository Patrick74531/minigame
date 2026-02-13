import { Rect, Size, Vec3, sys, view } from 'cc';

export type ScreenBounds = {
    left: number;
    right: number;
    bottom: number;
    top: number;
};

export class UIResponsive {
    private static readonly DESIGN_SHORT_SIDE = 720;
    private static readonly MAX_SAFE_INSET_RATIO = 0.2;

    public static getVisibleSize(): Size {
        return view.getVisibleSize();
    }

    public static shouldUseTouchControls(): boolean {
        if (sys.isMobile) return true;
        return this.isPadLikeViewport() || this.isPhoneLikeViewport();
    }

    public static getControlScale(): number {
        const size = this.getVisibleSize();
        const shortSide = Math.min(size.width, size.height);
        return this.clamp(shortSide / this.DESIGN_SHORT_SIDE, 0.82, 1.1);
    }

    public static getControlPadding(): {
        left: number;
        right: number;
        bottom: number;
        top: number;
    } {
        const size = this.getVisibleSize();
        const shortSide = Math.min(size.width, size.height);
        const horizontal = Math.round(this.clamp(shortSide * 0.08, 36, 84));
        const bottom = Math.round(this.clamp(shortSide * 0.09, 40, 96));
        const top = Math.round(this.clamp(shortSide * 0.05, 24, 52));
        const safe = this.getSafeAreaInsets();

        return {
            left: horizontal + safe.left,
            right: horizontal + safe.right,
            bottom: bottom + safe.bottom,
            top: top + safe.top,
        };
    }

    public static getBounds(padding: {
        left: number;
        right: number;
        bottom: number;
        top: number;
    }): ScreenBounds {
        const size = this.getVisibleSize();
        const halfW = size.width * 0.5;
        const halfH = size.height * 0.5;
        return {
            left: -halfW + padding.left,
            right: halfW - padding.right,
            bottom: -halfH + padding.bottom,
            top: halfH - padding.top,
        };
    }

    public static clampVec3ToBounds(pos: Vec3, bounds: ScreenBounds): Vec3 {
        return new Vec3(
            this.clamp(pos.x, bounds.left, bounds.right),
            this.clamp(pos.y, bounds.bottom, bounds.top),
            pos.z
        );
    }

    public static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private static isPadLikeViewport(): boolean {
        const frame = view.getFrameSize();
        if (frame.width <= 0 || frame.height <= 0) return false;

        const shortSide = Math.min(frame.width, frame.height);
        const longSide = Math.max(frame.width, frame.height);
        const ratio = longSide / shortSide;

        return shortSide >= 700 && shortSide <= 1050 && ratio >= 1.25 && ratio <= 1.6;
    }

    private static isPhoneLikeViewport(): boolean {
        const frame = view.getFrameSize();
        if (frame.width <= 0 || frame.height <= 0) return false;

        const shortSide = Math.min(frame.width, frame.height);
        const longSide = Math.max(frame.width, frame.height);
        const ratio = longSide / shortSide;

        return shortSide >= 320 && shortSide <= 900 && ratio >= 1.6 && ratio <= 2.5;
    }

    private static getSafeAreaInsets(): {
        left: number;
        right: number;
        bottom: number;
        top: number;
    } {
        const visible = this.getVisibleSize();
        const frame = view.getFrameSize();
        const safeRect = this.getSafeRect();
        if (!safeRect || frame.width <= 0 || frame.height <= 0) {
            return { left: 0, right: 0, bottom: 0, top: 0 };
        }

        const fromFrame = this.calcInsetsFromRect(
            safeRect,
            frame.width,
            frame.height,
            visible,
            true
        );
        const fromVisible = this.calcInsetsFromRect(
            safeRect,
            visible.width,
            visible.height,
            visible,
            false
        );

        const candidates = [fromFrame, fromVisible].filter(
            (v): v is { left: number; right: number; bottom: number; top: number } => v !== null
        );
        if (candidates.length === 0) {
            return { left: 0, right: 0, bottom: 0, top: 0 };
        }

        candidates.sort((a, b) => this.insetSum(a) - this.insetSum(b));
        return candidates[0];
    }

    private static getSafeRect(): Rect | null {
        const maybeGetter = (view as unknown as { getSafeAreaRect?: () => Rect }).getSafeAreaRect;
        if (typeof maybeGetter !== 'function') return null;
        try {
            return maybeGetter.call(view);
        } catch {
            return null;
        }
    }

    private static calcInsetsFromRect(
        safeRect: Rect,
        totalW: number,
        totalH: number,
        visible: Size,
        scaleFromTotal: boolean
    ): { left: number; right: number; bottom: number; top: number } | null {
        if (totalW <= 0 || totalH <= 0) return null;

        const scaleX = scaleFromTotal ? visible.width / totalW : 1;
        const scaleY = scaleFromTotal ? visible.height / totalH : 1;

        const left = safeRect.x * scaleX;
        const bottom = safeRect.y * scaleY;
        const right = (totalW - (safeRect.x + safeRect.width)) * scaleX;
        const top = (totalH - (safeRect.y + safeRect.height)) * scaleY;

        if (left < -1 || right < -1 || bottom < -1 || top < -1) return null;

        const maxX = visible.width * this.MAX_SAFE_INSET_RATIO;
        const maxY = visible.height * this.MAX_SAFE_INSET_RATIO;

        if (left > maxX || right > maxX || bottom > maxY || top > maxY) {
            return null;
        }

        return {
            left: Math.max(0, Math.round(left)),
            right: Math.max(0, Math.round(right)),
            bottom: Math.max(0, Math.round(bottom)),
            top: Math.max(0, Math.round(top)),
        };
    }

    private static insetSum(insets: {
        left: number;
        right: number;
        bottom: number;
        top: number;
    }): number {
        return insets.left + insets.right + insets.bottom + insets.top;
    }
}
