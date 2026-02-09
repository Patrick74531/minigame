import {
    Color,
    Material,
    MeshRenderer,
    Node,
    ParticleSystem,
    Vec3,
    primitives,
    tween,
    utils,
} from 'cc';
import { VisualEffect } from '../VisualEffect';
import { TextureLoader } from '../runtime/TextureLoader';

type ParticleSystemMutable = ParticleSystem & {
    startSize?: number;
    startSpeed?: number;
    startLifetime?: number;
    gravityModifier?: number;
    material?: Material;
};

export class FrostExplosionEffect {
    private static readonly RAIN_DROP_TEXTURE_PATHS = [
        'textures/droplet/texture',
        'textures/droplet',
        'textures/droplet.webp',
    ];

    public static play(payload: { parent: Node; position: Vec3; radius: number }): void {
        const effectNode = new Node('FrostExplosion');
        payload.parent.addChild(effectNode);
        effectNode.setWorldPosition(payload.position);

        const effectComp = effectNode.addComponent(VisualEffect);
        effectComp.duration = 1.5;

        this.createShockwaveRing(effectNode, payload.radius);
        this.createIceParticles(effectNode);
        this.createRainDrizzle(effectNode, payload.radius);
    }

    private static createShockwaveRing(parent: Node, radius: number): void {
        const ringNode = new Node('ShockwaveRing');
        parent.addChild(ringNode);

        const renderer = ringNode.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
        );

        const material = new Material();
        material.initialize({
            effectName: 'builtin-unlit',
            technique: 1,
            defines: { USE_TEXTURE: true },
        });
        material.setProperty('mainColor', new Color(100, 200, 255, 255));
        renderer.material = material;

        TextureLoader.requestWithFallbacks(
            [
                'textures/shockwave_ring/texture',
                'textures/shockwave_ring',
                'textures/shockwave_ring.png',
            ],
            texture => {
                if (!texture) return;
                material.setProperty('mainTexture', texture);
                if (material.passes && material.passes.length > 0) {
                    const target = material.passes[0].blendState.targets[0];
                    target.blend = true;
                    target.blendSrc = 2;
                    target.blendDst = 1;
                    target.blendSrcAlpha = 2;
                    target.blendDstAlpha = 1;
                }
            }
        );

        const effect = ringNode.addComponent(VisualEffect);
        effect.duration = 1.0;
        effect.playScaleAnim(radius * 2, 0.5);
    }

    private static createIceParticles(parent: Node): void {
        const particleNode = new Node('IceParticles');
        parent.addChild(particleNode);

        const particleSystem = particleNode.addComponent(ParticleSystem);
        const particleMutable = particleSystem as ParticleSystemMutable;
        particleSystem.duration = 0.5;
        particleSystem.loop = false;
        particleSystem.playOnAwake = true;
        particleSystem.capacity = 50;
        particleSystem.startColor = new Color(200, 240, 255, 255);
        particleMutable.startSize = 0.5;
        particleMutable.startSpeed = 10;
        particleMutable.startLifetime = 0.8;
        particleMutable.gravityModifier = 2.0;

        TextureLoader.requestWithFallbacks(
            [
                'textures/frost_particle/texture',
                'textures/frost_particle',
                'textures/frost_particle.png',
            ],
            texture => {
                if (!texture) return;
                if (!particleMutable.material) return;
                const mat = particleMutable.material;
                mat.setProperty('mainTexture', texture);
                if (mat.passes && mat.passes.length > 0) {
                    const target = mat.passes[0].blendState.targets[0];
                    target.blend = true;
                    target.blendSrc = 2;
                    target.blendDst = 1;
                }
            }
        );
    }

    private static createRainDrizzle(parent: Node, radius: number): void {
        const rainNode = new Node('RainDrizzle');
        parent.addChild(rainNode);

        const dropCount = Math.max(10, Math.round(radius * 7));
        const dropMaterials: Material[] = [];
        for (let i = 0; i < dropCount; i++) {
            const dropNode = new Node(`Drop_${i}`);
            rainNode.addChild(dropNode);

            const renderer = dropNode.addComponent(MeshRenderer);
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
            );

            const mat = new Material();
            mat.initialize({
                effectName: 'builtin-unlit',
                technique: 1,
                defines: { USE_TEXTURE: true },
            });
            mat.setProperty('mainColor', new Color(140, 205, 255, 220));
            renderer.material = mat;
            dropMaterials.push(mat);

            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * Math.max(0.8, radius * 0.95);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const startY = 2.4 + Math.random() * 1.2;
            const endY = 0.12 + Math.random() * 0.25;
            const startPos = new Vec3(x, startY, z);
            const endPos = new Vec3(
                x + (Math.random() - 0.5) * 0.22,
                endY,
                z + (Math.random() - 0.5) * 0.22
            );

            dropNode.setPosition(startPos);
            dropNode.setRotationFromEuler(90, Math.random() * 360, 0);
            dropNode.setScale(0.12, 1, 0.34 + Math.random() * 0.2);

            tween(dropNode)
                .delay(Math.random() * 0.12)
                .to(0.32 + Math.random() * 0.16, { position: endPos }, { easing: 'quadIn' })
                .call(() => {
                    if (dropNode.isValid) dropNode.destroy();
                })
                .start();
        }

        TextureLoader.requestWithFallbacks(this.RAIN_DROP_TEXTURE_PATHS, texture => {
            if (!texture) return;
            for (const mat of dropMaterials) {
                mat.setProperty('mainTexture', texture);
                mat.setProperty('mainColor', new Color(255, 255, 255, 230));
            }
        });
    }
}
