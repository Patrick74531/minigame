import {
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
    assetManager,
    SkeletalAnimation,
    AnimationClip,
    Renderer,
    Texture2D,
} from 'cc';
import { Enemy } from './Enemy';
import { Soldier } from './Soldier';
import { Hero } from './Hero';
import { HealthBar } from '../../ui/HealthBar';
import { GameConfig } from '../../data/GameConfig';
import { HeroAnimationController } from './HeroAnimationController';
import { HeroWeaponMountController } from './HeroWeaponMountController';
import { AnimRootScaleLock } from '../visuals/AnimRootScaleLock';
import { SoldierGooseAnimator } from '../visuals/SoldierGooseAnimator';
import { resolveHeroModelConfig } from './HeroModelConfig';
import { WeaponType } from '../weapons/WeaponTypes';
import { attachEnemyVisual } from './EnemyVisualFactory';
import type { EnemyAttackType, EnemyVisualVariant } from './EnemyVisualTypes';
import { findChildByName, findRightHandBone, pathBaseName } from './UnitFactoryHeroSearch';

export type { EnemyAttackType, EnemyVisualVariant } from './EnemyVisualTypes';

export interface EnemySpawnOptions {
    hpMultiplier?: number;
    attackMultiplier?: number;
    speedMultiplier?: number;
    isElite?: boolean;
    scaleMultiplier?: number;
    coinDropMultiplier?: number;
    /** 攻击范围（可造成伤害的距离） */
    attackRange?: number;
    /** 索敌范围（发现/锁定目标距离） */
    aggroRange?: number;
    /** 敌人外观变体 */
    visualVariant?: EnemyVisualVariant;
    /** 敌人攻击类型（不传则按模型推断） */
    attackType?: EnemyAttackType;
    /** 敌人模型路径（resources 下相对路径，不含前缀） */
    modelPath?: string;
    /** 敌人可视缩放（不传则按模型推断） */
    visualScale?: number;
}

/**
 * 单位工厂
 * 负责创建和配置所有单位实体
 */
export class UnitFactory {
    private static readonly GROUP_DEFAULT = 1 << 0;
    private static readonly GROUP_ENEMY = 1 << 3;
    private static readonly GROUP_BULLET = 1 << 4;
    private static readonly GROUP_WALL = 1 << 5;
    private static readonly HERO_RUN_SPEED = 1.0;
    private static readonly HERO_IDLE_SPEED = 0.25;
    private static readonly HERO_WEAPON_SOCKET_NAME = 'HeroWeaponSocket';
    private static readonly HERO_WEAPON_TYPES: WeaponType[] = [
        WeaponType.MACHINE_GUN,
        WeaponType.FLAMETHROWER,
    ];
    private static _materials: Map<string, Material> = new Map();
    private static _heroPrefabs: Map<string, Prefab> = new Map();
    private static _heroPrefabLoading: Set<string> = new Set();
    private static _heroRunClipCache: Map<string, AnimationClip> = new Map();
    private static _heroRunClipLoading: Set<string> = new Set();
    private static _heroIdleClipCache: Map<string, AnimationClip> = new Map();
    private static _heroIdleClipLoading: Set<string> = new Set();
    private static _weaponColorTexture: Texture2D | null = null;
    private static _weaponColorTextureLoading: boolean = false;
    private static _weaponColorTextureWaiting: Set<Node> = new Set();
    private static _weaponUnlitMaterial: Material | null = null;

    private static get heroWeaponVisuals(): Record<
        string,
        {
            handBone?: string;
            prefab?: { path?: string; fallbacks?: string[]; uuid?: string };
            transform?: {
                position?: { x?: number; y?: number; z?: number };
                rotation?: { x?: number; y?: number; z?: number };
                scale?: number;
            };
        }
    > {
        const raw = (GameConfig.HERO as unknown as { WEAPON_VISUALS?: unknown }).WEAPON_VISUALS;
        if (!raw || typeof raw !== 'object') return {};
        return raw as Record<
            string,
            {
                handBone?: string;
                prefab?: { path?: string; fallbacks?: string[]; uuid?: string };
                transform?: {
                    position?: { x?: number; y?: number; z?: number };
                    rotation?: { x?: number; y?: number; z?: number };
                    scale?: number;
                };
            }
        >;
    }

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
        let scaleMultiplier = options.scaleMultiplier ?? 1;

