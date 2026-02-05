import {
    _decorator,
    Node,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Color,
    Component,
    RigidBody,
    BoxCollider,
    Vec3,
    Prefab,
    instantiate,
    resources,
    SkeletalAnimation,
    AnimationClip,
    Renderer,
} from 'cc';
import { Enemy } from './Enemy';
import { Soldier } from './Soldier';
import { Hero } from './Hero';
import { GameConfig } from '../../data/GameConfig';
import { HeroAnimationController } from './HeroAnimationController';

/**
 * 单位工厂
 * 负责创建和配置所有单位实体
 */
export class UnitFactory {
    private static _materials: Map<string, Material> = new Map();
    private static _heroRunPrefab: Prefab | null = null;
    private static _heroRunLoading: boolean = false;
    private static _heroIdleClipLoading: boolean = false;
    private static _heroIdleClip: AnimationClip | null = null;
    private static readonly HERO_RUN_PREFAB_PATH =
        'character/Meshy_AI_Animation_Running_withSkin/Meshy_AI_Animation_Running_withSkin';
    private static readonly HERO_RUN_PREFAB_FALLBACK =
        'character/Meshy_AI_Animation_Running_withSkin';
    private static readonly HERO_RUN_CLIP_PATH =
        'character/Meshy_AI_Animation_Running_withSkin/Armature|running|baselayer';
    private static readonly HERO_RUN_CLIP_FALLBACK =
        'character/Meshy_AI_Animation_Running_withSkin';
    private static readonly HERO_IDLE_CLIP_PATH =
        'character/Meshy_AI_Animation_Idle_withSkin/Armature|Idle|baselayer';
    private static readonly HERO_IDLE_CLIP_FALLBACK =
        'character/Meshy_AI_Animation_Idle_withSkin';

