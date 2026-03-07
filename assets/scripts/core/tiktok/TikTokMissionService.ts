const SHORTCUT_FLAG_KEY = '__gvr_tiktok_shortcut_done_v1';
const ENTRANCE_FLAG_KEY = '__gvr_tiktok_entrance_started_v1';

type TikTokHost = Record<string, unknown> & {
    getStorageSync?: (key: string) => unknown;
    setStorageSync?: (key: string, value: string) => void;
};

export type TikTokMissionState = {
    isTikTokRuntime: boolean;
    shortcutSupported: boolean;
    shortcutAdded: boolean;
    entranceSupported: boolean;
    entrancePrompted: boolean;
    launchedFromShortcut: boolean;
    launchedFromProfile: boolean;
};

export type TikTokMissionActionCode =
    | 'unsupported'
    | 'already_done'
    | 'prompt_requested'
    | 'completed'
    | 'failed';

export type TikTokMissionActionResult = {
    code: TikTokMissionActionCode;
    raw?: unknown;
    state: TikTokMissionState;
};

type HostApiResult = {
    ok: boolean;
    raw?: unknown;
    timedOut?: boolean;
};

export class TikTokMissionService {
    public static isTikTokRuntime(): boolean {
        const g = globalThis as Record<string, unknown> & {
            TTMinis?: Record<string, unknown>;
            tt?: Record<string, unknown>;
            __GVR_PLATFORM__?: unknown;
        };
        return g.__GVR_PLATFORM__ === 'tiktok' || typeof g.tt !== 'undefined';
    }

    public static async getMissionState(): Promise<TikTokMissionState> {
        const primaryHost = this.getPrimaryHost();
        const shortcutHost = this.findHostForApi('addShortcut');
        const checkShortcutHost = this.findHostForApi('checkShortcut');
        const entranceHost = this.findHostForApi('startEntranceMission');
        const launchHost = this.findHostForApi('getLaunchOptionsSync');

        const state: TikTokMissionState = {
            isTikTokRuntime: this.isTikTokRuntime(),
            shortcutSupported: this.isApiUsable(shortcutHost, 'addShortcut'),
            shortcutAdded: false,
            entranceSupported: this.isApiUsable(entranceHost, 'startEntranceMission'),
            entrancePrompted: this.readStoredFlag(primaryHost, ENTRANCE_FLAG_KEY),
            launchedFromShortcut: false,
            launchedFromProfile: false,
        };

        if (checkShortcutHost && this.isApiUsable(checkShortcutHost, 'checkShortcut')) {
            const result = await this.callHostApi(
                checkShortcutHost,
                'checkShortcut',
                {},
                { timeoutMs: 1500 }
            );
            if (result.ok && this.parseShortcutAdded(result.raw)) {
                state.shortcutAdded = true;
                this.writeStoredFlag(primaryHost, SHORTCUT_FLAG_KEY, true);
            }
        } else if (shortcutHost) {
            state.shortcutAdded = this.readStoredFlag(primaryHost, SHORTCUT_FLAG_KEY);
        }

        if (launchHost && this.isApiUsable(launchHost, 'getLaunchOptionsSync')) {
            const raw = this.readLaunchOptions(launchHost);
            state.launchedFromShortcut = this.detectLaunchSource(raw, 'shortcut');
            state.launchedFromProfile = this.detectLaunchSource(raw, 'profile');
        }

        if (state.launchedFromShortcut) {
            state.shortcutAdded = true;
            this.writeStoredFlag(primaryHost, SHORTCUT_FLAG_KEY, true);
        }

        return state;
    }

