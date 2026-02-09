import {
    _decorator,
    Billboard,
    Camera,
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
} from 'cc';
import { Soldier } from '../units/Soldier';
import { UnitState } from '../units/Unit';

const { ccclass, property } = _decorator;

const RUN_FRAME_PATHS = ['footman/goose/Run', 'footman/goose/Run/texture'];
const ATTACK_FRAME_PATHS = ['footman/goose/Flap', 'footman/goose/Flap/texture'];

@ccclass('SoldierGooseAnimator')
export class SoldierGooseAnimator extends Component {
    @property
    public yOffset: number = 0.5;

    @property
    public visualScale: number = 0.014;

    @property
    public scaleReference: number = 0.3;

    @property
    public moveFps: number = 10;

    @property
    public attackFps: number = 14;

    private static readonly _stripCache = new Map<string, SpriteFrame[]>();

    private _soldier: Soldier | null = null;
    private _meshRenderer: MeshRenderer | null = null;
    private _visualRoot: Node | null = null;
    private _sprite: Sprite | null = null;
    private _cameraNode: Node | null = null;
    private _runFrames: SpriteFrame[] = [];
    private _attackFrames: SpriteFrame[] = [];
    private _isReady: boolean = false;
    private _frameTimer: number = 0;
    private _frameIndex: number = 0;
    private _state: UnitState = UnitState.IDLE;
    private _modelScaleMultiplier: number = 1;

    public setModelScaleMultiplier(multiplier: number): void {
        this._modelScaleMultiplier = Math.max(0.6, multiplier);
        this.applyVisualRootTransform();
    }

    protected start(): void {
        this._soldier = this.node.getComponent(Soldier);
        this._meshRenderer = this.node.getComponent(MeshRenderer);
        void this.buildVisualAsync();
    }

    protected update(dt: number): void {
        if (!this._isReady || !this._sprite) return;

        const nextState = this.resolveState();
        if (nextState !== this._state) {
            this._state = nextState;
            this._frameTimer = 0;
            this._frameIndex = 0;
            this.applyCurrentFrame();
        }

        if (this._state === UnitState.IDLE) {
            this.applyCurrentFrame();
            return;
        }

        const frames = this.getFramesByState(this._state);
        if (frames.length <= 1) {
            this.applyCurrentFrame();
            return;
        }

        const fps = this._state === UnitState.ATTACKING ? this.attackFps : this.moveFps;
        const interval = 1 / Math.max(1, fps);
        this._frameTimer += dt;
        while (this._frameTimer >= interval) {
            this._frameTimer -= interval;
            this._frameIndex = (this._frameIndex + 1) % frames.length;
        }

        this.applyCurrentFrame();
    }

    protected lateUpdate(): void {
        if (!this._isReady || !this._visualRoot) return;
        const cameraNode = this.resolveCameraNode();
        if (!cameraNode) return;
        this._visualRoot.lookAt(cameraNode.worldPosition);
    }

    private resolveState(): UnitState {
        if (!this._soldier || !this._soldier.isAlive) return UnitState.IDLE;
        if (this._soldier.state === UnitState.ATTACKING) return UnitState.ATTACKING;
        if (this._soldier.state === UnitState.MOVING) return UnitState.MOVING;
        return UnitState.IDLE;
    }

    private getFramesByState(state: UnitState): SpriteFrame[] {
        if (state === UnitState.ATTACKING) {
            return this._attackFrames.length > 0 ? this._attackFrames : this._runFrames;
        }
        return this._runFrames.length > 0 ? this._runFrames : this._attackFrames;
    }

    private applyCurrentFrame(): void {
        if (!this._sprite) return;
        const frames = this.getFramesByState(this._state);
        if (frames.length <= 0) return;
        const index = this._state === UnitState.IDLE ? 0 : this._frameIndex % frames.length;
        const frame = frames[index];
        if (this._sprite.spriteFrame !== frame) {
            this._sprite.spriteFrame = frame;
        }
    }

