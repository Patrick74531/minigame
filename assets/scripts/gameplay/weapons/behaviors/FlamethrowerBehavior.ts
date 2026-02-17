import { Node, Vec3, Color } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { GameConfig } from '../../../data/GameConfig';
import { Unit, UnitType } from '../../units/Unit';
import { EnemyQuery } from '../../../core/managers/EnemyQuery';

/**
 * 堆肥喷火器 — 持续喷射火焰版
 *
 * 与其他武器不同，喷火器是持续型武器：
 * - fire() 每帧被调用，维护一个持续的火焰粒子节点
 * - 伤害按 DPS 均摊到每帧（乘以 dt）
 * - 失去目标时调用 stopFire() 回收火焰节点
 */
export class FlamethrowerBehavior extends WeaponBehavior {
    public readonly type = WeaponType.FLAMETHROWER;

    private static readonly MAX_TARGETS = [2, 3, 4, 5, 6];
    private static readonly CORE_COLORS: Color[] = [
        new Color(255, 215, 95, 232),
        new Color(255, 222, 105, 236),
        new Color(255, 228, 116, 240),
        new Color(255, 235, 130, 244),
        new Color(255, 240, 145, 248),
    ];
    private static readonly GLOW_COLORS: Color[] = [
        new Color(255, 118, 26, 168),
        new Color(255, 128, 30, 178),
        new Color(255, 138, 34, 188),
        new Color(255, 148, 42, 198),
        new Color(255, 160, 54, 210),
    ];

    /** 持续火焰节点 */
    private _flameNode: Node | null = null;
    /** 当前火焰的父节点 */
    private _flameParent: Node | null = null;

    /** 伤害计时器（控制每秒伤害 tick 频率） */
    private _dmgTickTimer: number = 0;
    /** 伤害 tick 间隔（秒） */
    private static readonly DMG_TICK_INTERVAL = 0.15;

    /** 标记为持续型武器 */
    public override get isContinuous(): boolean {
        return true;
    }

    /**
     * 每帧调用：维护火焰 VFX + 持续造成伤害
     */
    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node,
        dt?: number
    ): void {
        if (!target || !target.isValid) {
            this.stopFire();
            return;
        }

        const frameDt = dt ?? 0.016;

        WeaponVFX.initialize();

        const spawnPos = owner.position.clone();
        spawnPos.y += GameConfig.PHYSICS.PROJECTILE_SPAWN_OFFSET_Y - 0.1;

        const dx = target.position.x - spawnPos.x;
        const dz = target.position.z - spawnPos.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;

        const dirX = dx / len;
        const dirZ = dz / len;
        const idx = Math.min(level - 1, 4);
        const range = Math.max(1.6, stats.range);
        const streamLength = Math.max(1.6, Math.min(range, len + 0.95));
        const streamWidth = 0.46 + level * 0.08;
        const streamEnd = new Vec3(
            spawnPos.x + dirX * streamLength,
            spawnPos.y,
            spawnPos.z + dirZ * streamLength
        );

        // 等级缩放：lv1=0.7, lv2=1.0（基准）, lv3+=逐级放大
        const levelScale = level <= 1 ? 0.7 : Math.min(1.6, 1.0 + (level - 2) * 0.12);

        // === 持续火焰 VFX ===
        if (!this._flameNode || !this._flameNode.isValid) {
            // 首次：创建持续火焰
            this._flameNode = WeaponVFX.startContinuousFlame(
                parent,
                spawnPos,
                streamEnd,
                streamWidth,
                levelScale
            );
            this._flameParent = parent;
        } else {
            // 后续帧：更新位置/方向
            WeaponVFX.updateFlameTransform(
                this._flameNode,
                spawnPos,
                streamEnd,
                streamWidth,
                levelScale
            );
        }

        // === 地面灼烧（低频随机） ===
        if (Math.random() < 0.006) {
            WeaponVFX.createGroundBurn(
                parent,
                streamEnd,
                0.12 + level * 0.02,
                FlamethrowerBehavior.GLOW_COLORS[idx],
                0.18
            );
        }

        // === 持续伤害（按 tick 间隔计算） ===
        this._dmgTickTimer += frameDt;
        if (this._dmgTickTimer < FlamethrowerBehavior.DMG_TICK_INTERVAL) return;

        // 达到 tick 间隔，结算一次伤害
        this._dmgTickTimer -= FlamethrowerBehavior.DMG_TICK_INTERVAL;

        const hitRadiusAtEnd = 0.56 + level * 0.12;
        const hits = this.collectConeHits(spawnPos, dirX, dirZ, streamLength, hitRadiusAtEnd);
        if (hits.length === 0) return;

        const ownerUnit = owner.getComponent(Unit);
        const critRate = ownerUnit ? ownerUnit.stats.critRate : 0;
        const critDamage = ownerUnit ? ownerUnit.stats.critDamage : 1.5;
        const targetCap = FlamethrowerBehavior.MAX_TARGETS[idx];
        const hitCount = Math.min(targetCap, hits.length);

        // DPS 按 tick 间隔分摊：每 tick 伤害 = damage * (tickInterval / attackInterval)
        const dpsRatio =
            FlamethrowerBehavior.DMG_TICK_INTERVAL / Math.max(0.1, stats.attackInterval);

        for (let i = 0; i < hitCount; i++) {
            const hit = hits[i];
            const distanceT = hit.dist / streamLength;
            const nearBonus = 1 - distanceT * 0.35;
            let damage = Math.max(1, Math.floor(stats.damage * nearBonus * dpsRatio));
            let isCrit = false;
            if (critRate > 0 && Math.random() < critRate) {
                damage = Math.floor(damage * critDamage);
                isCrit = true;
            }

            hit.unit.takeDamage(damage, undefined, isCrit);
            hit.unit.applyKnockback(dirX, dirZ, (0.9 + level * 0.25) * dpsRatio, 0.05);
        }
    }

    /**
     * 停止火焰 VFX（失去目标或切换武器时调用）
     */
    public override stopFire(): void {
        if (this._flameNode && this._flameNode.isValid) {
            WeaponVFX.stopContinuousFlame(this._flameNode);
        }
        this._flameNode = null;
        this._flameParent = null;
        this._dmgTickTimer = 0;
    }

    private collectConeHits(
        origin: Vec3,
        dirX: number,
        dirZ: number,
        maxDist: number,
        maxRadius: number
    ): Array<{ unit: Unit; dist: number }> {
        const hits: Array<{ unit: Unit; dist: number }> = [];
        const enemies = EnemyQuery.getEnemies();
        const baseRadius = 0.18;

        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid) continue;
            const unit = enemy.getComponent(Unit);
            if (!unit || !unit.isAlive || unit.unitType !== UnitType.ENEMY) continue;

            const ex = enemy.position.x - origin.x;
            const ez = enemy.position.z - origin.z;
            const distOnAxis = ex * dirX + ez * dirZ;
            if (distOnAxis < 0 || distOnAxis > maxDist) continue;

            // 2D 叉积长度 = 到火束中心线的垂距
            const perpDist = Math.abs(ex * dirZ - ez * dirX);
            const radiusAtDist = baseRadius + (distOnAxis / maxDist) * maxRadius;
            if (perpDist > radiusAtDist) continue;

            hits.push({ unit, dist: distOnAxis });
        }

        hits.sort((a, b) => a.dist - b.dist);
        return hits;
    }
}
