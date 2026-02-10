import { resources, Texture2D, Prefab, AnimationClip } from 'cc';
import { resolveHeroModelConfig } from '../../gameplay/units/HeroModelConfig';
import { GameConfig } from '../../data/GameConfig';

/**
 * ResourcePreloader
 * 在游戏启动时预加载运行时懒加载资源，避免首波帧率抖动。
 *
 * 调用 preloadAll() 即可触发所有资源的后台加载。
 * 加载结果缓存在各自的工厂/管理器中（通过 resources 引用计数），
 * 后续运行时 load 会命中缓存，不再产生 IO 开销。
 */
export class ResourcePreloader {
    private static _started = false;

    /** 一次性触发所有关键资源的预加载 */
    public static preloadAll(): void {
        if (this._started) return;
        this._started = true;

        this.preloadEnemyPaperDollTextures();
        this.preloadSoldierGooseTextures();
        this.preloadWeaponVFXTextures();
        this.preloadBuildingModelPrefabs();
        this.preloadHeroAssets();
        this.preloadHeroWeaponVisuals();
    }

    // === Enemy Paper-Doll 贴图 ===

    private static readonly ENEMY_TEXTURE_PATHS = [
        'enemies/Robot/Body',
        'enemies/Robot/Head',
        'enemies/Robot/LeftArm',
        'enemies/Robot/RightArm',
        'enemies/Robot/LeftLeg',
        'enemies/Robot/RightLeg',
    ];

    private static preloadEnemyPaperDollTextures(): void {
        for (const path of this.ENEMY_TEXTURE_PATHS) {
            // 尝试两种路径格式（与 EnemyPaperDollAnimator.loadFrameFromTexture 一致）
            resources.preload(path, Texture2D);
            resources.preload(`${path}/texture`, Texture2D);
        }
    }

    private static readonly SOLDIER_GOOSE_TEXTURE_PATHS = [
        'footman/goose/Run',
        'footman/goose/Flap',
    ];

    private static preloadSoldierGooseTextures(): void {
        for (const path of this.SOLDIER_GOOSE_TEXTURE_PATHS) {
            resources.preload(path, Texture2D);
            resources.preload(`${path}/texture`, Texture2D);
        }
    }

    // === WeaponVFX 贴图 ===

    private static preloadWeaponVFXTextures(): void {
        resources.preload('textures/bullet/texture', Texture2D);
        resources.preload('textures/bullet', Texture2D);
        resources.preload('floor/tileable_grass_01/texture', Texture2D);
        resources.preload('floor/tileable_grass_01', Texture2D);
        resources.preload('floor/tileable_grass_01.webp', Texture2D);
        resources.preload('floor/tileable_grass_02/texture', Texture2D);
        resources.preload('floor/tileable_grass_02', Texture2D);
        resources.preload('floor/tileable_grass_02.webp', Texture2D);
        resources.preload('floor/tileable_grass_03/texture', Texture2D);
        resources.preload('floor/tileable_grass_03', Texture2D);
        resources.preload('floor/tileable_grass_03.webp', Texture2D);
        resources.preload('floor/tileable_grass_04/texture', Texture2D);
        resources.preload('floor/tileable_grass_04', Texture2D);
        resources.preload('floor/tileable_grass_04.webp', Texture2D);
        resources.preload('floor/Dirt_01/texture', Texture2D);
        resources.preload('floor/Dirt_01', Texture2D);
        resources.preload('floor/Dirt_01.webp', Texture2D);
        resources.preload('textures/droplet/texture', Texture2D);
        resources.preload('textures/droplet', Texture2D);
        resources.preload('textures/droplet.webp', Texture2D);
        resources.preload('building/sunflower/texture', Texture2D);
        resources.preload('building/sunflower', Texture2D);
        resources.preload('building/sunflower.webp', Texture2D);
        resources.preload('building/radar_3d', Prefab);
        resources.preload('effects/star_coin', Prefab);
        resources.preload('effects/star_coin/star_coin', Prefab);
    }

    private static readonly BUILDING_MODEL_PREFAB_PATHS = [
        'building/barn_3d',
        'building/barn_3d/barn_3d',
    ];

    private static preloadBuildingModelPrefabs(): void {
        for (const path of this.BUILDING_MODEL_PREFAB_PATHS) {
            resources.preload(path, Prefab);
        }
    }

    // === Hero 模型 + 动画 ===

    private static preloadHeroAssets(): void {
        const config = resolveHeroModelConfig();
        if (!config) return;

        // Prefab
        const prefabPaths = [config.prefabPath, ...config.prefabFallbacks].filter(Boolean);
        for (const p of prefabPaths) {
            resources.preload(p, Prefab);
        }

        // Run clip
        const runPaths = [config.runClipPath, ...config.runClipFallbacks].filter(Boolean);
        for (const p of runPaths) {
            resources.preload(p as string, AnimationClip);
        }

        // Idle clip
        const idlePaths = [config.idleClipPath, ...config.idleClipFallbacks].filter(Boolean);
        for (const p of idlePaths) {
            resources.preload(p as string, AnimationClip);
        }
    }

    private static preloadHeroWeaponVisuals(): void {
        const visuals = (GameConfig.HERO as unknown as { WEAPON_VISUALS?: unknown }).WEAPON_VISUALS;
        if (!visuals || typeof visuals !== 'object') return;

        const entries = visuals as Record<
            string,
            { prefab?: { path?: string; fallbacks?: string[]; uuid?: string } }
        >;
        for (const key of Object.keys(entries)) {
            const prefabCfg = entries[key]?.prefab;
            const paths = [prefabCfg?.path, ...(prefabCfg?.fallbacks ?? [])].filter(Boolean);
            for (const p of paths) {
                resources.preload(p as string, Prefab);
            }
        }
    }
}
