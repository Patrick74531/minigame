export type BossDialogueProfile = {
    zhName: string;
    enName: string;
    zhLine: string;
    enLine: string;
};

export type BossDialogueRequest = {
    archetypeId?: string;
    modelPath?: string;
    fallbackName?: string;
};

const BOSS_DIALOGUES: Record<string, BossDialogueProfile> = {
    event_boss_mech: {
        zhName: '终焉机甲',
        enName: 'Apex Mech',
        zhLine: '计算完成。你们败局已定。',
        enLine: 'Calculation done. Your loss is certain.',
    },
    boss_mech: {
        zhName: '重型机甲',
        enName: 'Heavy Mech',
        zhLine: '火力上线。现在清场。',
        enLine: 'Weapons online. Field purge begins.',
    },
    event_boss_large: {
        zhName: '终焉巨像',
        enName: 'Apex Colossus',
        zhLine: '正面碾碎。别挡路。',
        enLine: 'I crush head-on. Move.',
    },
    boss_robot_large: {
        zhName: '巨型机甲',
        enName: 'Titan Warbot',
        zhLine: '护甲全开。迎接冲击。',
        enLine: 'Armor maxed. Brace for impact.',
    },
    boss_legs_gun: {
        zhName: '机炮步行者',
        enName: 'Gun Walker',
        zhLine: '火线锁定。原地蒸发。',
        enLine: 'Line locked. Evaporate.',
    },
    event_boss_flying: {
        zhName: '终焉飞行体',
        enName: 'Apex Skyframe',
        zhLine: '天空封锁。你们无处可逃。',
        enLine: 'Skyline sealed. Nowhere to run.',
    },
    boss_robot_flying: {
        zhName: '飞行机甲',
        enName: 'Flying Warbot',
        zhLine: '制空权归我。准备坠落。',
        enLine: 'Air superiority is mine. Prepare to fall.',
    },
};

const FALLBACK_DIALOGUE: BossDialogueProfile = {
    zhName: 'Boss 单位',
    enName: 'Boss Unit',
    zhLine: '警报拉满。迎战。',
    enLine: 'Max alert. Engage.',
};

export function resolveBossDialogueProfile(request: BossDialogueRequest): BossDialogueProfile {
    const archetypeId = (request.archetypeId ?? '').toLowerCase();
    const modelPath = (request.modelPath ?? '').toLowerCase();

    const keys = [
        archetypeId,
        inferKeyByModelPath(modelPath),
        inferKeyByArchetype(archetypeId),
    ].filter(Boolean) as string[];

    for (const key of keys) {
        const found = BOSS_DIALOGUES[key];
        if (found) {
            return found;
        }
    }

    if (request.fallbackName) {
        return {
            ...FALLBACK_DIALOGUE,
            zhName: request.fallbackName,
        };
    }

    return FALLBACK_DIALOGUE;
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
