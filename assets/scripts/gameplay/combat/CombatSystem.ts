import { _decorator, Component } from 'cc';
import { Soldier } from '../units/Soldier';
import { Enemy } from '../units/Enemy';
import { MathUtils } from '../../core/utils/MathUtils';
import { CombatService, CombatProvider } from '../../core/managers/CombatService';
import { GameConfig } from '../../data/GameConfig';

const { ccclass, property } = _decorator;

/**
 * 战斗系统
 * 管理单位之间的战斗和目标分配
 * 挂载到场景中的战斗管理节点
 *
 * NOTE: 与 core/managers/CombatManager 功能重叠，建议后续统一入口。
 */
@ccclass('CombatSystem')
export class CombatSystem extends Component implements CombatProvider {
    /** 所有活跃的敌人 */
    private _enemies: Enemy[] = [];

    /** 所有活跃的士兵 */
    private _soldiers: Soldier[] = [];

    /** 目标分配检查间隔 */
    @property
    public targetCheckInterval: number = GameConfig.COMBAT.TARGET_CHECK_INTERVAL;

    private _targetCheckTimer: number = 0;

    // === 生命周期 ===

    protected onLoad(): void {
        // Register this implementation for new callers (no behavior change for existing code)
        CombatService.setProvider(this);
    }

    protected onDestroy(): void {
        if (CombatService.provider === this) {
            CombatService.setProvider(null);
        }
    }

    protected update(dt: number): void {
        this._targetCheckTimer += dt;

        if (this._targetCheckTimer >= this.targetCheckInterval) {
            this._targetCheckTimer = 0;
            this.assignTargets();
        }
    }

    // === 单位注册 ===

    /**
     * 注册敌人
     */
    public registerEnemy(enemy: Enemy): void {
        if (this._enemies.indexOf(enemy) === -1) {
            this._enemies.push(enemy);
        }
    }

    /**
     * 注销敌人
     */
    public unregisterEnemy(enemy: Enemy): void {
        const index = this._enemies.indexOf(enemy);
        if (index !== -1) {
            this._enemies.splice(index, 1);
        }
    }

    /**
     * 注册士兵
     */
    public registerSoldier(soldier: Soldier): void {
        if (this._soldiers.indexOf(soldier) === -1) {
            this._soldiers.push(soldier);
        }
    }

    /**
     * 注销士兵
     */
    public unregisterSoldier(soldier: Soldier): void {
        const index = this._soldiers.indexOf(soldier);
        if (index !== -1) {
            this._soldiers.splice(index, 1);
        }
    }

    // === 目标分配 ===

    /**
     * 为所有士兵分配最近的敌人目标
     */
    private assignTargets(): void {
        // 清理死亡单位
        this._enemies = this._enemies.filter(e => e.isAlive);
        this._soldiers = this._soldiers.filter(s => s.isAlive);

        // 为每个没有目标的士兵分配最近的敌人
        for (const soldier of this._soldiers) {
            if (!soldier.target || !soldier.target.isAlive) {
                const nearestEnemy = this.findNearestEnemy(soldier);
                if (nearestEnemy) {
                    soldier.setTarget(nearestEnemy);
                }
            }
        }
    }

    /**
     * 找到最近的敌人
     */
    private findNearestEnemy(soldier: Soldier): Enemy | null {
        let nearest: Enemy | null = null;
        let minDistance = Infinity;

        for (const enemy of this._enemies) {
            if (!enemy.isAlive) continue;

            const distance = MathUtils.distanceSquared(soldier.node.position, enemy.node.position);

            if (distance < minDistance) {
                minDistance = distance;
                nearest = enemy;
            }
        }

        return nearest;
    }

    /**
     * 找到范围内的最近敌人
     */
    public findEnemyInRange(position: { x: number; y: number }, range: number): Enemy | null {
        const rangeSquared = range * range;
        let nearest: Enemy | null = null;
        let minDistance = Infinity;

        for (const enemy of this._enemies) {
            if (!enemy.isAlive) continue;

            // Cast to any to bypass generic object vs Vec2 strictness if simple, or use Vec2
            const distance = MathUtils.distanceSquared(position as any, enemy.node.position);

            if (distance <= rangeSquared && distance < minDistance) {
                minDistance = distance;
                nearest = enemy;
            }
        }

        return nearest;
    }

    /**
     * 清理所有注册的单位
     */
    public clearAll(): void {
        this._enemies = [];
        this._soldiers = [];
    }
}
