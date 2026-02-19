import { _decorator, Component, Animation, SkeletalAnimation } from 'cc';
import { Hero } from './Hero';
import { UnitState } from './Unit';

const { ccclass } = _decorator;

/**
 * HeroAnimationController
 * 根据英雄状态切换 Idle / Run 动画
 */
@ccclass('HeroAnimationController')
export class HeroAnimationController extends Component {
    private _hero: Hero | null = null;
    private _anim: Animation | SkeletalAnimation | null = null;
    private _idleClip: string | null = null;
    private _runClip: string | null = null;
    private _current: string | null = null;

    public configure(
        hero: Hero | null,
        anim: Animation | SkeletalAnimation | null,
        runClip: string | null
    ): void {
        this._hero = hero;
        this._anim = anim;
        if (runClip) {
            this.setRunClip(runClip);
        }
    }

    public setRunClip(name: string | null): void {
        this._runClip = name;
        if (!this._anim || !this._runClip) return;
        const shouldRun = this._hero ? this._hero.state === UnitState.MOVING : true;
        if (shouldRun && this._current !== this._runClip) {
            this.playClip(this._runClip);
        }
    }

    public setIdleClip(name: string | null): void {
        this._idleClip = name;
        if (!this._anim || !this._idleClip) return;
        const shouldIdle = this._hero ? this._hero.state !== UnitState.MOVING : true;
        if (shouldIdle && this._current !== this._idleClip) {
            this.playClip(this._idleClip);
        }
    }

    // ⚠️ 【重要，请勿修改】此方法结构被 patch-csp.cjs Patch HC 依赖。
    // 不要改变 this._hero.state===UnitState.MOVING 判断或 playClip 调用结构。
    protected update(): void {
        if (!this._hero || !this._anim) return;
        const shouldRun = this._hero.state === UnitState.MOVING;
        const target = shouldRun ? this._runClip : this._idleClip;
        if (!target || target === this._current) return;
        this.playClip(target);
    }

    // ⚠️ 【重要，请勿修改】此方法名和签名被 Patch HC 依赖，请勿重命名或改变参数。
    private playClip(target: string): void {
        if (!this._anim) return;
        this._anim.play(target);
        this._current = target;
    }
}
