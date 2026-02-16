import { Node } from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { HealthBar } from '../../ui/HealthBar';
import { EnemyFlyingAnimator } from '../visuals/EnemyFlyingAnimator';
import { EnemyPaperDollAnimator } from '../visuals/EnemyPaperDollAnimator';
import { EnemyRoboVacuumAnimator } from '../visuals/EnemyRoboVacuumAnimator';
import { Enemy } from './Enemy';
import { EnemyProjectile, EnemyProjectileVisualStyle } from '../combat/EnemyProjectile';
import type {
    EnemyAttackType,
    EnemyVisualSelectionOptions,
    EnemyVisualVariant,
} from './EnemyVisualTypes';

const ENEMY_MODEL_POOL: string[] = [
    // Bosses (Robots)
    'boss/Robot_Flying',
    'boss/Robot_Large',
    'boss/Robot_Legs_Gun',
    'boss/Mech',

    // Vehicles (Ground)
    'vehicle/Tank',
    'vehicle/Enemy_Turret',
    'vehicle/Enemy_Truck',
    'vehicle/Enemy_Rover',
    'vehicle/Enemy_RoundRover',

    // Flying (Spaceships)
    'flying/Spaceship',
    'flying/Spaceship_02',
    'flying/Spaceship_03',
];

export function attachEnemyVisual(
    root: Node,
    variant: EnemyVisualVariant,
    options?: EnemyVisualSelectionOptions
): void {
    void variant;
    attachEnemyFlyingVisual(root, options);
}

function attachEnemyFlyingVisual(root: Node, options?: EnemyVisualSelectionOptions): void {
    if (!root || !root.isValid) return;

    // Cleanup old visuals if any
    const paper = root.getComponent(EnemyPaperDollAnimator);
    if (paper) paper.destroy();
    const vacuum = root.getComponent(EnemyRoboVacuumAnimator);
    if (vacuum) vacuum.destroy();

    const paperRoot = root.getChildByName('EnemyPaperRoot');
    if (paperRoot) paperRoot.destroy();
    const vacuumRoot = root.getChildByName('EnemyVacuumRoot');
    if (vacuumRoot) vacuumRoot.destroy();

    if (!root.getComponent(EnemyFlyingAnimator)) {
        const anim = root.addComponent(EnemyFlyingAnimator);
        const selected =
            options?.modelPath ??
            ENEMY_MODEL_POOL[Math.floor(Math.random() * ENEMY_MODEL_POOL.length)];
        anim.modelPath = `enemies/${selected}`;
        anim.yOffset = resolveEnemyModelYOffsetByModelPath(selected);

        const enemy = root.getComponent(Enemy);
        if (enemy) {
            const resolvedAttackType =
                options?.attackType ?? resolveEnemyAttackTypeByModelPath(selected);
            enemy.attackType = resolvedAttackType;
            const resolvedProjectileStyle = resolveEnemyProjectileStyleByModelPath(selected);
            enemy.setRangedProjectileStyle(resolvedProjectileStyle);
            EnemyProjectile.preloadStyle(resolvedProjectileStyle);
            if (resolvedAttackType === 'ranged') {
                enemy.setCombatProfile({
                    aggroRange: GameConfig.ENEMY.FLYING_RANGED.AGGRO_RANGE,
                    attackRange: GameConfig.ENEMY.FLYING_RANGED.ATTACK_RANGE,
                });
            }
        }

        anim.visualScale = options?.visualScale ?? resolveEnemyVisualScaleByModelPath(selected);
    }

    const hb = root.getComponent(HealthBar);
    if (hb) {
        hb.requestAnchorRefresh();
    }
}

export function resolveEnemyAttackTypeByModelPath(modelPath: string): EnemyAttackType {
    if (modelPath.indexOf('vehicle/') === 0) return 'ram';
    if (modelPath.indexOf('flying/') === 0) return 'ranged';
    return 'standard';
}

export function resolveEnemyProjectileStyleByModelPath(
    modelPath: string
): EnemyProjectileVisualStyle {
    if (modelPath.indexOf('vehicle/Tank') === 0) return 'tank_shell_round';
    if (modelPath.indexOf('vehicle/Enemy_Turret') === 0) return 'turret_cannon_round';
    if (modelPath.indexOf('boss/Robot_Legs_Gun') === 0) return 'legs_gun_plasma_round';
    if (modelPath.indexOf('flying/Spaceship_03') === 0) return 'flying_ship_heavy_bolt';
    if (modelPath.indexOf('flying/Spaceship_02') === 0) return 'flying_ship_raider_bolt';
    if (modelPath.indexOf('flying/Spaceship') === 0) return 'flying_ship_interceptor_bolt';
    if (modelPath.indexOf('boss/Robot_Flying') === 0) return 'boss_flying_apex_core';
    return 'default';
}

export function resolveEnemyVisualScaleByModelPath(modelPath: string): number {
    if (modelPath.indexOf('Mech') !== -1) {
        return 1.5;
    }
    if (modelPath.indexOf('boss/') === 0) {
        return 4.5;
    }
    if (modelPath.indexOf('flying/') === 0 || modelPath.indexOf('Rover') !== -1) {
        return 0.45;
    }
    return 0.9;
}

function resolveEnemyModelYOffsetByModelPath(modelPath: string): number {
    if (modelPath.indexOf('flying/') === 0) {
        return 0.3;
    }
    if (modelPath.indexOf('Robot_Flying') !== -1) {
        return 0.28;
    }
    return 0.04;
}
