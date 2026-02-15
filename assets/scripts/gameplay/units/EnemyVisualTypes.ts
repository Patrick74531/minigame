export type EnemyVisualVariant = 'robot' | 'robovacuum';
export type EnemyAttackType = 'standard' | 'ram' | 'ranged';

export interface EnemyVisualSelectionOptions {
    modelPath?: string;
    visualScale?: number;
    attackType?: EnemyAttackType;
}
