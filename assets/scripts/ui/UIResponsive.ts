import { Rect, Size, Vec3, sys, view } from 'cc';

export type ScreenBounds = {
    left: number;
    right: number;
    bottom: number;
    top: number;
};

export type RuntimeDisplayProfile = 'default' | 'tiktok_phone_portrait';

export class UIResponsive {
    private static readonly DESIGN_WIDTH = 1280;
    private static readonly DESIGN_HEIGHT = 720;
    private static readonly DESIGN_SHORT_SIDE = 720;
    private static readonly MAX_SAFE_INSET_RATIO = 0.2;
    private static readonly TEMP_INPUT_MODE: 'touch' | 'desktop' | null = null;

    public static getRuntimeDisplayProfile(): RuntimeDisplayProfile {
        if (this.isTikTokRuntime() && this.isPhoneLikeViewport() && this.isPortraitViewport()) {
            return 'tiktok_phone_portrait';
        }
        return 'default';
    }

    public static getVisibleSize(): Size {
        return view.getVisibleSize();
    }

    public static getVisibleSizeAndRatio(): { visibleSize: Size; ratio: number } {
        const size = view.getVisibleSize();
        return {
            visibleSize: size,
            ratio: size.width / size.height,
        };
    }

    public static shouldUseTouchControls(): boolean {
        const forced = this.getForcedInputMode();
        if (forced === 'touch') return true;
        if (forced === 'desktop') return false;

        if (sys.isMobile) return true;
        if (!sys.isBrowser) return this.isMobileLikeViewport();

        const likelyTouchDevice =
            this.hasTouchCapability() || (this.isIpadDesktopUA() && this.isPadLikeViewport());
        if (!likelyTouchDevice) return false;

        return this.isMobileLikeViewport();
    }

    public static getControlScale(): number {
        const size = this.getVisibleSize();
        const shortSide = Math.min(size.width, size.height);
        if (this.getRuntimeDisplayProfile() === 'tiktok_phone_portrait') {
            // Keep TikTok portrait controls smaller to avoid clipping on narrow phones.
            return this.clamp((shortSide / this.DESIGN_SHORT_SIDE) * 0.9, 0.62, 0.84);
        }
        return this.clamp(shortSide / this.DESIGN_SHORT_SIDE, 0.82, 1.1);
    }

    public static isTikTokPhonePortraitProfile(): boolean {
        return this.getRuntimeDisplayProfile() === 'tiktok_phone_portrait';
    }

    public static getLayoutViewportSize(
        minWidth: number = 480,
        minHeight: number = 320,
        legacyMode: 'visible' | 'canvas' = 'visible'
    ): { width: number; height: number } {
        const profile = this.getRuntimeDisplayProfile();
        if (profile !== 'tiktok_phone_portrait' && legacyMode === 'canvas') {
            return {
                width: Math.max(minWidth, this.DESIGN_WIDTH),
                height: Math.max(minHeight, this.DESIGN_HEIGHT),
            };
        }

        const visible = this.getVisibleSize();
        const effectiveMinWidth = profile === 'tiktok_phone_portrait' ? 320 : minWidth;
        const effectiveMinHeight = profile === 'tiktok_phone_portrait' ? 480 : minHeight;
        return {
            width: Math.max(effectiveMinWidth, Math.round(visible.width)),
            height: Math.max(effectiveMinHeight, Math.round(visible.height)),
        };
    }

    public static getControlPadding(): {
        left: number;
        right: number;
        bottom: number;
        top: number;
    } {
        const size = this.getVisibleSize();
        const shortSide = Math.min(size.width, size.height);
        const profile = this.getRuntimeDisplayProfile();
        const horizontal = Math.round(
            profile === 'tiktok_phone_portrait'
                ? this.clamp(shortSide * 0.06, 22, 44)
                : this.clamp(shortSide * 0.08, 36, 84)
        );
        const bottom = Math.round(
            profile === 'tiktok_phone_portrait'
                ? this.clamp(shortSide * 0.11, 40, 90)
                : this.clamp(shortSide * 0.09, 40, 96)
        );
        const top = Math.round(
            profile === 'tiktok_phone_portrait'
                ? this.clamp(shortSide * 0.09, 30, 64)
                : this.clamp(shortSide * 0.05, 24, 52)
        );
        const safe = this.getSafeAreaInsets();
        const extraTop =
            profile === 'tiktok_phone_portrait'
                ? Math.round(this.clamp(shortSide * 0.11, 34, 76))
                : 0;
        const extraRight =
            profile === 'tiktok_phone_portrait'
                ? Math.round(this.clamp(shortSide * 0.05, 12, 30))
                : 0;
        const extraBottom =
            profile === 'tiktok_phone_portrait'
                ? Math.round(this.clamp(shortSide * 0.03, 8, 24))
                : 0;

        return {
            left: horizontal + safe.left,
            right: horizontal + safe.right + extraRight,
            bottom: bottom + safe.bottom + extraBottom,
            top: top + safe.top + extraTop,
        };
    }

    public static getGameplayCameraPreset(): { fov: number; offset: Vec3 } {
        if (this.getRuntimeDisplayProfile() === 'tiktok_phone_portrait') {
            return { fov: 54, offset: new Vec3(0, 12, 14.6) };
        }
        return { fov: 42, offset: new Vec3(0, 8.2, 9.8) };
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

    private static getForcedInputMode(): 'touch' | 'desktop' | null {
        if (this.TEMP_INPUT_MODE) {
            return this.TEMP_INPUT_MODE;
        }

        const runtimeValue = (globalThis as { __KINGSHIT_INPUT_MODE__?: unknown })
            .__KINGSHIT_INPUT_MODE__;
        if (runtimeValue === 'touch' || runtimeValue === 'desktop') {
            return runtimeValue;
        }

        if (sys.isBrowser && typeof location !== 'undefined') {
            const mode = new URLSearchParams(location.search).get('inputMode');
            if (mode === 'touch' || mode === 'desktop') {
                return mode;
            }
        }

        return null;
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

    private static isMobileLikeViewport(): boolean {
        return this.isPadLikeViewport() || this.isPhoneLikeViewport();
    }

    private static isPortraitViewport(): boolean {
        const size = this.getVisibleSize();
        if (size.width <= 0 || size.height <= 0) return false;
        return size.height > size.width;
    }

    private static isTikTokRuntime(): boolean {
        const g = globalThis as unknown as { __GVR_PLATFORM__?: unknown; tt?: unknown };
        return g.__GVR_PLATFORM__ === 'tiktok' || typeof g.tt !== 'undefined';
    }

    private static hasTouchCapability(): boolean {
        if (typeof navigator === 'undefined' || typeof window === 'undefined') {
            return false;
        }

        const hasTouchPoints = (navigator.maxTouchPoints ?? 0) > 0;
        const hasTouchEvent = 'ontouchstart' in window;
        const coarsePointer = this.hasCoarsePointer();
        return hasTouchPoints || hasTouchEvent || coarsePointer;
    }

    private static hasCoarsePointer(): boolean {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return false;
        }

        try {
            return window.matchMedia('(pointer: coarse)').matches;
        } catch {
            return false;
        }
    }

    private static isIpadDesktopUA(): boolean {
        if (typeof navigator === 'undefined') return false;

        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const touchPoints = navigator.maxTouchPoints ?? 0;

        if (/iPad/i.test(ua)) return true;
        return platform === 'MacIntel' && touchPoints > 1;
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
