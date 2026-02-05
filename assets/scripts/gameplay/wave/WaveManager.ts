import { Node, Vec3 } from 'cc';
import { GameEvents } from '../../data/GameEvents';
import { UnitFactory } from '../units/UnitFactory';
import { Unit, UnitType } from '../units/Unit';
import { GameConfig } from '../../data/GameConfig';
import { WaveService } from '../../core/managers/WaveService';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { EventManager } from '../../core/managers/EventManager';

/**
 * 波次配置
 */
export interface WaveConfig {
    waveNumber: number;
    regularCount: number;
    eliteCount: number;
    enemyCount: number;
    spawnInterval: number;
    hpMultiplier: number;
    speedMultiplier: number;
}

/**
 * 波次管理器（无限波模式）
 * 负责敌人波次的生成和管理
 *
 * NOTE: 当前由 GameController 驱动（无限波模式）。
 * 若需配置波次，可新增独立的配置波次管理器。
 */
export class WaveManager {
    private static _instance: WaveManager | null = null;

    public static get instance(): WaveManager {
        if (!this._instance) {
            this._instance = new WaveManager();
        }
        return this._instance;
    }

    // === 状态 ===
    private _enemyContainer: Node | null = null;
    private _enemies: Node[] = [];
    private _currentWave: number = 0;
    private _waveActive: boolean = false;
    private _regularSpawned: number = 0;
    private _eliteSpawned: number = 0;
    private _enemySpawnTimer: number = 0;
    private _waveConfig: WaveConfig | null = null;

    // === 初始化 ===

    private _baseNode: Node | null = null;
    public initialize(enemyContainer: Node, baseNode: Node): void {
        this._enemyContainer = enemyContainer;
        this._baseNode = baseNode;
        this._enemies = [];
        this._currentWave = 0;

        // Listen for AOE impacts
        this.eventManager.on(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this.eventManager.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        ServiceRegistry.register('EnemyProvider', {
            getEnemies: () => this._enemies,
        });
        this.waveService.registerProvider({
            id: 'infinite',
            priority: 0,
            getSnapshot: () => ({
                currentWave: this._currentWave,
                enemiesAlive: this._enemies.length,
            }),
        });

        console.log('[WaveManager] 初始化完成 (Infinite Mode)');
    }

    private onUnitDied(data: { unitType: string; node?: Node }): void {
        if (data.unitType !== UnitType.ENEMY || !data.node) return;
        this.removeEnemy(data.node);
    }

    private onEnemyReachedBase(data: { enemy?: Node }): void {
        if (!data?.enemy) return;
        this.removeEnemy(data.enemy);
    }

    private onApplyAoE(data: {
        center: any;
        radius: number;
        damage: number;
        slowPercent: number;
        slowDuration: number;
    }): void {
        const radiusSqr = data.radius * data.radius;
        const center = data.center;

        // Iterate all active enemies
        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            // Check distance
            const dx = enemy.position.x - center.x;
            const dz = enemy.position.z - center.z;
            const distSqr = dx * dx + dz * dz;

            if (distSqr <= radiusSqr) {
                const u = enemy.getComponent(Unit);

                if (u && u.isAlive) {
                    u.takeDamage(data.damage);
                    if (data.slowPercent > 0) {
                        u.applySlow(data.slowPercent, data.slowDuration);
                    }
                }
            }
        }
        console.log(`[WaveManager] AOE Applied to ${this._enemies.length} potential targets.`);
    }

    // === 公共接口 ===

    public get enemies(): Node[] {
        return this._enemies;
    }

    public get currentWave(): number {
        return this._currentWave;
    }

    public get isWaveActive(): boolean {
        return this._waveActive;
    }

    /**
     * 开始新波次
     */
    public startWave(waveNumber: number): void {
        this._currentWave = waveNumber;
        this._waveActive = true;
        this._regularSpawned = 0;
        this._eliteSpawned = 0;
        this._enemySpawnTimer = 0;

        // Difficulty scaling from centralized config
        const infinite = GameConfig.WAVE.INFINITE;
        const waveIndex = waveNumber - 1;
        const countStepBonus =
            Math.floor(waveIndex / infinite.COUNT_GROWTH_STEP_WAVES) *
            infinite.COUNT_GROWTH_STEP_BONUS;
        const regularCount = Math.max(
            1,
            Math.round(infinite.BASE_COUNT + waveIndex * infinite.COUNT_PER_WAVE + countStepBonus)
        );
        const eliteCount = this.getEliteCountForWave(waveNumber);
        const hpMult = infinite.BASE_HP_MULT + waveIndex * infinite.HP_MULT_PER_WAVE;
        const speedMult = Math.min(
            infinite.MAX_SPEED_MULT,
            infinite.BASE_SPEED_MULT + waveIndex * infinite.SPEED_MULT_PER_WAVE
        );

        this._waveConfig = {
            waveNumber,
            regularCount,
            eliteCount,
            enemyCount: regularCount + eliteCount,
            spawnInterval: Math.max(
                infinite.MIN_SPAWN_INTERVAL,
                infinite.BASE_SPAWN_INTERVAL - waveIndex * infinite.SPAWN_INTERVAL_DECAY_PER_WAVE
            ),
            hpMultiplier: hpMult,
            speedMultiplier: speedMult,
        };

        console.log('═══════════════════════════════════════');
        console.log(
            `🌊 第 ${waveNumber} 波! 敌人: ${this._waveConfig.enemyCount} (普通:${regularCount} 精英:${eliteCount})`
        );
        console.log('═══════════════════════════════════════');

        this.eventManager.emit(GameEvents.WAVE_START, {
            wave: waveNumber,
            waveIndex: waveNumber - 1,
            enemyCount: this._waveConfig.enemyCount,
        });
    }

