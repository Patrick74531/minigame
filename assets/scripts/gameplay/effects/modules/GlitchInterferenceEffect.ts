import { Color, Material, MeshRenderer, Node, Vec3, primitives, tween, utils } from 'cc';
import { VisualEffect } from '../VisualEffect';
import { TextureLoader } from '../runtime/TextureLoader';

export class GlitchInterferenceEffect {
    private static readonly NOISE_TEXTURE_PATHS = [
        'textures/beam_noise/texture',
        'textures/beam_noise',
        'textures/beam_noise.png',
    ];

    public static play(payload: { parent: Node; position: Vec3; radius: number }): void {
        const effectNode = new Node('GlitchInterference');
        payload.parent.addChild(effectNode);
        effectNode.setWorldPosition(payload.position);

        const effectComp = effectNode.addComponent(VisualEffect);
        effectComp.duration = 0.78;

        this.createWarpRings(effectNode, payload.radius);
        this.createNoiseSlices(effectNode, payload.radius);
    }

    private static createWarpRings(parent: Node, radius: number): void {
        const ringCount = 3;
        const mats: Material[] = [];

        for (let ring = 0; ring < ringCount; ring++) {
            const ringRadius = Math.max(0.5, radius * (0.24 + ring * 0.22));
            const segmentCount = 10 + ring * 4;
            const y = 0.1 + ring * 0.05;

            for (let i = 0; i < segmentCount; i++) {
                const segNode = new Node(`GlitchSeg_${ring}_${i}`);
                parent.addChild(segNode);

                const renderer = segNode.addComponent(MeshRenderer);
                renderer.mesh = utils.MeshUtils.createMesh(
                    primitives.box({ width: 1, height: 1, length: 1 })
                );

                const mat = new Material();
                mat.initialize({
                    effectName: 'builtin-unlit',
                    technique: 1,
                    defines: { USE_TEXTURE: true },
                });
                const alpha = Math.max(110, 205 - ring * 28);
                mat.setProperty('mainColor', new Color(110, 255, 245, alpha));
                this.enableAdditiveBlend(mat);
                renderer.material = mat;
                mats.push(mat);

                const angle = (Math.PI * 2 * i) / segmentCount + (Math.random() - 0.5) * 0.12;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const startPos = new Vec3(cos * ringRadius, y, sin * ringRadius);
                const endPos = new Vec3(
                    cos * (ringRadius + 0.26 + Math.random() * 0.2),
                    y + (Math.random() - 0.5) * 0.08,
                    sin * (ringRadius + 0.26 + Math.random() * 0.2)
                );
                const segLen = 0.22 + radius * 0.08 + Math.random() * 0.12;

                segNode.setPosition(startPos);
                segNode.setRotationFromEuler(0, -angle * (180 / Math.PI) + 90, 0);
                segNode.setScale(0.1 + Math.random() * 0.04, 0.06, segLen);

                const alphaState = { value: alpha };
                tween(alphaState)
                    .delay(ring * 0.05 + Math.random() * 0.08)
                    .to(
                        0.22 + Math.random() * 0.1,
                        { value: 0 },
                        {
                            easing: 'quadOut',
                            onUpdate: () => {
                                if (!segNode.isValid) return;
                                const c = new Color(110, 255, 245, Math.max(0, alphaState.value));
                                mat.setProperty('mainColor', c);
                            },
                        }
                    )
                    .start();

                tween(segNode)
                    .delay(ring * 0.05 + Math.random() * 0.08)
                    .to(
                        0.18 + Math.random() * 0.12,
                        { position: endPos, scale: new Vec3(0.04, 0.03, segLen * 0.6) },
                        { easing: 'quadOut' }
                    )
                    .to(
                        0.08,
                        {
                            scale: new Vec3(0.01, 0.01, Math.max(0.01, segLen * 0.1)),
                        },
                        { easing: 'quadIn' }
                    )
                    .call(() => {
                        if (segNode.isValid) segNode.destroy();
                    })
                    .start();
            }
        }

        this.applyNoiseTexture(mats);
    }

    private static createNoiseSlices(parent: Node, radius: number): void {
        const count = Math.min(22, Math.max(10, Math.round(radius * 5)));
        const mats: Material[] = [];

        for (let i = 0; i < count; i++) {
            const sliceNode = new Node(`NoiseSlice_${i}`);
            parent.addChild(sliceNode);

            const renderer = sliceNode.addComponent(MeshRenderer);
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
            );

            const mat = new Material();
            mat.initialize({
                effectName: 'builtin-unlit',
                technique: 1,
                defines: { USE_TEXTURE: true },
            });
            mat.setProperty('mainColor', new Color(145, 255, 250, 185));
            this.enableAdditiveBlend(mat);
            renderer.material = mat;
            mats.push(mat);

            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * Math.max(0.4, radius * 0.55);
            const start = new Vec3(
                Math.cos(angle) * dist,
                0.12 + Math.random() * 0.2,
                Math.sin(angle) * dist
            );
            const end = new Vec3(
                start.x + (Math.random() - 0.5) * 0.8,
                start.y + (Math.random() - 0.5) * 0.16,
                start.z + (Math.random() - 0.5) * 0.8
            );

            sliceNode.setPosition(start);
            sliceNode.setRotationFromEuler(90, Math.random() * 360, 0);
            sliceNode.setScale(0.12 + Math.random() * 0.07, 1, 0.4 + Math.random() * 0.55);

            const alphaState = { value: 185 };
            tween(alphaState)
                .delay(Math.random() * 0.06)
                .to(
                    0.16 + Math.random() * 0.08,
                    { value: 0 },
                    {
                        easing: 'quadOut',
                        onUpdate: () => {
                            if (!sliceNode.isValid) return;
                            const c = new Color(145, 255, 250, Math.max(0, alphaState.value));
                            mat.setProperty('mainColor', c);
                        },
                    }
                )
                .start();

            tween(sliceNode)
                .delay(Math.random() * 0.06)
                .to(0.08 + Math.random() * 0.04, { position: end }, { easing: 'quadOut' })
                .to(0.08, { scale: new Vec3(0.03, 1, 0.08) }, { easing: 'quadIn' })
                .call(() => {
                    if (sliceNode.isValid) sliceNode.destroy();
                })
                .start();
        }

        this.applyNoiseTexture(mats);
    }

    private static applyNoiseTexture(mats: Material[]): void {
        TextureLoader.requestWithFallbacks(this.NOISE_TEXTURE_PATHS, texture => {
            if (!texture) return;
            for (const mat of mats) {
                mat.setProperty('mainTexture', texture);
            }
        });
    }

    private static enableAdditiveBlend(mat: Material): void {
        if (!mat.passes || mat.passes.length === 0) return;
        const target = mat.passes[0].blendState.targets[0];
        target.blend = true;
        target.blendSrc = 2;
        target.blendDst = 1;
        target.blendSrcAlpha = 2;
        target.blendDstAlpha = 1;
    }
}
