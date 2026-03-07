import { sys, view } from 'cc';

export type RuntimePlatform = 'reddit' | 'tiktok';

export function detectRuntimePlatform(): RuntimePlatform {
    try {
        const g = globalThis as unknown as Record<string, unknown>;
        if (g.tt !== undefined || g.TTMinis !== undefined) {
            return 'tiktok';
        }
        const forcedGlobal = g.__GVR_PLATFORM__;
        if (forcedGlobal === 'tiktok' || forcedGlobal === 'reddit') {
            return forcedGlobal;
        }
    } catch {
        // Keep fallback below.
    }

    if (typeof window === 'undefined') return 'reddit';

    try {
        const w = window as unknown as Record<string, unknown>;
        const forced = w.__GVR_PLATFORM__;
        if (forced === 'tiktok' || forced === 'reddit') {
            return forced;
        }

        const queryPlatform = new URLSearchParams(window.location.search).get('platform');
        if (queryPlatform === 'tiktok' || queryPlatform === 'reddit') {
            return queryPlatform;
        }

        const host = window.location.hostname.toLowerCase();
        if (
            w.__devvit__ !== undefined ||
            host === '' ||
            host.includes('reddit.com') ||
            host.includes('redd.it')
        ) {
            return 'reddit';
        }
    } catch {
        // Keep fallback below.
    }

    return 'reddit';
}

export function isTikTokRuntime(): boolean {
    return detectRuntimePlatform() === 'tiktok';
}

export function isRedditRuntime(): boolean {
    return detectRuntimePlatform() === 'reddit';
}

export function shouldUseConstrainedGameplayMode(): boolean {
    if (isTikTokRuntime()) return true;
    if (!isRedditRuntime()) return false;

    const touchLike = sys.isMobile || hasTouchCapability();
    if (!touchLike) return false;

    const deviceMemory = readNavigatorNumber('deviceMemory');
    const hardwareConcurrency = readNavigatorNumber('hardwareConcurrency');
    const saveData = readSaveDataHint();

    const lowSpecHint =
        saveData ||
        (deviceMemory !== null && deviceMemory <= 4) ||
        (hardwareConcurrency !== null && hardwareConcurrency <= 4);

    return lowSpecHint || isPhoneLikeViewport();
}

function readNavigatorNumber(key: 'deviceMemory' | 'hardwareConcurrency'): number | null {
    if (typeof navigator === 'undefined') return null;
    const raw = (navigator as unknown as Record<string, unknown>)[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function readSaveDataHint(): boolean {
    if (typeof navigator === 'undefined') return false;
    const connection = (navigator as unknown as Record<string, unknown>).connection;
    if (!connection || typeof connection !== 'object') return false;
    return (connection as Record<string, unknown>).saveData === true;
}

function hasTouchCapability(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
        return false;
    }

    const hasTouchPoints = (navigator.maxTouchPoints ?? 0) > 0;
    const hasTouchEvent = 'ontouchstart' in window;
    return hasTouchPoints || hasTouchEvent || hasCoarsePointer();
}

function hasCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    try {
        return window.matchMedia('(pointer: coarse)').matches;
    } catch {
        return false;
    }
}

function isPhoneLikeViewport(): boolean {
    const frame = view.getFrameSize();
    if (frame.width <= 0 || frame.height <= 0) return false;

    const shortSide = Math.min(frame.width, frame.height);
    const longSide = Math.max(frame.width, frame.height);
    const ratio = longSide / shortSide;
    return shortSide >= 320 && shortSide <= 900 && ratio >= 1.6 && ratio <= 2.5;
}
