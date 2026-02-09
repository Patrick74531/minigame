import { Color, Material, MeshRenderer, Node, Vec3, primitives, tween, utils } from 'cc';
import { VisualEffect } from '../VisualEffect';
import { TextureLoader } from '../runtime/TextureLoader';

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
        effectComp.duration = 1.0;

        this.createRainDrizzle(effectNode, payload.radius);
    }

    public static playCastSpray(payload: { parent: Node; position: Vec3; radius: number }): void {
        const effectNode = new Node('FrostCastSpray');
        payload.parent.addChild(effectNode);
        effectNode.setWorldPosition(payload.position);

        const effectComp = effectNode.addComponent(VisualEffect);
        effectComp.duration = 0.55;

        this.createCastSpray(effectNode, payload.radius);
    }

    private static createCastSpray(parent: Node, radius: number): void {
        const sprayCount = Math.min(36, Math.max(16, Math.round(radius * 8)));
        const sprayMaterials: Material[] = [];

        for (let i = 0; i < sprayCount; i++) {
            const dropNode = new Node(`SprayDrop_${i}`);
            parent.addChild(dropNode);

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
            mat.setProperty('mainColor', new Color(168, 223, 255, 210));
            renderer.material = mat;
            sprayMaterials.push(mat);

            const angle = Math.random() * Math.PI * 2;
            const outward = 0.35 + Math.random() * Math.max(0.25, radius * 0.22);
            const startPos = new Vec3(
                (Math.random() - 0.5) * 0.12,
                0.04 + Math.random() * 0.08,
                (Math.random() - 0.5) * 0.12
            );
            const midPos = new Vec3(
                Math.cos(angle) * outward * 0.62,
                0.24 + Math.random() * 0.12,
                Math.sin(angle) * outward * 0.62
            );
            const endPos = new Vec3(
                Math.cos(angle) * outward,
                -0.45 - Math.random() * 0.28,
                Math.sin(angle) * outward
            );

            dropNode.setPosition(startPos);
            dropNode.setRotationFromEuler(90, Math.random() * 360, 0);
            dropNode.setScale(0.1, 1, 0.26 + Math.random() * 0.18);

            tween(dropNode)
                .delay(Math.random() * 0.04)
                .to(0.08 + Math.random() * 0.03, { position: midPos }, { easing: 'quadOut' })
                .to(
                    0.16 + Math.random() * 0.08,
                    {
                        position: endPos,
                        scale: new Vec3(0.03, 1, 0.08 + Math.random() * 0.06),
                    },
                    { easing: 'quadIn' }
                )
                .call(() => {
                    if (dropNode.isValid) dropNode.destroy();
                })
                .start();
        }

        TextureLoader.requestWithFallbacks(this.RAIN_DROP_TEXTURE_PATHS, texture => {
            if (!texture) return;
            for (const mat of sprayMaterials) {
                mat.setProperty('mainTexture', texture);
                mat.setProperty('mainColor', new Color(255, 255, 255, 210));
            }
        });
    }

    private static createRainDrizzle(parent: Node, radius: number): void {
        const rainNode = new Node('RainDrizzle');
        parent.addChild(rainNode);

        const dropCount = Math.min(120, Math.max(28, Math.round(radius * 20)));
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
            const startY = 2.6 + Math.random() * 1.6;
            const endY = 0.12 + Math.random() * 0.25;
            const startPos = new Vec3(x, startY, z);
            const endPos = new Vec3(
                x + (Math.random() - 0.5) * 0.22,
                endY,
                z + (Math.random() - 0.5) * 0.22
            );

            dropNode.setPosition(startPos);
            dropNode.setRotationFromEuler(90, Math.random() * 360, 0);
            dropNode.setScale(0.11, 1, 0.36 + Math.random() * 0.26);

            tween(dropNode)
                .delay(Math.random() * 0.07)
                .to(0.24 + Math.random() * 0.12, { position: endPos }, { easing: 'quadIn' })
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
