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
    private _externalAuthority: boolean = false;
    private _externalPendingWave: number = 0;
    private _externalCountdownTimer: number = 0;
    private _externalLastCountdownSeconds: number = -1;
    private _lastStartedWave: number = 0;

    /** True while counting down between waves (current wave complete, next not started). */
    public get isPendingNextWave(): boolean {
        return this._pendingNextWave;
    }

    /** The wave number that will start after the countdown. Valid when isPendingNextWave=true. */
    public get nextWaveNumber(): number {
        return this._nextWaveNumber;
    }

    public initialize(
        wave: WaveRuntime,
        game: GameManager,
        firstWaveDelay: number = 2,
        startingWave: number = 1,
        autoStart: boolean = true
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
        this._externalPendingWave = 0;
        this._externalCountdownTimer = 0;
        this._externalLastCountdownSeconds = -1;
        this._lastStartedWave = 0;

        this.eventManager.on(GameEvents.LANE_UNLOCK_IMMINENT, this.onLaneUnlockImminent, this);
        this.eventManager.on(GameEvents.LANE_UNLOCKED, this.onLaneUnlocked, this);

        if (autoStart) {
            const safeStart = Math.max(1, Math.floor(startingWave));
            this.scheduleOnce(() => {
                this.startWaveInternal(safeStart);
            }, firstWaveDelay);
        }
    }

    protected update(dt: number): void {
        if (!this._active || !this._wave || !this._game || !this._game.isPlaying) return;

        if (this._externalAuthority) {
            this._wave.update(dt);
            this.tickExternalCountdown(dt);
            return;
        }

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
                this.startWaveInternal(this._nextWaveNumber);
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
        this._externalPendingWave = 0;
        this._externalCountdownTimer = 0;
        this.eventManager.off(GameEvents.LANE_UNLOCK_IMMINENT, this.onLaneUnlockImminent, this);
        this.eventManager.off(GameEvents.LANE_UNLOCKED, this.onLaneUnlocked, this);
        this.unscheduleAllCallbacks();
    }

    public setExternalAuthority(enabled: boolean): void {
        this._externalAuthority = enabled;
        if (!enabled) return;
        this._pendingNextWave = false;
        this._countdownTimer = 0;
        this._lastCountdownSeconds = -1;
        this._awaitLaneUnlockBeforeCountdown = false;
        this._laneUnlockResolvedForCountdown = false;
        this._externalPendingWave = 0;
        this._externalCountdownTimer = 0;
        this._externalLastCountdownSeconds = -1;
    }

    public scheduleExternalWaveStart(waveNumber: number, delaySeconds: number = 0): void {
        const targetWave = Math.max(1, Math.floor(waveNumber));
        if (targetWave <= this._lastStartedWave) return;

        if (delaySeconds <= 0) {
            this.startWaveInternal(targetWave);
            this._externalPendingWave = 0;
            this._externalCountdownTimer = 0;
            this._externalLastCountdownSeconds = -1;
            return;
        }

        this._externalPendingWave = targetWave;
        this._externalCountdownTimer = Math.max(0, delaySeconds);
        this._externalLastCountdownSeconds = Math.ceil(this._externalCountdownTimer);
        this.eventManager.emit(GameEvents.WAVE_COUNTDOWN, {
            seconds: this._externalLastCountdownSeconds,
        });
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

    private tickExternalCountdown(dt: number): void {
        if (this._externalPendingWave < 1) return;

        this._externalCountdownTimer -= dt;
        const remainingSeconds = Math.max(0, Math.ceil(this._externalCountdownTimer));
        if (remainingSeconds !== this._externalLastCountdownSeconds) {
            this._externalLastCountdownSeconds = remainingSeconds;
            this.eventManager.emit(GameEvents.WAVE_COUNTDOWN, { seconds: remainingSeconds });
        }

        if (this._externalCountdownTimer <= 0) {
            const wave = this._externalPendingWave;
            this._externalPendingWave = 0;
            this._externalCountdownTimer = 0;
            this._externalLastCountdownSeconds = -1;
            this.startWaveInternal(wave);
        }
    }

    private startWaveInternal(waveNumber: number): void {
        if (!this._wave) return;
        const targetWave = Math.max(1, Math.floor(waveNumber));
        if (targetWave <= this._lastStartedWave) return;
        this._lastStartedWave = targetWave;
        this._wave.startWave(targetWave);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
