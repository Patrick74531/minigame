import {
    _decorator,
    Billboard,
    Color,
    Component,
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

const { ccclass, property } = _decorator;

type PartKey = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

interface PartFrameSpec {
    required: boolean;
    candidates: string[];
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

@ccclass('EnemyPaperDollAnimator')
export class EnemyPaperDollAnimator extends Component {
    @property
    public yOffset: number = 0.45;

    @property
    public visualScale: number = 0.0042;

    @property
    public scaleReference: number = 0.35;

    @property
    public walkFrequency: number = 2.8;

    @property
    public limbSwingAngle: number = 9;

    @property
    public bobAmount: number = 6;

    @property
    public headSwayAngle: number = 4;

    private static readonly _frameCache = new Map<string, SpriteFrame>();
    private static readonly _tmpColorElite = new Color(255, 236, 170, 255);
    private static readonly _tmpColorNormal = new Color(255, 255, 255, 255);

    private _enemy: Enemy | null = null;
    private _isReady: boolean = false;
    private _phase: number = 0;
    private _moveBlend: number = 0;
    private _lastWorldPos: Vec3 = new Vec3();

    private _rigRoot: Node | null = null;
    private _headNode: Node | null = null;
    private _leftArmNode: Node | null = null;
    private _rightArmNode: Node | null = null;
    private _leftLegNode: Node | null = null;
    private _rightLegNode: Node | null = null;
    private _sprites: Sprite[] = [];

    protected start(): void {
        this._enemy = this.node.getComponent(Enemy);
        this._lastWorldPos.set(this.node.worldPosition);
        void this.buildVisualAsync();
    }

    protected update(dt: number): void {
        if (!this._isReady || !this._rigRoot) return;

        const moving = this.resolveMoving(dt);
        const moveTarget = moving ? 1 : 0;
        const blendSpeed = Math.min(1, dt * 8);
        this._moveBlend += (moveTarget - this._moveBlend) * blendSpeed;

        const speedWeight = 0.35 + 0.65 * this._moveBlend;
        this._phase += dt * this.walkFrequency * Math.PI * 2 * speedWeight;

        const swing = Math.sin(this._phase) * this.limbSwingAngle * this._moveBlend;
        const headSway = Math.sin(this._phase * 0.5) * this.headSwayAngle * this._moveBlend;
        const bobMove = Math.sin(this._phase * 2) * this.bobAmount * this._moveBlend;
        const bobIdle = Math.sin(this._phase * 0.6) * 1.4 * (1 - this._moveBlend);

        this._rigRoot.setPosition(0, bobMove + bobIdle, 0);
        if (this._leftLegNode) this._leftLegNode.angle = swing;
        if (this._rightLegNode) this._rightLegNode.angle = -swing;
        if (this._leftArmNode) this._leftArmNode.angle = -swing * 0.9;
        if (this._rightArmNode) this._rightArmNode.angle = swing * 0.9;
        if (this._headNode) this._headNode.angle = headSway;
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

        const mesh = this.node.getComponent(MeshRenderer);
        if (mesh) {
            mesh.enabled = false;
        }
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
