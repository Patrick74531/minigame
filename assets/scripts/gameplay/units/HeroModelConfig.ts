import { GameConfig } from '../../data/GameConfig';

export type HeroModelPreset = {
    key?: string;
    prefab?: {
        path?: string;
        fallbacks?: string[];
    };
    clips?: Record<string, { path?: string; fallbacks?: string[] }>;
    transform?: {
        scale?: number;
        offsetY?: number;
        rotY?: number;
    };
    animRootScale?: {
        lock?: boolean;
        scale?: number;
    };
    stack?: {
        offsetY?: number;
        itemHeight?: number;
        itemScale?: number;
    };
};

export type ResolvedHeroModelConfig = {
    key: string;
    prefabPath: string;
    prefabFallbacks: string[];
    runClipPath?: string;
    runClipFallbacks: string[];
    idleClipPath?: string;
    idleClipFallbacks: string[];
    transformScale: number;
    transformOffsetY: number;
    transformRotY: number;
    lockAnimRootScale: boolean;
    animRootScale: number;
    stackOffsetY: number;
    stackItemHeight: number;
    stackItemScale: number;
};

const DEFAULT_STACK_OFFSET_Y = 1.2;
const DEFAULT_STACK_ITEM_HEIGHT = 0.1;
const DEFAULT_STACK_ITEM_SCALE = 0.5;

const resolveClip = (
    preset: HeroModelPreset,
    names: string[],
    legacyPath?: string,
    legacyFallbacks?: string[]
): { path?: string; fallbacks: string[] } => {
    for (const name of names) {
        const clip = preset.clips?.[name];
        if (clip?.path || (clip?.fallbacks && clip.fallbacks.length)) {
            return {
                path: clip.path,
                fallbacks: clip.fallbacks ?? [],
            };
        }
    }
    return {
        path: legacyPath,
        fallbacks: legacyFallbacks ?? [],
    };
};

export const resolveHeroModelConfig = (): ResolvedHeroModelConfig => {
    const presets = GameConfig.HERO.MODEL_PRESETS as Record<string, HeroModelPreset> | undefined;
    const key = GameConfig.HERO.MODEL_PRESET;
    const fallbackPreset = presets ? presets[Object.keys(presets)[0]] : undefined;
    const preset = (key && presets && presets[key]) || fallbackPreset || {};

    const transform = preset.transform ?? {};
    const animRootScale = preset.animRootScale ?? {};
    const stack = preset.stack ?? {};

    const runClip = resolveClip(
        preset,
        ['run', 'move'],
        (preset as any).runClipPath,
        (preset as any).runClipFallbacks
    );
    const idleClip = resolveClip(
        preset,
        ['idle', 'run', 'move'],
        (preset as any).idleClipPath,
        (preset as any).idleClipFallbacks
    );

    return {
        key: preset.key ?? key ?? 'default',
        prefabPath: preset.prefab?.path ?? (preset as any).prefabPath ?? '',
        prefabFallbacks: preset.prefab?.fallbacks ?? (preset as any).prefabFallbacks ?? [],
        runClipPath: runClip.path,
        runClipFallbacks: runClip.fallbacks,
        idleClipPath: idleClip.path ?? runClip.path,
        idleClipFallbacks: idleClip.fallbacks ?? runClip.fallbacks,
        transformScale: transform.scale ?? GameConfig.HERO.MODEL_SCALE,
        transformOffsetY: transform.offsetY ?? GameConfig.HERO.MODEL_OFFSET_Y,
        transformRotY: transform.rotY ?? GameConfig.HERO.MODEL_ROT_Y,
        lockAnimRootScale: animRootScale.lock ?? GameConfig.HERO.LOCK_ANIM_ROOT_SCALE,
        animRootScale: animRootScale.scale ?? GameConfig.HERO.ANIM_ROOT_SCALE,
        stackOffsetY: stack.offsetY ?? GameConfig.HERO.STACK_OFFSET_Y ?? DEFAULT_STACK_OFFSET_Y,
        stackItemHeight:
            stack.itemHeight ?? GameConfig.HERO.STACK_ITEM_HEIGHT ?? DEFAULT_STACK_ITEM_HEIGHT,
        stackItemScale:
            stack.itemScale ?? GameConfig.HERO.STACK_ITEM_SCALE ?? DEFAULT_STACK_ITEM_SCALE,
    };
};
