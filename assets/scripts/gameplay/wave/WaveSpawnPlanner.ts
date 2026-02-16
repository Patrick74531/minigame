import { clamp, indexOfMax, toFinite } from './WaveMath';
import type {
    EnemyArchetypeConfig,
    PlannedSpawnEntry,
    RhythmPattern,
    TemplateRuntimeState,
} from './WaveTypes';

export function toComboKey(ids: string[]): string {
    return ids.slice().sort().join('|');
}

export function weightedPickWithoutReplacement(
    source: EnemyArchetypeConfig[],
    scores: Map<string, number>,
    pickCount: number,
    minWeightFloor: number
): EnemyArchetypeConfig[] {
    const pool = source.slice();
    const result: EnemyArchetypeConfig[] = [];
    const targetCount = Math.min(pickCount, pool.length);
    for (let i = 0; i < targetCount; i++) {
        const picked = pickOneWeighted(pool, scores, minWeightFloor);
        if (!picked) break;
        result.push(picked);
        const idx = pool.indexOf(picked);
        if (idx >= 0) pool.splice(idx, 1);
    }
    return result;
}

function pickOneWeighted(
    pool: EnemyArchetypeConfig[],
    scores: Map<string, number>,
    minWeightFloor: number
): EnemyArchetypeConfig | null {
    if (pool.length === 0) return null;
    let total = 0;
    for (const item of pool) {
        total += Math.max(minWeightFloor, scores.get(item.id) ?? 0);
    }
    if (!Number.isFinite(total) || total <= 0) {
        return pool[Math.floor(Math.random() * pool.length)] ?? null;
    }

    let cursor = Math.random() * total;
    for (const item of pool) {
        cursor -= Math.max(minWeightFloor, scores.get(item.id) ?? 0);
        if (cursor <= 0) return item;
    }
    return pool[pool.length - 1] ?? null;
}

export function enumerateValidCombos(
    pool: EnemyArchetypeConfig[],
    pickCount: number,
    forbidden: Set<string>
): EnemyArchetypeConfig[][] {
    if (pickCount <= 0 || pool.length < pickCount) return [];
    const results: EnemyArchetypeConfig[][] = [];
    const stack: EnemyArchetypeConfig[] = [];

    const dfs = (start: number): void => {
        if (stack.length === pickCount) {
            const comboKey = toComboKey(stack.map(item => item.id));
            if (!forbidden.has(comboKey)) {
                results.push(stack.slice());
            }
            return;
        }
        for (let i = start; i < pool.length; i++) {
            stack.push(pool[i]);
            dfs(i + 1);
            stack.pop();
        }
    };

    dfs(0);
    return results;
}

export function pickWeightedCombo(
    combos: EnemyArchetypeConfig[][],
    scores: Map<string, number>,
    minWeightFloor: number
): EnemyArchetypeConfig[] {
    if (combos.length === 0) return [];
    let total = 0;
    const comboWeights: number[] = new Array(combos.length);
    for (let i = 0; i < combos.length; i++) {
        let weight = 0;
        for (const item of combos[i]) {
            weight += scores.get(item.id) ?? minWeightFloor;
        }
        weight = Math.max(minWeightFloor, weight);
        comboWeights[i] = weight;
        total += weight;
    }
    if (!Number.isFinite(total) || total <= 0) {
        return combos[Math.floor(Math.random() * combos.length)] ?? [];
    }
    let cursor = Math.random() * total;
    for (let i = 0; i < combos.length; i++) {
        cursor -= comboWeights[i];
        if (cursor <= 0) return combos[i];
    }
    return combos[combos.length - 1] ?? [];
}

export function selectTemplateWithCooldown<T extends { id: string; cooldownWaves: number }>(
    templates: T[],
    stateMap: Map<string, TemplateRuntimeState>
): T {
    const unlocked = templates.filter(tpl => (stateMap.get(tpl.id)?.cooldownRemain ?? 0) <= 0);
    if (unlocked.length > 0) {
        return unlocked[Math.floor(Math.random() * unlocked.length)] ?? templates[0];
    }

    return (
        templates
            .slice()
            .sort(
                (a, b) =>
                    (stateMap.get(a.id)?.cooldownRemain ?? 0) -
                    (stateMap.get(b.id)?.cooldownRemain ?? 0)
            )[0] ?? templates[0]
    );
}

export function allocateTypeCounts(total: number, shares: number[], typeCount: number): number[] {
    const resolvedTypeCount = Math.max(1, typeCount);
    if (total <= 0) return new Array(resolvedTypeCount).fill(0);
    const normalizedShares = normalizeShares(shares, resolvedTypeCount);

    const raw = normalizedShares.map(share => (total * share) / 100);
    const counts = raw.map(value => Math.floor(value));
    let assigned = counts.reduce((sum, value) => sum + value, 0);

    const fracOrder = raw
        .map((value, idx) => ({ idx, frac: value - Math.floor(value) }))
        .sort((a, b) => b.frac - a.frac);
    let cursor = 0;
    while (assigned < total && fracOrder.length > 0) {
        const idx = fracOrder[cursor % fracOrder.length].idx;
        counts[idx]++;
        assigned++;
        cursor++;
    }

    if (total >= resolvedTypeCount) {
        for (let i = 0; i < resolvedTypeCount; i++) {
            if (counts[i] <= 0) {
                const donorIdx = indexOfMax(counts);
                if (counts[donorIdx] > 1) {
                    counts[donorIdx]--;
                    counts[i]++;
                }
            }
        }
    }

    return counts;
}

function normalizeShares(shares: number[], typeCount: number): number[] {
    if (typeCount <= 0) return [];
    const candidate = shares.slice(0, typeCount).map(value => clamp(toFinite(value, 0), 0, 1000));
    while (candidate.length < typeCount) {
        candidate.push(100 / typeCount);
    }

    const sum = candidate.reduce((acc, value) => acc + value, 0);
    if (!Number.isFinite(sum) || sum <= 0) {
        const even = 100 / typeCount;
        return new Array(typeCount).fill(even);
    }
    return candidate.map(value => (value / sum) * 100);
}

export function buildElitePositionSet(total: number, eliteCount: number): Set<number> {
    const result = new Set<number>();
    const safeTotal = Math.max(0, total);
    const safeElite = Math.max(0, Math.min(eliteCount, safeTotal));
    if (safeElite <= 0 || safeTotal <= 0) return result;

    for (let i = 0; i < safeElite; i++) {
        const pos = Math.floor(((i + 1) * safeTotal) / (safeElite + 1));
        result.add(clamp(pos, 0, Math.max(0, safeTotal - 1)));
    }
    return result;
}

export function applyRhythm(entries: PlannedSpawnEntry[], pattern: RhythmPattern): void {
    if (entries.length <= 0) return;
    const last = Math.max(1, entries.length - 1);
    for (let i = 0; i < entries.length; i++) {
        const t = i / last;
        let m = 1;
        if (pattern === 'frontload') {
            m = 0.72 + 0.58 * t;
        } else if (pattern === 'backload') {
            m = 1.3 - 0.58 * t;
        } else if (pattern === 'pulse') {
            m = i % 4 === 0 || i % 4 === 1 ? 0.74 : 1.3;
        }
        entries[i].intervalMultiplier = clamp(m, 0.35, 2.4);
    }
}

export function shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}
