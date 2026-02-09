import { resources, Texture2D } from 'cc';

export class TextureLoader {
    private static readonly _cache = new Map<string, Texture2D | null>();
    private static readonly _waiters = new Map<string, Array<(tex: Texture2D | null) => void>>();

    public static requestWithFallbacks(
        paths: string[],
        done: (tex: Texture2D | null) => void
    ): void {
        const key = paths.join('|');
        if (this._cache.has(key)) {
            done(this._cache.get(key) ?? null);
            return;
        }

        const pending = this._waiters.get(key);
        if (pending) {
            pending.push(done);
            return;
        }

        this._waiters.set(key, [done]);
        void this.loadWithFallbacks(paths).then(tex => {
            this._cache.set(key, tex);
            const waiters = this._waiters.get(key) ?? [];
            this._waiters.delete(key);
            for (const cb of waiters) cb(tex);
        });
    }

    public static async loadWithFallbacks(paths: string[]): Promise<Texture2D | null> {
        for (const path of paths) {
            const tex = await this.load(path);
            if (tex) return tex;
        }
        return null;
    }

    public static load(path: string): Promise<Texture2D | null> {
        return new Promise(resolve => {
            resources.load(path, Texture2D, (err, tex) => {
                if (err || !tex) return resolve(null);
                resolve(tex);
            });
        });
    }
}
