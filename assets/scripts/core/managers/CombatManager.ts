import { _decorator, Node, Vec3 } from 'cc';
import { EventManager } from './EventManager';
import { GameEvents } from '../../data/GameEvents';
import { Unit } from '../../gameplay/units/Unit';

/**
 * 战斗管理器
 * 负责战斗检测、伤害计算
 */
export class CombatManager {
    private static _instance: CombatManager | null = null;

    public static get instance(): CombatManager {
        if (!this._instance) {
            this._instance = new CombatManager();
        }
        return this._instance;
    }

    // === 配置 ===
    private readonly MELEE_RANGE = 0.5;  // 近战攻击范围
    private readonly HERO_RANGE = 1.0;   // 英雄攻击范围

    /**
     * 计算两个节点之间的距离
     */
    public getDistance(a: Node, b: Node): number {
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 查找最近的敌人
     */
    public findNearestEnemy(unit: Node, enemies: Node[]): Node | null {
        let nearest: Node | null = null;
        let minDist = Infinity;

        for (const enemy of enemies) {
            if (!enemy.isValid) continue;
            const dist = this.getDistance(unit, enemy);
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    /**
     * 处理士兵战斗
     */
    public processSoldierCombat(
        soldiers: Node[], 
        enemies: Node[],
        onEnemyKilled: (enemy: Node) => void
    ): void {
        const killedEnemies: Node[] = [];

        for (const soldier of soldiers) {
            if (!soldier.isValid) continue;
            const target = (soldier as any).currentTarget;
            if (!target || !target.isValid) continue;

            const dist = this.getDistance(soldier, target);
            if (dist < this.MELEE_RANGE) {
                this.dealDamage(target, 15, killedEnemies);
            }
        }

        for (const enemy of killedEnemies) {
            onEnemyKilled(enemy);
        }
    }

    /**
     * 处理英雄战斗
     */
    public processHeroCombat(
        hero: Node,
        enemies: Node[],
        onEnemyKilled: (enemy: Node) => void
    ): void {
        if (!hero || !hero.isValid) return;

        const killedEnemies: Node[] = [];
        const target = this.findNearestEnemy(hero, enemies);

        if (target && target.isValid) {
            const dist = this.getDistance(hero, target);
            if (dist < this.HERO_RANGE) {
                this.dealDamage(target, 30, killedEnemies);
            }
        }

        for (const enemy of killedEnemies) {
            onEnemyKilled(enemy);
        }
    }

    /**
     * 对目标造成伤害
     */
    public dealDamage(target: Node, damage: number, killedList: Node[]): void {
        const unit = target.getComponent(Unit);
        if (!unit) return;

        unit.takeDamage(damage);

        if (!unit.isAlive && !killedList.includes(target)) {
            killedList.push(target);
            console.log('[Combat] ⚔️ 击败敌人!');
            EventManager.instance.emit(GameEvents.ENEMY_KILLED, { enemy: target });
        }
    }
}
