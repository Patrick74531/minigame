import { Node, Vec3 } from 'cc';

/**
 * DualCameraFollow
 * 双人模式相机：以本地英雄为中心，按队友距离动态微调高度。
 * 单人模式不使用此类（CameraRig.setupFollow 保持不变）。
 */
export class DualCameraFollow {
    private static _cameraNode: Node | null = null;
    private static _primaryTarget: Node | null = null;
    private static _secondaryTargets: Node[] = [];
    private static _offset: Vec3 = new Vec3(0, 8.2, 9.8);
    private static _minHeight: number = 8.2;
    private static _maxHeight: number = 14;
    private static _zoomDistThreshold: number = 12;
    private static readonly _tmpLookAt = new Vec3();

    /**
     * Setup coop camera with local hero as primary target.
     */
    static setup(
        scene: Node | null,
        primaryTarget: Node,
        secondaryTargets: Node[] = [],
        offset?: Vec3
    ): void {
        if (!scene) return;
        DualCameraFollow._primaryTarget = primaryTarget;
        DualCameraFollow._secondaryTargets = secondaryTargets;
        if (offset) DualCameraFollow._offset.set(offset);

        // Find camera in scene
        const cam = scene.getComponentInChildren('cc.Camera' as never);
        DualCameraFollow._cameraNode = cam ? (cam as unknown as { node: Node }).node : null;
    }

    /**
     * Call every frame to update camera position.
     */
    static update(): void {
        const cam = DualCameraFollow._cameraNode;
        if (!cam || !cam.isValid) return;

        const primary = DualCameraFollow._primaryTarget;
        if (!primary || !primary.isValid) return;

        // Keep the camera centered on local player.
        const anchorX = primary.position.x;
        const anchorZ = primary.position.z;

        // Dynamic height uses the farthest valid teammate distance to reduce clipping.
        let height = DualCameraFollow._minHeight;
        for (const teammate of DualCameraFollow._secondaryTargets) {
            if (!teammate || !teammate.isValid) continue;
            const dx = anchorX - teammate.position.x;
            const dz = anchorZ - teammate.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const t = Math.min(1, dist / DualCameraFollow._zoomDistThreshold);
            const candidate =
                DualCameraFollow._minHeight +
                (DualCameraFollow._maxHeight - DualCameraFollow._minHeight) * t;
            if (candidate > height) {
                height = candidate;
            }
        }

        const off = DualCameraFollow._offset;
        cam.setPosition(anchorX + off.x, height, anchorZ + off.z);
        const lookAt = DualCameraFollow._tmpLookAt;
        lookAt.set(anchorX, 0, anchorZ);
        cam.lookAt(lookAt);
    }

    static cleanup(): void {
        DualCameraFollow._cameraNode = null;
        DualCameraFollow._primaryTarget = null;
        DualCameraFollow._secondaryTargets = [];
    }
}
