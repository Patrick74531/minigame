import { _decorator, Node } from 'cc';
import { EventManager } from './EventManager';
import { GameEvents } from '../../data/GameEvents';
import { UnitFactory } from '../../gameplay/units/UnitFactory';

const { ccclass } = _decorator;

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
 * 波次管理器
 * 负责敌人波次的生成和管理
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
    private _maxWaves: number = 10;

    // === 初始化 ===

    public initialize(enemyContainer: Node, maxWaves: number = 999): void {
        this._enemyContainer = enemyContainer;
        this._maxWaves = maxWaves;
        this._enemies = [];
        this._currentWave = 0;
        console.log('[WaveManager] 初始化完成');
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

        this._waveConfig = {
            waveNumber,
            enemyCount: 50 + waveNumber * 10, // Increased for testing
            spawnInterval: 0.5, // Faster spawn
            hpMultiplier: 1 + (waveNumber - 1) * 0.3,
        };

        console.log('═══════════════════════════════════════');
        console.log(`🌊 第 ${waveNumber} 波! 敌人: ${this._waveConfig.enemyCount}`);
        console.log('═══════════════════════════════════════');

        EventManager.instance.emit(GameEvents.WAVE_START, { wave: waveNumber });
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

        const bonus = this._currentWave * 25;
        console.log(`✅ 第 ${this._currentWave} 波完成! +${bonus} 金币`);

        EventManager.instance.emit(GameEvents.WAVE_COMPLETE, { 
            wave: this._currentWave, 
            bonus 
        });

        this._waveConfig = null;
        onComplete(bonus);
    }

    /**
     * 是否还有更多波次
     */
    public hasMoreWaves(): boolean {
        return this._currentWave < this._maxWaves;
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
            this._waveConfig?.hpMultiplier || 1
        );
        this._enemies.push(enemy);
    }

    private getEdgePosition(): { x: number; y: number } {
        const range = 6;
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
        this._enemies = [];
        this._waveConfig = null;
        this._waveActive = false;
    }
}
