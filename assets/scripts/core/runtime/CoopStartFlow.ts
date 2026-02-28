import { Node, Vec3 } from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { UnitFactory } from '../../gameplay/units/UnitFactory';
import { DualCameraFollow } from '../camera/DualCameraFollow';
import { BuildingFactory } from '../../gameplay/buildings/BuildingFactory';
import { BuildingPadSpawner } from '../../gameplay/buildings/BuildingPadSpawner';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { WaveManager } from '../../gameplay/wave/WaveManager';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';
import { GameManager } from '../managers/GameManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { PlayerContext } from './PlayerContext';
import { CoopRuntime } from './CoopRuntime';
import { Hero } from '../../gameplay/units/Hero';
import { WeaponType } from '../../gameplay/weapons/WeaponTypes';

export interface CoopSpawnResult {
    base: Node;
    heroes: Node[];
}

/**
 * CoopStartFlow
 * 双人模式的启动流程。
 * 创建基地、两个英雄、设置双人相机、初始化波次系统。
 */
export class CoopStartFlow {
    /**
     * Spawn base + two heroes for coop mode.
     */
    static spawn(
        containers: { enemy: Node; soldier: Node; building: Node },
        runtime: CoopRuntime,
        localPlayerId: string,
        remotePlayerId: string
    ): CoopSpawnResult {
        const spawnX = GameConfig.MAP.BASE_SPAWN.x;
        const spawnZ = GameConfig.MAP.BASE_SPAWN.z;

        // Create base
        const base = BuildingFactory.createBase(
            containers.building,
            spawnX,
            spawnZ,
            GameConfig.BUILDING.BASE_START_HP
        );

        // Create hero A (local, slot 0) — offset left
        const heroA = UnitFactory.createHero(
            containers.soldier,
            spawnX + GameConfig.MAP.HERO_SPAWN_OFFSET.x - 1.5,
            spawnZ + GameConfig.MAP.HERO_SPAWN_OFFSET.z
        );

        // Create hero B (remote, slot 1) — offset right
        const heroB = UnitFactory.createHero(
            containers.soldier,
            spawnX + GameConfig.MAP.HERO_SPAWN_OFFSET.x + 1.5,
            spawnZ + GameConfig.MAP.HERO_SPAWN_OFFSET.z
        );

        // Register player contexts
        const ctxA = new PlayerContext(localPlayerId, 0, true);
        ctxA.heroNode = heroA;
        runtime.addPlayer(ctxA);

        const ctxB = new PlayerContext(remotePlayerId, 1, false);
        ctxB.heroNode = heroB;
        runtime.addPlayer(ctxB);

        const heroAComp = heroA.getComponent(Hero);
        if (heroAComp) heroAComp.isLocalPlayerHero = true;
        const heroBComp = heroB.getComponent(Hero);
        if (heroBComp) heroBComp.isLocalPlayerHero = false;
        const remoteWeaponManager = runtime.getWeaponManager(remotePlayerId);
        if (heroBComp) {
            heroBComp.setCoopWeaponManager(remoteWeaponManager);
        }
        // Pre-seed starter weapon so remote hero fires VFX immediately.
        // WEAPON_ASSIGNED messages will upgrade/override as the game progresses.
        remoteWeaponManager?.addWeapon(WeaponType.MACHINE_GUN);

        // Initialize team level system
        runtime.initializeTeamLevel();

        // Initialize wave manager
        CoopStartFlow.waveManager.initialize(containers.enemy, base);

        // Coop camera: local hero centered, remote hero only affects zoom.
        DualCameraFollow.setup(base.scene, heroA, [heroB], new Vec3(0, 8.2, 9.8));

        // Building pads
        CoopStartFlow.buildingManager.setHeroNode(heroA);
        BuildingPadSpawner.spawnPads(containers.building, CoopStartFlow.buildingManager);

        // Remote hero interpolation is driven by GameController.update → CoopRuntime.tick(dt)

        return { base, heroes: [heroA, heroB] };
    }

    /**
     * Start wave loop for coop mode.
     */
    static startWaves(
        waveLoop: WaveLoop | null,
        delaySeconds: number = GameConfig.WAVE.FIRST_WAVE_DELAY,
        startingWave: number = 1
    ): void {
        if (!waveLoop) return;
        waveLoop.initialize(
            CoopStartFlow.waveManager,
            CoopStartFlow.gameManager,
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