        // Apply 0.7 scale to normal enemies (not elite, not boss, not turret)
        const modelPath = options.modelPath ?? '';
        const isBoss = modelPath.includes('boss/');
        const isTurret = modelPath.includes('vehicle/Enemy_Turret');
        if (!isElite && !isBoss && !isTurret) {
            scaleMultiplier *= 0.7;
        }

        const baseScale = 0.38;
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
        // Enable dynamic body so enemy-enemy collision can physically separate crowds.
        rb.type = RigidBody.Type.DYNAMIC;
        rb.useGravity = false;
        rb.linearDamping = GameConfig.PHYSICS.UNIT_LINEAR_DAMPING; // Low damping
        rb.angularFactor = new Vec3(0, 0, 0); // Lock rotation
        rb.linearFactor = new Vec3(1, 0, 1);
        rb.group = UnitFactory.GROUP_ENEMY;

        const col = node.addComponent(BoxCollider);
        col.size = new Vec3(1, 1, 1);
        col.isTrigger = false; // Solid for collision
        col.setGroup(UnitFactory.GROUP_ENEMY);
        // Collide with DEFAULT (buildings/hero/soldier), ENEMY, BULLET and WALL.
        col.setMask(
            UnitFactory.GROUP_DEFAULT |
                UnitFactory.GROUP_ENEMY |
                UnitFactory.GROUP_BULLET |
                UnitFactory.GROUP_WALL
        );

        const hpMultiplier = options.hpMultiplier ?? 1;
        const attackMultiplier = options.attackMultiplier ?? 1;
        const speedMultiplier = options.speedMultiplier ?? 1;

