import { _decorator, Node } from 'cc';
import { Singleton } from '../base/Singleton';
import { EventManager } from './EventManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';

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
 * GameManager.instance.startGame();
 *
 * // 暂停/恢复
 * GameManager.instance.pauseGame();
 * GameManager.instance.resumeGame();
 */
export class GameManager extends Singleton<GameManager>() {
    private _gameState: GameState = GameState.NONE;
    private _coins: number = 0;
    private _score: number = 0;
    private _currentWave: number = 0;

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
        this._coins = GameConfig.ECONOMY.INITIAL_COINS;

        EventManager.instance.emit(GameEvents.GAME_START);
    }

    /**
     * 暂停游戏
     */
    public pauseGame(): void {
        if (this._gameState !== GameState.PLAYING) return;

        this._gameState = GameState.PAUSED;
        EventManager.instance.emit(GameEvents.GAME_PAUSE);
    }

    /**
     * 恢复游戏
     */
    public resumeGame(): void {
        if (this._gameState !== GameState.PAUSED) return;

        this._gameState = GameState.PLAYING;
        EventManager.instance.emit(GameEvents.GAME_RESUME);
    }

    /**
     * 游戏结束
     * @param victory 是否胜利
     */
    public gameOver(victory: boolean): void {
        if (this._gameState === GameState.GAME_OVER) return;

        this._gameState = GameState.GAME_OVER;
        EventManager.instance.emit(GameEvents.GAME_OVER, { victory });
    }

    /**
     * 重置游戏状态
     */
    public reset(): void {
        this._gameState = GameState.NONE;
        this._coins = 0;
        this._score = 0;
        this._currentWave = 0;
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

        EventManager.instance.emit(GameEvents.COIN_CHANGED, {
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

        EventManager.instance.emit(GameEvents.COIN_CHANGED, {
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

    // === 事件处理 ===

    private registerEvents(): void {
        EventManager.instance.on(GameEvents.COIN_COLLECTED, this.onCoinCollected, this);
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
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
        EventManager.instance.offAllByTarget(this);
    }
}
