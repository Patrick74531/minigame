import {
    _decorator,
    Node,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Color,
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
import { HealthBar } from '../../ui/HealthBar';
import { GameConfig } from '../../data/GameConfig';
import { HeroAnimationController } from './HeroAnimationController';
import { AnimRootScaleLock } from '../visuals/AnimRootScaleLock';
import { resolveHeroModelConfig } from './HeroModelConfig';

export interface EnemySpawnOptions {
    hpMultiplier?: number;
    attackMultiplier?: number;
    speedMultiplier?: number;
    isElite?: boolean;
    scaleMultiplier?: number;
    coinDropMultiplier?: number;
}

/**
 * 单位工厂
 * 负责创建和配置所有单位实体
 */
export class UnitFactory {
    private static _materials: Map<string, Material> = new Map();
    private static _heroPrefabs: Map<string, Prefab> = new Map();
    private static _heroPrefabLoading: Set<string> = new Set();
    private static _heroRunClipCache: Map<string, AnimationClip> = new Map();
    private static _heroRunClipLoading: Set<string> = new Set();
    private static _heroIdleClipCache: Map<string, AnimationClip> = new Map();
    private static _heroIdleClipLoading: Set<string> = new Set();

    /**
     * 创建敌人
     */
    public static createEnemy(
        parent: Node,
        x: number,
        z: number,
        targetPos: Vec3,
        options: EnemySpawnOptions = {}
    ): Node {
        const isElite = options.isElite ?? false;
        const node = this.createCubeNode(
            isElite ? 'Enemy_Elite' : 'Enemy',
            isElite ? new Color(235, 245, 160, 255) : new Color(220, 60, 60, 255)
        );
        const scaleMultiplier = options.scaleMultiplier ?? 1;
        const baseScale = 0.35;
        node.setPosition(x, GameConfig.PHYSICS.ENEMY_Y, z); // Raised
        node.setScale(
            baseScale * scaleMultiplier,
            baseScale * scaleMultiplier,
            baseScale * scaleMultiplier
        );
        parent.addChild(node);

        const enemy = node.addComponent(Enemy);

        // Physics Setup
        const rb = node.addComponent(RigidBody);
        // Enemy uses script-driven movement; KINEMATIC avoids heavy dynamic solver cost in crowds.
        rb.type = RigidBody.Type.KINEMATIC;
        rb.useGravity = false;
        rb.linearDamping = GameConfig.PHYSICS.UNIT_LINEAR_DAMPING; // Low damping
        rb.angularFactor = new Vec3(0, 0, 0); // Lock rotation
        rb.linearFactor = new Vec3(1, 0, 1);
        rb.group = 1 << 3; // GROUP_ENEMY

        const col = node.addComponent(BoxCollider);
        col.size = new Vec3(1, 1, 1);
        col.isTrigger = false; // Solid for collision
        col.setGroup(1 << 3); // ENEMY
        // Collide only with DEFAULT (buildings/hero/soldier) and BULLET.
        // Excluding ENEMY-ENEMY collisions greatly reduces physics cost and crowd jitter.
        col.setMask((1 << 0) | (1 << 4));

        const hpMultiplier = options.hpMultiplier ?? 1;
        const attackMultiplier = options.attackMultiplier ?? 1;
        const speedMultiplier = options.speedMultiplier ?? 1;

        enemy.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP * hpMultiplier,
            attack: GameConfig.ENEMY.BASE_ATTACK * attackMultiplier,
            attackRange: GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED * speedMultiplier,
        });
        enemy.setVariant({
            isElite,
            coinDropMultiplier: options.coinDropMultiplier ?? 1,
        });

        // Set Target
        enemy.setTargetPosition(targetPos);

        // 血条
        const hb = node.addComponent(HealthBar);
        hb.width = 80;
        hb.height = 8;
        hb.yOffset = 1.8;

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

        // 英雄血条（显示在头顶，金币堆叠在血条上方）
        const hb = node.addComponent(HealthBar);
        hb.width = 100;
        hb.height = 10;
        hb.yOffset = 2.0;

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
            const config = resolveHeroModelConfig();
            const scale = Math.max(config.transformScale, 0.05);
            model.setPosition(0, config.transformOffsetY, 0);
            model.setScale(scale, scale, scale);
            model.setRotationFromEuler(0, config.transformRotY, 0);
            this.applyLayerRecursive(model, root.layer);
            root.addChild(model);

            const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
            const mesh = root.getComponent(MeshRenderer);
            if (mesh && hasRenderer) {
                mesh.enabled = false;
            }

            const anim = this.getModelSkeletalAnimation(model);

            const hero = root.getComponent(Hero);
            let controller = root.getComponent(HeroAnimationController);
            if (!controller) {
                controller = root.addComponent(HeroAnimationController);
            }
            controller.configure(hero, anim, null);

            if (anim) {
                if (config.lockAnimRootScale) {
                    let lock = anim.node.getComponent(AnimRootScaleLock);
                    if (!lock) {
                        lock = anim.node.addComponent(AnimRootScaleLock);
                    }
                    lock.scale.set(
                        config.animRootScale,
                        config.animRootScale,
                        config.animRootScale
                    );
                }
                const existing = anim.clips && anim.clips.length > 0 ? anim.clips[0] : null;
                if (existing) {
                    controller.setRunClip(existing.name);
                } else {
                    this.ensureRunClip(anim, controller);
                }
                this.ensureIdleClip(anim, controller);
            }
        };

        this.loadRunPrefab(attach);
    }

    private static getModelSkeletalAnimation(model: Node): SkeletalAnimation | null {
        const skels = model.getComponentsInChildren(SkeletalAnimation);
        return skels[0] ?? null;
    }

    private static ensureRunClip(
        anim: SkeletalAnimation,
        controller: HeroAnimationController | null
    ): void {
        const config = resolveHeroModelConfig();
        if (!config) return;

        const cached = this._heroRunClipCache.get(config.key);
        if (cached) {
            this.addClipIfNeeded(anim, cached);
            if (controller) {
                controller.setRunClip(cached.name);
            }
            return;
        }

        if (this._heroRunClipLoading.has(config.key)) return;
        this._heroRunClipLoading.add(config.key);

        const paths = this.buildClipPaths(config.runClipPath, config.runClipFallbacks);
        this.loadWithFallbacks(paths, AnimationClip, (err, clip) => {
            this._heroRunClipLoading.delete(config.key);
            if (!clip) {
                console.warn('[UnitFactory] Failed to load hero run clip:', err);
                return;
            }
            if (!anim.node || !anim.node.isValid) {
                return;
            }
            this._heroRunClipCache.set(config.key, clip);
            this.addClipIfNeeded(anim, clip);
            if (controller) {
                controller.setRunClip(clip.name);
            }
        });
    }

    private static ensureIdleClip(
        anim: SkeletalAnimation,
        controller: HeroAnimationController | null
    ): void {
        if (!anim.node || !anim.node.isValid) {
            return;
        }
        const config = resolveHeroModelConfig();
        if (!config) return;

        const cached = this._heroIdleClipCache.get(config.key);
        if (cached) {
            this.addClipIfNeeded(anim, cached);
            anim.defaultClip = cached;
            anim.playOnLoad = true;
            if (controller) {
                controller.setIdleClip(cached.name);
            }
            return;
        }

        if (this._heroIdleClipLoading.has(config.key)) return;
        this._heroIdleClipLoading.add(config.key);

        const paths = this.buildClipPaths(config.idleClipPath, config.idleClipFallbacks);
        this.loadWithFallbacks(paths, AnimationClip, (err, clip) => {
            this._heroIdleClipLoading.delete(config.key);
            if (!clip) {
                console.warn('[UnitFactory] Failed to load hero idle clip:', err);
                return;
            }
            if (!anim.node || !anim.node.isValid) {
                return;
            }
            this._heroIdleClipCache.set(config.key, clip);
            this.addClipIfNeeded(anim, clip);
            anim.defaultClip = clip;
            anim.playOnLoad = true;
            if (controller) {
                controller.setIdleClip(clip.name);
            }
        });
    }

    private static loadRunPrefab(attach: (prefab: Prefab) => void): void {
        const config = resolveHeroModelConfig();
        if (!config) return;

        const cached = this._heroPrefabs.get(config.key);
        if (cached) {
            attach(cached);
            return;
        }

        if (this._heroPrefabLoading.has(config.key)) return;
        this._heroPrefabLoading.add(config.key);

        const paths = this.buildPrefabPaths(config);
        this.loadWithFallbacks(paths, Prefab, (err, prefab) => {
            this._heroPrefabLoading.delete(config.key);
            if (!prefab) {
                console.warn('[UnitFactory] Failed to load hero run prefab:', err);
                return;
            }
            this._heroPrefabs.set(config.key, prefab);
            attach(prefab);
        });
    }

    // Hero model config resolution moved to HeroModelConfig for reuse.

    private static buildPrefabPaths(config: {
        prefabPath: string;
        prefabFallbacks: string[];
    }): string[] {
        return [config.prefabPath, ...config.prefabFallbacks].filter(Boolean);
    }

    private static buildClipPaths(primary?: string, fallbacks?: string[]): string[] {
        return [primary, ...(fallbacks ?? [])].filter(Boolean);
    }

    private static loadWithFallbacks<T>(
        paths: string[],
        type: typeof Prefab | typeof AnimationClip,
        done: (err: Error | null, asset: T | null) => void
    ): void {
        if (!paths.length) {
            done(new Error('No paths provided'), null);
            return;
        }
        const tryLoad = (index: number, lastErr: Error | null) => {
            if (index >= paths.length) {
                done(lastErr, null);
                return;
            }
            resources.load(paths[index], type, (err, asset) => {
                if (!err && asset) {
                    done(null, asset as T);
                    return;
                }
                tryLoad(index + 1, err ?? lastErr);
            });
        };
        tryLoad(0, null);
    }

    private static addClipIfNeeded(anim: SkeletalAnimation, clip: AnimationClip): void {
        if (anim.clips && anim.clips.some(existing => existing && existing.name === clip.name)) {
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
