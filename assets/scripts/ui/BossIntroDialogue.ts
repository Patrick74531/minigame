export type BossDialogueProfile = {
    nameKey: string;
    lineKey: string;
};

export type BossDialogueRequest = {
    archetypeId?: string;
    modelPath?: string;
};

const BOSS_DIALOGUE_LINE_KEYS: Record<string, string> = {
    event_boss_mech: 'ui.bossIntro.line.event_boss_mech',
    boss_mech: 'ui.bossIntro.line.boss_mech',
    event_boss_large: 'ui.bossIntro.line.event_boss_large',
    boss_robot_large: 'ui.bossIntro.line.boss_robot_large',
    boss_legs_gun: 'ui.bossIntro.line.boss_legs_gun',
    event_boss_flying: 'ui.bossIntro.line.event_boss_flying',
    boss_robot_flying: 'ui.bossIntro.line.boss_robot_flying',
};

export function resolveBossDialogueProfile(request: BossDialogueRequest): BossDialogueProfile {
    const archetypeId = (request.archetypeId ?? '').toLowerCase();
    const modelPath = (request.modelPath ?? '').toLowerCase();
    const resolvedId = resolveDialogueId(archetypeId, modelPath);
    const nameId = resolvedId || archetypeId;
    return {
        nameKey: nameId ? `enemy.archetype.${nameId}` : '',
        lineKey: resolvedId ? BOSS_DIALOGUE_LINE_KEYS[resolvedId] : 'ui.bossIntro.line.default',
    };
}

function resolveDialogueId(archetypeId: string, modelPath: string): string {
    if (archetypeId && BOSS_DIALOGUE_LINE_KEYS[archetypeId]) {
        return archetypeId;
    }
    const byModelPath = inferKeyByModelPath(modelPath);
    if (byModelPath && BOSS_DIALOGUE_LINE_KEYS[byModelPath]) {
        return byModelPath;
    }
    const byArchetype = inferKeyByArchetype(archetypeId);
    if (byArchetype && BOSS_DIALOGUE_LINE_KEYS[byArchetype]) {
        return byArchetype;
    }
    return '';
}

function inferKeyByArchetype(archetypeId: string): string {
    if (!archetypeId) return '';
    if (archetypeId.includes('flying')) return 'event_boss_flying';
    if (archetypeId.includes('large')) return 'event_boss_large';
    if (archetypeId.includes('legs')) return 'boss_legs_gun';
    if (archetypeId.includes('mech')) return 'event_boss_mech';
    return '';
}

function inferKeyByModelPath(modelPath: string): string {
    if (!modelPath) return '';
    if (modelPath.includes('robot_flying')) return 'event_boss_flying';
    if (modelPath.includes('robot_large')) return 'event_boss_large';
    if (modelPath.includes('robot_legs_gun')) return 'boss_legs_gun';
    if (modelPath.includes('mech')) return 'event_boss_mech';
    return '';
}
