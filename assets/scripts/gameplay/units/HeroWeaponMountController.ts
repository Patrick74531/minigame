import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';
import { HeroWeaponManager } from '../weapons/HeroWeaponManager';
import { WeaponType } from '../weapons/WeaponTypes';
import { Hero } from './Hero';
import { UnitState } from './Unit';

const { ccclass } = _decorator;

@ccclass('HeroWeaponMountController')
export class HeroWeaponMountController extends Component {
    private _weaponNodes: Map<WeaponType, Node> = new Map();
    private _lastActiveType: WeaponType | null = null;
    private _socketRoot: Node | null = null;
    private _followBone: Node | null = null;
    private _followBoneName: string = 'mixamorig:RightHand';
    private _missingBoneWarned: boolean = false;
    private static readonly _tmpHeroWorldPos = new Vec3();
    private static readonly _tmpSocketWorldPos = new Vec3();
    private static readonly _tmpFollowRot = new Quat();
    private static readonly _tmpBoneWorldPos = new Vec3();
    private static readonly _tmpHeroRightDir = new Vec3();
    private static readonly _tmpRightMoveOffset = new Vec3();
    private _lastHeroWorldPos = new Vec3();
    private _lastMoveDelta = new Vec3();
    private _hasLastHeroWorldPos = false;
    private _isMovingByDelta = false;
    private _startupSnapFrames = 0;

    public bindWeaponNode(type: WeaponType, node: Node): void {
        this._weaponNodes.set(type, node);
        node.active = false;
        this._startupSnapFrames = Math.max(this._startupSnapFrames, this.startupSnapFrames);
        this.forceImmediateSync();
        this.refresh();
    }

    public bindSocket(socketRoot: Node, followBone: Node | null): void {
        this._socketRoot = socketRoot;
        this._followBone = followBone;
        if (followBone && followBone.name) {
            this._followBoneName = followBone.name;
        }
        this._missingBoneWarned = false;
        this._startupSnapFrames = this.startupSnapFrames;
        this.updateSocketFollow();
    }

    public requestImmediateSnap(): void {
        this._startupSnapFrames = Math.max(this._startupSnapFrames, this.startupSnapFrames);
        this.forceImmediateSync();
    }

    protected onEnable(): void {
        this.eventManager.on(GameEvents.WEAPON_SWITCHED, this.onWeaponChanged, this);
        this.eventManager.on(GameEvents.WEAPON_INVENTORY_CHANGED, this.onWeaponChanged, this);
        this.refresh();
    }

    protected onDisable(): void {
        this.eventManager.off(GameEvents.WEAPON_SWITCHED, this.onWeaponChanged, this);
        this.eventManager.off(GameEvents.WEAPON_INVENTORY_CHANGED, this.onWeaponChanged, this);
    }

    public refresh(): void {
        if (this.forceShowAll) {
            this.setAllActive(true);
            this._lastActiveType = HeroWeaponManager.instance.activeWeaponType;
            return;
        }
        this.applyWeaponType(HeroWeaponManager.instance.activeWeaponType);
    }

    private onWeaponChanged(): void {
        this.refresh();
    }

    protected update(): void {
        if (this.forceShowAll) {
            this.setAllActive(true);
            this._lastActiveType = HeroWeaponManager.instance.activeWeaponType;
            return;
        }
        const activeType = HeroWeaponManager.instance.activeWeaponType;
        if (activeType === this._lastActiveType) return;
        this.applyWeaponType(activeType);
    }

    protected lateUpdate(): void {
        this.updateMovementByDelta();
        this.resolveFollowBoneIfNeeded();
        this.updateSocketFollow();
        this.ensureSocketNearHero();
        if (this._startupSnapFrames > 0) {
            this._startupSnapFrames--;
            this.forceImmediateSync();
        }
    }

