import {
    Color,
    Graphics,
    Material,
    MeshRenderer,
    Node,
    Quat,
    Vec3,
    primitives,
    tween,
    utils,
} from 'cc';
import { VisualEffect } from '../VisualEffect';

export class LightningBoltEffect {
    public static play(payload: { parent: Node; startPos: Vec3; endPos: Vec3 }): void {
        const node = new Node('LightningBolt');
        payload.parent.addChild(node);

        const g = node.addComponent(Graphics);
        g.lineWidth = 0.2;
        g.strokeColor = new Color(150, 50, 255, 255);

        node.setWorldPosition(payload.startPos);
        const localEnd = new Vec3();
        Vec3.subtract(localEnd, payload.endPos, payload.startPos);

        const points: Vec3[] = [];
        const segments = 5;
        points.push(new Vec3(0, 0, 0));

        const direction = localEnd.clone().normalize();
        const distance = localEnd.length();
        const segmentLen = distance / segments;

        for (let i = 1; i < segments; i++) {
            const point = direction.clone().multiplyScalar(i * segmentLen);
            point.add3f(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
            );
            points.push(point);
        }
        points.push(localEnd);

        g.destroy();
        for (let i = 0; i < points.length - 1; i++) {
            this.createSegment(node, points[i], points[i + 1]);
        }

        const effect = node.addComponent(VisualEffect);
        effect.duration = 0.3;
    }

    private static createSegment(parent: Node, start: Vec3, end: Vec3): void {
        const seg = new Node('Segment');
        parent.addChild(seg);

        const renderer = seg.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(primitives.box());

        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', new Color(200, 100, 255, 255));
        if (material.passes && material.passes.length > 0) {
            const target = material.passes[0].blendState.targets[0];
            target.blend = true;
            target.blendSrc = 2;
            target.blendDst = 1;
        }
        renderer.material = material;

        const length = Vec3.distance(start, end);
        const mid = new Vec3();
        Vec3.add(mid, start, end);
        mid.multiplyScalar(0.5);
        seg.setPosition(mid);
        seg.setScale(0.15, 0.15, length);

        const dir = new Vec3();
        Vec3.subtract(dir, end, start);
        dir.normalize();
        if (dir.lengthSqr() > 0.001) {
            const qt = new Quat();
            Quat.fromViewUp(qt, dir, Vec3.UP);
            seg.setRotation(qt);
        }

        tween(renderer.material)
            .call(() => {})
            .start();
        tween(seg)
            .to(0.25, { scale: new Vec3(0, 0, length) })
            .start();
    }
}
