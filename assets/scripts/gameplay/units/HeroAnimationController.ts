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
        console.warn('[HeroAnim] configure', {
            hasHero: !!hero,
            animType: anim ? anim.constructor.name : 'null',
            runClip,
        });
        if (runClip) {
            this.setRunClip(runClip);
        }
    }

    public setRunClip(name: string | null): void {
        this._runClip = name;
        if (!this._anim || !this._runClip) return;
        const shouldRun = this._hero ? this._hero.state === UnitState.MOVING : true;
        if (shouldRun && this._current !== this._runClip) {
            console.warn('[HeroAnim] play run', this._runClip);
            this._anim.play(this._runClip);
            this._current = this._runClip;
        }
    }

    public setIdleClip(name: string | null): void {
        this._idleClip = name;
        if (!this._anim || !this._idleClip) return;
        const shouldIdle = this._hero ? this._hero.state !== UnitState.MOVING : true;
        if (shouldIdle && this._current !== this._idleClip) {
            console.warn('[HeroAnim] play idle', this._idleClip);
            this._anim.play(this._idleClip);
            this._current = this._idleClip;
        }
    }

    protected update(): void {
        if (!this._hero || !this._anim) return;
        const shouldRun = this._hero.state === UnitState.MOVING;
        const target = shouldRun ? this._runClip : this._idleClip;
        if (!target || target === this._current) return;
        this._anim.play(target);
        this._current = target;
    }
}
