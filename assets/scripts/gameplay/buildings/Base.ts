import { _decorator } from 'cc';
import { Building, BuildingType } from './Building';
import { GameManager } from '../../core/managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { HUDManager } from '../../ui/HUDManager';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';

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

        EventManager.instance.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        
        // Initial HUD Update
        HUDManager.instance.updateBaseHp(this.currentHp, this.maxHp);
    }

    public takeDamage(damage: number, attacker?: any): void {
        super.takeDamage(damage, attacker);
        
        // Update HUD
        HUDManager.instance.updateBaseHp(this.currentHp, this.maxHp);
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
        GameManager.instance.gameOver(false); // Victory = false
    }
}