    public static async requestShortcut(): Promise<TikTokMissionActionResult> {
        const primaryHost = this.getPrimaryHost();
        const shortcutHost = this.findHostForApi('addShortcut');
        let state = await this.getMissionState();

        if (!shortcutHost || !this.isApiUsable(shortcutHost, 'addShortcut')) {
            return { code: 'unsupported', state };
        }
        if (state.shortcutAdded) {
            return { code: 'already_done', state };
        }

        const result = await this.callHostApi(shortcutHost, 'addShortcut', {}, { timeoutMs: 1800 });
        if (!result.ok) {
            return { code: 'failed', raw: result.raw, state };
        }

        state = await this.getMissionState();
        if (state.shortcutAdded) {
            this.writeStoredFlag(primaryHost, SHORTCUT_FLAG_KEY, true);
            return { code: 'completed', raw: result.raw, state };
        }

        return {
            code: result.timedOut ? 'prompt_requested' : 'prompt_requested',
            raw: result.raw,
            state,
        };
    }

    public static async requestEntranceMission(): Promise<TikTokMissionActionResult> {
        const primaryHost = this.getPrimaryHost();
        const entranceHost = this.findHostForApi('startEntranceMission');
        let state = await this.getMissionState();

        if (!entranceHost || !this.isApiUsable(entranceHost, 'startEntranceMission')) {
            return { code: 'unsupported', state };
        }
        if (state.launchedFromProfile || state.entrancePrompted) {
            return { code: 'already_done', state };
        }

        const result = await this.callHostApi(
            entranceHost,
            'startEntranceMission',
            {},
            { timeoutMs: 1800 }
        );
        if (!result.ok) {
            return { code: 'failed', raw: result.raw, state };
        }

        this.writeStoredFlag(primaryHost, ENTRANCE_FLAG_KEY, true);
        state = await this.getMissionState();
        return {
            code: state.launchedFromProfile ? 'completed' : 'prompt_requested',
            raw: result.raw,
            state,
        };
    }

    private static getPrimaryHost(): TikTokHost | null {
        const g = globalThis as Record<string, unknown> & {
            TTMinis?: Record<string, unknown>;
            tt?: Record<string, unknown>;
        };

        if (g.tt && typeof g.tt === 'object') {
            return g.tt as TikTokHost;
        }

        const ttMinisGame = g.TTMinis?.game;
        if (ttMinisGame && typeof ttMinisGame === 'object') {
            return ttMinisGame as TikTokHost;
        }

        return null;
    }

    private static getHosts(): TikTokHost[] {
        const g = globalThis as Record<string, unknown> & {
            TTMinis?: Record<string, unknown>;
            tt?: Record<string, unknown>;
        };

        const out: TikTokHost[] = [];
        const push = (host: unknown): void => {
            if (!host || typeof host !== 'object') return;
            const ref = host as TikTokHost;
            if (out.includes(ref)) return;
            out.push(ref);
        };

        push(g.tt);
        push(g.TTMinis?.game);
        push(g.TTMinis);
        return out;
    }

    private static findHostForApi(apiName: string): TikTokHost | null {
        for (const host of this.getHosts()) {
            if (typeof host?.[apiName] === 'function') {
                return host;
            }
        }
        return null;
    }

    private static isApiUsable(host: TikTokHost | null, apiName: string): boolean {
        if (!host || typeof host[apiName] !== 'function') {
            return false;
        }

        try {
            const canIUse = host.canIUse as ((feature: string) => boolean) | undefined;
            if (typeof canIUse === 'function') {
                return canIUse.call(host, apiName) !== false;
            }
        } catch {
            // Ignore canIUse probe failures and fall back to function existence.
        }

        return true;
    }

