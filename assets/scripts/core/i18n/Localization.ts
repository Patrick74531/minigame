import { _decorator } from 'cc';
import { EventManager } from '../managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { DEFAULT_LANGUAGE, DEFAULT_MESSAGES } from './messages';
import type { LanguageCode, LocalizationDictionary, LocalizationParams } from './types';
const { ccclass } = _decorator;

@ccclass('Localization')
export class Localization {
    private static _instance: Localization;
    private _currentLang: LanguageCode = DEFAULT_LANGUAGE;
    private readonly _messages = new Map<LanguageCode, LocalizationDictionary>();
    private readonly STORAGE_KEY = 'kingshit.lang';

    public static get instance(): Localization {
        if (!this._instance) {
            this._instance = new Localization();
            this._instance.init();
        }
        return this._instance;
    }

    public init(): void {
        this._messages.clear();

        const entries = Object.entries(DEFAULT_MESSAGES) as Array<
            [LanguageCode, LocalizationDictionary]
        >;
        for (const [lang, dictionary] of entries) {
            this._messages.set(lang, { ...dictionary });
        }

        // Load persisted language
        const savedLang = localStorage.getItem(this.STORAGE_KEY) as LanguageCode;
        if (savedLang && this._messages.has(savedLang)) {
            this._currentLang = savedLang;
        }
    }

    public setLanguage(lang: LanguageCode): void {
        if (!this._messages.has(lang)) {
            console.warn(
                `[Localization] Unsupported language "${lang}", fallback to ${DEFAULT_LANGUAGE}`
            );
            lang = DEFAULT_LANGUAGE;
        }

        this._currentLang = lang;
        localStorage.setItem(this.STORAGE_KEY, lang);
        
        // Emit language changed event
        EventManager.instance.emit(GameEvents.LANGUAGE_CHANGED, { lang });
    }

    public get currentLanguage(): LanguageCode {
        return this._currentLang;
    }

    public t(key: string, params?: LocalizationParams): string {
        const template = this.resolveTemplate(key);
        if (!template) {
            console.error(`[Localization] Missing key: "${key}"`);
            return `[[${key}]]`;
        }
        return this.interpolate(template, params);
    }

    public registerMessages(lang: LanguageCode, messages: LocalizationDictionary): void {
        const existing = this._messages.get(lang) ?? {};
        this._messages.set(lang, {
            ...existing,
            ...messages,
        });
    }

    private resolveTemplate(key: string): string | null {
        const current = this._messages.get(this._currentLang);
        if (current && current[key] !== undefined) {
            return current[key];
        }

        const fallback = this._messages.get(DEFAULT_LANGUAGE);
        if (fallback && fallback[key] !== undefined) {
            return fallback[key];
        }

        return null;
    }

    private interpolate(template: string, params?: LocalizationParams): string {
        if (!params) return template;

        return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token: string) => {
            const value = params[token];
            if (value === undefined || value === null) {
                return `{${token}}`;
            }
            return `${value}`;
        });
    }
}
