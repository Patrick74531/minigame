import { Color, Material, MeshRenderer, Node, Vec3, primitives, tween, utils } from 'cc';
import { VisualEffect } from '../VisualEffect';
import { TextureLoader } from '../runtime/TextureLoader';

export class GooseExplosionEffect {
    private static readonly SMOKE_TEXTURE_PATHS = [
        'effects/build_smoke/texture/loseSmoke01',
        'effects/build_smoke/texture/loseSmoke01.png',
        'effects/build_smoke/loseSmoke01',
        'effects/build_smoke/loseSmoke01.png',
    ];

    public static play(payload: { parent: Node; position: Vec3; radius: number }): void {
        const effectNode = new Node('GooseExplosion');
        payload.parent.addChild(effectNode);
        effectNode.setWorldPosition(payload.position);

        const effectComp = effectNode.addComponent(VisualEffect);
        effectComp.duration = 0.85;

        const radius = Math.max(0.8, payload.radius);
        this.createShockwave(effectNode, radius);
        this.createFlashCore(effectNode, radius);
        this.createDebrisBurst(effectNode, radius);
        this.createSmokePlumes(effectNode, radius);
    }

    private static createShockwave(parent: Node, radius: number): void {
        const ringNode = new Node('GooseShockwave');
        parent.addChild(ringNode);
        ringNode.setPosition(0, 0.04, 0);
        ringNode.setScale(0.28, 1, 0.28);

        const segmentCount = 20;
        const baseRadius = 0.62;
        const ringThickness = 0.12;
        const segmentLength = (Math.PI * 2 * baseRadius) / segmentCount;
        const materials: Material[] = [];

        for (let i = 0; i < segmentCount; i++) {
            const segmentNode = new Node(`GooseShockwaveSeg_${i}`);
            ringNode.addChild(segmentNode);

            const renderer = segmentNode.addComponent(MeshRenderer);
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.box({
                    width: segmentLength * 0.92,
                    height: 0.015,
                    length: ringThickness,
                })
            );

            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            mat.setProperty('mainColor', new Color(255, 188, 98, 210));
            this.enableAdditiveBlend(mat);
            renderer.material = mat;
            this.disableShadows(renderer);
            materials.push(mat);

            const angle = (i / segmentCount) * Math.PI * 2;
            segmentNode.setPosition(Math.cos(angle) * baseRadius, 0, Math.sin(angle) * baseRadius);
            segmentNode.setRotationFromEuler(0, (-angle * 180) / Math.PI, 0);
        }

        tween(ringNode)
            .to(0.14, { scale: new Vec3(radius * 1.15, 1, radius * 1.15) }, { easing: 'quadOut' })
            .to(0.18, { scale: new Vec3(radius * 1.85, 1, radius * 1.85) }, { easing: 'quadIn' })
            .call(() => {
                if (ringNode.isValid) ringNode.destroy();
            })
            .start();

