import type { PlannedSpawnEntry, WaveSpawnPlan } from './WaveTypes';

/**
 * 选择用于波前播报的代表怪物：Boss > Elite > 常规波次中的主导类型
 */
export function pickForecastEntry(plan: WaveSpawnPlan): PlannedSpawnEntry | null {
    if (!plan.entries.length) return null;

    const boss = plan.entries.find(entry => entry.spawnType === 'boss');
    if (boss) return boss;

    const elite = plan.entries.find(entry => entry.spawnType === 'elite');
    if (elite) return elite;

    const dominantId = pickDominantArchetypeId(plan.entries);
    if (!dominantId) {
        return plan.entries[0] ?? null;
    }

    return plan.entries.find(entry => entry.archetypeId === dominantId) ?? plan.entries[0] ?? null;
}

function pickDominantArchetypeId(entries: PlannedSpawnEntry[]): string | null {
    if (!entries.length) return null;

    const counts = new Map<string, number>();
    for (const entry of entries) {
        counts.set(entry.archetypeId, (counts.get(entry.archetypeId) ?? 0) + 1);
    }

    let bestId: string | null = null;
    let bestCount = -1;
    for (const [id, count] of counts) {
        if (count > bestCount) {
            bestId = id;
            bestCount = count;
        }
    }

    return bestId;
}
