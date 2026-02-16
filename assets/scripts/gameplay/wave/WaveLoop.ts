import { _decorator, Component } from 'cc';
import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';

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

    public initialize(wave: WaveRuntime, game: GameManager, firstWaveDelay: number = 2): void {
        this._wave = wave;
        this._game = game;
        this._active = true;
        this._pendingNextWave = false;

        this.scheduleOnce(() => {
            this._wave?.startWave(1);
        }, firstWaveDelay);
    }

    protected update(dt: number): void {
        if (!this._active || !this._wave || !this._game || !this._game.isPlaying) return;

        this._wave.update(dt);

        this._wave.checkWaveComplete(bonus => {
            this._game?.addCoins(bonus);

            const nextWave = this._wave ? this._wave.currentWave + 1 : 1;
            console.log(
                `[Game] Wave ${this._wave?.currentWave ?? 0} Complete. Next Wave: ${nextWave}`
            );
            if (this._pendingNextWave) return;
            this._pendingNextWave = true;
            this.scheduleOnce(() => {
                this._pendingNextWave = false;
                this._wave?.startWave(nextWave);
            }, GameConfig.WAVE.NEXT_WAVE_DELAY);
        });
    }

    protected onDestroy(): void {
        this._active = false;
        this._pendingNextWave = false;
        this.unscheduleAllCallbacks();
    }
}
