import {
    _decorator,
    Node,
    ParticleSystem,
    Texture2D,
    resources,
    Material,
    Color,
    MeshRenderer,
    primitives,
    utils,
    Vec3,
    Graphics,
    tween,
    Quat,
} from 'cc';
import { VisualEffect } from './VisualEffect';

/**
 * 特效工厂
 * 负责通过代码创建各种特效节点 (避免依赖复杂的 Prefab 编辑)
 */
export class EffectFactory {
    /**
     * 创建冰霜爆炸特效
     * @param parent 父节点
     * @param position 位置 (World)
     * @param radius 爆炸半径
     */
    public static createFrostExplosion(parent: Node, position: Vec3, radius: number): void {
        // 1. Root Node
        const effectNode = new Node('FrostExplosion');
        parent.addChild(effectNode);
        effectNode.setWorldPosition(position);

        const effectComp = effectNode.addComponent(VisualEffect);
        effectComp.duration = 1.5;

        // 2. Shockwave Ring (Ground)
        this.createShockwaveRing(effectNode, radius);

        // 3. Ice Particles (Explosion)
        this.createIceParticles(effectNode);
    }

    /**
     * 创建冲击波光环
     */
    private static createShockwaveRing(parent: Node, radius: number): void {
        const ringNode = new Node('ShockwaveRing');
        parent.addChild(ringNode);

        // 扁平的圓柱体用来做光环 或者 Quad
        const renderer = ringNode.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 }));

        const material = new Material();
        // Use 'transparent' technique (1) and define USE_TEXTURE
        material.initialize({
            effectName: 'builtin-unlit',
            technique: 1,
            defines: { USE_TEXTURE: true },
        });

        material.setProperty('mainColor', new Color(100, 200, 255, 255));
        renderer.material = material;

        // Load texture
        resources.load(
            'textures/shockwave_ring/texture',
            Texture2D,
            (err: Error | null, texture: Texture2D) => {
                if (err) {
                    console.warn('[EffectFactory] Failed to load shockwave texture:', err);
                    return;
                }
                if (texture) {
                    material.setProperty('mainTexture', texture);

                    // Apply Additive Blending Safely
                    if (material.passes && material.passes.length > 0) {
                        const pass = material.passes[0];
                        const target = pass.blendState.targets[0];
                        target.blend = true;
                        target.blendSrc = 2; // SRC_ALPHA
                        target.blendDst = 1; // ONE
                        target.blendSrcAlpha = 2;
                        target.blendDstAlpha = 1;
                        // Note: pass.update() might not be public/needed if we modify the state directly before next render
                    }
                }
            }
        );

        // Animation
        const effect = ringNode.addComponent(VisualEffect);
        effect.duration = 1.0;
        // Start small, grow to radius * 2 (diameter)
        effect.playScaleAnim(radius * 2, 0.5);
    }

    /**
     * 创建冰屑粒子
     */
    private static createIceParticles(parent: Node): void {
        const particleNode = new Node('IceParticles');
        parent.addChild(particleNode);

        const particleSystem = particleNode.addComponent(ParticleSystem);

        // Configure Particle System (Code-driven is tricky, simplified here)
        particleSystem.duration = 0.5;
        particleSystem.loop = false;
        particleSystem.playOnAwake = true;

        // Emitter
        particleSystem.capacity = 50;
        // Type casting to bypass strict declaration checks (runtime supports these)
        particleSystem.startColor = new Color(200, 240, 255, 255) as any;
        (particleSystem as any).startSize = 0.5; 
        (particleSystem as any).startSpeed = 10;
        (particleSystem as any).startLifetime = 0.8;
        (particleSystem as any).gravityModifier = 2.0;

        // Shape
        // Cocos Creator 3.x ParticleSystem shape config via script is verbose.
        // We will stick to default usage or use 'sphere' if accessible via script properties.

        // Load Texture
        resources.load(
            'textures/frost_particle/texture',
            Texture2D,
            (err: Error | null, texture: Texture2D) => {
                if (err) {
                    console.warn('[EffectFactory] Failed to load particle texture:', err);
                    return;
                }
                // Cast to any to access material
                const psRender = particleSystem as any;
                if (texture && psRender.material) {
                    const material = psRender.material;
                    material.setProperty('mainTexture', texture);
                    // Force Additive
                    if (material.passes && material.passes.length > 0) {
                        const pass = material.passes[0];
                        const target = pass.blendState.targets[0];
                        target.blend = true;
                        target.blendSrc = 2; // SRC_ALPHA
                        target.blendDst = 1; // ONE
                    }
                }
            }
        );
    }
    /**
     * 创建闪电链特效
     * @param parent 父节点
     * @param startPos 起始位置 (World)
     * @param endPos 结束位置 (World)
     */
    public static createLightningBolt(parent: Node, startPos: Vec3, endPos: Vec3): void {
        const node = new Node('LightningBolt');
        parent.addChild(node);

        // Use Graphics to draw lines
        const g = node.addComponent(Graphics);
        g.lineWidth = 0.2;
        g.strokeColor = new Color(150, 50, 255, 255); // Purple

        // Convert world pos to local pos relative to the graphics node
        // Actually, simplest is to set node at 0,0,0 (world) if parent is scene root,
        // OR better: set node at startPos, and draw to relative endPos.

        // Strategy: Node at world(0,0,0) -> draw absolute coords (if optimization is not concern for now)
        // Better: Node at startPos. Draw line to invalid-local-endPos.

        node.setWorldPosition(startPos);
        const localEnd = new Vec3();
        Vec3.subtract(localEnd, endPos, startPos); // localEnd = end - start

        // Generate Jagged Line
        const points: Vec3[] = [];
        const segments = 5;
        points.push(new Vec3(0, 0, 0));

        const direction = localEnd.clone().normalize();
        const distance = localEnd.length();
        const segmentLen = distance / segments;

        for (let i = 1; i < segments; i++) {
            // Point along the line
            const point = direction.clone().multiplyScalar(i * segmentLen);

            // Random offset (perpendicular-ish)
            const offset = new Vec3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
            );
            point.add(offset);
            points.push(point);
        }
        points.push(localEnd);

        // Draw
        g.moveTo(points[0].x, points[0].y); // Z is ignored in standard Graphics unless using special shader or 3D traits?
        // Note: Cocos Graphics component is primarily 2D.
        // For 3D lightning, LineRenderer or Mesh is better.
        // HACK: Use Line Mesh or Series of Thin Cubes?

        // REVISION: Graphics is 2D.
        // Let's use a stretched Cube or Billboard for MVP, OR just use multiple thin cubes connecting points.
        // Or simpler: Just a single stretched Cylinder from A to B.

        // Cleanup Graphics attempt
        g.destroy();

        // Create segments connecting all points
        for (let i = 0; i < points.length - 1; i++) {
            this.createLightningSegment(node, points[i], points[i + 1]);
        }

        // Auto destroy
        const effect = node.addComponent(VisualEffect);
        effect.duration = 0.3; // Slightly longer duration

        // No global tween on root, handled in segments or just quick destroy
    }

    private static createLightningSegment(parent: Node, start: Vec3, end: Vec3): void {
        const seg = new Node('Segment');
        parent.addChild(seg);

        const renderer = seg.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(primitives.box());

        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        // Brighter Purple
        material.setProperty('mainColor', new Color(200, 100, 255, 255));

        // Optimize: Use cached material if possible, but for now new is fine
        if (material.passes && material.passes.length > 0) {
            const pass = material.passes[0];
            const target = pass.blendState.targets[0];
            target.blend = true;
            target.blendSrc = 2; // SRC_ALPHA
            target.blendDst = 1; // ONE
        }
        renderer.material = material;

        // Geometric Maths to align Box Z-axis from Start to End
        const length = Vec3.distance(start, end);

        // Position: Midpoint
        const mid = new Vec3();
        Vec3.add(mid, start, end);
        mid.multiplyScalar(0.5);
        seg.setPosition(mid);

        // Scale: Thin box, length equal to distance
        // Box is 1x1x1. We scale Z to length.
        seg.setScale(0.15, 0.15, length); // Thicker (0.15) for visibility

        // Rotation: lookAt
        // We want the box's Z axis (FORWARD) to point to 'end' from 'start'.
        // But lookAt rotates the node's FORWARD (-Z usually in Cocos) to target.
        // If we want +Z to point to target, we might need adjustments or lookAt(target) then rotate?
        // Let's rely on standard lookAt and scale Z.
        // Note: Cocos lookAt usually points -Z to target. So if we scale Z, it might be backwards?
        // Box is symmetric so backwards is fine.

        // Convert 'end' to local space of 'parent' (which is 'node', at startPos WORLD)
        // Wait, 'start' and 'end' passed here ARE in 'parent's local space (relative to startPos).
        // BUT lookAt takes a WORLD TARGET usually? No, Node.lookAt takes world position in 3.x.
        // We need the world position of 'end' to use lookAt correctly?
        // Actually, parent is at World Start. 'start' arg is roughly 0,0,0 (or previous point). 'end' is next point.
        // seg.setPosition(mid) puts it at local mid.
        // To rotate correctly, we need vector direction.

        // Manual Quat is safer than lookAt with hierarchy mixups
        // Direction: end - start

        // Workaround: Use lookAt with a temporary world pos calculation?
        // Or just compute Quat. fromViewUp?

        // Simple approach:
        // seg position is local.
        // We want to look at 'end' in local space? No API for local lookAt easily.
        // Let's use Quat.fromViewUp

        // Direction vector
        const dir = new Vec3();
        Vec3.subtract(dir, end, start);
        dir.normalize();

        if (dir.lengthSqr() > 0.001) {
            const qt = new Quat();
            // Rotate Z (0,0,1) to align with dir
            Quat.fromViewUp(qt, dir.normalize(), Vec3.UP);
            // fromViewUp creates rotation looking in 'dir'.
            // Default forward is -Z. We want +Z to be length? Or -Z?
            // Box is symmetric.
            seg.setRotation(qt);
        }

        // Tween Fade Out
        tween(renderer.material)
            // .to(0.3, { property: ... }) - accessing color property needs specific API or pass
            // changing opacity on unlit color:
            .call(() => {}) // Placeholder
            .start();

        // Scale down width over time
        tween(seg)
            .to(0.25, { scale: new Vec3(0, 0, length) })
            .start();
    }
}
