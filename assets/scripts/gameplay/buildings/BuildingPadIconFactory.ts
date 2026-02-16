import { Node, Sprite, SpriteFrame, Texture2D, UITransform, resources } from 'cc';

export type BuildingPadIconKind = 'tower' | 'farm' | 'barracks' | 'wall';

const ICON_TEXTURE_PATHS: Record<BuildingPadIconKind, readonly string[]> = {
    tower: [
        'icon/tower_icon',
        'icon/tower_icon/texture',
        'icon/tower_icon.webp',
        'icon/tower_icon.webp/texture',
    ],
    farm: [
        'icon/coin_icon',
        'icon/coin_icon/texture',
        'icon/coin_icon.webp',
        'icon/coin_icon.webp/texture',
    ],
    barracks: [
        'icon/soldier',
        'icon/soldier/texture',
        'icon/soldier.webp',
        'icon/soldier.webp/texture',
    ],
    wall: ['icon/fence', 'icon/fence/texture', 'icon/fence.webp', 'icon/fence.webp/texture'],
};

/**
 * BuildingPad 功能图标加载器（静态缓存 + 去重加载）
 */
export class BuildingPadIconFactory {
    private static _frameCache = new Map<BuildingPadIconKind, SpriteFrame>();
    private static _loading = new Set<BuildingPadIconKind>();
    private static _waiting = new Map<BuildingPadIconKind, Set<Sprite>>();

    public static createFunctionIcon(parent: Node, kind: BuildingPadIconKind): void {
        const spriteNode = new Node('SpriteIcon');
        parent.addChild(spriteNode);
        spriteNode.setPosition(0, 0, 0);

        const transform = spriteNode.addComponent(UITransform);
        transform.setContentSize(48, 48);

        const sprite = spriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.bindIcon(sprite, kind);
    }

    private static bindIcon(sprite: Sprite, kind: BuildingPadIconKind): void {
        const cached = this._frameCache.get(kind);
        if (cached) {
            sprite.spriteFrame = cached;
            return;
        }

        this.getWaitingSet(kind).add(sprite);
        if (this._loading.has(kind)) return;
        this._loading.add(kind);

        this.loadIconTexture(kind, 0, tex => {
            this._loading.delete(kind);
            if (!tex) {
                console.error(
                    `[BuildingPadIconFactory] Failed to load ${kind} icon texture from paths:`,
                    ICON_TEXTURE_PATHS[kind]
                );
                this.getWaitingSet(kind).clear();
                return;
            }

            const frame = new SpriteFrame();
            frame.texture = tex;
            this._frameCache.set(kind, frame);

            for (const waiting of this.getWaitingSet(kind)) {
                if (!waiting || !waiting.node || !waiting.node.isValid) continue;
                waiting.spriteFrame = frame;
            }
            this.getWaitingSet(kind).clear();
        });
    }

    private static loadIconTexture(
        kind: BuildingPadIconKind,
        idx: number,
        done: (tex: Texture2D | null) => void
    ): void {
        const paths = ICON_TEXTURE_PATHS[kind];
        if (idx >= paths.length) {
            done(null);
            return;
        }

        const path = paths[idx];
        resources.load(path, Texture2D, (err, tex) => {
            if (!err && tex) {
                done(tex);
                return;
            }
            this.loadIconTexture(kind, idx + 1, done);
        });
    }

    private static getWaitingSet(kind: BuildingPadIconKind): Set<Sprite> {
        let set = this._waiting.get(kind);
        if (!set) {
            set = new Set<Sprite>();
            this._waiting.set(kind, set);
        }
        return set;
    }
}
