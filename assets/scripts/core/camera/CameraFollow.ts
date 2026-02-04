import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Camera Follow Script
 * Smoothly follows a target node (e.g., Hero)
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {
    @property(Node)
    public target: Node | null = null;

    @property
    public smoothSpeed: number = 0.125;

    @property
    public offset: Vec3 = new Vec3(0, 10, 10); // Default isometric-ish offset

    private _tempVec = new Vec3();

    protected start(): void {
        // If target is set and offset is zero, calculate initial offset relative to it
        if (this.target && this.offset.lengthSqr() === 0) {
            Vec3.subtract(this.offset, this.node.position, this.target.position);
        }

        // Snap immediately on start to ensure correct rotation relative to the offset position
        this.snap();
    }

    protected lateUpdate(dt: number): void {
        if (!this.target || !this.target.isValid) return;

        // Desired Position
        const desiredPos = this._tempVec;
        Vec3.add(desiredPos, this.target.position, this.offset);

        const currentPos = this.node.position;
        const t = this.smoothSpeed; 
        
        // Manual Lerp for clarity
        const finalX = currentPos.x + (desiredPos.x - currentPos.x) * t;
        const finalY = currentPos.y + (desiredPos.y - currentPos.y) * t;
        const finalZ = currentPos.z + (desiredPos.z - currentPos.z) * t;

        this.node.setPosition(finalX, finalY, finalZ);
    }

    /**
     * Snap camera to target immediately and set rotation
     */
    public snap(): void {
        if (this.target) {
            // Set Position
            const desired = new Vec3();
            Vec3.add(desired, this.target.position, this.offset);
            this.node.setPosition(desired);
            
            // Set Rotation (Look at target)
            this.node.lookAt(this.target.position);
        }
    }
}
