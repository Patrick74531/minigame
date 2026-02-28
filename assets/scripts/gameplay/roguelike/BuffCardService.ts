import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameConfig } from '../../data/GameConfig';
import { GameEvents } from '../../data/GameEvents';
import { Hero } from '../units/Hero';

/**
 * 卡牌效果：支持乘算（multiply）和加算（add）两种模式
 * 与 UnitStats 战斗属性字段对应
 */
export interface BuffCardEffect {
    attack?: { multiply?: number; add?: number };
    attackInterval?: { multiply?: number; add?: number };
    moveSpeed?: { multiply?: number; add?: number };
    attackRange?: { multiply?: number; add?: number };
    /** 最大生命值 (multiply: 1.1 = +10% 血量) */
    maxHp?: { multiply?: number; add?: number };
    /** 暴击率增量 (add: 0.05 = +5% 暴击率) */
    critRate?: { multiply?: number; add?: number };
    /** 暴击伤害增量 (add: 0.3 = +30% 暴击伤害) */
    critDamage?: { multiply?: number; add?: number };
}

/** 卡牌稀有度 */
export type CardRarity = 'gold' | 'purple' | 'blue';

/** 卡牌定义（与 GameConfig.BUFF_CARDS.POOL 条目一一对应） */
export interface BuffCardDef {
    id: string;
    nameKey: string;
    rarity: CardRarity;
    effects: BuffCardEffect;
}

/**
 * BuffCardService
 * 负责卡牌抽取与效果应用逻辑。
 * UI 层通过事件驱动，不直接引用此服务。
 *
 * NOTE: 扩展新卡牌只需在 GameConfig.BUFF_CARDS.POOL 中添加条目。
 */
export class BuffCardService extends Singleton<BuffCardService>() {
    /** 当前待选卡牌（展示给玩家的 N 张） */
    private _pendingCards: BuffCardDef[] = [];

    /** 已选择卡牌历史（用于统计/UI 回溯） */
    private _pickedHistory: BuffCardDef[] = [];

    public get pendingCards(): ReadonlyArray<BuffCardDef> {
        return this._pendingCards;
    }

    public get pickedHistory(): ReadonlyArray<BuffCardDef> {
        return this._pickedHistory;
    }

    // === 初始化 ===

