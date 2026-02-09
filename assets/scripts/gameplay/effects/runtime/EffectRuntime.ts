import { Node, Vec3 } from 'cc';

export type EffectPayloadMap = {
    frostExplosion: {
        parent: Node;
        position: Vec3;
        radius: number;
    };
    frostCastSpray: {
        parent: Node;
        position: Vec3;
        radius: number;
    };
    lightningBolt: {
        parent: Node;
        startPos: Vec3;
        endPos: Vec3;
    };
};

type EffectKey = keyof EffectPayloadMap;
type EffectHandler<K extends EffectKey> = (payload: EffectPayloadMap[K]) => void;

export class EffectRuntime {
    private static readonly _handlers = new Map<
        EffectKey,
        (payload: EffectPayloadMap[EffectKey]) => void
    >();

    public static register<K extends EffectKey>(key: K, handler: EffectHandler<K>): void {
        this._handlers.set(key, handler as (payload: EffectPayloadMap[EffectKey]) => void);
    }

    public static play<K extends EffectKey>(key: K, payload: EffectPayloadMap[K]): void {
        const handler = this._handlers.get(key);
        if (!handler) {
            console.warn(`[EffectRuntime] No handler registered for effect "${key}".`);
            return;
        }
        handler(payload as EffectPayloadMap[EffectKey]);
    }
}