    private applyWeaponType(type: WeaponType | null): void {
        const effectiveType = type ?? WeaponType.MACHINE_GUN;
        const targets = new Set<Node>();
        this._weaponNodes.forEach((node, key) => {
            if (!node || !node.isValid) return;
            if (key === effectiveType) {
                targets.add(node);
            }
        });
        if (targets.size === 0) {
            for (const node of this._weaponNodes.values()) {
                if (!node || !node.isValid) continue;
                targets.add(node);
                break;
            }
        }

        const visited = new Set<Node>();
        this._weaponNodes.forEach(node => {
            if (!node || !node.isValid || visited.has(node)) return;
            node.active = targets.has(node);
            visited.add(node);
        });
        this._lastActiveType = effectiveType;
    }

    private setAllActive(active: boolean): void {
        this._weaponNodes.forEach(node => {
            if (!node || !node.isValid) return;
            node.active = active;
        });
    }

    private resolveFollowBoneIfNeeded(): void {
        const model = this.node.getChildByName('HeroModel');
        if (!model || !model.isValid) return;

        if (
            this._followBone &&
            this._followBone.isValid &&
            this.isNodeUnderRoot(this._followBone, model)
        ) {
            return;
        }

        this._followBone =
            this.findChildByName(model, this._followBoneName) ?? this.findRightHandBone(model);

        if (!this._followBone && !this._missingBoneWarned) {
            this._missingBoneWarned = true;
            console.warn('[HeroWeaponMountController] Right hand bone not found on HeroModel.');
        } else if (this._followBone) {
            this._missingBoneWarned = false;
        }
    }

    private updateSocketFollow(): void {
        if (!this._socketRoot || !this._socketRoot.isValid) return;
        const runOffsetY = this.getRunSocketOffsetY();
        const rightMoveOffset = this.getRightMoveSocketOffset();

        const bone = this._followBone;
        if (bone && bone.isValid) {
            const boneWorldPos = HeroWeaponMountController._tmpBoneWorldPos;
            boneWorldPos.set(bone.worldPosition);
            const heroWorldPos = this.node.worldPosition;
            const boneDistSq = Vec3.squaredDistance(heroWorldPos, boneWorldPos);

            if (boneDistSq <= this.maxBoneDistanceSq) {
                const followRot = this.followBoneRotation
                    ? bone.worldRotation
                    : this.node.worldRotation;
                HeroWeaponMountController._tmpFollowRot.set(followRot);
                const finalPos = this.followBonePosition
                    ? this.applyWorldRightOffset(
                          boneWorldPos.x + rightMoveOffset.x,
                          boneWorldPos.y + runOffsetY + rightMoveOffset.y,
                          boneWorldPos.z + rightMoveOffset.z
                      )
                    : this.getRootFallbackPosition(runOffsetY, rightMoveOffset);
                this._socketRoot.setWorldPosition(finalPos);
                this._socketRoot.setWorldRotation(HeroWeaponMountController._tmpFollowRot);
                return;
            }

            // Bone appears detached from current hero instance. Fallback to hero root.
            this._followBone = null;
        }

        this._socketRoot.setWorldPosition(
            this.getRootFallbackPosition(runOffsetY, rightMoveOffset)
        );
        this._socketRoot.setWorldRotation(this.node.worldRotation);
    }

    private ensureSocketNearHero(): void {
        if (!this._socketRoot || !this._socketRoot.isValid) return;

        HeroWeaponMountController._tmpHeroWorldPos.set(this.node.worldPosition);
        HeroWeaponMountController._tmpSocketWorldPos.set(this._socketRoot.worldPosition);
        const distSq = Vec3.squaredDistance(
            HeroWeaponMountController._tmpHeroWorldPos,
            HeroWeaponMountController._tmpSocketWorldPos
        );
        if (distSq <= this.maxSocketDistanceSq) return;

        // Bone reference likely stale (e.g. old instance). Re-resolve next frame and hard snap now.
        this._followBone = null;
        const runOffsetY = this.getRunSocketOffsetY();
        const rightMoveOffset = this.getRightMoveSocketOffset();
        const recoveryPos = this.getRootFallbackPosition(runOffsetY, rightMoveOffset);
        this._socketRoot.setWorldPosition(recoveryPos);
        this._socketRoot.setWorldRotation(this.node.worldRotation);
    }

