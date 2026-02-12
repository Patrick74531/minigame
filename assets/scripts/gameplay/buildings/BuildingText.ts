import { Localization } from '../../core/i18n/Localization';
import { GameConfig } from '../../data/GameConfig';

export interface BuildingTextSource {
    id?: string;
    nameKey?: string;
}

export class BuildingText {
    public static resolveName(source?: BuildingTextSource | null): string {
        if (!source) {
            throw new Error('[BuildingText] Missing text source.');
        }

        const nameKey = source.nameKey ?? this.resolveNameKey(source.id);
        if (!nameKey) {
            throw new Error('[BuildingText] Missing nameKey and building id.');
        }

        return Localization.instance.t(nameKey);
    }

    public static resolveNameKey(typeId?: string): string | null {
        if (!typeId) return null;
        const types = GameConfig.BUILDING.TYPES as Record<string, { nameKey?: string }>;
        const configured = types[typeId]?.nameKey;
        if (!configured) {
            throw new Error(`[BuildingText] Missing nameKey in GameConfig for "${typeId}".`);
        }
        return configured;
    }

    public static buildTitle(name: string): string {
        return Localization.instance.t('ui.building.action.build', { name });
    }

    public static upgradeTitle(name: string, fromLevel: number): string {
        return Localization.instance.t('ui.building.action.upgrade', {
            name,
            from: fromLevel,
            to: fromLevel + 1,
        });
    }

    public static constructingLabel(): string {
        return Localization.instance.t('ui.building.status.constructing');
    }

    public static maxLabel(): string {
        return Localization.instance.t('ui.common.max');
    }
}
