import type { RuntimePlatform } from '../reddit/RedditBridge';

const STORAGE_KEY = 'gvr.pendingScoreSubmissions.v1';
const MAX_PENDING_SUBMISSIONS = 8;

export interface PendingScoreSubmission {
    platform: RuntimePlatform;
    runId: string;
    score: number;
    wave: number;
    createdAt: number;
}

export class PendingScoreSubmissionStore {
    public static save(
        entry: Omit<PendingScoreSubmission, 'createdAt'> & { createdAt?: number }
    ): void {
        const list = this.load();
        const normalized: PendingScoreSubmission = {
            platform: entry.platform,
            runId: entry.runId,
            score: Math.max(0, Math.floor(entry.score)),
            wave: Math.max(0, Math.floor(entry.wave)),
            createdAt: entry.createdAt ?? Date.now(),
        };

        const existingIndex = list.findIndex(item => item.runId === normalized.runId);
        if (existingIndex >= 0) {
            list[existingIndex] = normalized;
        } else {
            list.push(normalized);
        }

        list.sort((a, b) => a.createdAt - b.createdAt);
        while (list.length > MAX_PENDING_SUBMISSIONS) {
            list.shift();
        }
        this.persist(list);
    }

    public static peekAll(platform?: RuntimePlatform): PendingScoreSubmission[] {
        const list = this.load();
        if (!platform) return list;
        return list.filter(entry => entry.platform === platform);
    }

    public static clear(runId: string): void {
        if (!runId) return;
        const next = this.load().filter(entry => entry.runId !== runId);
        this.persist(next);
    }

    private static load(): PendingScoreSubmission[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((entry): entry is PendingScoreSubmission => {
                    if (!entry || typeof entry !== 'object') return false;
                    const record = entry as Record<string, unknown>;
                    return (
                        (record.platform === 'reddit' || record.platform === 'tiktok') &&
                        typeof record.runId === 'string' &&
                        record.runId.length > 0 &&
                        typeof record.score === 'number' &&
                        Number.isFinite(record.score) &&
                        typeof record.wave === 'number' &&
                        Number.isFinite(record.wave) &&
                        typeof record.createdAt === 'number' &&
                        Number.isFinite(record.createdAt)
                    );
                })
                .map(entry => ({
                    platform: entry.platform,
                    runId: entry.runId,
                    score: Math.max(0, Math.floor(entry.score)),
                    wave: Math.max(0, Math.floor(entry.wave)),
                    createdAt: Math.max(0, Math.floor(entry.createdAt)),
                }));
        } catch {
            return [];
        }
    }

    private static persist(entries: PendingScoreSubmission[]): void {
        try {
            if (entries.length <= 0) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        } catch {
            // ignore localStorage failures
        }
    }
}
