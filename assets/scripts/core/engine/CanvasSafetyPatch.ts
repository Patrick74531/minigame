import { Canvas } from 'cc';

const PATCH_FLAG = '__kingshitCanvasOnDisableSafePatched';

/**
 * Cocos Creator 3.8.8 preview workaround:
 * Canvas.onDisable may access cameraComponent.node.off(...) after camera node is already null.
 * Patch once at runtime and sanitize cameraComponent before original onDisable runs.
 */
export function applyCanvasOnDisableSafetyPatch(): void {
    const proto = Canvas.prototype as Record<string, unknown>;
    if (!proto) return;
    if (proto[PATCH_FLAG]) return;

    const original = proto.onDisable as ((...args: unknown[]) => void) | undefined;
    if (typeof original !== 'function') return;

    proto.onDisable = function patchedCanvasOnDisable(this: Record<string, unknown>): void {
        const cameraComp = this._cameraComponent as { node?: unknown } | null | undefined;
        if (cameraComp && !cameraComp.node) {
            this._cameraComponent = null;
        }
        original.call(this);
    };

    proto[PATCH_FLAG] = true;
}
