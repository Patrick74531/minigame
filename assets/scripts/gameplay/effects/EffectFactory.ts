import { _decorator, Node, ParticleSystem, Texture2D, Asset, resources, Material, Color, MeshRenderer, primitives, utils, Vec3, Billboard } from 'cc';
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
}