    private applyWorldRightOffset(baseX: number, baseY: number, baseZ: number): Vec3 {
        const out = HeroWeaponMountController._tmpSocketWorldPos;
        out.set(baseX, baseY, baseZ);
        const offset = this.worldRightOffset;
        if (Math.abs(offset) <= 0.0001) return out;
        const right = HeroWeaponMountController._tmpHeroRightDir;
        Vec3.transformQuat(right, Vec3.RIGHT, this.node.worldRotation);
        out.x += right.x * offset;
        out.y += right.y * offset;
        out.z += right.z * offset;
        return out;
    }

    private getRootFallbackPosition(runOffsetY: number, rightMoveOffset: Vec3): Vec3 {
        const heroPos = this.node.worldPosition;
        return this.applyWorldRightOffset(
            heroPos.x + rightMoveOffset.x,
            heroPos.y + 0.9 + runOffsetY + rightMoveOffset.y,
            heroPos.z + rightMoveOffset.z
        );
    }

    private isNodeUnderRoot(node: Node, root: Node): boolean {
        let cursor: Node | null = node;
        while (cursor) {
            if (cursor === root) return true;
            cursor = cursor.parent;
        }
        return false;
    }

    private forceImmediateSync(): void {
        this.resolveFollowBoneIfNeeded();
        this.updateSocketFollow();
        this.ensureSocketNearHero();
    }

    private updateMovementByDelta(): void {
        const p = this.node.worldPosition;
        if (!this._hasLastHeroWorldPos) {
            this._lastHeroWorldPos.set(p);
            this._lastMoveDelta.set(0, 0, 0);
            this._hasLastHeroWorldPos = true;
            this._isMovingByDelta = false;
            return;
        }
        this._lastMoveDelta.set(
            p.x - this._lastHeroWorldPos.x,
            p.y - this._lastHeroWorldPos.y,
            p.z - this._lastHeroWorldPos.z
        );
        const distSq = this._lastMoveDelta.lengthSqr();
        this._isMovingByDelta = distSq > this.movementDetectEpsilonSq;
        this._lastHeroWorldPos.set(p);
    }

    private getRunSocketOffsetY(): number {
        return this.isMovingForOffsets() ? this.runSocketOffsetY : 0;
    }

    private getRightMoveSocketOffset(): Vec3 {
        const out = HeroWeaponMountController._tmpRightMoveOffset;
        out.set(0, 0, 0);
        if (!this.isMovingForOffsets()) return out;

        const dx = this._lastMoveDelta.x;
        const dz = this._lastMoveDelta.z;
        if (dx <= this.rightMoveDetectX) return out;
        if (Math.abs(dx) < Math.abs(dz) * this.rightMoveDominance) return out;

        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        const raw =
            runtime && typeof runtime === 'object'
                ? (runtime as { RIGHT_MOVE_SOCKET_OFFSET?: unknown }).RIGHT_MOVE_SOCKET_OFFSET
                : null;
        if (!raw || typeof raw !== 'object') return out;
        const o = raw as { x?: number; y?: number; z?: number };
        out.set(
            typeof o.x === 'number' ? o.x : 0,
            typeof o.y === 'number' ? o.y : 0,
            typeof o.z === 'number' ? o.z : 0
        );
        return out;
    }

    private isMovingForOffsets(): boolean {
        const hero = this.node.getComponent(Hero);
        if (hero) {
            return hero.state === UnitState.MOVING;
        }
        return this._isMovingByDelta;
    }

