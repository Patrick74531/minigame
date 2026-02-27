import {
    _decorator,
    Billboard,
    Color,
    Component,
    director,
    MeshRenderer,
    Node,
    Rect,
    RenderRoot2D,
    resources,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec2,
    Vec3,
} from 'cc';
import { Enemy } from '../units/Enemy';
import { UnitState } from '../units/Unit';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { HeroQuery } from '../../core/runtime/HeroQuery';
import {
    EnemyAttackPerformedPayload,
    EnemyAttackStateChangedPayload,
    EnemyVisualEvents,
} from './EnemyVisualEvents';

const { ccclass, property } = _decorator;

type PartKey = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

interface PartFrameSpec {
    required: boolean;
    candidates: string[];
}

interface AttackPoseSample {
    rightArm: number;
    leftArm: number;
    head: number;
    bodyLean: number;
    bob: number;
}

const PART_FRAME_SPECS: Record<PartKey, PartFrameSpec> = {
    body: {
        required: true,
        candidates: ['enemies/Robot/Body'],
    },
    head: {
        required: true,
        candidates: ['enemies/Robot/Head'],
    },
    leftArm: {
        required: true,
        candidates: ['enemies/Robot/LeftArm'],
    },
    rightArm: {
        required: true,
        candidates: ['enemies/Robot/RightArm'],
    },
    leftLeg: {
        required: true,
        candidates: ['enemies/Robot/LeftLeg'],
    },
    rightLeg: {
        required: true,
        candidates: ['enemies/Robot/RightLeg'],
    },
};

