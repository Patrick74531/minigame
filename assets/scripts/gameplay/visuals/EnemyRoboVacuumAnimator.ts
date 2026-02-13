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
} from 'cc';
import { Enemy } from '../units/Enemy';
import { UnitState } from '../units/Unit';

const { ccclass, property } = _decorator;

const VACUUM_FRAME_PATHS = [
    'enemies/robovacuum_blue',
    'enemies/robovacuum_blue/texture',
    'enemies/robovacuum_blue.webp',
];

@ccclass('EnemyRoboVacuumAnimator')
export class EnemyRoboVacuumAnimator extends Component {
    @property
    public yOffset: number = 0.42;

    @property
    public visualScale: number = 0.0105;

    @property
    public scaleReference: number = 0.38;

    @property
    public moveFps: number = 10;

    @property
    public idleFps: number = 7;

    @property
    public attackFps: number = 12;

    @property
    public frameCountOverride: number = 4;

    @property
    public pitchAngle: number = 68;

    @property
    public rollAngle: number = 4;

    private static readonly _stripCache = new Map<string, SpriteFrame[]>();
    private static readonly _eliteTint = new Color(255, 236, 170, 255);
    private static readonly _normalTint = new Color(255, 255, 255, 255);

    private _enemy: Enemy | null = null;
    private _meshRenderer: MeshRenderer | null = null;
    private _visualRoot: Node | null = null;
    private _sprite: Sprite | null = null;
    private _frames: SpriteFrame[] = [];
    private _isReady: boolean = false;
    private _frameTimer: number = 0;
    private _frameIndex: number = 0;
    private _state: UnitState = UnitState.IDLE;

    protected start(): void {
        this._enemy = this.node.getComponent(Enemy);
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

        if (this._frames.length <= 1) {
            this.applyCurrentFrame();
            return;
        }

        const fps =
            this._state === UnitState.ATTACKING
                ? this.attackFps
                : this._state === UnitState.MOVING
                  ? this.moveFps
                  : this.idleFps;
        const interval = 1 / Math.max(1, fps);
        this._frameTimer += dt;
        while (this._frameTimer >= interval) {
            this._frameTimer -= interval;
            this._frameIndex = (this._frameIndex + 1) % this._frames.length;
        }

        this.applyCurrentFrame();
    }

    private resolveState(): UnitState {
        if (!this._enemy || !this._enemy.isAlive) return UnitState.IDLE;
        if (this._enemy.state === UnitState.ATTACKING) return UnitState.ATTACKING;
        if (this._enemy.state === UnitState.MOVING) return UnitState.MOVING;
        return UnitState.IDLE;
    }

    private applyCurrentFrame(): void {
        if (!this._sprite || this._frames.length <= 0) return;
        const index = this._state === UnitState.IDLE ? 0 : this._frameIndex % this._frames.length;
        const frame = this._frames[index];
        if (this._sprite.spriteFrame !== frame) {
            this._sprite.spriteFrame = frame;
        }
    }

    private async buildVisualAsync(): Promise<void> {
        const existingRoot = this.node.getChildByName('EnemyVacuumRoot');
        if (existingRoot) {
            this._visualRoot = existingRoot;
            this._sprite = existingRoot.getComponentInChildren(Sprite);
            const billboard = existingRoot.getComponent(Billboard);
            if (billboard && billboard.isValid) {
                billboard.destroy();
            }
            this.applyVisualRootTransform();
            if (this._meshRenderer && this._meshRenderer.isValid) {
                this._meshRenderer.enabled = false;
            }
            this._isReady = !!this._sprite;
            return;
        }

        const frames = await this.loadFramesWithFallbacks(VACUUM_FRAME_PATHS);
        if (!this.node.isValid) return;
        if (frames.length <= 0) {
            console.warn('[EnemyRoboVacuumAnimator] Failed to load robovacuum_blue frames.');
            return;
        }
        this._frames = frames;

        const visualRoot = new Node('EnemyVacuumRoot');
        this.node.addChild(visualRoot);
        this._visualRoot = visualRoot;

        visualRoot.addComponent(RenderRoot2D);
        this.applyLayerRecursive(visualRoot, this.node.layer);
        this.applyVisualRootTransform();

        const spriteNode = new Node('VacuumSprite');
        visualRoot.addChild(spriteNode);
        spriteNode.layer = this.node.layer;
        this._sprite = spriteNode.addComponent(Sprite);
        this._sprite.sizeMode = Sprite.SizeMode.RAW;
        this._sprite.trim = false;
        this._sprite.node.setRotationFromEuler(0, 180, 0);
        this._sprite.color = this._enemy?.isElite
            ? EnemyRoboVacuumAnimator._eliteTint
            : EnemyRoboVacuumAnimator._normalTint;

        const uiTransform = spriteNode.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setAnchorPoint(new Vec2(0.5, 0.5));
        }

        if (this._meshRenderer && this._meshRenderer.isValid) {
            this._meshRenderer.enabled = false;
        }

        this._state = this.resolveState();
        this._frameIndex = 0;
        this._frameTimer = 0;
        this._isReady = true;
        this.applyCurrentFrame();
    }

    private async loadFramesWithFallbacks(paths: string[]): Promise<SpriteFrame[]> {
        for (const path of paths) {
            const key = path.endsWith('/texture') ? path.slice(0, -8) : path;
            const cached = EnemyRoboVacuumAnimator._stripCache.get(key);
            if (cached && cached.length > 0) return cached;

            const texture = await this.loadTexture(path);
            if (!texture) continue;

            const frames = this.buildFramesFromTexture(texture);
            if (frames.length <= 0) continue;

            EnemyRoboVacuumAnimator._stripCache.set(key, frames);
            EnemyRoboVacuumAnimator._stripCache.set(path, frames);
            return frames;
        }
        return [];
    }

    private buildFramesFromTexture(texture: Texture2D): SpriteFrame[] {
        const width = Math.max(1, texture.width);
        const height = Math.max(1, texture.height);
        const estimatedCount = Math.max(1, Math.floor(width / height));
        const frameCount =
            this.frameCountOverride > 0 ? Math.floor(this.frameCountOverride) : estimatedCount;
        const safeFrameCount = Math.max(1, frameCount);
        const frameWidth = Math.floor(width / safeFrameCount);
        const frames: SpriteFrame[] = [];

        for (let i = 0; i < safeFrameCount; i++) {
            const x = i * frameWidth;
            const w = i === safeFrameCount - 1 ? width - x : frameWidth;
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
        const localVisualScale = this.visualScale / referenceScale;
        this._visualRoot.setPosition(0, this.yOffset / referenceScale, 0);
        this._visualRoot.setRotationFromEuler(this.pitchAngle, 0, this.rollAngle);
        this._visualRoot.setScale(localVisualScale, localVisualScale, localVisualScale);
    }

    private applyLayerRecursive(root: Node, layer: number): void {
        root.layer = layer;
        for (const child of root.children) {
            this.applyLayerRecursive(child, layer);
        }
    }
}
