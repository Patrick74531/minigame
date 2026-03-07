import {
    _decorator,
    Color,
    Component,
    EffectAsset,
    Material,
    Mesh,
    MeshRenderer,
    Node,
    Quat,
    Vec3,
    Vec4,
    primitives,
    resources,
    utils,
} from 'cc';

const { ccclass } = _decorator;

export type GroundContactShadowConfig = {
    sizeX: number;
    sizeZ: number;
    opacity?: number;
    groundY?: number;
    yOffset?: number;
    followRotation?: boolean;
    innerFade?: number;
    outerFade?: number;
};

@ccclass('GroundContactShadow')
export class GroundContactShadow extends Component {
    private static readonly EFFECT_PATH = 'shaders/soft-shadow';
    private static _effectAsset: EffectAsset | null = null;
    private static _effectLoading: boolean = false;
    private static _materialCache: Map<string, Material> = new Map();
    private static _waiting: Set<GroundContactShadow> = new Set();
    private static _sharedMesh: Mesh | null = null;
    private static readonly _tmpPos = new Vec3();
    private static readonly _tmpRot = new Quat();

    private _shadowNode: Node | null = null;
    private _shadowRenderer: MeshRenderer | null = null;
    private _sizeX: number = 1.2;
    private _sizeZ: number = 0.9;
    private _opacity: number = 0.22;
    private _groundY: number = 0.04;
    private _yOffset: number = 0;
    private _followRotation: boolean = true;
    private _innerFade: number = 0.12;
    private _outerFade: number = 0.96;

    public configure(config: GroundContactShadowConfig): void {
        this._sizeX = Math.max(0.1, config.sizeX);
        this._sizeZ = Math.max(0.1, config.sizeZ);
        this._opacity = Math.max(0.02, Math.min(0.92, config.opacity ?? this._opacity));
        this._groundY = config.groundY ?? this._groundY;
        this._yOffset = config.yOffset ?? this._yOffset;
        this._followRotation = config.followRotation ?? this._followRotation;
        this._innerFade = Math.max(0.0, Math.min(0.9, config.innerFade ?? this._innerFade));
        this._outerFade = Math.max(
            this._innerFade + 0.02,
            Math.min(1.35, config.outerFade ?? this._outerFade)
        );

        this.ensureShadowNode();
        this.applyMaterialIfReady();
        this.syncShadow(true);
    }

    protected onEnable(): void {
        this.ensureShadowNode();
        this.applyMaterialIfReady();
        this.syncShadow(true);
    }

    protected lateUpdate(): void {
        this.syncShadow(false);
    }

    protected onDisable(): void {
        if (this._shadowNode && this._shadowNode.isValid) {
            this._shadowNode.active = false;
        }
    }

    protected onDestroy(): void {
        GroundContactShadow._waiting.delete(this);
        if (this._shadowNode && this._shadowNode.isValid) {
            this._shadowNode.destroy();
        }
        this._shadowNode = null;
        this._shadowRenderer = null;
    }

    private ensureShadowNode(): void {
        const ownerParent = this.node.parent;
        if (!ownerParent || !ownerParent.isValid) return;

        if (this._shadowNode && this._shadowNode.isValid) {
            if (this._shadowNode.parent !== ownerParent) {
                this._shadowNode.removeFromParent();
                ownerParent.addChild(this._shadowNode);
            }
            return;
        }

        const shadowNode = new Node(`${this.node.name}_GroundShadow`);
        shadowNode.layer = this.node.layer;
        ownerParent.addChild(shadowNode);
        shadowNode.setSiblingIndex(Math.max(0, this.node.getSiblingIndex()));

        const renderer = shadowNode.addComponent(MeshRenderer);
        renderer.mesh = GroundContactShadow.getSharedMesh();
        renderer.shadowCastingMode = 0;
        renderer.receiveShadow = 0;

        this._shadowNode = shadowNode;
        this._shadowRenderer = renderer;
    }

    private syncShadow(forceVisible: boolean): void {
        if (!this.enabledInHierarchy || !this.node.isValid) return;
        this.ensureShadowNode();
        if (!this._shadowNode || !this._shadowNode.isValid) return;

        this._shadowNode.active = forceVisible || this.node.activeInHierarchy;
        this._shadowNode.layer = this.node.layer;

        this.node.getWorldPosition(GroundContactShadow._tmpPos);
        const pos = GroundContactShadow._tmpPos;
        this._shadowNode.setWorldPosition(pos.x, this._groundY + this._yOffset, pos.z);
        this._shadowNode.setScale(this._sizeX, 1, this._sizeZ);

        if (this._followRotation) {
            this.node.getWorldRotation(GroundContactShadow._tmpRot);
            this._shadowNode.setWorldRotation(GroundContactShadow._tmpRot);
        } else {
            this._shadowNode.setRotationFromEuler(0, 0, 0);
        }
    }

    private applyMaterialIfReady(): void {
        if (!this._shadowRenderer || !this._shadowRenderer.isValid) return;

        if (!GroundContactShadow._effectAsset) {
            GroundContactShadow._waiting.add(this);
            this.requestEffect();
            return;
        }

        const material = GroundContactShadow.getMaterial(
            this._opacity,
            this._innerFade,
            this._outerFade
        );
        this._shadowRenderer.material = material;
    }

    private requestEffect(): void {
        if (GroundContactShadow._effectLoading || GroundContactShadow._effectAsset) return;

        GroundContactShadow._effectLoading = true;
        resources.load(GroundContactShadow.EFFECT_PATH, EffectAsset, (err, effectAsset) => {
            GroundContactShadow._effectLoading = false;

            if (err || !effectAsset) {
                console.warn('[GroundContactShadow] Failed to load soft shadow effect', err);
                GroundContactShadow._waiting.clear();
                return;
            }

            GroundContactShadow._effectAsset = effectAsset;
            const waiting = Array.from(GroundContactShadow._waiting);
            GroundContactShadow._waiting.clear();
            for (const instance of waiting) {
                if (!instance || !instance.isValid) continue;
                instance.applyMaterialIfReady();
            }
        });
    }

    private static getMaterial(opacity: number, innerFade: number, outerFade: number): Material {
        const key = `${opacity.toFixed(3)}_${innerFade.toFixed(3)}_${outerFade.toFixed(3)}`;
        const cached = this._materialCache.get(key);
        if (cached) return cached;

        const effectAsset = this._effectAsset;
        if (!effectAsset) {
            throw new Error('GroundContactShadow effect requested before load completed');
        }

        const material = new Material();
        material.initialize({
            effectAsset,
            technique: 0,
        });
        material.setProperty('shadowColor', new Color(18, 14, 10, Math.round(opacity * 255)));
        material.setProperty('shadowParams', new Vec4(innerFade, outerFade, 1.35, 0));
        this._materialCache.set(key, material);
        return material;
    }

    private static getSharedMesh(): Mesh {
        if (this._sharedMesh) return this._sharedMesh;

        this._sharedMesh = utils.MeshUtils.createMesh(
            primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
        );
        return this._sharedMesh;
    }
}