    private async buildVisualAsync(): Promise<void> {
        const existingRoot = this.node.getChildByName('SoldierGooseRoot');
        if (existingRoot) {
            this._visualRoot = existingRoot;
            this._sprite = existingRoot.getComponentInChildren(Sprite);
            const billboard = existingRoot.getComponent(Billboard);
            if (billboard) {
                billboard.destroy();
            }
            this.applySpriteFacingCorrection();
            this.applyVisualRootTransform();
            if (this._meshRenderer) {
                this._meshRenderer.enabled = false;
            }
            this._isReady = !!this._sprite;
            return;
        }

        const [runFrames, attackFrames] = await Promise.all([
            this.loadStripFramesWithFallbacks(RUN_FRAME_PATHS),
            this.loadStripFramesWithFallbacks(ATTACK_FRAME_PATHS),
        ]);
        if (!this.node.isValid) return;

        this._runFrames = runFrames;
        this._attackFrames = attackFrames.length > 0 ? attackFrames : runFrames;
        if (this._runFrames.length <= 0 && this._attackFrames.length <= 0) {
            console.warn('[SoldierGooseAnimator] Failed to load goose frames.');
            return;
        }

        const visualRoot = new Node('SoldierGooseRoot');
        this.node.addChild(visualRoot);
        this._visualRoot = visualRoot;

        visualRoot.addComponent(RenderRoot2D);
        this.applyLayerRecursive(visualRoot, this.node.layer);
        this.applyVisualRootTransform();

        const spriteNode = new Node('GooseSprite');
        visualRoot.addChild(spriteNode);
        spriteNode.layer = this.node.layer;
        this._sprite = spriteNode.addComponent(Sprite);
        this._sprite.sizeMode = Sprite.SizeMode.RAW;
        this._sprite.trim = false;
        this.applySpriteFacingCorrection();

        const uiTransform = spriteNode.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setAnchorPoint(new Vec2(0.5, 0.5));
        }

        if (this._meshRenderer) {
            this._meshRenderer.enabled = false;
        }

        this._state = this.resolveState();
        this._frameIndex = 0;
        this._frameTimer = 0;
        this._isReady = true;
        this.applyCurrentFrame();
    }

    private async loadStripFramesWithFallbacks(paths: string[]): Promise<SpriteFrame[]> {
        for (const path of paths) {
            const key = path.endsWith('/texture') ? path.slice(0, -8) : path;
            const cached = SoldierGooseAnimator._stripCache.get(key);
            if (cached && cached.length > 0) return cached;

            const texture = await this.loadTexture(path);
            if (!texture) continue;

            const frames = this.buildFramesFromTexture(texture);
            if (frames.length <= 0) continue;

            SoldierGooseAnimator._stripCache.set(key, frames);
            SoldierGooseAnimator._stripCache.set(path, frames);
            return frames;
        }
        return [];
    }

    private buildFramesFromTexture(texture: Texture2D): SpriteFrame[] {
        const width = Math.max(1, texture.width);
        const height = Math.max(1, texture.height);
        const estimatedCount = Math.floor(width / height);
        const frameCount = Math.max(1, estimatedCount);
        const frameWidth = Math.floor(width / frameCount);
        const frames: SpriteFrame[] = [];

        for (let i = 0; i < frameCount; i++) {
            const x = i * frameWidth;
            const w = i === frameCount - 1 ? width - x : frameWidth;
            if (w <= 0) continue;
            const frame = new SpriteFrame();
            frame.reset({
                texture,
                rect: new Rect(x, 0, w, height),
                originalSize: new Size(w, height),
                offset: new Vec2(),
                isRotate: false,
            });
            frames.push(frame);
        }

        return frames;
    }

    private loadTexture(path: string): Promise<Texture2D | null> {
        return new Promise(resolve => {
            resources.load(path, Texture2D, (err, texture) => {
                if (err || !texture) {
                    resolve(null);
                    return;
                }
                resolve(texture);
            });
        });
    }

    private applyVisualRootTransform(): void {
        if (!this._visualRoot) return;

        const referenceScale = Math.max(this.scaleReference, 0.0001);
        const localVisualScale = (this.visualScale * this._modelScaleMultiplier) / referenceScale;
        this._visualRoot.setPosition(0, this.yOffset / referenceScale, 0);
        this._visualRoot.setScale(localVisualScale, localVisualScale, localVisualScale);
    }

    private applySpriteFacingCorrection(): void {
        if (!this._sprite || !this._sprite.node || !this._sprite.node.isValid) return;
        this._sprite.node.setRotationFromEuler(0, 180, 0);
    }

    private resolveCameraNode(): Node | null {
        if (this._cameraNode && this._cameraNode.isValid) {
            return this._cameraNode;
        }
        const scene = director.getScene();
        if (!scene) return null;
        const cameras = scene.getComponentsInChildren(Camera);
        if (cameras.length <= 0) return null;
        const active = cameras.find(cam => cam.enabledInHierarchy);
        this._cameraNode = (active ?? cameras[0]).node;
        return this._cameraNode;
    }

    private applyLayerRecursive(root: Node, layer: number): void {
        root.layer = layer;
        for (const child of root.children) {
            this.applyLayerRecursive(child, layer);
        }
    }
}
