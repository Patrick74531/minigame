// ... (Replacing whole file content for WaveLoop.ts below using targeted multi replace later if needed, wait, I can just replace the whole class implementation)
// Actually I need to add EventManager import and change the logic.
// wait, I can use replace_file_content to replace the entire class and imports.
import { _decorator, Component } from 'cc';
import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';

const { ccclass } = _decorator;

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

    public initialize(wave: WaveRuntime, game: GameManager, firstWaveDelay: number = 2): void {
        this._wave = wave;
        this._game = game;
        this._active = true;
        this._pendingNextWave = false;
        this._countdownTimer = 0;
        this._lastCountdownSeconds = -1;

        this.scheduleOnce(() => {
            this._wave?.startWave(1);
        }, firstWaveDelay);
    }

    protected update(dt: number): void {
        if (!this._active || !this._wave || !this._game || !this._game.isPlaying) return;

        if (this._pendingNextWave) {
            this._countdownTimer -= dt;
            const remainingSeconds = Math.max(0, Math.ceil(this._countdownTimer));
            
            if (remainingSeconds !== this._lastCountdownSeconds) {
                this._lastCountdownSeconds = remainingSeconds;
                this.eventManager.emit(GameEvents.WAVE_COUNTDOWN, { seconds: remainingSeconds });
            }

            if (this._countdownTimer <= 0) {
                this._pendingNextWave = false;
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
            this._countdownTimer = GameConfig.WAVE.NEXT_WAVE_DELAY;
            this._lastCountdownSeconds = Math.ceil(this._countdownTimer);
            this.eventManager.emit(GameEvents.WAVE_COUNTDOWN, { seconds: this._lastCountdownSeconds });
        });
    }

    protected onDestroy(): void {
        this._active = false;
        this._pendingNextWave = false;
        this.unscheduleAllCallbacks();
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
