import { _decorator, Node, PhysicsSystem } from 'cc';
import { Singleton } from '../base/Singleton';
import { EventManager } from './EventManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';
import { ServiceRegistry } from './ServiceRegistry';

const { ccclass, property } = _decorator;

/** 游戏状态枚举 */
export enum GameState {
    NONE = 0,
    LOADING = 1,
    PLAYING = 2,
    PAUSED = 3,
    GAME_OVER = 4,
}

/**
 * 游戏管理器
 * 游戏的总控制器，协调各子系统
 *
 * @example
 * // 开始游戏
 * ServiceRegistry.get<GameManager>('GameManager')?.startGame();
 *
 * // 暂停/恢复
 * ServiceRegistry.get<GameManager>('GameManager')?.pauseGame();
 * ServiceRegistry.get<GameManager>('GameManager')?.resumeGame();
 */
export class GameManager extends Singleton<GameManager>() {
    private _gameState: GameState = GameState.NONE;
    private _coins: number = 0;
    private _score: number = 0;
    private _currentWave: number = 0;
    /** 暂停请求计数：用于处理多个系统同时请求暂停的场景 */
    private _pauseRequestCount: number = 0;

    // Public reference to Hero for global access (e.g. Magnet logic)
    public hero: Node | null = null;

    // Active Buildings List (Stores Nodes to avoid circular deps)
    public activeBuildings: Node[] = [];

    // === 状态访问器 ===

    public get gameState(): GameState {
        return this._gameState;
    }

    public get coins(): number {
        return this._coins;
    }

    public get score(): number {
        return this._score;
    }

    public get currentWave(): number {
        return this._currentWave;
    }

    public get isPlaying(): boolean {
        return this._gameState === GameState.PLAYING;
    }

    // === 游戏流程控制 ===

    /**
     * 初始化游戏管理器
     * 在游戏启动时调用
     */
    public initialize(): void {
        this._gameState = GameState.LOADING;
        this._coins = 0;
        this._score = 0;
        this._currentWave = 0;
        this._pauseRequestCount = 0;
        this.hero = null;
        this.activeBuildings = [];

        this.registerEvents();
    }

    /**
     * 开始游戏
     */
    public startGame(): void {
        if (this._gameState === GameState.PLAYING) {
            console.warn('[GameManager] Game is already playing');
            return;
        }

        this._gameState = GameState.PLAYING;
        this._pauseRequestCount = 0;
        PhysicsSystem.instance.enable = true;
        this._coins = GameConfig.ECONOMY.INITIAL_COINS;

        this.eventManager.emit(GameEvents.GAME_START);
    }

    /**
     * 暂停游戏
     */
    public pauseGame(): void {
        if (this._gameState === GameState.PAUSED) {
            this._pauseRequestCount += 1;
            return;
        }
        if (this._gameState !== GameState.PLAYING) return;

        this._pauseRequestCount = 1;
        this._gameState = GameState.PAUSED;
        PhysicsSystem.instance.enable = false;
        this.eventManager.emit(GameEvents.GAME_PAUSE);
    }

    /**
     * 恢复游戏
     */
    public resumeGame(): void {
        if (this._gameState !== GameState.PAUSED) return;
        if (this._pauseRequestCount > 1) {
            this._pauseRequestCount -= 1;
            return;
        }

        this._pauseRequestCount = 0;
        this._gameState = GameState.PLAYING;
        PhysicsSystem.instance.enable = true;
        this.eventManager.emit(GameEvents.GAME_RESUME);
    }

    /**
     * 游戏结束
     * @param victory 是否胜利
     */
    public gameOver(victory: boolean): void {
        if (this._gameState === GameState.GAME_OVER) return;

        this._gameState = GameState.GAME_OVER;
        this._pauseRequestCount = 0;
        PhysicsSystem.instance.enable = false;
        this.eventManager.emit(GameEvents.GAME_OVER, { victory });
    }

    /**
     * 重置游戏状态
     */
    public reset(): void {
        this._gameState = GameState.NONE;
        this._coins = 0;
        this._score = 0;
        this._currentWave = 0;
        this._pauseRequestCount = 0;
    }

    // === 金币系统 ===

    /**
     * 添加金币
     * @param amount 金币数量
     */
    public addCoins(amount: number): void {
        if (amount <= 0) return;

        const oldCoins = this._coins;
        this._coins += amount;

        this.eventManager.emit(GameEvents.COIN_CHANGED, {
            current: this._coins,
            delta: amount,
        });
    }

    /**
     * 消耗金币
     * @param amount 金币数量
     * @returns 是否成功消耗
     */
    public spendCoins(amount: number): boolean {
        if (amount <= 0 || this._coins < amount) {
            return false;
        }

        this._coins -= amount;

        this.eventManager.emit(GameEvents.COIN_CHANGED, {
            current: this._coins,
            delta: -amount,
        });

        return true;
    }

    /**
     * 检查是否有足够金币
     * @param amount 需要的金币数量
     */
    public hasEnoughCoins(amount: number): boolean {
        return this._coins >= amount;
    }

    // === 波次控制 ===

    /**
     * 设置当前波次
     * @param wave 波次索引
     */
    public setCurrentWave(wave: number): void {
        this._currentWave = wave;
    }

    /**
     * 增加分数
     * @param points 分数
     */
    public addScore(points: number): void {
        if (points <= 0) return;
        this._score += points;
    }

    /**
     * 直接设置金币（用于存档恢复）
     */
    public setCoins(amount: number): void {
        this._coins = Math.max(0, Math.floor(amount));
        this.eventManager.emit(GameEvents.COIN_CHANGED, {
            current: this._coins,
            delta: 0,
        });
    }

    /**
     * 直接设置分数（用于存档恢复）
     */
    public setScore(amount: number): void {
        this._score = Math.max(0, Math.floor(amount));
    }

    // === 事件处理 ===

    private registerEvents(): void {
        this.eventManager.on(GameEvents.COIN_COLLECTED, this.onCoinCollected, this);
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    private onCoinCollected(data: { amount: number }): void {
        this.addCoins(data.amount);
    }

    private onUnitDied(data: { unitType: string }): void {
        // 敌人死亡增加分数
        if (data.unitType.startsWith('enemy')) {
            this.addScore(10);
        }
    }

    /**
     * 清理事件监听
     */
    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
