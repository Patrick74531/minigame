import { _decorator, Component, Node, Prefab, Vec2, Color, director } from 'cc';
import { GameManager, GameState } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { PoolManager } from './core/managers/PoolManager';
import { WaveManager } from './gameplay/wave/WaveManager';
import { GameEvents } from './data/GameEvents';
import { GameConfig } from './data/GameConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏控制器
 * 挂载到场景根节点，负责初始化和协调所有游戏系统
 */
@ccclass('GameController')
export class GameController extends Component {
    // === 预制体引用 ===
    @property(Prefab)
    public enemyPrefab: Prefab | null = null;

    @property(Prefab)
    public soldierPrefab: Prefab | null = null;

    @property(Prefab)
    public coinPrefab: Prefab | null = null;

    @property(Prefab)
    public buildingPrefab: Prefab | null = null;

    // === 容器节点 ===
    @property(Node)
    public enemyContainer: Node | null = null;

    @property(Node)
    public soldierContainer: Node | null = null;

    @property(Node)
    public coinContainer: Node | null = null;

    @property(Node)
    public buildingContainer: Node | null = null;

    // === 游戏配置 ===
    @property
    public basePositionX: number = 0;

    @property
    public basePositionY: number = -200;

    // === 生命周期 ===

    protected onLoad(): void {
        this.initializeManagers();
        this.registerPools();
        this.registerEvents();
    }

    protected start(): void {
        // 自动开始游戏
        this.startGame();
    }

    protected update(dt: number): void {
        // 更新波次管理器
        if (GameManager.instance.isPlaying) {
            WaveManager.instance.update(dt);
        }
    }

    protected onDestroy(): void {
        this.cleanup();
    }

    // === 初始化 ===

    private initializeManagers(): void {
        // 初始化游戏管理器
        GameManager.instance.initialize();

        // 初始化波次管理器
        if (this.enemyContainer) {
            WaveManager.instance.initialize(
                this.enemyContainer,
                new Vec2(this.basePositionX, this.basePositionY),
                () => this.getRandomSpawnPosition()
            );
            WaveManager.instance.generateDefaultWaves(10);
        }
    }

    private registerPools(): void {
        // 注册对象池
        if (this.enemyPrefab) {
            PoolManager.instance.registerPool(
                'enemy_basic',
                this.enemyPrefab,
                GameConfig.POOL.ENEMY_INITIAL_SIZE
            );
        }

        if (this.soldierPrefab) {
            PoolManager.instance.registerPool(
                'soldier_basic',
                this.soldierPrefab,
                GameConfig.POOL.SOLDIER_INITIAL_SIZE
            );
        }

        if (this.coinPrefab) {
            PoolManager.instance.registerPool(
                'coin',
                this.coinPrefab,
                GameConfig.POOL.COIN_INITIAL_SIZE
            );
        }
    }

    private registerEvents(): void {
        EventManager.instance.on(GameEvents.WAVE_START, this.onWaveStart, this);
        EventManager.instance.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
        EventManager.instance.on(GameEvents.GAME_OVER, this.onGameOver, this);
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    // === 游戏流程 ===

    public startGame(): void {
        GameManager.instance.startGame();

        // 延迟开始第一波
        this.scheduleOnce(() => {
            WaveManager.instance.startNextWave();
        }, 2);
    }

    public pauseGame(): void {
        GameManager.instance.pauseGame();
    }

    public resumeGame(): void {
        GameManager.instance.resumeGame();
    }

    public restartGame(): void {
        // 清理所有对象
        this.clearAllUnits();

        // 重置管理器
        GameManager.instance.reset();
        WaveManager.instance.cleanup();
        WaveManager.instance.generateDefaultWaves(10);

        // 重新初始化
        if (this.enemyContainer) {
            WaveManager.instance.initialize(
                this.enemyContainer,
                new Vec2(this.basePositionX, this.basePositionY),
                () => this.getRandomSpawnPosition()
            );
        }

        // 开始新游戏
        this.startGame();
    }

    // === 辅助方法 ===

    /**
     * 获取随机敌人生成位置（从屏幕边缘）
     */
    private getRandomSpawnPosition(): Vec2 {
        const screenWidth = 960; // 后续从 view 获取
        const screenHeight = 640;

        // 从四个方向随机选一个
        const side = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;

        switch (side) {
            case 0: // 上
                x = Math.random() * screenWidth - screenWidth / 2;
                y = screenHeight / 2 + 50;
                break;
            case 1: // 下
                x = Math.random() * screenWidth - screenWidth / 2;
                y = -screenHeight / 2 - 50;
                break;
            case 2: // 左
                x = -screenWidth / 2 - 50;
                y = Math.random() * screenHeight - screenHeight / 2;
                break;
            case 3: // 右
                x = screenWidth / 2 + 50;
                y = Math.random() * screenHeight - screenHeight / 2;
                break;
        }

        return new Vec2(x, y);
    }

    private clearAllUnits(): void {
        // 清理所有容器中的子节点
        this.enemyContainer?.removeAllChildren();
        this.soldierContainer?.removeAllChildren();
        this.coinContainer?.removeAllChildren();
    }

    private cleanup(): void {
        EventManager.instance.offAllByTarget(this);
        PoolManager.instance.clearAll();
        WaveManager.instance.cleanup();
        GameManager.instance.cleanup();
    }

    // === 事件处理 ===

    private onWaveStart(data: { waveIndex: number; enemyCount: number }): void {
        console.log(
            `[GameController] Wave ${data.waveIndex + 1} started with ${data.enemyCount} enemies`
        );
    }

    private onWaveComplete(data: { waveIndex: number }): void {
        console.log(`[GameController] Wave ${data.waveIndex + 1} completed!`);

        // 延迟开始下一波
        this.scheduleOnce(() => {
            WaveManager.instance.startNextWave();
        }, GameConfig.WAVE.WAVE_INTERVAL);
    }

    private onGameOver(data: { victory: boolean }): void {
        if (data.victory) {
            console.log('[GameController] Victory!');
        } else {
            console.log('[GameController] Game Over!');
        }
    }

    private onUnitDied(data: { unitType: string; node: Node }): void {
        // 回收死亡单位到对象池
        if (data.unitType.startsWith('enemy')) {
            PoolManager.instance.despawn('enemy_basic', data.node);

            // 掉落金币
            this.spawnCoin(data.node.position.x, data.node.position.y);
        } else if (data.unitType === 'soldier') {
            PoolManager.instance.despawn('soldier_basic', data.node);
        }
    }

    private spawnCoin(x: number, y: number): void {
        if (!this.coinContainer) return;

        const coin = PoolManager.instance.spawn('coin', this.coinContainer);
        if (coin) {
            coin.setPosition(x, y, 0);
        }
    }
}
