import { _decorator, Component, Node } from 'cc';
import { Joystick } from '../../ui/Joystick';
import { Hero } from '../../gameplay/units/Hero';
import { GameManager } from '../managers/GameManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';

const { ccclass } = _decorator;

/**
 * PlayerInputAdapter
 * 负责将 UI 输入转发给英雄
 */
@ccclass('PlayerInputAdapter')
export class PlayerInputAdapter extends Component {
    private _hero: Node | null = null;
    private _joystick: Joystick | null = null;

    public setTarget(hero: Node | null, joystick: Joystick | null): void {
        this._hero = hero;
        this._joystick = joystick;
    }

    protected update(): void {
        if (!this.gameManager.isPlaying) return;
        if (!this._hero || !this._joystick) return;
        const heroComp = this._hero.getComponent(Hero);
        if (heroComp) {
            heroComp.setInput(this._joystick.inputVector);
        }
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