    private findChildByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findChildByName(child, name);
            if (found) return found;
        }
        return null;
    }

    private findRightHandBone(root: Node): Node | null {
        const exactNames = [
            'mixamorig:RightHand',
            'mixamorig_RightHand',
            'RightHand',
            'right_hand',
            'Hand.R',
            'hand_r',
        ];
        for (const name of exactNames) {
            const node = this.findChildByName(root, name);
            if (node) return node;
        }

        const allNodes: Node[] = [];
        this.collectChildren(root, allNodes);
        let best: Node | null = null;
        let bestScore = -1;
        for (const node of allNodes) {
            const score = this.scoreRightHandName(node.name);
            if (score > bestScore) {
                best = node;
                bestScore = score;
            }
        }
        return bestScore >= 3 ? best : null;
    }

    private collectChildren(root: Node, out: Node[]): void {
        out.push(root);
        for (const child of root.children) {
            this.collectChildren(child, out);
        }
    }

    private scoreRightHandName(name: string): number {
        if (!name) return 0;
        const raw = name.toLowerCase();
        const compact = raw.replace(/[^a-z0-9]/g, '');
        let score = 0;
        if (compact.includes('righthand')) score += 6;
        if (compact.includes('hand') && compact.includes('right')) score += 4;
        if (compact.includes('handr') || compact.includes('rhand')) score += 3;
        if (compact.includes('right')) score += 1;
        if (compact.includes('hand')) score += 1;
        return score;
    }

    private get forceShowAll(): boolean {
        const debug = (GameConfig.HERO as unknown as { WEAPON_VISUAL_DEBUG?: unknown })
            .WEAPON_VISUAL_DEBUG;
        if (!debug || typeof debug !== 'object') return false;
        return (debug as { FORCE_SHOW_ALL?: boolean }).FORCE_SHOW_ALL === true;
    }

    private get runSocketOffsetY(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 0;
        const raw = (runtime as { RUN_SOCKET_OFFSET_Y?: number }).RUN_SOCKET_OFFSET_Y;
        return typeof raw === 'number' ? raw : 0;
    }

    private get maxBoneDistanceSq(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 16;
        const raw = (runtime as { MAX_BONE_DISTANCE_SQ?: number }).MAX_BONE_DISTANCE_SQ;
        return typeof raw === 'number' ? raw : 16;
    }

    private get maxSocketDistanceSq(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 25;
        const raw = (runtime as { MAX_SOCKET_DISTANCE_SQ?: number }).MAX_SOCKET_DISTANCE_SQ;
        return typeof raw === 'number' ? raw : 25;
    }

    private get movementDetectEpsilonSq(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 0.0004;
        const raw = (runtime as { MOVEMENT_DETECT_EPSILON_SQ?: number }).MOVEMENT_DETECT_EPSILON_SQ;
        return typeof raw === 'number' ? raw : 0.0004;
    }

    private get startupSnapFrames(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 12;
        const raw = (runtime as { STARTUP_SNAP_FRAMES?: number }).STARTUP_SNAP_FRAMES;
        return typeof raw === 'number' ? Math.max(0, Math.floor(raw)) : 12;
    }

    private get worldRightOffset(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 0;
        const raw = (runtime as { WORLD_RIGHT_OFFSET?: number }).WORLD_RIGHT_OFFSET;
        return typeof raw === 'number' ? raw : 0;
    }

    private get followBonePosition(): boolean {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return false;
        const raw = (runtime as { FOLLOW_BONE_POSITION?: boolean }).FOLLOW_BONE_POSITION;
        return raw === true;
    }

    private get followBoneRotation(): boolean {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return false;
        const raw = (runtime as { FOLLOW_BONE_ROTATION?: boolean }).FOLLOW_BONE_ROTATION;
        return raw === true;
    }

    private get rightMoveDetectX(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 0.002;
        const raw = (runtime as { RIGHT_MOVE_DETECT_X?: number }).RIGHT_MOVE_DETECT_X;
        return typeof raw === 'number' ? raw : 0.002;
    }

    private get rightMoveDominance(): number {
        const runtime = (GameConfig.HERO as unknown as { WEAPON_VISUAL_RUNTIME?: unknown })
            .WEAPON_VISUAL_RUNTIME;
        if (!runtime || typeof runtime !== 'object') return 0.6;
        const raw = (runtime as { RIGHT_MOVE_DOMINANCE?: number }).RIGHT_MOVE_DOMINANCE;
        return typeof raw === 'number' ? raw : 0.6;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
