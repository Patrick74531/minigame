import { _decorator, Component } from 'cc';
import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';

const { ccclass } = _decorator;
const COUNTDOWN_NOT_STARTED = -1;
const BUILD_PHASE_AFTER_LANE_UNLOCK_SECONDS = 30;

export type WaveRuntime = {
    update: (dt: number) => void;
    checkWaveComplete: (onComplete: (bonus: number) => void) => void;
    startWave: (waveNumber: number) => void;
    currentWave: number;
};

/**
 * WaveLoop
 * 负责波次更新与调度，避免在 GameController 中堆积逻辑
 */
@ccclass('WaveLoop')
export class WaveLoop extends Component {
    private _wave: WaveRuntime | null = null;
    private _game: GameManager | null = null;
    private _active: boolean = false;
    private _pendingNextWave: boolean = false;
    private _countdownTimer: number = 0;
    private _lastCountdownSeconds: number = -1;
    private _nextWaveNumber: number = 1;
    private _awaitLaneUnlockBeforeCountdown: boolean = false;
    private _laneUnlockResolvedForCountdown: boolean = false;

    public initialize(
        wave: WaveRuntime,
        game: GameManager,
        firstWaveDelay: number = 2,
        startingWave: number = 1
    ): void {
        this._wave = wave;
        this._game = game;
        this._active = true;
        this._pendingNextWave = false;
        this._countdownTimer = 0;
        this._lastCountdownSeconds = -1;
        this._nextWaveNumber = Math.max(1, Math.floor(startingWave));
        this._awaitLaneUnlockBeforeCountdown = false;
        this._laneUnlockResolvedForCountdown = false;

        this.eventManager.on(GameEvents.LANE_UNLOCK_IMMINENT, this.onLaneUnlockImminent, this);
        this.eventManager.on(GameEvents.LANE_UNLOCKED, this.onLaneUnlocked, this);

        const waveToStart = Math.max(1, Math.floor(startingWave));
        this.scheduleOnce(() => {
            this._wave?.startWave(waveToStart);
        }, firstWaveDelay);
    }

    protected update(dt: number): void {
        if (!this._active || !this._wave || !this._game || !this._game.isPlaying) return;

        if (this._pendingNextWave) {
            // Keep WaveManager ticking so pending lane-unlock timers can continue.
            this._wave.update(dt);
            if (this._countdownTimer === COUNTDOWN_NOT_STARTED) {
                return;
            }

            this._countdownTimer -= dt;
            const remainingSeconds = Math.max(0, Math.ceil(this._countdownTimer));

            if (remainingSeconds !== this._lastCountdownSeconds) {
                this._lastCountdownSeconds = remainingSeconds;
                this.eventManager.emit(GameEvents.WAVE_COUNTDOWN, { seconds: remainingSeconds });
            }

            if (this._countdownTimer <= 0) {
                this._pendingNextWave = false;
                this._awaitLaneUnlockBeforeCountdown = false;
                this._laneUnlockResolvedForCountdown = false;
                this._wave.startWave(this._nextWaveNumber);
            }
            return;
        }

        this._wave.update(dt);

        this._wave.checkWaveComplete(bonus => {
            this._game?.addCoins(bonus);

            this._nextWaveNumber = this._wave ? this._wave.currentWave + 1 : 1;
            console.log(
                `[Game] Wave ${this._wave?.currentWave ?? 0} Complete. Next Wave: ${this._nextWaveNumber}`
            );

            this._pendingNextWave = true;
            if (this._awaitLaneUnlockBeforeCountdown) {
                if (this._laneUnlockResolvedForCountdown) {
                    this.beginBuildPhaseCountdown();
                } else {
                    this._countdownTimer = COUNTDOWN_NOT_STARTED;
                    this._lastCountdownSeconds = -1;
                }
                return;
            }

            this.startCountdown(GameConfig.WAVE.NEXT_WAVE_DELAY);
        });
    }

    protected onDestroy(): void {
        this._active = false;
        this._pendingNextWave = false;
        this.eventManager.off(GameEvents.LANE_UNLOCK_IMMINENT, this.onLaneUnlockImminent, this);
        this.eventManager.off(GameEvents.LANE_UNLOCKED, this.onLaneUnlocked, this);
        this.unscheduleAllCallbacks();
    }

    private onLaneUnlockImminent(): void {
        this._awaitLaneUnlockBeforeCountdown = true;
        this._laneUnlockResolvedForCountdown = false;
    }

    private onLaneUnlocked(): void {
        if (!this._awaitLaneUnlockBeforeCountdown) return;

        this._laneUnlockResolvedForCountdown = true;
        if (!this._pendingNextWave) return;

        this.beginBuildPhaseCountdown();
    }

    private beginBuildPhaseCountdown(): void {
        this._awaitLaneUnlockBeforeCountdown = false;
        this._laneUnlockResolvedForCountdown = false;
        this.startCountdown(BUILD_PHASE_AFTER_LANE_UNLOCK_SECONDS);
    }

    private startCountdown(seconds: number): void {
        this._countdownTimer = Math.max(0, seconds);
        this._lastCountdownSeconds = Math.ceil(this._countdownTimer);
        this.eventManager.emit(GameEvents.WAVE_COUNTDOWN, { seconds: this._lastCountdownSeconds });
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
