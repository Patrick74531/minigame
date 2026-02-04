import { Node, Vec3 } from 'cc';

/**
 * Interface for any object that can be attacked (Unit, Building, etc.)
 */
export interface IAttackable {
    /** The cocos Node associated with this object */
    node: Node;
    
    /** Whether the object is currently alive/active */
    isAlive: boolean;
    
    /**
     * Apply damage to this object
     * @param amount Amount of damage to deal
     * @param attacker The object dealing the damage (optional)
     */
    takeDamage(amount: number, attacker?: any): void;
    
    /**
     * Get the world position of the object for targeting calculations
     */
    getWorldPosition(): Vec3;
}
