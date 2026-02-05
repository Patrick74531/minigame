import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * AnimRootScaleLock
 * Locks the scale of the animation root node to avoid scale curves
 * causing visible size changes between clips.
 */
@ccclass('AnimRootScaleLock')
export class AnimRootScaleLock extends Component {
    @property({ type: Vec3 })
    public scale: Vec3 = new Vec3(1, 1, 1);

    protected lateUpdate(): void {
        const s = this.node.scale;
        if (s.x !== this.scale.x || s.y !== this.scale.y || s.z !== this.scale.z) {
            this.node.setScale(this.scale);
        }
    }
}
