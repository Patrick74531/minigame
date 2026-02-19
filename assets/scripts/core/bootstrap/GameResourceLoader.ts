import { resources, Prefab, Texture2D, AnimationClip } from 'cc';
import { resolveHeroModelConfig } from '../../gameplay/units/HeroModelConfig';

export type LoadProgressCallback = (loaded: number, total: number) => void;

type LoadEntry = [string, unknown];

/**
 * GameResourceLoader
 * Phase 1: 首屏关键资源（英雄/预建建筑/首波敌人/地图景物）
 * Phase 2: 后台预加载（Boss/飞行敌人/其他建筑/VFX贴图等）
 */
export class GameResourceLoader {
    private static readonly PHASE1_BASE: LoadEntry[] = [
        // Pre-built buildings
        ['building/rifle_tower', Prefab],
        ['building/fencebar', Prefab],
        ['building/house', Prefab],
        ['building/spa', Prefab],
        // Wave-1 enemy models (vehicles)
        ['enemies/vehicle/Tank', Prefab],
        ['enemies/vehicle/Enemy_Rover', Prefab],
        ['enemies/vehicle/Enemy_Truck', Prefab],
        ['enemies/vehicle/Enemy_Turret', Prefab],
        ['enemies/vehicle/Enemy_RoundRover', Prefab],
        // Nature scenery
        ['models/nature/Tree_1_A_Color1', Prefab],
        ['models/nature/Bush_1_A_Color1', Prefab],
        ['models/nature/Rock_1_A_Color1', Prefab],
        // Critical floor textures
        ['floor/tileable_grass_01', Texture2D],
        ['floor/tileable_grass_02', Texture2D],
        ['floor/Dirt_01', Texture2D],
    ];

    private static readonly PHASE2: LoadEntry[] = [
        // Boss enemies
        ['enemies/boss/Mech', Prefab],
        ['enemies/boss/Robot_Large', Prefab],
        ['enemies/boss/Robot_Flying', Prefab],
        ['enemies/boss/Robot_Legs_Gun', Prefab],
        // Flying enemies
        ['enemies/flying/Spaceship', Prefab],
        ['enemies/flying/Spaceship_02', Prefab],
        ['enemies/flying/Spaceship_03', Prefab],
        // Other buildings
        ['building/barn_3d', Prefab],
        ['building/gold', Prefab],
        ['building/radar_3d', Prefab],
        // More nature
        ['models/nature/Tree_3_A_Color1', Prefab],
        ['models/nature/Bush_2_A_Color1', Prefab],
        ['models/nature/Bush_3_A_Color1', Prefab],
        ['models/nature/Rock_2_A_Color1', Prefab],
        ['models/nature/Rock_3_A_Color1', Prefab],
        // More floor textures
        ['floor/tileable_grass_03', Texture2D],
        ['floor/tileable_grass_04', Texture2D],
        // Weapon VFX
        ['textures/bullet', Texture2D],
        ['textures/droplet', Texture2D],
        ['building/sunflower', Texture2D],
        ['effects/star_coin', Prefab],
        // Soldier goose
        ['footman/goose/Run', Texture2D],
        ['footman/goose/Flap', Texture2D],
    ];

    /** Phase 1: 等待完成后才进入游戏 */
    public static loadPhase1(onProgress: LoadProgressCallback): Promise<void> {
        const items = [...this.PHASE1_BASE, ...this._heroItems()];
        return this._loadAll(items, onProgress);
    }

    /** Phase 2: 后台静默预加载，不阻塞游戏 */
    public static loadPhase2(): void {
        for (const [path, type] of this.PHASE2) {
            resources.preload(path, type as never);
        }
    }

    // ── internals ────────────────────────────────────────────────────────────

    private static _heroItems(): LoadEntry[] {
        const cfg = resolveHeroModelConfig();
        const items: LoadEntry[] = [];
        const push = (p: string | undefined, t: unknown) => {
            if (p) items.push([p, t]);
        };
        push(cfg.prefabPath, Prefab);
        push(cfg.runClipPath, AnimationClip);
        push(cfg.idleClipPath, AnimationClip);
        return items;
    }

    private static _loadAll(items: LoadEntry[], onProgress: LoadProgressCallback): Promise<void> {
        return new Promise(resolve => {
            const total = items.length;
            if (total === 0) {
                onProgress(1, 1);
                resolve();
                return;
            }
            let done = 0;
            onProgress(0, total);
            const tick = () => {
                done++;
                onProgress(done, total);
                if (done >= total) resolve();
            };
            for (const [path, type] of items) {
                resources.load(path, type as never, (_err, _asset) => tick());
            }
        });
    }
}