    private static callHostApi(
        host: TikTokHost,
        apiName: string,
        payload: Record<string, unknown>,
        options: { timeoutMs?: number } = {}
    ): Promise<HostApiResult> {
        return new Promise(resolve => {
            const fn = host?.[apiName];
            if (typeof fn !== 'function') {
                resolve({ ok: false, raw: new Error(`Missing TikTok API: ${apiName}`) });
                return;
            }

            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const finish = (result: HostApiResult): void => {
                if (settled) return;
                settled = true;
                if (timer) {
                    clearTimeout(timer);
                }
                resolve(result);
            };

            if ((options.timeoutMs ?? 0) > 0) {
                timer = setTimeout(() => {
                    finish({ ok: true, timedOut: true });
                }, options.timeoutMs);
            }

            try {
                const request = {
                    ...payload,
                    success: (raw: unknown) => finish({ ok: true, raw }),
                    fail: (raw: unknown) => finish({ ok: false, raw }),
                };
                const ret = (fn as (args: Record<string, unknown>) => unknown).call(host, request);
                if (ret && typeof (ret as Promise<unknown>).then === 'function') {
                    (ret as Promise<unknown>)
                        .then((raw: unknown) => finish({ ok: true, raw }))
                        .catch((raw: unknown) => finish({ ok: false, raw }));
                    return;
                }

                if (ret !== undefined) {
                    finish({ ok: true, raw: ret });
                }
            } catch (raw) {
                finish({ ok: false, raw });
            }
        });
    }

    private static readLaunchOptions(host: TikTokHost): unknown {
        try {
            const fn = host.getLaunchOptionsSync;
            if (typeof fn !== 'function') return null;
            return fn.call(host);
        } catch {
            return null;
        }
    }

    private static readStoredFlag(host: TikTokHost | null, key: string): boolean {
        try {
            if (host?.getStorageSync) {
                const raw = host.getStorageSync(key);
                return raw === true || raw === '1' || raw === 'true';
            }
        } catch {
            // Fall through to localStorage.
        }

        try {
            return globalThis.localStorage?.getItem(key) === '1';
        } catch {
            return false;
        }
    }

    private static writeStoredFlag(host: TikTokHost | null, key: string, value: boolean): void {
        const text = value ? '1' : '0';
        try {
            host?.setStorageSync?.(key, text);
        } catch {
            // Fall through to localStorage.
        }

        try {
            globalThis.localStorage?.setItem(key, text);
        } catch {
            // Ignore storage write failures in sandboxed runtimes.
        }
    }

    private static parseShortcutAdded(raw: unknown): boolean {
        const boolLike = this.parseBooleanLike(raw);
        if (boolLike !== null) return boolLike;

        if (Array.isArray(raw)) {
            return raw.some(item => this.parseShortcutAdded(item));
        }

        if (!raw || typeof raw !== 'object') return false;
        const record = raw as Record<string, unknown>;
        const keys = [
            'hasShortcut',
            'added',
            'isAdded',
            'installed',
            'isInstalled',
            'exist',
            'exists',
            'status',
            'result',
        ];

        for (const key of keys) {
            if (!(key in record)) continue;
            const nested = this.parseBooleanLike(record[key]);
            if (nested !== null) return nested;
            if (typeof record[key] === 'string') {
                const guessed = this.guessStatus(record[key]);
                if (guessed !== null) return guessed;
            }
        }

        return Object.values(record).some(value => this.parseShortcutAdded(value));
    }

    private static parseBooleanLike(value: unknown): boolean | null {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value !== 'string') return null;
        return this.guessStatus(value);
    }

    private static guessStatus(value: string): boolean | null {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;

        if (
            /not[_ -]?added|missing|none|false|disable|disabled|fail|failed|remove|removed/.test(
                normalized
            )
        ) {
            return false;
        }

        if (
            /added|exist|exists|installed|true|success|succeeded|done|complete|completed|ok/.test(
                normalized
            )
        ) {
            return true;
        }

        return null;
    }

    private static detectLaunchSource(raw: unknown, target: 'shortcut' | 'profile'): boolean {
        const text = this.stringifyLower(raw);
        if (!text) return false;

        if (target === 'shortcut') {
            return text.includes('shortcut');
        }

        return (
            text.includes('profile') ||
            text.includes('entrance') ||
            text.includes('personal') ||
            text.includes('homepage_mission')
        );
    }

    private static stringifyLower(raw: unknown): string {
        try {
            if (typeof raw === 'string') return raw.toLowerCase();
            if (raw && typeof raw === 'object') return JSON.stringify(raw).toLowerCase();
        } catch {
            // Ignore circular structures.
        }
        return '';
    }
}
