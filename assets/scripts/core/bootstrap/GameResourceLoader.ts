import { resources, Prefab, AnimationClip } from 'cc';
import { resolveHeroModelConfig } from '../../gameplay/units/HeroModelConfig';

export type LoadProgressCallback = (loaded: number, total: number) => void;

/**
 * GameResourceLoader
 * Phase 1: 首屏关键资源 — 用 preloadDir 整目录预加载，绕过 GLB 嵌套路径格式问题。
 * Phase 2: 后台静默预加载。
 *
 * preloadDir 会把目录内所有子资源（含 GLB 生成的 Mesh/Prefab/Material）都加载进缓存，
 * 无需知道 GLB 在 Cocos 中实际展开成哪个嵌套路径。
 */
export class GameResourceLoader {
    // Phase 1 directories — fully preloaded before game starts
    private static readonly PHASE1_DIRS = [
        'building', // rifle_tower, fencebar, house, spa, barn_3d, gold, radar_3d
        'enemies/vehicle', // Tank, Rover, Truck, Turret, RoundRover (wave-1 enemies)
        'models/nature', // trees, bushes, rocks
        'floor', // all floor textures
        'character', // hero GLB + animation clips
    ];

    // Phase 2 directories — silently preloaded after game begins
    private static readonly PHASE2_DIRS = [
        'enemies/boss',
        'enemies/flying',
        'enemies/bullet',
        'footman',
        'effects',
        'textures',
        'icon',
        'weapons',
        'shaders',
    ];

    /** Phase 1: 等 preloadDir 全部完成，每目录算一个进度单位 */
    public static loadPhase1(onProgress: LoadProgressCallback): Promise<void> {
        const dirs = [...this.PHASE1_DIRS];
        const heroClips = this._heroClipPaths();

        // hero clips are individual files — treat them as one extra "task"
        const total = dirs.length + (heroClips.length > 0 ? 1 : 0);
        if (total === 0) {
            onProgress(1, 1);
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let done = 0;
            onProgress(0, total);

            const tick = () => {
                done++;
                onProgress(done, total);
                if (done >= total) resolve();
            };

            for (const dir of dirs) {
                resources.preloadDir(dir, (_err: Error | null) => tick());
            }

            if (heroClips.length > 0) {
                let clipsDone = 0;
                for (const path of heroClips) {
                    resources.load(path, AnimationClip, () => {
                        clipsDone++;
                        if (clipsDone >= heroClips.length) tick();
                    });
                }
            }
        });
    }

    /** Phase 2: 后台静默预加载，不阻塞游戏 */
    public static loadPhase2(): void {
        for (const dir of this.PHASE2_DIRS) {
            resources.preloadDir(dir);
        }
        // Also warm up hero prefab in case it wasn't in character/ dir
        const cfg = resolveHeroModelConfig();
        if (cfg.prefabPath) resources.preload(cfg.prefabPath, Prefab);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private static _heroClipPaths(): string[] {
        const cfg = resolveHeroModelConfig();
        const paths: string[] = [];
        if (cfg.runClipPath) paths.push(cfg.runClipPath);
        if (cfg.idleClipPath && cfg.idleClipPath !== cfg.runClipPath) {
            paths.push(cfg.idleClipPath);
        }
        return paths;
    }
}
