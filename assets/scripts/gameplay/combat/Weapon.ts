import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('Weapon')
export abstract class Weapon extends Component {
    @property
    public damage: number = 10;

    @property
    public attackInterval: number = 1.0;

    @property
    public range: number = 8;

    protected _cooldownTimer: number = 0;

    protected update(dt: number): void {
        if (this._cooldownTimer > 0) {
            this._cooldownTimer -= dt;
        }
    }

    public get isReady(): boolean {
        return this._cooldownTimer <= 0;
    }

    public tryAttack(target: Node): boolean {
        if (!this.isReady) return false;
        
        // Optional: Check range again here
        
        this.onAttack(target);
        this._cooldownTimer = this.attackInterval;
        return true;
    }

    protected abstract onAttack(target: Node): void;
}
