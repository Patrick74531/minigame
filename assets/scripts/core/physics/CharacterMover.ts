import { _decorator, Component, Vec3, PhysicsSystem, geometry, CapsuleCollider, Vec2 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('CharacterMover')
export class CharacterMover extends Component {
    @property
    public moveSpeed: number = 5;

    @property
    public radius: number = 0.3;

    @property
    public center: Vec3 = new Vec3(0, 0.75, 0);

    // Limits for the map
    private _limitX: number = 25;
    private _limitZ: number = 25;

    public move(inputVector: Vec2, dt: number): void {
        const moveLen = inputVector.length();
        if (moveLen < 0.01) return;

        // Desired movement in World Space
        // Joystick Up (Y=1) is World Forward (-Z)
        const dx = inputVector.x * this.moveSpeed * dt;
        const dz = -inputVector.y * this.moveSpeed * dt;

        const currentPos = this.node.position.clone();
        const targetPos = new Vec3(currentPos.x + dx, currentPos.y, currentPos.z + dz);
        
        // Basic movement direction for sweep
        const moveVec = new Vec3(dx, 0, dz);
        const moveDist = moveVec.length();

        if (moveDist < 0.001) return;

        // Perform Sweep Test
        // Origin should be the center of the capsule for the sphere sweep
        const sweepOrigin = new Vec3(currentPos.x, currentPos.y + this.center.y, currentPos.z);
        
        // Ray for sweep
        const ray = new geometry.Ray();
        Vec3.copy(ray.o, sweepOrigin);
        Vec3.normalize(ray.d, moveVec);

        // Sweep
        const mask = 0xffffffff; 
        const maxDist = moveDist + 0.1; // Check slightly further

        let finalX = targetPos.x;
        let finalZ = targetPos.z;

        if (PhysicsSystem.instance.sweepSphereClosest(ray, this.radius, mask, maxDist, false)) {
            const result = PhysicsSystem.instance.sweepSphereClosestResult;
            
            // If we hit something (Physical Obstacle, since queryTrigger is false)
            if (result.collider) {
                // Determine if it's a wall or floor
                // Floor normal is usually (0, 1, 0)
                if (Math.abs(result.hitNormal.y) < 0.5) {
                    // It's a wall/obstacle (normal is mostly horizontal)
                    
                    // Simple slide: Remove velocity component along normal
                    // V_new = V - (V . N) * N
                    const dot = Vec3.dot(moveVec, result.hitNormal);
                    const slideVec = moveVec.clone().subtract(result.hitNormal.clone().multiplyScalar(dot));
                    
                    // Apply slide
                    finalX = currentPos.x + slideVec.x;
                    finalZ = currentPos.z + slideVec.z;
                }
            }
        }

        // Apply Position
        this.node.setPosition(finalX, currentPos.y, finalZ); // Keep Y strictly constant

        // Face movement
        if (moveLen > 0.1) {
             const lookTarget = new Vec3(
                 finalX + dx, // Look at "desired" direction slightly better feel
                 currentPos.y, 
                 finalZ + dz 
             );
             this.node.lookAt(lookTarget);
        }

        this.clampPosition();
    }

    private clampPosition(): void {
        const pos = this.node.position;
        let newX = pos.x;
        let newZ = pos.z;

        if (pos.x > this._limitX) newX = this._limitX;
        if (pos.x < -this._limitX) newX = -this._limitX;
        if (pos.z > this._limitZ) newZ = this._limitZ;
        if (pos.z < -this._limitZ) newZ = -this._limitZ;

        if (newX !== pos.x || newZ !== pos.z) {
            this.node.setPosition(newX, pos.y, newZ);
        }
    }
}
