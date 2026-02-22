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
