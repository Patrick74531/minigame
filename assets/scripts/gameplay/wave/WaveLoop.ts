import { _decorator, Component } from 'cc';
import { GameManager } from '../../core/managers/GameManager';

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

    public initialize(wave: WaveRuntime, game: GameManager, firstWaveDelay: number = 2): void {
        this._wave = wave;
        this._game = game;
        this._active = true;

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
            this.scheduleOnce(() => this._wave?.startWave(nextWave), 3);
        });
    }

    protected onDestroy(): void {
        this._active = false;
        this.unscheduleAllCallbacks();
    }
}
