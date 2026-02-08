export const EnemyVisualEvents = {
    ATTACK_STATE_CHANGED: 'enemy:attack-state-changed',
    ATTACK_PERFORMED: 'enemy:attack-performed',
} as const;

export interface EnemyAttackStateChangedPayload {
    isAttacking: boolean;
    attackInterval: number;
}

export interface EnemyAttackPerformedPayload {
    attackInterval: number;
    damage: number;
}