    /**
     * 创建敌人
     */
    public static createEnemy(
        parent: Node,
        x: number,
        z: number,
        targetPos: Vec3,
        waveMultiplier: number = 1
    ): Node {
        const node = this.createCubeNode('Enemy', new Color(220, 60, 60, 255));
        node.setPosition(x, GameConfig.PHYSICS.ENEMY_Y, z); // Raised
        node.setScale(0.35, 0.35, 0.35);
        parent.addChild(node);

        const enemy = node.addComponent(Enemy);

        // Physics Setup
        const rb = node.addComponent(RigidBody);
        rb.type = RigidBody.Type.DYNAMIC; // Dynamic for physics movement
        rb.useGravity = false;
        rb.linearDamping = GameConfig.PHYSICS.UNIT_LINEAR_DAMPING; // Low damping
        rb.angularFactor = new Vec3(0, 0, 0); // Lock rotation
        rb.linearFactor = new Vec3(1, 0, 1);
        rb.group = 1 << 3; // GROUP_ENEMY

        const col = node.addComponent(BoxCollider);
        col.size = new Vec3(1, 1, 1);
        col.isTrigger = false; // Solid for collision
        col.setGroup(1 << 3); // ENEMY
        col.setMask(0xffffffff); // Collide with all

        enemy.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP * waveMultiplier,
            attack: GameConfig.ENEMY.BASE_ATTACK,
            attackRange: GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED * (1 + (waveMultiplier - 1) * 0.1),
        });

        // Set Target
        enemy.setTargetPosition(targetPos);

        return node;
    }

    /**
     * 创建士兵
     */
    public static createSoldier(parent: Node, x: number, z: number): Node {
        const node = this.createCubeNode('Soldier', new Color(60, 140, 220, 255));
        node.setPosition(x, GameConfig.PHYSICS.SOLDIER_Y, z); // Spawn high safe
        node.setScale(0.3, 0.3, 0.3);
        parent.addChild(node);

        // Physics for Soldier
        const rb = node.addComponent(RigidBody);
        rb.type = RigidBody.Type.DYNAMIC;
        rb.useGravity = false;
        rb.linearDamping = GameConfig.PHYSICS.UNIT_LINEAR_DAMPING;
        rb.angularFactor = new Vec3(0, 0, 0);
        rb.linearFactor = new Vec3(1, 0, 1); // Lock Y
        // Group? Let's say Soldier is layer 5 or just Default(0) for now if not defined
        // Using Default (1<<0) is fine for now

        const col = node.addComponent(BoxCollider);
        col.size = new Vec3(1, 1, 1);
        col.isTrigger = false;
        col.setGroup(1 << 0);
        col.setMask(0xffffffff);

        const soldier = node.addComponent(Soldier);
        soldier.initStats({
            maxHp: GameConfig.SOLDIER.BASE_HP,
            attack: GameConfig.SOLDIER.BASE_ATTACK,
            attackRange: GameConfig.SOLDIER.ATTACK_RANGE,
            attackInterval: GameConfig.SOLDIER.ATTACK_INTERVAL,
            moveSpeed: GameConfig.SOLDIER.MOVE_SPEED,
        });

        return node;
    }

    public static createHero(parent: Node, x: number, z: number): Node {
        const node = this.createCubeNode('Hero', new Color(255, 215, 0, 255));
        node.setPosition(x, GameConfig.PHYSICS.HERO_Y, z); // Raised to be safe
        node.setScale(0.5, 0.5, 0.5);
        parent.addChild(node);

        // 英雄使用 Hero 组件
        const hero = node.addComponent(Hero);
        // Physics logic moved to Hero component initialize usually,
        // but if we add it here, we must ensure it matches.
        // Let's rely on Hero.ts initialize or configure it here nicely.
        // Actually UnitFactory previously didn't add RB to Hero!
        // Wait, looking at previous view_file of UnitFactory...
        // It DID NOT add RB to Hero in the original code I viewed in step 300!
        // It only added RB to Enemy and Soldier.
        // BUT my recent edits MIGHT have added it?
        // Checking my memory... checking file content...
        // Step 304 diff shows createHero UNCHANGED except position.
        // So UnitFactory DOES NOT add RB to Hero. Hero.ts adds it.
        // So I should only change spawn height here.

        hero.initStats({
            maxHp: GameConfig.HERO.BASE_HP,
            attack: GameConfig.HERO.BASE_ATTACK,
            attackRange: GameConfig.HERO.ATTACK_RANGE,
            attackInterval: GameConfig.HERO.ATTACK_INTERVAL,
            moveSpeed: GameConfig.HERO.MOVE_SPEED,
        });

        this.attachHeroModel(node);

        return node;
    }

    /**
     * 创建 3D 立方体节点
     */
    private static createCubeNode(name: string, color: Color): Node {
        const node = new Node(name);
        const renderer = node.addComponent(MeshRenderer);

        // 创建立方体网格
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );

        // 获取或创建材质
        const colorKey = `${color.r}_${color.g}_${color.b}`;
        let material = this._materials.get(colorKey);

        if (!material) {
            material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', color);
            this._materials.set(colorKey, material);
        }

        renderer.material = material;
        return node;
    }

    /**
     * 清理材质缓存
     */
    public static clearCache(): void {
        this._materials.clear();
    }

    private static attachHeroModel(root: Node): void {
        if (root.getChildByName('HeroModel')) return;

        const attach = (prefab: Prefab) => {
            if (!root.isValid) return;
            if (root.getChildByName('HeroModel')) return;

            const model = instantiate(prefab);
            model.name = 'HeroModel';
            model.setPosition(0, GameConfig.HERO.MODEL_OFFSET_Y, 0);
            const scale = Math.max(GameConfig.HERO.MODEL_SCALE, 0.05);
            model.setScale(scale, scale, scale);
            model.setRotationFromEuler(0, GameConfig.HERO.MODEL_ROT_Y, 0);
            this.applyLayerRecursive(model, root.layer);
            root.addChild(model);

            const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
            const mesh = root.getComponent(MeshRenderer);
            if (mesh && hasRenderer) {
                mesh.enabled = false;
            }

            const anim = this.diagnoseModelAnimations(model);

            const hero = root.getComponent(Hero);
            let controller = root.getComponent(HeroAnimationController);
            if (!controller) {
                controller = root.addComponent(HeroAnimationController);
            }
            controller.configure(hero, anim, null);

            if (anim) {
                const existing = anim.clips && anim.clips.length > 0 ? anim.clips[0] : null;
                if (existing) {
                    console.warn('[UnitFactory] Found existing run clip:', existing.name);
                    controller.setRunClip(existing.name);
                } else {
                    this.ensureRunClip(anim, controller);
                }
                this.ensureIdleClip(anim, controller);
            }
        };

        this.loadRunPrefab(attach);
    }

    private static diagnoseModelAnimations(model: Node): SkeletalAnimation | null {
        const skels = model.getComponentsInChildren(SkeletalAnimation);
        const infos = skels.map((skel) => {
            const names = skel.clips ? skel.clips.map((c) => c.name).join(',') : '';
            return `${skel.node.name} [${names}]`;
        });
        console.warn('[UnitFactory] SkeletalAnimation count:', skels.length, infos);
        const anim = skels[0] ?? null;
        if (!anim) {
            console.warn('[UnitFactory] No SkeletalAnimation found in model.');
        }
        return anim;
    }

    private static ensureRunClip(
        anim: SkeletalAnimation,
        controller: HeroAnimationController | null
    ): void {
        resources.load(this.HERO_RUN_CLIP_PATH, AnimationClip, (err, clip) => {
            if (!err && clip) {
                if (!anim.node || !anim.node.isValid) {
                    return;
                }
                console.warn('[UnitFactory] Run clip loaded:', clip.name);
                this.addClipIfNeeded(anim, clip);
                if (controller) {
                    controller.setRunClip(clip.name);
                }
                return;
            }

            resources.load(this.HERO_RUN_CLIP_FALLBACK, AnimationClip, (fallbackErr, fallbackClip) => {
                if (fallbackErr || !fallbackClip) {
                    console.warn('[UnitFactory] Failed to load hero run clip:', err ?? fallbackErr);
                    return;
                }
                if (!anim.node || !anim.node.isValid) {
                    return;
                }
                console.warn('[UnitFactory] Run clip loaded (fallback):', fallbackClip.name);
                this.addClipIfNeeded(anim, fallbackClip);
                if (controller) {
                    controller.setRunClip(fallbackClip.name);
                }
            });
        });
    }

    private static ensureIdleClip(
        anim: SkeletalAnimation,
        controller: HeroAnimationController | null
    ): void {
        if (!anim.node || !anim.node.isValid) {
            return;
        }
        if (this._heroIdleClip) {
            this.addClipIfNeeded(anim, this._heroIdleClip);
            anim.defaultClip = this._heroIdleClip;
            anim.playOnLoad = true;
            if (controller) {
                controller.setIdleClip(this._heroIdleClip.name);
            }
            return;
        }
        if (this._heroIdleClipLoading) return;
        this._heroIdleClipLoading = true;
        resources.load(this.HERO_IDLE_CLIP_PATH, AnimationClip, (err, clip) => {
            if (!err && clip) {
                this._heroIdleClipLoading = false;
                if (!anim.node || !anim.node.isValid) {
                    return;
                }
                this._heroIdleClip = clip;
                this.addClipIfNeeded(anim, clip);
                anim.defaultClip = clip;
                anim.playOnLoad = true;
                console.warn('[UnitFactory] Idle clip loaded:', clip.name);
                if (controller) {
                    controller.setIdleClip(clip.name);
                }
                return;
            }

            resources.load(this.HERO_IDLE_CLIP_FALLBACK, AnimationClip, (fallbackErr, fallbackClip) => {
                this._heroIdleClipLoading = false;
                if (fallbackErr || !fallbackClip) {
                    console.warn('[UnitFactory] Failed to load hero idle clip:', err ?? fallbackErr);
                    return;
                }
                if (!anim.node || !anim.node.isValid) {
                    return;
                }
                this._heroIdleClip = fallbackClip;
                this.addClipIfNeeded(anim, fallbackClip);
                anim.defaultClip = fallbackClip;
                anim.playOnLoad = true;
                console.warn('[UnitFactory] Idle clip loaded (fallback):', fallbackClip.name);
                if (controller) {
                    controller.setIdleClip(fallbackClip.name);
                }
            });
        });
    }

    private static loadRunPrefab(attach: (prefab: Prefab) => void): void {
        if (this._heroRunPrefab) {
            attach(this._heroRunPrefab);
            return;
        }

        if (this._heroRunLoading) return;
        this._heroRunLoading = true;
        
        resources.load(this.HERO_RUN_PREFAB_PATH, Prefab, (err, prefab) => {
            if (!err && prefab) {
                this._heroRunLoading = false;
                this._heroRunPrefab = prefab;
                attach(prefab);
                return;
            }

            resources.load(this.HERO_RUN_PREFAB_FALLBACK, Prefab, (fallbackErr, fallbackPrefab) => {
                this._heroRunLoading = false;
                if (fallbackErr || !fallbackPrefab) {
                    console.warn('[UnitFactory] Failed to load hero run prefab:', err ?? fallbackErr);
                    return;
                }
                this._heroRunPrefab = fallbackPrefab;
                attach(fallbackPrefab);
            });
        });
    }

    private static addClipIfNeeded(
        anim: SkeletalAnimation,
        clip: AnimationClip
    ): void {
        if (anim.clips && anim.clips.some((existing) => existing && existing.name === clip.name)) {
            return;
        }
        anim.addClip(clip);
    }

    private static applyLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) {
            this.applyLayerRecursive(child, layer);
        }
    }
}
