import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ProjectileBlocker')
export class ProjectileBlocker extends Component {
    private static readonly _instances: Set<ProjectileBlocker> = new Set();

    @property
    public baseRadius: number = 0.8;

    protected onEnable(): void {
        ProjectileBlocker._instances.add(this);
    }

    protected onDisable(): void {
        ProjectileBlocker._instances.delete(this);
    }

    protected onDestroy(): void {
        ProjectileBlocker._instances.delete(this);
    }

    public getWorldRadius(): number {
        const scale = this.node.worldScale;
        const scaleXZ = Math.max(Math.abs(scale.x), Math.abs(scale.z));
        return Math.max(0.1, this.baseRadius * scaleXZ);
    }

    public static findFromNode(node: Node | null): ProjectileBlocker | null {
        let cursor: Node | null = node;
        while (cursor) {
            const blocker = cursor.getComponent(ProjectileBlocker);
            if (blocker) return blocker;
            cursor = cursor.parent;
        }
        return null;
    }

    public static findClosestHitT(start: Vec3, end: Vec3, extraRadius: number = 0): number {
        let closest = Number.POSITIVE_INFINITY;
        for (const blocker of ProjectileBlocker._instances) {
            if (
                !blocker ||
                !blocker.node ||
                !blocker.node.isValid ||
                !blocker.node.activeInHierarchy
            )
                continue;
            const pos = blocker.node.worldPosition;
            const t = ProjectileBlocker.segmentHitT(
                start,
                end,
                pos,
                blocker.getWorldRadius() + Math.max(0, extraRadius)
            );
            if (t >= 0 && t < closest) {
                closest = t;
            }
        }
        return Number.isFinite(closest) ? closest : -1;
    }

    public static resolveMovement(
        start: Vec3,
        end: Vec3,
        extraRadius: number = 0,
        stopEpsilon: number = 0.02,
        pushOutEpsilon: number = 0.04
    ): Vec3 {
        const extra = Math.max(0, extraRadius);
        const minPush = Math.max(0, pushOutEpsilon);
        const startInside = ProjectileBlocker.isInsideAny(start, extra + minPush);

        if (startInside) {
            return ProjectileBlocker.pushOutOfAll(start, end, extra + minPush);
        }

        const hitT = ProjectileBlocker.findClosestHitT(start, end, extra);
        if (hitT < 0 || hitT > 1) {
            return end;
        }

        const safeT = Math.max(0, hitT - Math.max(0, stopEpsilon));
        return new Vec3(
            start.x + (end.x - start.x) * safeT,
            end.y,
            start.z + (end.z - start.z) * safeT
        );
    }

    private static isInsideAny(pos: Vec3, extraRadius: number): boolean {
        for (const blocker of ProjectileBlocker._instances) {
            if (!ProjectileBlocker.isBlockerValid(blocker)) continue;

            const center = blocker.node.worldPosition;
            const radius = blocker.getWorldRadius() + extraRadius;
            const dx = pos.x - center.x;
            const dz = pos.z - center.z;
            if (dx * dx + dz * dz < radius * radius) {
                return true;
            }
        }
        return false;
    }

    private static pushOutOfAll(start: Vec3, target: Vec3, inflatedRadius: number): Vec3 {
        const resolved = target.clone();
        const fallbackDx = target.x - start.x;
        const fallbackDz = target.z - start.z;

        for (let iter = 0; iter < 4; iter++) {
            let changed = false;

            for (const blocker of ProjectileBlocker._instances) {
                if (!ProjectileBlocker.isBlockerValid(blocker)) continue;

                const center = blocker.node.worldPosition;
                const radius = blocker.getWorldRadius() + inflatedRadius;
                let dx = resolved.x - center.x;
                let dz = resolved.z - center.z;
                let distSq = dx * dx + dz * dz;
                const minDist = Math.max(0.05, radius);
                if (distSq >= minDist * minDist) continue;

                if (distSq < 1e-6) {
                    dx = fallbackDx;
                    dz = fallbackDz;
                    distSq = dx * dx + dz * dz;
                }

                if (distSq < 1e-6) {
                    dx = start.x - center.x;
                    dz = start.z - center.z;
                    distSq = dx * dx + dz * dz;
                }

                if (distSq < 1e-6) {
                    dx = 1;
                    dz = 0;
                    distSq = 1;
                }

                const dist = Math.sqrt(distSq);
                const nx = dx / dist;
                const nz = dz / dist;
                resolved.x = center.x + nx * minDist;
                resolved.z = center.z + nz * minDist;
                changed = true;
            }

            if (!changed) break;
        }

        return resolved;
    }

    private static isBlockerValid(blocker: ProjectileBlocker | null | undefined): boolean {
        return !!(
            blocker &&
            blocker.node &&
            blocker.node.isValid &&
            blocker.node.activeInHierarchy
        );
    }

    private static segmentHitT(start: Vec3, end: Vec3, point: Vec3, radius: number): number {
        const abx = end.x - start.x;
        const abz = end.z - start.z;
        const apx = point.x - start.x;
        const apz = point.z - start.z;
        const abLenSq = abx * abx + abz * abz;
        const rSq = radius * radius;

        if (abLenSq <= 0.000001) {
            const dx = point.x - start.x;
            const dz = point.z - start.z;
            return dx * dx + dz * dz <= rSq ? 0 : -1;
        }

        let t = (apx * abx + apz * abz) / abLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const cx = start.x + abx * t;
        const cz = start.z + abz * t;
        const dx = point.x - cx;
        const dz = point.z - cz;
        return dx * dx + dz * dz <= rSq ? t : -1;
    }
}