const PART_KEYS: PartKey[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
const ZERO_ATTACK_POSE: AttackPoseSample = {
    rightArm: 0,
    leftArm: 0,
    head: 0,
    bodyLean: 0,
    bob: 0,
};

@ccclass('EnemyPaperDollAnimator')
export class EnemyPaperDollAnimator extends Component {
    @property
    public yOffset: number = 0.5;

    @property
    public visualScale: number = 0.0048;

    @property
    public scaleReference: number = 0.35;

    @property
    public idleTiltAngle: number = -4;

    @property
    public walkFrequency: number = 2.8;

    @property
    public limbSwingAngle: number = 9;

    @property
    public bobAmount: number = 6;

    @property
    public headSwayAngle: number = 4;

    @property
    public attackBlendDamping: number = 12;

    @property
    public attackWindupRatio: number = 0.35;

    @property
    public attackHitRatio: number = 0.45;

    @property
    public attackWindupAngle: number = 32;

    @property
    public attackStrikeAngle: number = 58;

    @property
    public attackOffhandAngle: number = 18;

    @property
    public attackBodyLeanAngle: number = 5;

    @property
    public attackHeadTiltAngle: number = 7;

    @property
    public attackBobAmount: number = 3.2;

    @property
    public attackPulseAngle: number = 12;

    @property
    public attackPulseDecay: number = 11;

    @property
    public activeAnimationFps: number = 30;

    @property
    public idleAnimationFps: number = 14;

    @property
    public farAnimationFps: number = 10;

    @property
    public farLodDistance: number = 16;

    @property
    public enableMeshLod: boolean = false;

    @property
    public meshLodNearDistance: number = 11;

    @property
    public meshLodFarDistance: number = 15;

    @property
    public lodCheckInterval: number = 0.15;

    @property
    public enableExtremeCrowdMode: boolean = false;

    @property
    public maxPaperDollsNearHero: number = 32;

    @property
    public crowdBudgetCheckInterval: number = 0.2;

    private static readonly _frameCache = new Map<string, SpriteFrame>();
    private static readonly _tmpColorElite = new Color(255, 236, 170, 255);
    private static readonly _tmpColorNormal = new Color(255, 255, 255, 255);
    private static readonly _instances = new Set<EnemyPaperDollAnimator>();
    private static readonly _paperBudgetWinners = new Set<EnemyPaperDollAnimator>();
    private static _budgetAccum: number = 0;
    private static _budgetLastFrame: number = -1;
    private static _budgetDirty: boolean = true;
    private static _budgetLastCount: number = -1;
    private static _budgetScored: Array<{ animator: EnemyPaperDollAnimator; distSq: number }> = [];

    private _enemy: Enemy | null = null;
    private _isReady: boolean = false;
    private _phase: number = 0;
    private _moveBlend: number = 0;
    private _attackBlend: number = 0;
    private _isAttacking: boolean = false;
    private _attackInterval: number = 1;
    private _attackClock: number = 0;
    private _attackPulse: number = 0;
    private _animTickAccum: number = 0;
    private _gameManagerRef: GameManager | null = null;
    private _meshRenderer: MeshRenderer | null = null;
    private _visualRoot: Node | null = null;
    private _paperVisible: boolean = true;
    private _lodCheckAccum: number = 0;
    private _lastExtremeMode: boolean = false;
    private _lastExtremeBudget: number = 45;
    private _lastWorldPos: Vec3 = new Vec3();

    private _rigRoot: Node | null = null;
    private _headNode: Node | null = null;
    private _leftArmNode: Node | null = null;
    private _rightArmNode: Node | null = null;
    private _leftLegNode: Node | null = null;
    private _rightLegNode: Node | null = null;
    private _sprites: Sprite[] = [];

    protected onEnable(): void {
        EnemyPaperDollAnimator._instances.add(this);
        EnemyPaperDollAnimator._budgetDirty = true;
        this.node.on(EnemyVisualEvents.ATTACK_STATE_CHANGED, this.onAttackStateChanged, this);
        this.node.on(EnemyVisualEvents.ATTACK_PERFORMED, this.onAttackPerformed, this);
    }

    protected onDisable(): void {
        EnemyPaperDollAnimator._instances.delete(this);
        EnemyPaperDollAnimator._paperBudgetWinners.delete(this);
        EnemyPaperDollAnimator._budgetDirty = true;
        this.node.off(EnemyVisualEvents.ATTACK_STATE_CHANGED, this.onAttackStateChanged, this);
        this.node.off(EnemyVisualEvents.ATTACK_PERFORMED, this.onAttackPerformed, this);
    }

    protected start(): void {
        this._enemy = this.node.getComponent(Enemy);
        this._lastWorldPos.set(this.node.worldPosition);
        this._meshRenderer = this.node.getComponent(MeshRenderer);
        if (this._meshRenderer && this._meshRenderer.isValid) {
            // Never show fallback cube for enemies; keep paper visual only.
            this._meshRenderer.enabled = false;
        }
        void this.buildVisualAsync();
    }

    protected update(dt: number): void {
        if (!this._isReady || !this._rigRoot) return;
        if (!this.gameManager.isPlaying) return;
        this.updateVisualLod(dt);
        if (!this._paperVisible) {
            return;
        }
        const tickDt = this.consumeAnimationTick(dt);
        if (tickDt <= 0) {
            return;
        }

        const moving = this.resolveMoving(tickDt);
        const moveTarget = moving ? 1 : 0;
        const blendSpeed = Math.min(1, tickDt * 8);
        this._moveBlend += (moveTarget - this._moveBlend) * blendSpeed;
        const attacking = this.resolveAttacking();
        const attackTarget = attacking ? 1 : 0;
        const attackBlendSpeed = Math.min(1, tickDt * Math.max(this.attackBlendDamping, 0.01));
        this._attackBlend += (attackTarget - this._attackBlend) * attackBlendSpeed;

        const speedWeight = 0.35 + 0.65 * this._moveBlend;
        this._phase += tickDt * this.walkFrequency * Math.PI * 2 * speedWeight;
        if (attacking) {
            this._attackClock += tickDt;
        }
        this._attackPulse = Math.max(
            0,
            this._attackPulse - tickDt * Math.max(this.attackPulseDecay, 0)
        );

        const locomotionBlend = this._moveBlend * (1 - this._attackBlend * 0.82);
        const swing = Math.sin(this._phase) * this.limbSwingAngle * locomotionBlend;
        const headSway = Math.sin(this._phase * 0.5) * this.headSwayAngle * locomotionBlend;
        const bobMove = Math.sin(this._phase * 2) * this.bobAmount * locomotionBlend;
        const bobIdle = Math.sin(this._phase * 0.6) * 1.4 * (1 - this._moveBlend);
        const hasAttackMotion = attacking || this._attackBlend > 0.001 || this._attackPulse > 0.001;
        const attackPose = hasAttackMotion
            ? this.sampleAttackPose(this.resolveAttackPhase())
            : ZERO_ATTACK_POSE;

        let rigY = bobMove + bobIdle + attackPose.bob * this.attackBobAmount * this._attackBlend;
        let rigAngle = this.idleTiltAngle + attackPose.bodyLean * this._attackBlend;
        let leftArmAngle = this.mix(-swing * 0.9, attackPose.leftArm, this._attackBlend);
        let rightArmAngle = this.mix(swing * 0.9, attackPose.rightArm, this._attackBlend);
        const headAngle = this.mix(headSway, attackPose.head, this._attackBlend);

        if (this._attackPulse > 0) {
            rightArmAngle += this._attackPulse * this.attackPulseAngle;
            leftArmAngle -= this._attackPulse * this.attackPulseAngle * 0.35;
            rigY += this._attackPulse * this.attackBobAmount * 0.35;
            rigAngle += this._attackPulse * this.attackBodyLeanAngle * 0.2;
        }

        this._rigRoot.setPosition(0, rigY, 0);
        this._rigRoot.angle = rigAngle;
        if (this._leftLegNode) this._leftLegNode.angle = swing;
        if (this._rightLegNode) this._rightLegNode.angle = -swing;
        if (this._leftArmNode) this._leftArmNode.angle = leftArmAngle;
        if (this._rightArmNode) this._rightArmNode.angle = rightArmAngle;
        if (this._headNode) this._headNode.angle = headAngle;
    }

    private onAttackStateChanged(payload?: EnemyAttackStateChangedPayload): void {
        const isAttacking = !!payload?.isAttacking;
        if (payload && payload.attackInterval > 0) {
            this._attackInterval = payload.attackInterval;
        }
        if (isAttacking && !this._isAttacking) {
            this._attackClock = 0;
        }
        if (!isAttacking) {
            this._attackPulse = 0;
        }
        this._isAttacking = isAttacking;
    }

    private onAttackPerformed(payload?: EnemyAttackPerformedPayload): void {
        if (payload && payload.attackInterval > 0) {
            this._attackInterval = payload.attackInterval;
        }
        this._attackClock = this.resolveNormalizedHitRatio() * this._attackInterval;
        this._attackPulse = 1;
    }

    private resolveAttacking(): boolean {
        if (this._enemy) {
            return this._enemy.state === UnitState.ATTACKING;
        }
        return this._isAttacking;
    }

    private consumeAnimationTick(dt: number): number {
        const enemyState = this._enemy?.state;
        const active = enemyState === UnitState.MOVING || enemyState === UnitState.ATTACKING;
        let fps = Math.max(1, active ? this.activeAnimationFps : this.idleAnimationFps);
        const heroNode = HeroQuery.getNearestHero(this.node.worldPosition);
        if (heroNode && heroNode.isValid) {
            const myPos = this.node.worldPosition;
            const heroPos = heroNode.worldPosition;
            const dx = heroPos.x - myPos.x;
            const dz = heroPos.z - myPos.z;
            const distSq = dx * dx + dz * dz;
            const farDist = Math.max(0.1, this.farLodDistance);
            if (distSq > farDist * farDist) {
                fps = Math.min(fps, Math.max(1, this.farAnimationFps));
            }
        }

        const step = 1 / fps;
        this._animTickAccum += dt;
        if (this._animTickAccum < step) {
            return 0;
        }
        const tickDt = Math.min(this._animTickAccum, step * 2);
        this._animTickAccum = 0;
        return tickDt;
    }

    private updateVisualLod(_dt: number): void {
        if (!this._visualRoot) return;
        this.applyPaperVisible(true);
    }

    private applyPaperVisible(visible: boolean): void {
        if (this._meshRenderer && this._meshRenderer.isValid) {
            // Keep cube mesh disabled even if paper visibility toggles.
            this._meshRenderer.enabled = false;
        }
        if (this._paperVisible === visible) {
            return;
        }
        this._paperVisible = visible;
        if (this._visualRoot && this._visualRoot.isValid) {
            this._visualRoot.active = visible;
        }
        this._animTickAccum = 0;
        if (visible) {
            this._lastWorldPos.set(this.node.worldPosition);
        }
    }

    private resolveDistanceLodAllowed(heroNode: Node): boolean {
        if (!this.enableMeshLod) {
            return true;
        }
        const myPos = this.node.worldPosition;
        const heroPos = heroNode.worldPosition;
        const dx = heroPos.x - myPos.x;
        const dz = heroPos.z - myPos.z;
        const distSq = dx * dx + dz * dz;
        const nearDist = Math.max(0.1, this.meshLodNearDistance);
        const farDist = Math.max(nearDist, this.meshLodFarDistance);
        const nearSq = nearDist * nearDist;
        const farSq = farDist * farDist;
        if (this._paperVisible) {
            return distSq <= farSq;
        }
        return distSq < nearSq;
    }

    private resolveCrowdBudgetAllowed(dt: number, heroNode: Node): boolean {
        if (!this.enableExtremeCrowdMode) {
            return true;
        }
        const budget = Math.max(1, Math.floor(this.maxPaperDollsNearHero));
        const interval = Math.max(0.05, this.crowdBudgetCheckInterval);
        EnemyPaperDollAnimator.refreshPaperBudget(heroNode, budget, interval, dt);
        return EnemyPaperDollAnimator._paperBudgetWinners.has(this);
    }

    private static refreshPaperBudget(
        heroNode: Node,
        maxCount: number,
        interval: number,
        dt: number
    ): void {
        const frame = director.getTotalFrames();
        if (this._budgetLastFrame < 0) {
            this._budgetLastFrame = frame;
            this._budgetAccum += dt;
        } else if (frame !== this._budgetLastFrame) {
            const frameGap = Math.max(1, frame - this._budgetLastFrame);
            this._budgetLastFrame = frame;
            this._budgetAccum += dt * frameGap;
        }

        if (this._budgetLastCount !== maxCount) {
            this._budgetLastCount = maxCount;
            this._budgetDirty = true;
        }

        if (!this._budgetDirty && this._budgetAccum < interval) {
            return;
        }
        this._budgetDirty = false;
        this._budgetAccum = 0;
        this._paperBudgetWinners.clear();

        const heroPos = heroNode.worldPosition;
        const scored = this._budgetScored;
        let count = 0;
        for (const animator of this._instances) {
            if (!animator.enableExtremeCrowdMode) continue;
            if (!animator._isReady || !animator.node.isValid || !animator.node.activeInHierarchy) {
                continue;
            }
            const pos = animator.node.worldPosition;
            const dx = heroPos.x - pos.x;
            const dz = heroPos.z - pos.z;
            if (count < scored.length) {
                scored[count].animator = animator;
                scored[count].distSq = dx * dx + dz * dz;
            } else {
                scored.push({ animator, distSq: dx * dx + dz * dz });
            }
            count++;
        }
        scored.length = count;

        scored.sort((a, b) => a.distSq - b.distSq);
        const keep = Math.min(maxCount, count);
        for (let i = 0; i < keep; i++) {
            this._paperBudgetWinners.add(scored[i].animator);
        }
    }

    private get gameManager(): GameManager {
        if (!this._gameManagerRef) {
            this._gameManagerRef =
                ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        }
        return this._gameManagerRef;
    }

    private resolveAttackPhase(): number {
        const interval = Math.max(0.05, this._attackInterval);
        return (this._attackClock % interval) / interval;
    }

    private sampleAttackPose(phase: number): AttackPoseSample {
        const windupEnd = this.resolveNormalizedWindupRatio();
        const hitEnd = Math.max(windupEnd + 0.05, Math.min(0.95, this.resolveNormalizedHitRatio()));

        if (phase < windupEnd) {
            const t = phase / Math.max(windupEnd, 0.0001);
            return {
                rightArm: this.mix(0, -this.attackWindupAngle, t),
                leftArm: this.mix(0, this.attackOffhandAngle * 0.45, t),
                head: this.mix(0, -this.attackHeadTiltAngle * 0.3, t),
                bodyLean: this.mix(0, this.attackBodyLeanAngle * 0.35, t),
                bob: Math.sin(t * Math.PI) * 0.22,
            };
        }

        if (phase < hitEnd) {
            const t = (phase - windupEnd) / Math.max(hitEnd - windupEnd, 0.0001);
            return {
                rightArm: this.mix(-this.attackWindupAngle, this.attackStrikeAngle, t),
                leftArm: this.mix(this.attackOffhandAngle * 0.45, -this.attackOffhandAngle, t),
                head: this.mix(-this.attackHeadTiltAngle * 0.3, this.attackHeadTiltAngle, t),
                bodyLean: this.mix(this.attackBodyLeanAngle * 0.35, this.attackBodyLeanAngle, t),
                bob: 0.4 + Math.sin(t * Math.PI) * 0.25,
            };
        }

        const t = (phase - hitEnd) / Math.max(1 - hitEnd, 0.0001);
        const inv = 1 - t;
        const ease = 1 - inv * inv;
        return {
            rightArm: this.mix(this.attackStrikeAngle, 0, ease),
            leftArm: this.mix(-this.attackOffhandAngle, 0, ease),
            head: this.mix(this.attackHeadTiltAngle, 0, ease),
            bodyLean: this.mix(this.attackBodyLeanAngle, 0, ease),
            bob: (1 - ease) * 0.2,
        };
    }

    private resolveNormalizedWindupRatio(): number {
        return Math.max(0.05, Math.min(0.85, this.attackWindupRatio));
    }

    private resolveNormalizedHitRatio(): number {
        return Math.max(0.1, Math.min(0.95, this.attackHitRatio));
    }

    private mix(from: number, to: number, t: number): number {
        const clamped = Math.max(0, Math.min(1, t));
        return from + (to - from) * clamped;
    }

    private async buildVisualAsync(): Promise<void> {
        if (this.node.getChildByName('EnemyPaperRoot')) return;

        const frames = await this.loadFramesAsync();
        if (!this.node.isValid) return;

        for (const key of PART_KEYS) {
            if (!frames[key]) {
                console.warn(`[EnemyPaperDollAnimator] Missing required part: ${key}`);
                return;
            }
        }

        const visualRoot = new Node('EnemyPaperRoot');
        this.node.addChild(visualRoot);
        this._visualRoot = visualRoot;
        const referenceScale = Math.max(this.scaleReference, 0.0001);
        const localVisualScale = this.visualScale / referenceScale;
        visualRoot.setPosition(0, this.yOffset / referenceScale, 0);
        visualRoot.setScale(localVisualScale, localVisualScale, localVisualScale);
        visualRoot.addComponent(RenderRoot2D);
        visualRoot.addComponent(Billboard);
        this.applyLayerRecursive(visualRoot, this.node.layer);

        const rigRoot = new Node('EnemyPaperRig');
        visualRoot.addChild(rigRoot);
        this._rigRoot = rigRoot;

        this._rightArmNode = this.createPartNode(
            rigRoot,
            'RightArm',
            frames.rightArm!,
            new Vec3(-13, 1, 0),
            0.465,
            0.633
        );
        this._rightLegNode = this.createPartNode(
            rigRoot,
            'RightLeg',
            frames.rightLeg!,
            new Vec3(-6, -19, 0),
            0.48,
            0.641
        );
        this._leftLegNode = this.createPartNode(
            rigRoot,
            'LeftLeg',
            frames.leftLeg!,
            new Vec3(5, -20, 0),
            0.484,
            0.625
        );

        this.createPartNode(rigRoot, 'Body', frames.body!, new Vec3(0, 0, 0), 0.5, 0.5);
        this._headNode = this.createPartNode(
            rigRoot,
            'Head',
            frames.head!,
            new Vec3(1, 30, 0),
            0.492,
            0.398
        );

        this._leftArmNode = this.createPartNode(
            rigRoot,
            'LeftArm',
            frames.leftArm!,
            new Vec3(14, 1, 0),
            0.496,
            0.648
        );

        this.applyEliteTint();

        this._meshRenderer = this.node.getComponent(MeshRenderer);
        if (this._meshRenderer) {
            this._meshRenderer.enabled = false;
        }
        this._paperVisible = true;
        this._isReady = true;
    }

    private resolveMoving(dt: number): boolean {
        const pos = this.node.worldPosition;
        const dx = pos.x - this._lastWorldPos.x;
        const dz = pos.z - this._lastWorldPos.z;
        const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.0001);
        this._lastWorldPos.set(pos);
        return speed > 0.05 || (this._enemy ? this._enemy.state === UnitState.MOVING : false);
    }

    private createPartNode(
        parent: Node,
        name: string,
        frame: SpriteFrame,
        localPos: Vec3,
        anchorX: number,
        anchorY: number
    ): Node {
        const root = new Node(name);
        parent.addChild(root);
        root.setPosition(this.resolveAnchorCompensatedPosition(frame, localPos, anchorX, anchorY));

        this.createPartFace(root, `${name}_Front`, frame, anchorX, anchorY, 0);
        return root;
    }

    private createPartFace(
        parent: Node,
        name: string,
        frame: SpriteFrame,
        anchorX: number,
        anchorY: number,
        zOffset: number
    ): void {
        const node = new Node(name);
        parent.addChild(node);
        node.setPosition(0, 0, zOffset);
        this.addSprite(node, frame, anchorX, anchorY);
    }

    private addSprite(node: Node, frame: SpriteFrame, anchorX: number, anchorY: number): Sprite {
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame;
        sprite.sizeMode = Sprite.SizeMode.RAW;
        sprite.trim = false;
        const transform = node.getComponent(UITransform);
        if (transform) {
            transform.setAnchorPoint(new Vec2(anchorX, anchorY));
        }
        this._sprites.push(sprite);
        return sprite;
    }

    private resolveAnchorCompensatedPosition(
        frame: SpriteFrame,
        basePos: Vec3,
        anchorX: number,
        anchorY: number
    ): Vec3 {
        // Keep each part at the same rest pose as anchor(0.5,0.5),
        // so switching to shoulder/hip pivots does not pull parts apart.
        const rect = frame.rect;
        const w = rect ? rect.width : 128;
        const h = rect ? rect.height : 128;
        return new Vec3(
            basePos.x + (anchorX - 0.5) * w,
            basePos.y + (anchorY - 0.5) * h,
            basePos.z
        );
    }

    private applyEliteTint(): void {
        const tint = this._enemy?.isElite
            ? EnemyPaperDollAnimator._tmpColorElite
            : EnemyPaperDollAnimator._tmpColorNormal;
        for (const sprite of this._sprites) {
            sprite.color = tint;
        }
    }

    private applyLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) {
            this.applyLayerRecursive(child, layer);
        }
    }

    private async loadFramesAsync(): Promise<Partial<Record<PartKey, SpriteFrame>>> {
        const loaded = await Promise.all(
            PART_KEYS.map(async key => {
                const spec = PART_FRAME_SPECS[key];
                const frame = await this.loadFrameWithFallbacks(spec.candidates);
                return { key, frame, required: spec.required };
            })
        );

        const result: Partial<Record<PartKey, SpriteFrame>> = {};
        for (const item of loaded) {
            if (item.frame) {
                result[item.key] = item.frame;
                continue;
            }
            if (item.required) {
                console.warn(
                    `[EnemyPaperDollAnimator] Missing required sprite frame: ${item.key}. Check asset import in Cocos Creator.`
                );
            }
        }
        return result;
    }

    private async loadFrameWithFallbacks(paths: string[]): Promise<SpriteFrame | null> {
        for (const path of paths) {
            const frame = await this.loadFrameFromTexture(path);
            if (frame) return frame;
        }
        return null;
    }

    private async loadFrameFromTexture(path: string): Promise<SpriteFrame | null> {
        const mainPath = path.endsWith('/texture') ? path.slice(0, -8) : path;
        const cached = EnemyPaperDollAnimator._frameCache.get(mainPath);
        if (cached) return cached;

        const texturePaths = path.endsWith('/texture') ? [path] : [path, `${path}/texture`];
        for (const texturePath of texturePaths) {
            const texture = await this.loadTexture2D(texturePath);
            if (!texture) continue;

            const frame = new SpriteFrame();
            frame.reset({
                texture,
                rect: new Rect(0, 0, texture.width, texture.height),
                originalSize: new Size(texture.width, texture.height),
                offset: new Vec2(),
                isRotate: false,
            });

            EnemyPaperDollAnimator._frameCache.set(mainPath, frame);
            EnemyPaperDollAnimator._frameCache.set(texturePath, frame);
            return frame;
        }
        return null;
    }

    private loadTexture2D(path: string): Promise<Texture2D | null> {
        return new Promise(resolve => {
            resources.load(path, Texture2D, (err, tex) => {
                if (err || !tex) {
                    resolve(null);
                    return;
                }
                resolve(tex);
            });
        });
    }
}
