import { _decorator, Component, Node, Vec3, Tween, tween, Quat } from 'cc';
import { resolveHeroModelConfig } from '../units/HeroModelConfig';

const { ccclass, property } = _decorator;

@ccclass('StackVisualizer')
export class StackVisualizer extends Component {
    @property({ type: Node })
    public container: Node | null = null;

    @property
    public itemHeight: number = 0.1;

    private _stack: Node[] = [];

    public get count(): number {
        return this._stack.length;
    }

    protected onLoad(): void {
        if (!this.container) {
            this.container = new Node('StackContainer');
            this.node.addChild(this.container);
            const config = resolveHeroModelConfig();
            const offsetY = config.stackOffsetY;
            this.container.setPosition(0, offsetY, 0);
        }

        if (this.itemHeight <= 0.1) {
            const config = resolveHeroModelConfig();
            this.itemHeight = config.stackItemHeight ?? this.itemHeight;
        }
    }

    public addToStack(item: Node): void {
        if (!this.container) {
            this.container = new Node('StackContainer');
            this.node.addChild(this.container);
            const config = resolveHeroModelConfig();
            const offsetY = config.stackOffsetY;
            this.container.setPosition(0, offsetY, 0);
        }

        // Visual logic extracted from Hero.ts
        item.removeFromParent();
        this.container.addChild(item); // Parent to stack container

        // Calculate Position
        const targetPos = new Vec3(0, this._stack.length * this.itemHeight, 0);

        // Immediate set + random rot
        item.setPosition(targetPos);
        // Keep existing X/Z rotation (e.g. for flat coins) and randomize Y
        const currentRot = new Vec3();
        Quat.toEuler(currentRot, item.rotation);
        item.setRotationFromEuler(currentRot.x, Math.random() * 360, currentRot.z);
        const config = resolveHeroModelConfig();
        const scale = config.stackItemScale ?? 0.5;
        item.setScale(scale, scale, scale);

        this._stack.push(item);

        // Optional: Add simple bounce effect
        tween(item)
            .to(0.1, {
                scale: new Vec3(scale + 0.1, scale + 0.1, scale + 0.1),
            })
            .to(0.1, { scale: new Vec3(scale, scale, scale) })
            .start();
    }

    public popFromStack(): Node | null {
        return this._stack.pop() || null;
    }
}
