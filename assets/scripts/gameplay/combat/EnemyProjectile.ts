import {
    _decorator,
    BoxCollider,
    CapsuleCollider,
    Color,
    Component,
    Material,
    MeshRenderer,
    Node,
    Vec3,
    primitives,
    utils,
} from 'cc';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameManager } from '../../core/managers/GameManager';
import { Building } from '../buildings/Building';
import { Enemy } from '../units/Enemy';
import { Unit, UnitType } from '../units/Unit';

const { ccclass, property } = _decorator;

@ccclass('EnemyProjectile')
export class EnemyProjectile extends Component {
    @property
    public speed: number = 10;

    @property
    public damage: number = 8;

    @property
    public maxLifetime: number = 2.5;

    @property
    public hitRadius: number = 0.45;

    private _velocity: Vec3 = new Vec3();
    private _lifetime: number = 0;
    private _owner: Enemy | null = null;
    private _gameManagerRef: GameManager | null = null;

    private static _sharedMaterial: Material | null = null;
    private static readonly _tmpStart = new Vec3();
    private static readonly _tmpEnd = new Vec3();
    private static readonly _tmpLookAt = new Vec3();

    public launch(direction: Vec3, owner: Enemy | null): void {
        this._owner = owner;
        this._lifetime = 0;

        this._velocity.set(direction);
        this._velocity.y = 0;
        const lenSq = this._velocity.lengthSqr();
        if (lenSq <= 0.0001) {
            this.destroySelf();
            return;
        }
        this._velocity.normalize().multiplyScalar(this.speed);
    }

    protected onLoad(): void {
        this.ensureVisual();
    }

    protected onEnable(): void {
        this._lifetime = 0;
    }

    protected update(dt: number): void {
        if (!this.gameManager.isPlaying) return;

        this._lifetime += dt;
        if (this._lifetime >= this.maxLifetime) {
            this.destroySelf();
            return;
        }

        const start = EnemyProjectile._tmpStart;
        start.set(this.node.position);

        const end = EnemyProjectile._tmpEnd;
        end.set(
            start.x + this._velocity.x * dt,
            start.y + this._velocity.y * dt,
            start.z + this._velocity.z * dt
        );
        this.node.setPosition(end);

        if (this._velocity.lengthSqr() > 0.001) {
            const lookAt = EnemyProjectile._tmpLookAt;
            lookAt.set(
                end.x + this._velocity.x,
                end.y + this._velocity.y,
                end.z + this._velocity.z
            );
            this.node.lookAt(lookAt);
        }

        const hitTarget = this.findFirstHit(start, end);
        if (!hitTarget) return;

        hitTarget.takeDamage(this.damage, this._owner ?? undefined);
        this.destroySelf();
    }

    private findFirstHit(start: Vec3, end: Vec3): Unit | Building | null {
        let bestTarget: Unit | Building | null = null;
        let bestT = Number.POSITIVE_INFINITY;

        const heroNode = this.gameManager.hero;
        if (heroNode && heroNode.isValid) {
            const heroUnit = heroNode.getComponent(Unit);
            if (heroUnit && heroUnit.isAlive && heroUnit.unitType === UnitType.HERO) {
                const heroRadius = this.resolveHeroRadius(heroNode) + this.hitRadius;
                const heroT = this.segmentHitT(start, end, heroNode.position, heroRadius);
                if (heroT >= 0 && heroT < bestT) {
                    bestT = heroT;
                    bestTarget = heroUnit;
                }
            }
        }

        const buildings = this.gameManager.activeBuildings;
        for (const buildingNode of buildings) {
            if (!buildingNode || !buildingNode.isValid || !buildingNode.active) continue;

            const building = buildingNode.getComponent(Building);
            if (!building || !building.isAlive) continue;

            const buildingRadius = this.resolveBuildingRadius(buildingNode) + this.hitRadius;
            const t = this.segmentHitT(start, end, buildingNode.position, buildingRadius);
            if (t < 0 || t >= bestT) continue;

            bestT = t;
            bestTarget = building;
        }

        return bestTarget;
    }

    private segmentHitT(start: Vec3, end: Vec3, point: Vec3, radius: number): number {
        const abx = end.x - start.x;
        const abz = end.z - start.z;
        const apx = point.x - start.x;
        const apz = point.z - start.z;
        const abLenSq = abx * abx + abz * abz;
        const rSq = radius * radius;

        if (abLenSq <= 0.000001) {
            const dx = point.x - start.x;
            const dz = point.z - start.z;
            return dx * dx + dz * dz <= rSq ? 0 : -1;
        }

        let t = (apx * abx + apz * abz) / abLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const cx = start.x + abx * t;
        const cz = start.z + abz * t;
        const dx = point.x - cx;
        const dz = point.z - cz;
        return dx * dx + dz * dz <= rSq ? t : -1;
    }

    private resolveHeroRadius(heroNode: Node): number {
        const capsule = heroNode.getComponent(CapsuleCollider);
        if (!capsule) return 0.45;

        const scale = heroNode.worldScale;
        const scaleXZ = Math.max(Math.abs(scale.x), Math.abs(scale.z));
        return Math.max(0.2, capsule.radius * scaleXZ);
    }

    private resolveBuildingRadius(buildingNode: Node): number {
        const col = buildingNode.getComponent(BoxCollider);
        if (!col) return 0.8;

        const scale = buildingNode.worldScale;
        const width = Math.abs(col.size.x * scale.x);
        const depth = Math.abs(col.size.z * scale.z);
        return Math.max(0.4, Math.max(width, depth) * 0.5);
    }

    private ensureVisual(): void {
        if (this.node.getComponent(MeshRenderer)) return;

        const meshRenderer = this.node.addComponent(MeshRenderer);
        meshRenderer.mesh = utils.MeshUtils.createMesh(primitives.sphere(0.14));
        meshRenderer.material = EnemyProjectile.sharedMaterial;
    }

    private destroySelf(): void {
        if (!this.node || !this.node.isValid) return;
        this.node.destroy();
    }

    private static get sharedMaterial(): Material {
        if (!this._sharedMaterial) {
            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            mat.setProperty('mainColor', new Color(255, 120, 90, 255));
            this._sharedMaterial = mat;
        }
        return this._sharedMaterial;
    }

    private get gameManager(): GameManager {
        if (!this._gameManagerRef) {
            this._gameManagerRef =
                ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        }
        return this._gameManagerRef;
    }
}