    /**
     * 每帧更新波次生成
     */
    public update(dt: number): void {
        if (!this._waveActive || !this._waveConfig) return;

        this._enemySpawnTimer += dt;
        if (
            this._enemySpawnTimer >= this._waveConfig.spawnInterval &&
            this.totalSpawned < this._waveConfig.enemyCount
        ) {
            this._enemySpawnTimer = 0;
            const spawnElite = this.shouldSpawnElite();
            this.spawnEnemy(spawnElite);
            if (spawnElite) {
                this._eliteSpawned++;
            } else {
                this._regularSpawned++;
            }
        }

        if (this.totalSpawned >= this._waveConfig.enemyCount) {
            this._waveActive = false;
        }
    }

    /**
     * 检查波次是否完成
     */
    public checkWaveComplete(onComplete: (bonus: number) => void): void {
        if (this._waveActive || this._enemies.length > 0 || !this._waveConfig) return;

        const bonusBase = GameConfig.WAVE.INFINITE.BONUS_PER_WAVE;
        const bonusGrowth = GameConfig.WAVE.INFINITE.BONUS_GROWTH_PER_WAVE;
        const waveBonus = bonusBase + (this._currentWave - 1) * bonusGrowth;
        const eliteBonus = this._waveConfig.eliteCount * Math.floor(bonusBase * 0.75);
        const bonus = waveBonus + eliteBonus;
        console.log(`✅ 第 ${this._currentWave} 波完成! +${bonus} 金币`);

        this.eventManager.emit(GameEvents.WAVE_COMPLETE, {
            wave: this._currentWave,
            waveIndex: this._currentWave - 1,
            bonus,
        });

        this._waveConfig = null;
        onComplete(bonus);
    }

    /**
     * 是否还有更多波次
     */
    public hasMoreWaves(): boolean {
        return true; // Infinite
    }

    /**
     * 移除敌人（死亡或到达基地）
     */
    public removeEnemy(enemy: Node): void {
        const idx = this._enemies.indexOf(enemy);
        if (idx !== -1) {
            this._enemies.splice(idx, 1);
        }
    }

    // === 私有方法 ===

    private spawnEnemy(isElite: boolean): void {
        if (!this._enemyContainer) return;

        const pos = this.getEdgePosition();
        const elite = GameConfig.ENEMY.ELITE;
        const enemy = UnitFactory.createEnemy(
            this._enemyContainer,
            pos.x,
            pos.y,
            this._baseNode ? this._baseNode.position : new Vec3(0, 0, 0), // Base Position
            {
                hpMultiplier:
                    (this._waveConfig?.hpMultiplier || 1) * (isElite ? elite.HP_MULTIPLIER : 1),
                speedMultiplier:
                    (this._waveConfig?.speedMultiplier || 1) *
                    (isElite ? elite.SPEED_MULTIPLIER : 1),
                attackMultiplier: isElite ? elite.ATTACK_MULTIPLIER : 1,
                isElite,
                scaleMultiplier: isElite ? elite.SCALE_MULTIPLIER : 1,
                coinDropMultiplier: isElite ? elite.COIN_DROP_MULTIPLIER : 1,
            }
        );
        this._enemies.push(enemy);

        // Notify centralized systems (e.g., CombatSystem) about new enemy
        this.eventManager.emit(GameEvents.UNIT_SPAWNED, {
            unitType: 'enemy',
            node: enemy,
        });
    }

    private get totalSpawned(): number {
        return this._regularSpawned + this._eliteSpawned;
    }

    private shouldSpawnElite(): boolean {
        if (!this._waveConfig) return false;
        if (this._eliteSpawned >= this._waveConfig.eliteCount) return false;
        if (this._regularSpawned >= this._waveConfig.regularCount) return true;

        const spawnEvery = Math.max(1, GameConfig.WAVE.INFINITE.ELITE.SPAWN_EVERY);
        const nextSpawnIndex = this.totalSpawned + 1;
        return nextSpawnIndex % spawnEvery === 0;
    }

    private getEliteCountForWave(waveNumber: number): number {
        const elite = GameConfig.WAVE.INFINITE.ELITE;
        if (waveNumber < elite.START_WAVE) return 0;
        if ((waveNumber - elite.START_WAVE) % elite.INTERVAL !== 0) return 0;

        const growthSteps = Math.floor(
            (waveNumber - elite.START_WAVE) / elite.COUNT_GROWTH_STEP_WAVES
        );
        return Math.min(elite.MAX_COUNT, elite.BASE_COUNT + growthSteps);
    }

    private getEdgePosition(): { x: number; y: number } {
        const range = GameConfig.WAVE.INFINITE.SPAWN_RANGE;
        const side = Math.floor(Math.random() * 4);
        switch (side) {
            case 0:
                return { x: Math.random() * range * 2 - range, y: range + 1 };
            case 1:
                return { x: Math.random() * range * 2 - range, y: -range - 1 };
            case 2:
                return { x: -range - 1, y: Math.random() * range * 2 - range };
            default:
                return { x: range + 1, y: Math.random() * range * 2 - range };
        }
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.off(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
        this.eventManager.off(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this.eventManager.off(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        this.waveService.unregisterProvider('infinite');
        this._enemies = [];
        this._waveConfig = null;
        this._waveActive = false;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
