import { Node, Vec3 } from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { BuildingFactory } from '../../gameplay/buildings/BuildingFactory';
import { UnitFactory } from '../../gameplay/units/UnitFactory';
import { CameraRig } from '../camera/CameraRig';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { BuildingPadSpawner } from '../../gameplay/buildings/BuildingPadSpawner';
import { WaveManager } from '../../gameplay/wave/WaveManager';
import { GameManager } from '../managers/GameManager';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';
import { ServiceRegistry } from '../managers/ServiceRegistry';

export type SpawnResult = {
    base: Node;
    hero: Node;
};

/**
 * SpawnBootstrap
 * 负责初始实体创建与波次/相机/建造点的装配
 */
export class SpawnBootstrap {
    public static spawn(containers: { enemy: Node; soldier: Node; building: Node }): SpawnResult {
        const spawnX = GameConfig.MAP.BASE_SPAWN.x;
        const spawnZ = GameConfig.MAP.BASE_SPAWN.z;

        const base = BuildingFactory.createBase(
            containers.building,
            spawnX,
            spawnZ,
            GameConfig.BUILDING.BASE_START_HP
        );

        const hero = UnitFactory.createHero(
            containers.soldier,
            spawnX + GameConfig.MAP.HERO_SPAWN_OFFSET.x,
            spawnZ + GameConfig.MAP.HERO_SPAWN_OFFSET.z
        );

        SpawnBootstrap.waveManager.initialize(containers.enemy, base);
        // Less top-down: lower pitch and pull back for clearer character/enemy fronts.
        CameraRig.setupFollow(base.scene, hero, new Vec3(0, 8.2, 9.8));

        SpawnBootstrap.buildingManager.setHeroNode(hero);
        BuildingPadSpawner.spawnPads(containers.building, SpawnBootstrap.buildingManager);

        return { base, hero };
    }

    public static startWaves(
        waveLoop: WaveLoop | null,
        delaySeconds: number = GameConfig.WAVE.FIRST_WAVE_DELAY,
        startingWave: number = 1
    ): void {
        if (!waveLoop) return;
        waveLoop.initialize(
            SpawnBootstrap.waveManager,
            SpawnBootstrap.gameManager,
            delaySeconds,
            startingWave
        );
    }

    private static get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private static get waveManager(): WaveManager {
        return ServiceRegistry.get<WaveManager>('WaveManager') ?? WaveManager.instance;
    }

    private static get buildingManager(): BuildingManager {
        return ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
    }
}
