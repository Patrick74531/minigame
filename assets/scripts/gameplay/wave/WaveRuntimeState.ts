import type {
    ArchetypeRuntimeState,
    EnemyArchetypeConfig,
    TemplateRuntimeState,
} from './WaveTypes';

function trimWindow<T>(items: T[], maxLength: number): void {
    if (items.length <= maxLength) return;
    items.splice(0, items.length - maxLength);
}

export function updateWaveMemory(params: {
    selectedIds: string[];
    comboKey: string;
    recentWaveTypes: string[][];
    recentCombos: string[];
    recentTagRatios: Array<Record<string, number>>;
    recentWindowWaves: number;
    comboMemoryWaves: number;
    archetypeById: Map<string, EnemyArchetypeConfig>;
}): void {
    params.recentWaveTypes.push(params.selectedIds.slice());
    trimWindow(params.recentWaveTypes, params.recentWindowWaves);

    params.recentCombos.push(params.comboKey);
    trimWindow(params.recentCombos, params.comboMemoryWaves);

    const tagCounts: Record<string, number> = {};
    for (const id of params.selectedIds) {
        const archetype = params.archetypeById.get(id);
        if (!archetype) continue;
        for (const tag of archetype.tags) {
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
    }
    const denom = Math.max(1, params.selectedIds.length);
    const tagRatios: Record<string, number> = {};
    for (const tag of Object.keys(tagCounts)) {
        tagRatios[tag] = tagCounts[tag] / denom;
    }
    params.recentTagRatios.push(tagRatios);
    trimWindow(params.recentTagRatios, params.recentWindowWaves);
}

export function applyArchetypeSelectionState(params: {
    selectedIds: string[];
    waveNumber: number;
    archetypes: EnemyArchetypeConfig[];
    archetypeState: Map<string, ArchetypeRuntimeState>;
}): void {
    const picked = new Set(params.selectedIds);
    for (const archetype of params.archetypes) {
        const state = params.archetypeState.get(archetype.id);
        if (!state) continue;
        if (picked.has(archetype.id)) {
            state.cooldownRemain = Math.max(1, archetype.cooldownBase);
            state.lastSeenWave = params.waveNumber;
        }
    }
}

export function tickArchetypeCooldowns(stateMap: Map<string, ArchetypeRuntimeState>): void {
    for (const state of stateMap.values()) {
        state.cooldownRemain = Math.max(0, state.cooldownRemain - 1);
    }
}

export function tickTemplateCooldowns(stateMap: Map<string, TemplateRuntimeState>): void {
    for (const state of stateMap.values()) {
        state.cooldownRemain = Math.max(0, state.cooldownRemain - 1);
    }
}

export function markTemplateCooldown(
    stateMap: Map<string, TemplateRuntimeState>,
    id: string,
    cooldown: number
): void {
    const state = stateMap.get(id);
    if (!state) return;
    state.cooldownRemain = Math.max(0, cooldown);
}
