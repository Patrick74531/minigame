import { Node, Vec3 } from 'cc';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { UnitFactory } from '../units/UnitFactory';
import { Unit } from '../units/Unit';
import { WaveService } from '../../core/managers/WaveService';
import { GameConfig } from '../../data/GameConfig';

/**
 * 波次配置
 */
export interface WaveConfig {
    waveNumber: number;
    enemyCount: number;
    spawnInterval: number;
    hpMultiplier: number;
}

/**
 * 波次管理器（无限波模式）
 * 负责敌人波次的生成和管理
 *
 * NOTE: 当前由 GameController 驱动（无限波模式）。
 * 配置波次请使用 WaveConfigManager。
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
    private _enemiesSpawned: number = 0;
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
        EventManager.instance.on(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
        WaveService.instance.registerProvider({
            id: 'infinite',
            priority: 0,
            getSnapshot: () => ({
                currentWave: this._currentWave,
                enemiesAlive: this._enemies.length,
            }),
        });

        console.log('[WaveManager] 初始化完成 (Infinite Mode)');
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
        this._enemiesSpawned = 0;
        this._enemySpawnTimer = 0;

        // Roguelike Scaling Logic
        const infinite = GameConfig.WAVE.INFINITE;
        const count = infinite.BASE_COUNT + waveNumber * infinite.COUNT_PER_WAVE;
        const hpMult = infinite.BASE_HP_MULT + (waveNumber - 1) * infinite.HP_MULT_PER_WAVE;

        this._waveConfig = {
            waveNumber,
            enemyCount: count,
            spawnInterval: Math.max(
                infinite.MIN_SPAWN_INTERVAL,
                infinite.BASE_SPAWN_INTERVAL - waveNumber * infinite.SPAWN_INTERVAL_DECAY_PER_WAVE
            ),
            hpMultiplier: hpMult,
        };

        console.log('═══════════════════════════════════════');
        console.log(`🌊 第 ${waveNumber} 波! 敌人: ${this._waveConfig.enemyCount}`);
        console.log('═══════════════════════════════════════');

        EventManager.instance.emit(GameEvents.WAVE_START, {
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
            this._enemiesSpawned < this._waveConfig.enemyCount
        ) {
            this._enemySpawnTimer = 0;
            this.spawnEnemy();
            this._enemiesSpawned++;
        }

        if (this._enemiesSpawned >= this._waveConfig.enemyCount) {
            this._waveActive = false;
        }
    }

    /**
     * 检查波次是否完成
     */
    public checkWaveComplete(onComplete: (bonus: number) => void): void {
        if (this._waveActive || this._enemies.length > 0 || !this._waveConfig) return;

        const bonus = this._currentWave * GameConfig.WAVE.INFINITE.BONUS_PER_WAVE;
        console.log(`✅ 第 ${this._currentWave} 波完成! +${bonus} 金币`);

        EventManager.instance.emit(GameEvents.WAVE_COMPLETE, {
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

    private spawnEnemy(): void {
        if (!this._enemyContainer) return;

        const pos = this.getEdgePosition();
        const enemy = UnitFactory.createEnemy(
            this._enemyContainer,
            pos.x,
            pos.y,
            this._baseNode ? this._baseNode.position : new Vec3(0, 0, 0), // Base Position
            this._waveConfig?.hpMultiplier || 1
        );
        this._enemies.push(enemy);
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
        EventManager.instance.off(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
        WaveService.instance.unregisterProvider('infinite');
        this._enemies = [];
        this._waveConfig = null;
        this._waveActive = false;
    }
}