        const alphaState = { value: 210 };
        tween(alphaState)
            .to(
                0.32,
                { value: 0 },
                {
                    easing: 'quadOut',
                    onUpdate: () => {
                        if (!ringNode.isValid) return;
                        const alpha = Math.max(0, alphaState.value);
                        for (const mat of materials) {
                            mat.setProperty('mainColor', new Color(255, 188, 98, alpha));
                        }
                    },
                }
            )
            .start();
    }

    private static createFlashCore(parent: Node, radius: number): void {
        const coreNode = new Node('GooseFlashCore');
        parent.addChild(coreNode);

        const renderer = coreNode.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );

        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        mat.setProperty('mainColor', new Color(255, 238, 205, 235));
        this.enableAdditiveBlend(mat);
        renderer.material = mat;
        this.disableShadows(renderer);

        coreNode.setPosition(0, 0.18, 0);
        coreNode.setScale(0.1, 0.1, 0.1);

        const burst = Math.max(0.5, radius * 0.8);
        tween(coreNode)
            .to(0.09, { scale: new Vec3(burst, burst * 0.78, burst) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(0.08, 0.08, 0.08) }, { easing: 'quadIn' })
            .call(() => {
                if (coreNode.isValid) coreNode.destroy();
            })
            .start();

        const alphaState = { value: 235 };
        tween(alphaState)
            .to(
                0.21,
                { value: 0 },
                {
                    easing: 'quadOut',
                    onUpdate: () => {
                        if (!coreNode.isValid) return;
                        mat.setProperty(
                            'mainColor',
                            new Color(255, 238, 205, Math.max(0, alphaState.value))
                        );
                    },
                }
            )
            .start();
    }

    private static createDebrisBurst(parent: Node, radius: number): void {
        const count = Math.min(28, Math.max(12, Math.round(radius * 10)));

        for (let i = 0; i < count; i++) {
            const debrisNode = new Node(`GooseDebris_${i}`);
            parent.addChild(debrisNode);

            const renderer = debrisNode.addComponent(MeshRenderer);
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.box({ width: 1, height: 1, length: 1 })
            );

            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            mat.setProperty('mainColor', new Color(255, 145, 68, 220));
            renderer.material = mat;
            this.disableShadows(renderer);

            const angle = Math.random() * Math.PI * 2;
            const spread = radius * (0.45 + Math.random() * 0.85);
            const endPos = new Vec3(
                Math.cos(angle) * spread,
                0.35 + Math.random() * (0.45 + radius * 0.12),
                Math.sin(angle) * spread
            );

            debrisNode.setPosition(0, 0.08, 0);
            debrisNode.setRotationFromEuler(
                Math.random() * 360,
                Math.random() * 360,
                Math.random() * 360
            );
            debrisNode.setScale(
                0.08 + Math.random() * 0.07,
                0.08 + Math.random() * 0.07,
                0.22 + Math.random() * 0.18
            );

            tween(debrisNode)
                .to(
                    0.18 + Math.random() * 0.09,
                    { position: endPos, scale: new Vec3(0.02, 0.02, 0.05) },
                    { easing: 'quadOut' }
                )
                .call(() => {
                    if (debrisNode.isValid) debrisNode.destroy();
                })
                .start();

            const alphaState = { value: 220 };
            tween(alphaState)
                .to(
                    0.24 + Math.random() * 0.08,
                    { value: 0 },
                    {
                        easing: 'quadOut',
                        onUpdate: () => {
                            if (!debrisNode.isValid) return;
                            mat.setProperty(
                                'mainColor',
                                new Color(255, 145, 68, Math.max(0, alphaState.value))
                            );
                        },
                    }
                )
                .start();
        }
    }

    private static createSmokePlumes(parent: Node, radius: number): void {
        const count = Math.min(18, Math.max(7, Math.round(radius * 5)));
        const smokeEntries: Array<{
            node: Node;
            material: Material;
            start: () => void;
        }> = [];

        for (let i = 0; i < count; i++) {
            const smokeNode = new Node(`GooseSmoke_${i}`);
            parent.addChild(smokeNode);

            const renderer = smokeNode.addComponent(MeshRenderer);
            renderer.mesh = utils.MeshUtils.createMesh(
                primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
            );

            const mat = new Material();
            mat.initialize({
                effectName: 'builtin-unlit',
                technique: 1,
                defines: { USE_TEXTURE: true },
            });
            mat.setProperty('mainColor', new Color(110, 90, 80, 170));
            renderer.material = mat;
            this.disableShadows(renderer);

            smokeNode.active = false;

            const angle = Math.random() * Math.PI * 2;
            const drift = radius * (0.2 + Math.random() * 0.55);
            const startPos = new Vec3(
                (Math.random() - 0.5) * 0.22,
                0.08 + Math.random() * 0.08,
                (Math.random() - 0.5) * 0.22
            );
            const endPos = new Vec3(
                Math.cos(angle) * drift,
                0.55 + Math.random() * (0.35 + radius * 0.22),
                Math.sin(angle) * drift
            );

            smokeNode.setPosition(startPos);
            smokeNode.setRotationFromEuler(90, Math.random() * 360, 0);
            smokeNode.setScale(0.14, 1, 0.14);

            const endScale = 0.75 + radius * 0.25 + Math.random() * 0.55;
            const spawnDelay = Math.random() * 0.06;
            const riseDuration = 0.36 + Math.random() * 0.2;
            smokeEntries.push({
                node: smokeNode,
                material: mat,
                start: () => {
                    if (!smokeNode.isValid) return;
                    smokeNode.active = true;

                    tween(smokeNode)
                        .delay(spawnDelay)
                        .to(
                            riseDuration,
                            { position: endPos, scale: new Vec3(endScale, 1, endScale) },
                            { easing: 'quadOut' }
                        )
                        .to(0.1, { scale: new Vec3(0.01, 1, 0.01) }, { easing: 'quadIn' })
                        .call(() => {
                            if (smokeNode.isValid) smokeNode.destroy();
                        })
                        .start();

                    const alphaState = { value: 170 };
                    tween(alphaState)
                        .delay(spawnDelay)
                        .to(
                            0.48,
                            { value: 0 },
                            {
                                easing: 'quadOut',
                                onUpdate: () => {
                                    if (!smokeNode.isValid) return;
                                    mat.setProperty(
                                        'mainColor',
                                        new Color(110, 90, 80, Math.max(0, alphaState.value))
                                    );
                                },
                            }
                        )
                        .start();
                },
            });
        }

        TextureLoader.requestWithFallbacks(this.SMOKE_TEXTURE_PATHS, texture => {
            if (!texture) {
                for (const entry of smokeEntries) {
                    if (entry.node.isValid) entry.node.destroy();
                }
                return;
            }
            for (const entry of smokeEntries) {
                entry.material.setProperty('mainTexture', texture);
                entry.start();
            }
        });
    }

    private static enableAdditiveBlend(mat: Material): void {
        if (!mat.passes || mat.passes.length <= 0) return;
        const target = mat.passes[0].blendState.targets[0];
        target.blend = true;
        target.blendSrc = 2;
        target.blendDst = 1;
        target.blendSrcAlpha = 2;
        target.blendDstAlpha = 1;
    }

    private static disableShadows(renderer: MeshRenderer): void {
        renderer.shadowCastingMode = 0;
        renderer.receiveShadow = 0;
    }
}
