import {
    _decorator,
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

const { ccclass, property } = _decorator;

@ccclass('SunflowerPreview')
export class SunflowerPreview extends Component {
    @property
    public resourcePath: string = 'building/sunflower';

    @property
    public yOffset: number = 0.8;

    @property
    public visualScale: number = 0.02;

    @property
    public fps: number = 8;

    @property({ tooltip: '0 表示自动按 width/height 推断；>0 则使用手动帧数' })
    public frameCountOverride: number = 0;

    @property({ tooltip: '成功加载向日葵贴图后，隐藏当前节点上的立方体 MeshRenderer' })
    public hideOwnerMeshOnReady: boolean = false;

    @property({ tooltip: '是否始终朝向相机（Billboard）' })
    public faceCamera: boolean = true;

    @property({ tooltip: '仅在创建时朝向相机一次（之后保持静态）' })
    public alignToCameraOnStart: boolean = false;

    @property({ tooltip: '精灵局部 Y 轴旋转（度），用于修正左右朝向' })
    public spriteYRotation: number = 180;

    @property({ tooltip: '精灵在面向相机平面内的额外旋转角度（度），用于控制图像朝向' })
    public spriteZRotation: number = 0;

    @property({ tooltip: '是否水平翻转精灵（修正左右朝向）' })
    public flipX: boolean = false;

    @property({ tooltip: '是否垂直翻转精灵' })
    public flipY: boolean = false;

    private _cameraNode: Node | null = null;
    private _visualRoot: Node | null = null;
    private _sprite: Sprite | null = null;
    private _frames: SpriteFrame[] = [];
    private _frameTimer: number = 0;
    private _frameIndex: number = 0;
    private _ready: boolean = false;

    protected start(): void {
        void this.buildVisualAsync();
    }

    protected update(dt: number): void {
        if (!this._ready || this._frames.length <= 1 || !this._sprite) return;
        this._frameTimer += dt;
        const interval = 1 / Math.max(1, this.fps);
        while (this._frameTimer >= interval) {
            this._frameTimer -= interval;
            this._frameIndex = (this._frameIndex + 1) % this._frames.length;
        }
        const frame = this._frames[this._frameIndex];
        if (this._sprite.spriteFrame !== frame) {
            this._sprite.spriteFrame = frame;
        }
    }

    protected lateUpdate(): void {
        if (!this._ready || !this._visualRoot) return;
        if (!this.faceCamera) return;
        const cameraNode = this.resolveCameraNode();
        if (!cameraNode) return;
        this._visualRoot.lookAt(cameraNode.worldPosition);
    }

    private async buildVisualAsync(): Promise<void> {
        const texture = await this.loadTextureWithFallbacks(this.buildTextureCandidatePaths());
        if (!texture || !this.node.isValid) return;

        this._frames = this.buildFramesFromTexture(texture);
        if (this._frames.length <= 0) return;

        const visualRoot = new Node('SunflowerVisualRoot');
        this.node.addChild(visualRoot);
        this._visualRoot = visualRoot;
        visualRoot.addComponent(RenderRoot2D);
        this.applyLayerRecursive(visualRoot, this.node.layer);
        visualRoot.setPosition(0, this.yOffset, 0);
        visualRoot.setScale(this.visualScale, this.visualScale, this.visualScale);

        const spriteNode = new Node('SunflowerSprite');
        visualRoot.addChild(spriteNode);
        spriteNode.layer = this.node.layer;

        const sprite = spriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.RAW;
        sprite.trim = false;
        sprite.flipX = this.flipX;
        sprite.flipY = this.flipY;
        this._sprite = sprite;
        sprite.spriteFrame = this._frames[0];
        spriteNode.setRotationFromEuler(0, this.spriteYRotation, this.spriteZRotation);

        const uiTransform = spriteNode.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setAnchorPoint(new Vec2(0.5, 0.5));
        }

        this._frameIndex = 0;
        this._frameTimer = 0;

        if (this.alignToCameraOnStart) {
            const cameraNode = this.resolveCameraNode();
            if (cameraNode) {
                this._visualRoot.lookAt(cameraNode.worldPosition);
            }
        }

        if (this.hideOwnerMeshOnReady) {
            const meshRenderer = this.node.getComponent(MeshRenderer);
            if (meshRenderer) {
                meshRenderer.enabled = false;
            }
        }

        this._ready = true;
    }

    private buildTextureCandidatePaths(): string[] {
        const rawPath = this.resourcePath.trim();
        const basePath = rawPath.replace(/\.(png|webp|jpg|jpeg)$/i, '');
        const candidates: string[] = [];

        const pushUnique = (path: string): void => {
            if (!path) return;
            if (candidates.includes(path)) return;
            candidates.push(path);
        };

        // Respect explicit path first.
        pushUnique(rawPath);
        pushUnique(`${rawPath}/texture`);

        // Then try extensionless + common texture sub-asset path.
        pushUnique(basePath);
        pushUnique(`${basePath}/texture`);

        // Finally try common image extensions under the same base path.
        pushUnique(`${basePath}.png`);
        pushUnique(`${basePath}.webp`);
        pushUnique(`${basePath}.jpg`);
        pushUnique(`${basePath}.jpeg`);

        return candidates;
    }

    private buildFramesFromTexture(texture: Texture2D): SpriteFrame[] {
        const width = Math.max(1, texture.width);
        const height = Math.max(1, texture.height);
        const estimatedCount = Math.floor(width / height);
        const frameCount = Math.max(
            1,
            this.frameCountOverride > 0 ? Math.floor(this.frameCountOverride) : estimatedCount
        );
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

    private async loadTextureWithFallbacks(paths: string[]): Promise<Texture2D | null> {
        for (const path of paths) {
            const texture = await this.loadTexture(path);
            if (texture) return texture;
        }
        return null;
    }

    private loadTexture(path: string): Promise<Texture2D | null> {
        return new Promise(resolve => {
            resources.load(path, Texture2D, (err, texture) => {
                if (err || !texture) return resolve(null);
                resolve(texture);
            });
        });
    }

    private resolveCameraNode(): Node | null {
        if (this._cameraNode && this._cameraNode.isValid) return this._cameraNode;
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
