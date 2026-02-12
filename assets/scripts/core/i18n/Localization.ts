import { _decorator } from 'cc';
const { ccclass } = _decorator;

export type LanguageCode = 'zh' | 'en';

@ccclass('Localization')
export class Localization {
    private static _instance: Localization;
    private _currentLang: LanguageCode = 'zh';
    private _data: Record<string, string> = {};

    public static get instance(): Localization {
        if (!this._instance) {
            this._instance = new Localization();
            this._instance.init();
        }
        return this._instance;
    }

    public init(): void {
        // In a real app, this might load JSON assets.
        // For now, hardcode the dictionary for simplicity.
        this.loadLanguage(this._currentLang);
    }

    public setLanguage(lang: LanguageCode): void {
        this._currentLang = lang;
        this.loadLanguage(lang);
    }

    public t(key: string): string {
        return this._data[key] || key;
    }

    private loadLanguage(lang: LanguageCode): void {
        if (lang === 'zh') {
            this._data = {
                'building.barracks.name': '兵营',
                'building.tower.name': '机炮塔',
                'building.frost_tower.name': '冰霜塔',
                'building.lightning_tower.name': '闪电塔',
                'building.wall.name': '焊接墙',
                'building.base.name': '指挥中心',
                'building.spa.name': '纳米修复池',
                'building.farm.name': '资源回收站',
            };
        } else {
            this._data = {
                'building.barracks.name': 'Barracks',
                'building.tower.name': 'Gatling Tower',
                'building.frost_tower.name': 'Frost Tower',
                'building.lightning_tower.name': 'Tesla Tower',
                'building.wall.name': 'Blast Wall',
                'building.base.name': 'Command Center',
                'building.spa.name': 'Nano Spa',
                'building.farm.name': 'Recycler',
            };
        }
    }
}
