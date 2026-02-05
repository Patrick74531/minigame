import { _decorator } from 'cc';
import { Building, BuildingType } from './Building';
import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { HUDManager } from '../../ui/HUDManager';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';

const { ccclass, property } = _decorator;

/**
 * 基地组件
 * 游戏核心保护目标，血量归零则游戏结束
 */
@ccclass('Base')
export class Base extends Building {

    protected initialize(): void {
        this.buildingType = BuildingType.BASE;
        super.initialize();

        this.eventManager.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        
        // Initial HUD Update
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    public takeDamage(damage: number, attacker?: any): void {
        super.takeDamage(damage, attacker);
        
        // Update HUD
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    private onEnemyReachedBase(data: { damage?: number }): void {
        const damage = data?.damage ?? 10;
        if (!this.isAlive) return;
        this.takeDamage(damage);
    }
    
    protected onDestroyed(): void {
        // Trigger generic building destruction (remove from map, fx)
        super.onDestroyed();

        // Trigger Game Over
        console.log('[Base] Destroyed! Game Over.');
        this.gameManager.gameOver(false); // Victory = false
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
