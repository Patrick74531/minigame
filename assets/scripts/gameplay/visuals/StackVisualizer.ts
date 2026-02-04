import { _decorator, Component, Node, Vec3, Tween, tween } from 'cc';

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
            this.container.setPosition(0, 1.2, 0); // Default head pos
        }
    }

    public addToStack(item: Node): void {
        if (!this.container) {
            this.container = new Node('StackContainer');
            this.node.addChild(this.container);
            this.container.setPosition(0, 1.2, 0);
        }

        // Visual logic extracted from Hero.ts
        item.removeFromParent();
        this.container.addChild(item); // Parent to stack container

        // Calculate Position
        const targetPos = new Vec3(0, this._stack.length * this.itemHeight, 0);

        // Immediate set + random rot
        item.setPosition(targetPos);
        item.setRotationFromEuler(0, Math.random() * 360, 0);
        item.setScale(0.5, 0.5, 0.5);

        this._stack.push(item);

        // Optional: Add simple bounce effect
        tween(item)
            .to(0.1, { scale: new Vec3(0.6, 0.6, 0.6) })
            .to(0.1, { scale: new Vec3(0.5, 0.5, 0.5) })
            .start();
    }

    public popFromStack(): Node | null {
        return this._stack.pop() || null;
    }
}