    public initialize(): void {
        this._pendingCards = [];
        this._pickedHistory = [];

        this.eventManager.on(GameEvents.BASE_UPGRADE_READY, this.onBaseUpgradeReady, this);
        this.eventManager.on(GameEvents.BUFF_CARD_PICKED, this.onBuffCardPicked, this);
    }

    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        this._pendingCards = [];
        this._pickedHistory = [];
    }

    /**
     * 从存档恢复履历（幂等：清空历史然后顺序重放卡牌增益。关闭 UI 展示。）
     */
    public restorePickedHistory(cardIds: string[]): void {
        this._pickedHistory = [];
        for (const id of cardIds) {
            this.applyCard(id);
        }
    }

    // === 卡牌抽取 ===

    /**
     * 从卡池中按稀有度权重抽取 N 张不重复卡牌
     * 权重：blue=6, purple=3, gold=1（越强越难抽）
     */
    public drawCards(count: number = GameConfig.BUFF_CARDS.PICK_COUNT): BuffCardDef[] {
        const pool = this.getCardPool();
        const RARITY_WEIGHTS: Record<CardRarity, number> = { blue: 6, purple: 3, gold: 1 };
        const result: BuffCardDef[] = [];
        const remaining = [...pool];
        for (let i = 0; i < count && remaining.length > 0; i++) {
            const totalWeight = remaining.reduce((s, c) => s + (RARITY_WEIGHTS[c.rarity] ?? 1), 0);
            let r = Math.random() * totalWeight;
            let picked = remaining[remaining.length - 1];
            for (let j = 0; j < remaining.length; j++) {
                r -= RARITY_WEIGHTS[remaining[j].rarity] ?? 1;
                if (r <= 0) {
                    picked = remaining[j];
                    break;
                }
            }
            result.push(picked);
            remaining.splice(remaining.indexOf(picked), 1);
        }
        return result;
    }

    // === 效果应用 ===

    /**
     * 将卡牌效果应用到英雄身上
     */
    public applyCard(cardId: string): boolean {
        const card = this.findCardById(cardId);
        if (!card) {
            console.warn(`[BuffCardService] Card not found: ${cardId}`);
            return false;
        }

        const heroNode = this.gameManager.hero;
        if (!heroNode || !heroNode.isValid) {
            console.warn('[BuffCardService] Hero not available');
            return false;
        }

        const hero = heroNode.getComponent(Hero);
        if (!hero) {
            console.warn('[BuffCardService] Hero component not found');
            return false;
        }

        hero.applyBuffCard(this.scaleCardEffects(card.effects, card.rarity));
        this._pickedHistory.push(card);

        console.log(`[BuffCardService] Applied card: ${card.id}`);
        return true;
    }

    // === 事件处理 ===

    private onBaseUpgradeReady(data: { baseLevel: number; suppressCardDraw?: boolean }): void {
        if (data?.suppressCardDraw) return;
        this._pendingCards = this.drawCards();
        // 通知 UI 层卡牌已就绪，可展示选择界面
        this.eventManager.emit(GameEvents.BUFF_CARDS_DRAWN, { count: this._pendingCards.length });
    }

    private onBuffCardPicked(data: { cardId: string }): void {
        const success = this.applyCard(data.cardId);
        if (success) {
            this._pendingCards = [];
        }
    }

    // === 内部工具 ===

    private getCardPool(): BuffCardDef[] {
        return GameConfig.BUFF_CARDS.POOL.map(raw => ({
            id: raw.id,
            nameKey: raw.nameKey,
            rarity: raw.rarity as CardRarity,
            effects: raw.effects as BuffCardEffect,
        }));
    }

    public findCardById(cardId: string): BuffCardDef | null {
        const pool = this.getCardPool();
        return pool.find(c => c.id === cardId) ?? null;
    }

    private scaleCardEffects(effects: BuffCardEffect, rarity: CardRarity): BuffCardEffect {
        const balance = GameConfig.BALANCE.HERO_SKILL;
        const rarityScale =
            rarity === 'gold'
                ? balance.BUFF_RARITY_SCALE.GOLD
                : rarity === 'purple'
                  ? balance.BUFF_RARITY_SCALE.PURPLE
                  : balance.BUFF_RARITY_SCALE.BLUE;
        const multiplyScale = balance.BUFF_MULTIPLY_SCALE * rarityScale;
        const addScale = balance.BUFF_ADD_SCALE * rarityScale;

        return {
            attack: this.scaleStatModifier(effects.attack, multiplyScale, addScale),
            attackInterval: this.scaleStatModifier(effects.attackInterval, multiplyScale, addScale),
            moveSpeed: this.scaleStatModifier(effects.moveSpeed, multiplyScale, addScale),
            attackRange: this.scaleStatModifier(effects.attackRange, multiplyScale, addScale),
            maxHp: this.scaleStatModifier(effects.maxHp, multiplyScale, addScale),
            critRate: this.scaleStatModifier(effects.critRate, multiplyScale, addScale),
            critDamage: this.scaleStatModifier(effects.critDamage, multiplyScale, addScale),
        };
    }

    private scaleStatModifier(
        mod: { multiply?: number; add?: number } | undefined,
        multiplyScale: number,
        addScale: number
    ): { multiply?: number; add?: number } | undefined {
        if (!mod) return undefined;

        const scaled: { multiply?: number; add?: number } = {};
        if (mod.multiply !== undefined) {
            scaled.multiply = 1 + (mod.multiply - 1) * multiplyScale;
        }
        if (mod.add !== undefined) {
            scaled.add = mod.add * addScale;
        }

        return scaled;
    }

    private shuffle<T>(arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
