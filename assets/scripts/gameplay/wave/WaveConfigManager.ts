import { Node, Vec2, Vec3 } from 'cc';
import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { PoolManager } from '../../core/managers/PoolManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';
import { Enemy } from '../units/Enemy';
import { WaveService } from '../../core/managers/WaveService';

/** 配置波次数据 */
export interface WaveScheduleConfig {
    /** 波次索引 */
    index: number;
    /** 敌人总数 */
    enemyCount: number;
    /** 敌人生成间隔（秒） */
    spawnInterval: number;
    /** 敌人池名称 */
    enemyPoolName: string;
    /** 难度系数（乘以基础属性） */
    difficultyMultiplier: number;
}

/**
 * 配置波次管理器（Legacy/Alternative）
 * 管理敌人波次的生成（配置波次模式）
 *
 * NOTE: 目前主流程使用无限波模式。
 * 若要使用配置波次，请在场景中驱动此管理器的 update。
 * 该模块当前为“休眠/备用”状态。
 */
export class WaveConfigManager extends Singleton<WaveConfigManager>() {
    private _waves: WaveScheduleConfig[] = [];
    private _currentWaveIndex: number = 0;
    private _enemiesSpawned: number = 0;
    private _enemiesAlive: number = 0;
    private _isWaveActive: boolean = false;
    private _spawnTimer: number = 0;

    /** 敌人容器节点 */
    private _enemyContainer: Node | null = null;

    /** 敌人目标位置（基地） */
    private _targetPosition: Vec2 = new Vec2(0, 0);

    /** 敌人生成位置生成器 */
    private _spawnPositionGenerator: (() => Vec2) | null = null;

    // === 访问器 ===

    public get currentWaveIndex(): number {
        return this._currentWaveIndex;
    }

    public get isWaveActive(): boolean {
        return this._isWaveActive;
    }

    public get enemiesAlive(): number {
        return this._enemiesAlive;
    }

    public get totalWaves(): number {
        return this._waves.length;
    }

    public get enemies(): Node[] {
        return this._enemyContainer ? this._enemyContainer.children : [];
    }

    // === 初始化 ===

    /**
     * 初始化波次管理器
     * @param enemyContainer 敌人父节点
     * @param targetPosition 敌人目标位置（基地）
     */
    public initialize(
        enemyContainer: Node,
        targetPosition: Vec2,
        spawnPositionGenerator: () => Vec2
    ): void {
        this._enemyContainer = enemyContainer;
        this._targetPosition = targetPosition;
        this._spawnPositionGenerator = spawnPositionGenerator;

        // 注册事件
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
        WaveService.instance.registerProvider({
            id: 'config',
            priority: 10,
            isReady: () => this._waves.length > 0,
            getSnapshot: () => ({
                currentWave: this._currentWaveIndex + 1,
                totalWaves: this._waves.length,
                enemiesAlive: this._enemiesAlive,
            }),
        });
    }

    /**
     * 加载波次配置
     * @param waves 波次配置数组
     */
    public loadWaves(waves: WaveScheduleConfig[]): void {
        this._waves = waves;
        this._currentWaveIndex = 0;
    }

    /**
     * 生成默认波次配置
     * @param waveCount 波次数量
     */
    public generateDefaultWaves(waveCount: number = 10): void {
        this._waves = [];

        for (let i = 0; i < waveCount; i++) {
            const multiplier = Math.pow(GameConfig.WAVE.DIFFICULTY_MULTIPLIER, i);
            this._waves.push({
                index: i,
                enemyCount: 5 + Math.floor(i * 2),
                spawnInterval: GameConfig.WAVE.SPAWN_INTERVAL,
                enemyPoolName: 'enemy_basic',
                difficultyMultiplier: multiplier,
            });
        }
    }

    // === 波次控制 ===

    /**
     * 开始下一波
     */
    public startNextWave(): void {
        if (this._currentWaveIndex >= this._waves.length) {
            // 所有波次完成
            EventManager.instance.emit(GameEvents.ALL_WAVES_COMPLETE);
            return;
        }

        const wave = this._waves[this._currentWaveIndex];
        this._isWaveActive = true;
        this._enemiesSpawned = 0;
        this._spawnTimer = 0;

        EventManager.instance.emit(GameEvents.WAVE_START, {
            wave: wave.index + 1,
            waveIndex: wave.index,
            enemyCount: wave.enemyCount,
        });
    }

    /**
     * 更新波次（需要在游戏主循环中调用）
     * @param dt 帧间隔时间
     */
    public update(dt: number): void {
        if (!this._isWaveActive) return;

        const wave = this._waves[this._currentWaveIndex];
        if (!wave) return;

        // 检查是否需要生成敌人
        if (this._enemiesSpawned < wave.enemyCount) {
            this._spawnTimer += dt;

            if (this._spawnTimer >= wave.spawnInterval) {
                this._spawnTimer = 0;
                this.spawnEnemy(wave);
            }
        }

        // 检查波次是否完成
        if (this._enemiesSpawned >= wave.enemyCount && this._enemiesAlive === 0) {
            this.completeWave();
        }
    }

    // === 敌人生成 ===

    private spawnEnemy(wave: WaveScheduleConfig): void {
        if (!this._enemyContainer || !this._spawnPositionGenerator) return;

        const enemy = PoolManager.instance.spawn(wave.enemyPoolName, this._enemyContainer);
        if (!enemy) return;

        // 设置生成位置
        const spawnPos = this._spawnPositionGenerator();
        enemy.setPosition(spawnPos.x, spawnPos.y, 0);

        // 设置敌人目标和属性
        const enemyComponent = enemy.getComponent(Enemy);
        if (enemyComponent) {
            enemyComponent.setTargetPosition(
                new Vec3(this._targetPosition.x, 0, this._targetPosition.y)
            );

            // 应用难度系数
            enemyComponent.initStats({
                maxHp: Math.floor(GameConfig.ENEMY.BASE_HP * wave.difficultyMultiplier),
                attack: Math.floor(GameConfig.ENEMY.BASE_ATTACK * wave.difficultyMultiplier),
            });
        }

        this._enemiesSpawned++;
        this._enemiesAlive++;

        EventManager.instance.emit(GameEvents.UNIT_SPAWNED, {
            unitType: 'enemy',
            node: enemy,
        });
    }

    private completeWave(): void {
        this._isWaveActive = false;

        EventManager.instance.emit(GameEvents.WAVE_COMPLETE, {
            wave: this._currentWaveIndex + 1,
            waveIndex: this._currentWaveIndex,
        });

        this._currentWaveIndex++;

        // 自动开始下一波（可配置间隔）
        // 这里简化处理，实际应该用定时器
    }

    // === 事件处理 ===

    private onUnitDied(data: { unitType: string }): void {
        if (data.unitType === 'enemy') {
            this._enemiesAlive = Math.max(0, this._enemiesAlive - 1);
        }
    }

    /**
     * 清理
     */
    public cleanup(): void {
        EventManager.instance.offAllByTarget(this);
        WaveService.instance.unregisterProvider('config');
        this._waves = [];
        this._currentWaveIndex = 0;
        this._isWaveActive = false;
    }
}
