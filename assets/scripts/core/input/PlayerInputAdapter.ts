import { _decorator, Component, Node, Input, input, EventKeyboard, KeyCode, Vec2 } from 'cc';
import { Joystick } from '../../ui/Joystick';
import { Hero } from '../../gameplay/units/Hero';
import { GameManager } from '../managers/GameManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { HeroWeaponManager } from '../../gameplay/weapons/HeroWeaponManager';

const { ccclass } = _decorator;

/**
 * PlayerInputAdapter
 * 负责将 UI 输入和键盘输入转发给英雄
 */
@ccclass('PlayerInputAdapter')
export class PlayerInputAdapter extends Component {
    private _hero: Node | null = null;
    private _joystick: Joystick | null = null;
    
    // Keyboard input state
    private _keyboardInput: Vec2 = new Vec2(0, 0);
    private _keysPressed: Set<KeyCode> = new Set();

    public setTarget(hero: Node | null, joystick: Joystick | null): void {
        this._hero = hero;
        this._joystick = joystick;
    }

    protected onLoad(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    private onKeyDown(event: EventKeyboard): void {
        this._keysPressed.add(event.keyCode);
        this.updateKeyboardVector();
        this.checkWeaponSwitch(event.keyCode);
    }

    private onKeyUp(event: EventKeyboard): void {
        this._keysPressed.delete(event.keyCode);
        this.updateKeyboardVector();
    }

    private updateKeyboardVector(): void {
        let x = 0;
        let y = 0;

        if (this._keysPressed.has(KeyCode.KEY_W)) y += 1;
        if (this._keysPressed.has(KeyCode.KEY_S)) y -= 1;
        if (this._keysPressed.has(KeyCode.KEY_A)) x -= 1;
        if (this._keysPressed.has(KeyCode.KEY_D)) x += 1;

        this._keyboardInput.set(x, y);
        if (x !== 0 && y !== 0) {
            this._keyboardInput.normalize();
        }
    }

    private checkWeaponSwitch(keyCode: KeyCode): void {
        const manager = HeroWeaponManager.instance;
        const allIds = manager.getAllWeaponIds(); // Note: This gets ALL definitions, not inventory. 
        // Better to iterate inventory slots or just map to known types if slots are fixed?
        // Requirement: H J K L -> Weapon Slot 1 2 3 4
        
        // Let's map to inventory indices for now involving a predictable order
        // OR just simple mapping if easy.
        
        // Actually, let's just get the inventory as an array to map indices
        const inventory = Array.from(manager.inventory.keys());
        
        let slotIndex = -1;
        switch (keyCode) {
            case KeyCode.KEY_H: slotIndex = 0; break;
            case KeyCode.KEY_J: slotIndex = 1; break;
            case KeyCode.KEY_K: slotIndex = 2; break;
            case KeyCode.KEY_L: slotIndex = 3; break;
        }

        if (slotIndex >= 0 && slotIndex < inventory.length) {
            const weaponType = inventory[slotIndex];
            manager.switchWeapon(weaponType);
        }
    }

    protected update(): void {
        if (!this.gameManager.isPlaying) return;
        if (!this._hero) return;

        const heroComp = this._hero.getComponent(Hero);
        if (!heroComp) return;

        // Prioritize keyboard input
        if (this._keyboardInput.lengthSqr() > 0.01) {
            heroComp.setInput(this._keyboardInput);
        } else if (this._joystick) {
            heroComp.setInput(this._joystick.inputVector);
        } else {
            heroComp.setInput(Vec2.ZERO);
        }
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