        enemy.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP * hpMultiplier,
            attack: GameConfig.ENEMY.BASE_ATTACK * attackMultiplier,
            attackRange: options.attackRange ?? GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED * speedMultiplier,
        });
        enemy.setVariant({
            isElite,
            coinDropMultiplier: options.coinDropMultiplier ?? 1,
        });
        enemy.setCombatProfile({
            aggroRange: options.aggroRange ?? GameConfig.ENEMY.AGGRO_RANGE,
        });
        enemy.setCrowdSeparationProfile({
            radius: this.resolveEnemyCrowdSeparationRadius(options),
            weight: 1.08,
        });

        // Set Target
        enemy.setTargetPosition(targetPos);

        attachEnemyVisual(node, options.visualVariant ?? 'robot', {
            modelPath: options.modelPath,
            visualScale: options.visualScale,
            attackType: options.attackType,
        });

        // 血条（敌人使用 paper-doll，无骨骼头节点，关闭锚点探测避免浪费 CPU）
        // 仅在受伤时显示，避免大量敌人血条堆叠
        const hb = node.addComponent(HealthBar);
        hb.width = 60;
        hb.height = 6;
        hb.yOffset = 1.8;
        hb.baseWorldScale = 0.015;
        hb.autoDetectHeadAnchor = false;
        hb.inheritOwnerScaleInWorldSpace = false;
        hb.showOnlyWhenDamaged = true;
        hb.damagedShowDuration = 3.0;

        return node;
    }

    private static resolveEnemyCrowdSeparationRadius(options: EnemySpawnOptions): number {
        const modelPath = options.modelPath ?? '';
        const scaleMultiplier = Math.max(0.5, options.scaleMultiplier ?? 1);

        let baseRadius = 1.0;
        if (modelPath.indexOf('vehicle/Tank') === 0) {
            baseRadius = 1.45;
        } else if (modelPath.indexOf('vehicle/Enemy_Turret') === 0) {
            baseRadius = 1.35;
        } else if (modelPath.indexOf('boss/Robot_Legs_Gun') === 0) {
            baseRadius = 1.6;
        } else if (modelPath.indexOf('boss/') === 0) {
            baseRadius = 1.85;
        } else if (modelPath.indexOf('flying/') === 0) {
            baseRadius = 1.05;
        }

        const radius = baseRadius * Math.sqrt(scaleMultiplier);
        return Math.max(0.9, Math.min(2.6, radius));
    }

    /**
     * 创建士兵
     */
    public static createSoldier(parent: Node | null, x: number = 0, z: number = 0): Node {
        const node = this.createCubeNode('Soldier', new Color(60, 140, 220, 255));
        node.setPosition(x, GameConfig.PHYSICS.SOLDIER_Y, z); // Spawn high safe
        node.setScale(0.3, 0.3, 0.3);
        if (parent) parent.addChild(node);

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
        col.setGroup(UnitFactory.GROUP_DEFAULT);
        // Soldiers should not be blocked by wall-only colliders.
        col.setMask(UnitFactory.GROUP_DEFAULT | UnitFactory.GROUP_ENEMY | UnitFactory.GROUP_BULLET);

        const soldier = node.addComponent(Soldier);
        soldier.initStats({
            maxHp: GameConfig.SOLDIER.BASE_HP,
            attack: GameConfig.SOLDIER.BASE_ATTACK,
            attackRange: GameConfig.SOLDIER.ATTACK_RANGE,
            attackInterval: GameConfig.SOLDIER.ATTACK_INTERVAL,
            moveSpeed: GameConfig.SOLDIER.MOVE_SPEED,
        });

        this.attachSoldierGooseVisual(node);

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
        hb.autoDetectHeadAnchor = true;
        hb.headPadding = 0.18;

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
        renderer.shadowCastingMode = 1;
        renderer.receiveShadow = 1;
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

        console.log('[UnitFactory:ANIM] attachHeroModel called, loading prefab...');
        const attach = (prefab: Prefab) => {
            if (!root.isValid) return;
            if (root.getChildByName('HeroModel')) return;

            console.log('[UnitFactory:ANIM] prefab loaded, instantiating...');
            const model = instantiate(prefab);
            model.name = 'HeroModel';
            const config = resolveHeroModelConfig();
            const scale = Math.max(config.transformScale, 0.05);
            model.setScale(scale, scale, scale);
            model.setRotationFromEuler(0, config.transformRotY, 0);
            const rootScaleY = Math.max(Math.abs(root.scale.y), 0.0001);
            const rootAnchorCompensation = -GameConfig.PHYSICS.HERO_Y / rootScaleY;
            const autoGroundOffset = this.estimateNodeGroundOffset(model);
            model.setPosition(
                0,
                config.transformOffsetY + rootAnchorCompensation + autoGroundOffset,
                0
            );
            this.applyLayerRecursive(model, root.layer);
            root.addChild(model);

            // Retrieve SkeletalAnimation BEFORE attaching weapon visuals.
            // Switch to real-time mode so bone node worldPositions are updated
            // every frame by the CPU. Without this, baked mode (the default)
            // leaves bone transforms at the rest/bind pose, causing the weapon
            // socket to follow a near-origin position and land on the ground.
            // NOTE: patch-csp.cjs (Patch H) strips this call from the deployed
            // build and relies on baked GPU mode there instead.
            const anim = this.getModelSkeletalAnimation(model);
            console.log('[UnitFactory:ANIM] SkeletalAnimation found:', !!anim);
            if (anim) {
                const clipNames = (anim.clips ?? []).map(
                    (c: AnimationClip | null) => c?.name ?? 'null'
                );
                console.log('[UnitFactory:ANIM] clips:', clipNames.length, clipNames);
                const exotic = (anim.clips?.[0] as unknown as { _exoticAnimation?: unknown })
                    ?._exoticAnimation;
                console.log(
                    '[UnitFactory:ANIM] clip[0]._exoticAnimation:',
                    typeof exotic,
                    !!exotic
                );
                anim.useBakedAnimation = false;
            }

            this.attachHeroWeaponVisuals(root, model);

            const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
            const mesh = root.getComponent(MeshRenderer);
            if (mesh && hasRenderer) {
                mesh.enabled = false;
            }

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
                    const runClip = existing;
                    const runState = this.bindClipState(
                        anim,
                        runClip,
                        this.buildHeroStateName(config.key, 'run')
                    );
                    controller.setRunClip(runState);
                    // Idle uses run temporarily until idle clip is attached to the same skeleton.
                    controller.setIdleClip(runState);
                    anim.defaultClip = runClip;
                    anim.playOnLoad = true;
                    anim.play(runState);
                } else {
                    this.ensureRunClip(anim, controller);
                }
                this.ensureIdleClip(anim, controller);
            }

            const hb = root.getComponent(HealthBar);
            if (hb) {
                hb.requestAnchorRefresh();
            }
        };

        this.loadRunPrefab(attach);
    }

    private static getModelSkeletalAnimation(model: Node): SkeletalAnimation | null {
        const skels = model.getComponentsInChildren(SkeletalAnimation);
        if (skels.length === 0) {
            const allComps: string[] = [];
            const walk = (n: Node) => {
                for (const c of n.components) {
                    allComps.push((c.constructor as { name?: string })?.name ?? String(c));
                }
                for (let i = 0; i < n.children.length; i++) walk(n.children[i]);
            };
            walk(model);
            console.log(
                '[UnitFactory:ANIM] getModelSkeletalAnimation: 0 found, all components:',
                allComps.join(',')
            );
        }
        return skels[0] ?? null;
    }

    private static estimateNodeGroundOffset(root: Node): number {
        let minLocalY = Number.POSITIVE_INFINITY;

        const renderers = root.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            const mesh = (renderer as unknown as { mesh?: any }).mesh;
            if (!mesh) continue;

            const rawMinY = mesh?.struct?.minPosition?.y ?? mesh?._struct?.minPosition?.y;
            if (typeof rawMinY !== 'number' || !Number.isFinite(rawMinY)) continue;

            const sampled = this.sampleRendererMinYRelativeToRoot(renderer.node, root, rawMinY);
            if (sampled < minLocalY) {
                minLocalY = sampled;
            }
        }

        if (!Number.isFinite(minLocalY)) {
            return 0;
        }

        return -minLocalY;
    }

    private static sampleRendererMinYRelativeToRoot(
        node: Node,
        root: Node,
        localMinY: number
    ): number {
        let y = localMinY;
        let cur: Node | null = node;

        while (cur && cur !== root) {
            y = cur.position.y + y * cur.scale.y;
            cur = cur.parent;
        }

        if (cur === root) {
            return root.position.y + y * root.scale.y;
        }
        return y;
    }

    private static ensureRunClip(
        anim: SkeletalAnimation,
        controller: HeroAnimationController | null
    ): void {
        const config = resolveHeroModelConfig();
        if (!config) return;

        const cached = this._heroRunClipCache.get(config.key);
        if (cached) {
            const runState = this.bindClipState(
                anim,
                cached,
                this.buildHeroStateName(config.key, 'run')
            );
            anim.defaultClip = cached;
            anim.playOnLoad = true;
            anim.play(runState);
            if (controller) {
                controller.setRunClip(runState);
                controller.setIdleClip(runState);
            }
            return;
        }

        if (this._heroRunClipLoading.has(config.key)) return;
        this._heroRunClipLoading.add(config.key);

        const paths = this.buildClipPaths(config.runClipPath, config.runClipFallbacks);
        this.loadClipWithFallbacks(paths, (err, clip) => {
            this._heroRunClipLoading.delete(config.key);
            if (!clip) {
                console.warn('[UnitFactory] Failed to load hero run clip:', err);
                return;
            }
            if (!anim.node || !anim.node.isValid) {
                return;
            }
            this._heroRunClipCache.set(config.key, clip);
            const runState = this.bindClipState(
                anim,
                clip,
                this.buildHeroStateName(config.key, 'run')
            );
            anim.defaultClip = clip;
            anim.playOnLoad = true;
            anim.play(runState);
            if (controller) {
                controller.setRunClip(runState);
                controller.setIdleClip(runState);
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
            const idleState = this.bindClipState(
                anim,
                cached,
                this.buildHeroStateName(config.key, 'idle')
            );
            if (controller) {
                controller.setIdleClip(idleState);
            }
            return;
        }

        if (this._heroIdleClipLoading.has(config.key)) return;
        this._heroIdleClipLoading.add(config.key);

        const paths = this.buildClipPaths(config.idleClipPath, config.idleClipFallbacks);
        this.loadClipWithFallbacks(paths, (err, clip) => {
            this._heroIdleClipLoading.delete(config.key);
            if (!clip) {
                console.warn('[UnitFactory] Failed to load hero idle clip:', err);
                if (controller) {
                    controller.setIdleClip(this.buildHeroStateName(config.key, 'run'));
                }
                return;
            }
            if (!anim.node || !anim.node.isValid) {
                return;
            }
            this._heroIdleClipCache.set(config.key, clip);
            const idleState = this.bindClipState(
                anim,
                clip,
                this.buildHeroStateName(config.key, 'idle')
            );
            if (controller) {
                controller.setIdleClip(idleState);
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

    private static loadClipWithFallbacks(
        paths: string[],
        done: (err: Error | null, clip: AnimationClip | null) => void
    ): void {
        if (!paths.length) {
            done(new Error('No clip paths provided'), null);
            return;
        }

        const expanded: string[] = [];
        const seen = new Set<string>();
        for (const path of paths) {
            if (!path || seen.has(path)) continue;
            seen.add(path);
            expanded.push(path);
            if (!path.endsWith('.animation')) {
                const withExt = `${path}.animation`;
                if (!seen.has(withExt)) {
                    seen.add(withExt);
                    expanded.push(withExt);
                }
            }
        }

        const dirTried = new Set<string>();
        const tryLoad = (index: number, lastErr: Error | null) => {
            if (index >= expanded.length) {
                done(lastErr, null);
                return;
            }

            const path = expanded[index];
            resources.load(path, AnimationClip, (err, clip) => {
                if (!err && clip) {
                    done(null, clip);
                    return;
                }

                const slash = path.lastIndexOf('/');
                const dir = slash > 0 ? path.slice(0, slash) : path;
                const expected =
                    slash >= 0 ? path.slice(slash + 1).replace(/\.animation$/, '') : '';
                if (dir && !dirTried.has(dir)) {
                    dirTried.add(dir);
                    resources.loadDir(dir, AnimationClip, (dirErr, clips) => {
                        if (!dirErr && clips && clips.length > 0) {
                            const matched =
                                clips.find(c => c && c.name === expected) ??
                                clips.find(c => c && c.name === `${expected}.animation`) ??
                                clips[0];
                            done(null, matched);
                            return;
                        }
                        tryLoad(index + 1, (dirErr as Error) ?? (err as Error) ?? lastErr);
                    });
                    return;
                }

                tryLoad(index + 1, (err as Error) ?? lastErr);
            });
        };

        tryLoad(0, null);
    }

    private static buildHeroStateName(key: string, role: 'run' | 'idle'): string {
        return `${key}__${role}`;
    }

    private static bindClipState(
        anim: SkeletalAnimation,
        clip: AnimationClip,
        stateName: string
    ): string {
        this.addClipIfNeeded(anim, clip);
        const existing = anim.getState(stateName);
        if (existing) {
            this.tuneHeroStateSpeed(stateName, existing);
            return existing.name;
        }
        const created = anim.createState(clip, stateName);
        if (created) {
            this.tuneHeroStateSpeed(stateName, created);
            return created.name;
        }
        return clip.name;
    }

    private static tuneHeroStateSpeed(
        stateName: string,
        state: NonNullable<ReturnType<SkeletalAnimation['getState']>>
    ): void {
        const speed = stateName.endsWith('__idle') ? this.HERO_IDLE_SPEED : this.HERO_RUN_SPEED;
        if (Math.abs(state.speed - speed) > 0.0001) {
            state.speed = speed;
        }
    }

    private static addClipIfNeeded(anim: SkeletalAnimation, clip: AnimationClip): void {
        if (
            anim.clips &&
            anim.clips.some(
                existing =>
                    !!existing &&
                    (existing === clip ||
                        (!!existing.uuid && !!clip.uuid && existing.uuid === clip.uuid))
            )
        ) {
            return;
        }
        anim.addClip(clip);
    }

    private static attachHeroWeaponVisuals(root: Node, model: Node): void {
        if (!root || !root.isValid || !model || !model.isValid) return;

        let handNode: Node | null = null;
        const visuals = this.heroWeaponVisuals;
        for (const type of this.HERO_WEAPON_TYPES) {
            const cfg = visuals[type];
            const handName = cfg?.handBone;
            if (handName) {
                handNode = findChildByName(model, handName);
                if (handNode) break;
            }
        }

        if (!handNode) {
            handNode = findRightHandBone(model);
        }
        if (!handNode) {
            console.warn('[UnitFactory] Hero right hand bone not found for weapon mount.');
            return;
        }

        const legacySocketInModel = findChildByName(model, this.HERO_WEAPON_SOCKET_NAME);
        if (legacySocketInModel && legacySocketInModel.parent !== root) {
            legacySocketInModel.destroy();
        }

        let socket = root.getChildByName(this.HERO_WEAPON_SOCKET_NAME);
        if (!socket) {
            socket = new Node(this.HERO_WEAPON_SOCKET_NAME);
            root.addChild(socket);
        }

        let mountController = root.getComponent(HeroWeaponMountController);
        if (!mountController) {
            mountController = root.addComponent(HeroWeaponMountController);
        }
        mountController.bindSocket(socket, handNode);

        const sharedCfg =
            visuals[WeaponType.MACHINE_GUN] ?? visuals[WeaponType.FLAMETHROWER] ?? null;
        const defaultPath = 'weapons/blaster-h/blaster-h';
        const paths = this.buildPrefabPaths({
            prefabPath: sharedCfg?.prefab?.path ?? defaultPath,
            prefabFallbacks: sharedCfg?.prefab?.fallbacks ?? [],
        });
        const preferredName = pathBaseName(sharedCfg?.prefab?.path) ?? pathBaseName(defaultPath);
        this.loadWeaponPrefab(
            paths,
            preferredName ?? 'blaster-h',
            sharedCfg?.prefab?.uuid,
            (err, prefab) => {
                if (!prefab) {
                    console.warn('[UnitFactory] Failed to load shared hero weapon visual:', err);
                    return;
                }
                if (!socket || !socket.isValid || !root.isValid) return;

                // Prefab异步回调时，再次强制把挂点贴手，减少首帧落地可见时间。
                socket.setWorldPosition(handNode.worldPosition);
                socket.setWorldRotation(handNode.worldRotation);
                mountController?.requestImmediateSnap();

                let weaponNode = socket.getChildByName('WeaponVisual_Shared');
                if (!weaponNode) {
                    weaponNode = instantiate(prefab);
                    weaponNode.name = 'WeaponVisual_Shared';
                    socket.addChild(weaponNode);
                }

                const transform = sharedCfg?.transform;
                const pos = transform?.position;
                const rot = transform?.rotation;
                const scale = transform?.scale ?? 1;
                weaponNode.setPosition(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);
                weaponNode.setRotationFromEuler(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0);
                weaponNode.setScale(scale, scale, scale);
                this.applyLayerRecursive(weaponNode, root.layer);

                // 同一个模型绑定到所有武器类型，不做视觉区分。
                for (const type of this.HERO_WEAPON_TYPES) {
                    mountController?.bindWeaponNode(type, weaponNode);
                }
                mountController?.requestImmediateSnap();
            }
        );

        // 首帧对齐，避免加载回调前后出现一帧的错误位置。
        socket.setWorldPosition(handNode.worldPosition);
        socket.setWorldRotation(handNode.worldRotation);
    }

    private static loadWeaponPrefab(
        paths: string[],
        prefabNameFallback: string,
        prefabUuid: string | undefined,
        done: (err: Error | null, prefab: Prefab | null) => void
    ): void {
        const tryLoadByDir = (prevErr: Error | null) => {
            resources.loadDir('weapons', Prefab, (dirErr, prefabs) => {
                if (!dirErr && prefabs && prefabs.length > 0) {
                    const matched =
                        prefabs.find(
                            p =>
                                p &&
                                (p.name === prefabNameFallback ||
                                    p.name === `${prefabNameFallback}.prefab`)
                        ) ??
                        prefabs.find(p => p && p.name.indexOf(prefabNameFallback) !== -1) ??
                        null;
                    if (matched) {
                        done(null, matched);
                        return;
                    }
                }
                done((dirErr as Error) ?? prevErr, null);
            });
        };

        const tryLoadByPath = () => {
            this.loadWithFallbacks(paths, Prefab, (err, prefab) => {
                if (prefab) {
                    done(null, prefab);
                    return;
                }
                tryLoadByDir(err);
            });
        };

        if (!prefabUuid) {
            tryLoadByPath();
            return;
        }

        assetManager.loadAny({ uuid: prefabUuid }, (uuidErr, asset) => {
            if (!uuidErr && asset instanceof Prefab) {
                done(null, asset);
                return;
            }
            // UUID 失败后回退路径方案，兼容资源重导入导致 UUID 变化
            tryLoadByPath();
        });
    }

    private static applyWeaponVisualMaterial(root: Node): void {
        if (this._weaponColorTexture) {
            this.bindWeaponMaterial(root, this._weaponColorTexture);
            return;
        }

        this._weaponColorTextureWaiting.add(root);
        if (this._weaponColorTextureLoading) return;
        this._weaponColorTextureLoading = true;

        const paths = ['weapons/Textures/colormap/texture', 'weapons/Textures/colormap'];
        const tryLoad = (idx: number) => {
            if (idx >= paths.length) {
                // fallback: direct UUID load for texture sub-asset
                assetManager.loadAny(
                    { uuid: 'c950b245-9056-4bf7-abe8-91cd0ff9bd1a@6c48a' },
                    (err, asset) => {
                        this._weaponColorTextureLoading = false;
                        if (err || !(asset instanceof Texture2D)) return;
                        this._weaponColorTexture = asset;
                        for (const waitingRoot of this._weaponColorTextureWaiting) {
                            if (!waitingRoot || !waitingRoot.isValid) continue;
                            this.bindWeaponMaterial(waitingRoot, asset);
                        }
                        this._weaponColorTextureWaiting.clear();
                    }
                );
                return;
            }

            resources.load(paths[idx], Texture2D, (err, tex) => {
                if (err || !tex) {
                    tryLoad(idx + 1);
                    return;
                }

                this._weaponColorTexture = tex;
                this._weaponColorTextureLoading = false;

                for (const waitingRoot of this._weaponColorTextureWaiting) {
                    if (!waitingRoot || !waitingRoot.isValid) continue;
                    this.bindWeaponMaterial(waitingRoot, tex);
                }
                this._weaponColorTextureWaiting.clear();
            });
        };

        tryLoad(0);
    }

    private static bindWeaponMaterial(root: Node, tex: Texture2D): void {
        if (!this._weaponUnlitMaterial) {
            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            mat.setProperty('mainColor', new Color(255, 255, 255, 255));
            mat.setProperty('mainTexture', tex);
            this._weaponUnlitMaterial = mat;
        } else {
            this._weaponUnlitMaterial.setProperty('mainTexture', tex);
        }

        const renderers = root.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            renderer.material = this._weaponUnlitMaterial;
        }
    }

    private static applyLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        const mesh = node.getComponent(MeshRenderer);
        if (mesh) {
            mesh.shadowCastingMode = 1;
            mesh.receiveShadow = 1;
        }
        for (const child of node.children) {
            this.applyLayerRecursive(child, layer);
        }
    }

    private static attachSoldierGooseVisual(root: Node): void {
        if (!root.isValid) return;
        if (!root.getComponent(SoldierGooseAnimator)) {
            root.addComponent(SoldierGooseAnimator);
        }
    }
}
