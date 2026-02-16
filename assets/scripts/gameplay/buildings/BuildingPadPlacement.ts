import { Node, Vec3 } from 'cc';

type ScaleLike = {
    x?: number;
    z?: number;
};

type VisualScaleResolver = (typeId: string) => ScaleLike | null | undefined;

export class BuildingPadPlacement {
    public static isTowerType(typeId: string): boolean {
        return typeId === 'tower' || typeId === 'frost_tower' || typeId === 'lightning_tower';
    }

    public static estimateBuildingHalfSize(
        buildingTypeId: string,
        resolveVisualScale: VisualScaleResolver
    ): number {
        if (buildingTypeId === 'wall') {
            return 1.0;
        }
        if (buildingTypeId === 'farm') {
            return 3.4;
        }

        const scale = resolveVisualScale(buildingTypeId);
        const sx = Math.abs(scale?.x ?? 1);
        const sz = Math.abs(scale?.z ?? 1);
        const half = Math.max(sx, sz) * 0.5;
        return Math.max(0.3, half);
    }

    public static applyFixedOffsetFromSpawn(
        padNode: Node,
        originalPosition: Vec3,
        collectRadius: number,
        buildingTypeId: string,
        gap: number,
        resolveVisualScale: VisualScaleResolver
    ): void {
        const forward = new Vec3();
        Vec3.multiplyScalar(forward, padNode.forward, -1);
        if (forward.lengthSqr() < 0.0001) {
            forward.set(0, 0, 1);
        } else {
            forward.normalize();
        }

        const buildingHalfSize = this.estimateBuildingHalfSize(buildingTypeId, resolveVisualScale);
        const offsetDistance = buildingHalfSize + collectRadius + gap;

        padNode.setWorldPosition(
            originalPosition.x + forward.x * offsetDistance,
            padNode.worldPosition.y,
            originalPosition.z + forward.z * offsetDistance
        );
    }

    public static placeUpgradeZoneInFront(
        padNode: Node,
        buildingNode: Node,
        buildingTypeId: string,
        collectRadius: number,
        gap: number
    ): void {
        const forward = new Vec3();
        Vec3.multiplyScalar(forward, buildingNode.forward, -1);
        forward.normalize();

        let buildingHalfSize = Math.max(
            Math.abs(buildingNode.worldScale.x),
            Math.abs(buildingNode.worldScale.z)
        );
        buildingHalfSize *= 0.5;
        if (buildingTypeId === 'wall') {
            buildingHalfSize = 1.0;
        } else if (buildingTypeId === 'farm') {
            buildingHalfSize = 3.8;
        }

        const offsetDistance = buildingHalfSize + collectRadius + gap;
        const worldPos = buildingNode.worldPosition;
        padNode.setWorldPosition(
            worldPos.x + forward.x * offsetDistance,
            padNode.worldPosition.y,
            worldPos.z + forward.z * offsetDistance
        );
    }
}
