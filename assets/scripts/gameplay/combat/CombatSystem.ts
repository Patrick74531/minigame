import { _decorator, Component } from 'cc';
import { Soldier } from '../units/Soldier';
import { Enemy } from '../units/Enemy';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { CombatService, CombatProvider } from '../../core/managers/CombatService';
import { GameConfig } from '../../data/GameConfig';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameManager } from '../../core/managers/GameManager';

const { ccclass, property } = _decorator;

/**
 * 战斗系统（集中式索敌）
 * 管理单位之间的战斗和目标分配
 * 挂载到场景中的战斗管理节点
 *
 * NOTE: 若启用该系统，单位不再各自遍历全场敌人。
 */
@ccclass('CombatSystem')
export class CombatSystem extends Component implements CombatProvider {
    /** 所有活跃的敌人 */
    private _enemies: Enemy[] = [];

    public get activeEnemies(): Enemy[] {
        return this._enemies;
    }


    /** 所有活跃的士兵 */
    private _soldiers: Soldier[] = [];

    /** 目标分配检查间隔 */
    @property
    public targetCheckInterval: number = GameConfig.COMBAT.TARGET_CHECK_INTERVAL;

    private _targetCheckTimer: number = 0;

    // === 生命周期 ===

    protected onLoad(): void {
        CombatService.setProvider(this);
        // NOTE: CombatSystem depends on UNIT_SPAWNED/UNIT_DIED events for tracking.
        this.eventManager.on(GameEvents.UNIT_SPAWNED, this.onUnitSpawned, this);
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this.eventManager.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
    }

    protected onDestroy(): void {
        this.eventManager.offAllByTarget(this);
        if (CombatService.provider === this) {
            CombatService.setProvider(null);
        }
        this.clearAll();
    }

    protected update(dt: number): void {
        if (!this.gameManager.isPlaying) return;

        this._targetCheckTimer += dt;
        if (this._targetCheckTimer >= this.targetCheckInterval) {
            this._targetCheckTimer = 0;
            this.assignTargets();
        }
    }

    // === 事件处理 ===

    private onUnitSpawned(data: { unitType: string; node: any }): void {
        if (data.unitType === 'enemy') {
            const enemy = data.node.getComponent(Enemy);
            if (enemy) {
                this.registerEnemy(enemy);
                this.scheduleImmediateRetarget();
            }
        } else if (data.unitType === 'soldier') {
            const soldier = data.node.getComponent(Soldier);
            if (soldier) {
                this.registerSoldier(soldier);
            }
        }
    }

    private onUnitDied(data: { unitType: string; node: any }): void {
        if (data.unitType === 'enemy') {
            const enemy = data.node.getComponent(Enemy);
            if (enemy) {
                this.unregisterEnemy(enemy);
                this.scheduleImmediateRetarget();
            }
        } else if (data.unitType === 'soldier') {
            const soldier = data.node.getComponent(Soldier);
            if (soldier) this.unregisterSoldier(soldier);
        }
    }

    private onEnemyReachedBase(data: { enemy: any }): void {
        const enemy = data.enemy?.getComponent?.(Enemy);
        if (enemy) {
            this.unregisterEnemy(enemy);
            this.scheduleImmediateRetarget();
        }
    }

    // === 单位注册 ===

    public registerEnemy(enemy: Enemy): void {
        if (this._enemies.indexOf(enemy) === -1) {
            this._enemies.push(enemy);
        }
    }

    public unregisterEnemy(enemy: Enemy): void {
        const index = this._enemies.indexOf(enemy);
        if (index !== -1) {
            this._enemies.splice(index, 1);
        }
    }

    public registerSoldier(soldier: Soldier): void {
        if (this._soldiers.indexOf(soldier) === -1) {
            this._soldiers.push(soldier);
        }
        this.tryAssignNearestEnemy(soldier);
    }

    public unregisterSoldier(soldier: Soldier): void {
        const index = this._soldiers.indexOf(soldier);
        if (index !== -1) {
            this._soldiers.splice(index, 1);
        }
    }

    // === 目标分配 ===

    private assignTargets(): void {
        // 原地压缩清理死亡单位（避免 filter() 分配新数组）
        CombatSystem.compactArray(this._enemies);
        CombatSystem.compactArray(this._soldiers);

        for (const soldier of this._soldiers) {
            if (!soldier.target || !soldier.target.isAlive || !soldier.target.node?.isValid) {
                this.tryAssignNearestEnemy(soldier);
            }
        }
    }

    private tryAssignNearestEnemy(soldier: Soldier): void {
        if (!soldier || !soldier.isAlive || !soldier.node || !soldier.node.isValid) return;
        const nearestEnemy = this.findNearestEnemy(soldier);
        if (nearestEnemy) {
            soldier.engageTarget(nearestEnemy);
        }
    }

    private scheduleImmediateRetarget(): void {
        this._targetCheckTimer = this.targetCheckInterval;
    }

    /** 原地移除无效元素（swap-remove，O(n)，零分配） */
    private static compactArray<T extends { isAlive: boolean; node: { isValid: boolean } }>(
        arr: T[]
    ): void {
        let write = 0;
        for (let read = 0; read < arr.length; read++) {
            if (arr[read].isAlive && arr[read].node.isValid) {
                arr[write++] = arr[read];
            }
        }
        arr.length = write;
    }

    private findNearestEnemy(soldier: Soldier): Enemy | null {
        let nearest: Enemy | null = null;
        let minDistance = Infinity;

        const myPos = soldier.node.position;

        for (const enemy of this._enemies) {
            if (!enemy.isAlive) continue;

            const dx = enemy.node.position.x - myPos.x;
            const dz = enemy.node.position.z - myPos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < minDistance) {
                minDistance = distSq;
                nearest = enemy;
            }
        }

        return nearest;
    }

    public findEnemyInRange(
        position: { x: number; y?: number; z?: number },
        range: number
    ): Enemy | null {
        const rangeSquared = range * range;
        let nearest: Enemy | null = null;
        let minDistance = Infinity;

        const px = position.x;
        const pz = position.z ?? position.y ?? 0;

        for (const enemy of this._enemies) {
            if (!enemy.isAlive) continue;

            const dx = enemy.node.position.x - px;
            const dz = enemy.node.position.z - pz;
            const distSq = dx * dx + dz * dz;

            if (distSq <= rangeSquared && distSq < minDistance) {
                minDistance = distSq;
                nearest = enemy;
            }
        }

        return nearest;
    }

    public findSoldierInRange(
        position: { x: number; y?: number; z?: number },
        range: number
    ): Soldier | null {
        const rangeSquared = range * range;
        let nearest: Soldier | null = null;
        let minDistance = Infinity;

        const px = position.x;
        const pz = position.z ?? position.y ?? 0;

        for (const soldier of this._soldiers) {
            if (!soldier.isAlive) continue;

            const dx = soldier.node.position.x - px;
            const dz = soldier.node.position.z - pz;
            const distSq = dx * dx + dz * dz;

            if (distSq <= rangeSquared && distSq < minDistance) {
                minDistance = distSq;
                nearest = soldier;
            }
        }

        return nearest;
    }

    public clearAll(): void {
        this._enemies = [];
        this._soldiers = [];
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
