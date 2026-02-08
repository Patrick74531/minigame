import { resources, Texture2D, Prefab, AnimationClip } from 'cc';
import { resolveHeroModelConfig } from '../../gameplay/units/HeroModelConfig';

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
        this.preloadWeaponVFXTextures();
        this.preloadHeroAssets();
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

    // === WeaponVFX 贴图 ===

    private static preloadWeaponVFXTextures(): void {
        resources.preload('textures/beam_noise', Texture2D);
        resources.preload('textures/bullet/texture', Texture2D);
        resources.preload('textures/bullet', Texture2D);
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
}
