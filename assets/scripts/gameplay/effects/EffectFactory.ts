import { _decorator, Node, ParticleSystem, Texture2D, Asset, resources, Material, Color, MeshRenderer, primitives, utils, Vec3, Billboard, Graphics, Tween, tween } from 'cc';
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
        this.createIceParticles(effectNode, radius);
    }

    /**
     * 创建冲击波光环
     */
    private static createShockwaveRing(parent: Node, radius: number): void {
        const ringNode = new Node('ShockwaveRing');
        parent.addChild(ringNode);
        
        // 扁平的圓柱体用来做光环 或者 Quad
        const renderer = ringNode.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(primitives.plane({ width: 1, length: 1 }));
        
        const material = new Material();
        // Use 'transparent' technique (1) and define USE_TEXTURE
        material.initialize({ 
            effectName: 'builtin-unlit', 
            technique: 1, 
            defines: { USE_TEXTURE: true }
        });
        
        material.setProperty('mainColor', new Color(100, 200, 255, 255));
        renderer.material = material;

        // Load texture
         resources.load('textures/shockwave_ring/texture', Texture2D, (err: Error | null, texture: Texture2D) => {
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
        });

        // Animation
        const effect = ringNode.addComponent(VisualEffect);
        effect.duration = 1.0;
        // Start small, grow to radius * 2 (diameter)
        effect.playScaleAnim(radius * 2, 0.5);
    }

    /**
     * 创建冰屑粒子
     */
    private static createIceParticles(parent: Node, radius: number): void {
        const particleNode = new Node('IceParticles');
        parent.addChild(particleNode);
        
        const particleSystem = particleNode.addComponent(ParticleSystem);
        
        // Configure Particle System (Code-driven is tricky, simplified here)
        particleSystem.duration = 0.5;
        particleSystem.loop = false;
        particleSystem.playOnAwake = true;
        
        // Emitter
        particleSystem.capacity = 50;
        particleSystem.startColor = new Color(200, 240, 255, 255);
        particleSystem.startSize = 0.5;
        particleSystem.startSpeed = 10;
        particleSystem.startLifetime = 0.8;
        particleSystem.gravityModifier = 2.0; // Fall down
        
        // Shape
        // Cocos Creator 3.x ParticleSystem shape config via script is verbose.
        // We will stick to default usage or use 'sphere' if accessible via script properties.
        
        // Load Texture
        resources.load('textures/frost_particle/texture', Texture2D, (err: Error | null, texture: Texture2D) => {
            if (err) {
                console.warn('[EffectFactory] Failed to load particle texture:', err);
                return;
            }
            if (texture && particleSystem.particleMaterial) {
                const material = particleSystem.particleMaterial;
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
        });
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
        endPos.subtract(startPos, localEnd); // localEnd = end - start
        
        // Generate Jagged Line
        const points = [];
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
        
        // New Strategy: Cylinder Mesh scaled and rotated
        this.createLightningSegment(node, new Vec3(0,0,0), localEnd);

        // Auto destroy
        const effect = node.addComponent(VisualEffect);
        effect.duration = 0.2; // Flash
        
        // Beams fade out (scale Y/Width down)
        // tween(node).to(0.2, { scale: new Vec3(0, 0, 0)}).start(); 
    }

    private static createLightningSegment(parent: Node, start: Vec3, end: Vec3): void {
        const seg = new Node('Segment');
        parent.addChild(seg);
        
        const renderer = seg.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(primitives.cylinder({ radiusTop: 0.1, radiusBottom: 0.1, height: 1 }));
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', new Color(180, 80, 255, 255));
        
        // Additive
        material.passes[0].blendState.targets[0].blend = true;
        material.passes[0].blendState.targets[0].blendSrc = 2;
        material.passes[0].blendState.targets[0].blendDst = 1;
        
        renderer.material = material;
        
        // Transform
        // Cylinder default is Y-up. We need to rotate it to point from Start to End.
        
        const dir = new Vec3();
        Vec3.subtract(dir, end, start);
        const length = dir.length();
        
        // Position: Midpoint
        const mid = new Vec3();
        Vec3.add(mid, start, end);
        mid.multiplyScalar(0.5);
        seg.setPosition(mid);
        
        // Scale: Y = length
        seg.setScale(0.5, length, 0.5);
        
        // Rotation: LookAt (Trickier with Y-up cylinder)
        // Cocos properties are Z-forward. 
        // We want the Cylinder's Y-axis to align with 'dir'.
        
        // Simple hack: Look at the Target. 3D rotates Z to target.
        // We'll rotate the node so Z points to target, then rotate mesh 90 deg?
        // Or just use LookAt and know the Cylinder is wrong way?
        
        // Better: Use a thin Box instead of Cylinder, scaled along Z.
        // Box default is 1x1x1.
        renderer.mesh = utils.MeshUtils.createMesh(primitives.box());
        seg.lookAt(end); // Z-axis points to end.
        seg.setScale(0.1, 0.1, length); // Scale Z to length
        
        // Tween width out
        tween(seg)
            .to(0.2, { scale: new Vec3(0, 0, length) })
            .start();
    }
}
