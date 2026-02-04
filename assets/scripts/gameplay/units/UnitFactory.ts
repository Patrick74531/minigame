import { _decorator, Node, MeshRenderer, primitives, utils, Material, Color, Component, RigidBody, BoxCollider, Vec3 } from 'cc';
import { Unit, UnitType, UnitStats } from './Unit';
import { Enemy } from './Enemy';
import { Soldier } from './Soldier';
import { Hero } from './Hero';
import { GameConfig } from '../../data/GameConfig';

/**
 * 单位工厂
 * 负责创建和配置所有单位实体
 */
export class UnitFactory {
    private static _materials: Map<string, Material> = new Map();

    /**
     * 创建敌人
     */
    public static createEnemy(
        parent: Node,
        x: number,
        z: number,
        waveMultiplier: number = 1
    ): Node {
        const node = this.createCubeNode('Enemy', new Color(220, 60, 60, 255));
        node.setPosition(x, 0.5, z); // Raised to 0.5
        node.setScale(0.35, 0.35, 0.35);
        parent.addChild(node);

        const enemy = node.addComponent(Enemy);
        
        // Physics Setup
        const rb = node.addComponent(RigidBody);
        rb.type = RigidBody.Type.DYNAMIC; // Dynamic for physics movement
        rb.useGravity = false;
        rb.linearDamping = 0.5; // Low damping
        rb.angularFactor = new Vec3(0, 0, 0); // Lock rotation
        rb.linearFactor = new Vec3(1, 0, 1);
        rb.group = 1 << 3; // GROUP_ENEMY
        
        const col = node.addComponent(BoxCollider);
        col.size = new Vec3(1, 1, 1);
        col.isTrigger = false; // Solid for collision
        col.setGroup(1 << 3); // ENEMY
        col.setMask(0xffffffff); // Collide with all
        
        enemy.initStats({
            maxHp: GameConfig.ENEMY.BASE_HP * waveMultiplier,
            attack: GameConfig.ENEMY.BASE_ATTACK,
            attackRange: GameConfig.ENEMY.ATTACK_RANGE,
            attackInterval: GameConfig.ENEMY.ATTACK_INTERVAL,
            moveSpeed: GameConfig.ENEMY.MOVE_SPEED * (1 + (waveMultiplier - 1) * 0.1),
        });

        return node;
    }

    /**
     * 创建士兵
     */
    public static createSoldier(parent: Node, x: number, z: number): Node {
        const node = this.createCubeNode('Soldier', new Color(60, 140, 220, 255));
        node.setPosition(x, 1.0, z); // Spawn high safe
        node.setScale(0.3, 0.3, 0.3);
        parent.addChild(node);

        // Physics for Soldier
        const rb = node.addComponent(RigidBody);
        rb.type = RigidBody.Type.DYNAMIC; 
        rb.useGravity = false;
        rb.linearDamping = 0.5;
        rb.angularFactor = new Vec3(0, 0, 0); 
        rb.linearFactor = new Vec3(1, 0, 1); // Lock Y
        // Group? Let's say Soldier is layer 5 or just Default(0) for now if not defined
        // Using Default (1<<0) is fine for now
        
        const col = node.addComponent(BoxCollider);
        col.size = new Vec3(1, 1, 1);
        col.isTrigger = false;
        col.setGroup(1 << 0);
        col.setMask(0xffffffff);

        const soldier = node.addComponent(Soldier);
        soldier.initStats({
            maxHp: GameConfig.SOLDIER.BASE_HP,
            attack: GameConfig.SOLDIER.BASE_ATTACK,
            attackRange: GameConfig.SOLDIER.ATTACK_RANGE,
            attackInterval: GameConfig.SOLDIER.ATTACK_INTERVAL,
            moveSpeed: GameConfig.SOLDIER.MOVE_SPEED,
        });

        return node;
    }

    public static createHero(parent: Node, x: number, z: number): Node {
        const node = this.createCubeNode('Hero', new Color(255, 215, 0, 255));
        node.setPosition(x, 1.0, z); // Raised to 1.0 to be super safe
        node.setScale(0.5, 0.5, 0.5);
        parent.addChild(node);

        // 英雄使用 Hero 组件
        const hero = node.addComponent(Hero);
        // Physics logic moved to Hero component initialize usually, 
        // but if we add it here, we must ensure it matches.
        // Let's rely on Hero.ts initialize or configure it here nicely.
        // Actually UnitFactory previously didn't add RB to Hero! 
        // Wait, looking at previous view_file of UnitFactory...
        // It DID NOT add RB to Hero in the original code I viewed in step 300!
        // It only added RB to Enemy and Soldier.
        // BUT my recent edits MIGHT have added it?
        // Checking my memory... checking file content...
        // Step 304 diff shows createHero UNCHANGED except position.
        // So UnitFactory DOES NOT add RB to Hero. Hero.ts adds it.
        // So I should only change spawn height here.
        
        hero.initStats({
            maxHp: GameConfig.HERO.BASE_HP,
            attack: GameConfig.HERO.BASE_ATTACK,
            attackRange: GameConfig.HERO.ATTACK_RANGE,
            attackInterval: GameConfig.HERO.ATTACK_INTERVAL,
            moveSpeed: GameConfig.HERO.MOVE_SPEED,
        });

        return node;
    }

    /**
     * 创建 3D 立方体节点
     */
    private static createCubeNode(name: string, color: Color): Node {
        const node = new Node(name);
        const renderer = node.addComponent(MeshRenderer);

        // 创建立方体网格
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );

        // 获取或创建材质
        const colorKey = `${color.r}_${color.g}_${color.b}`;
        let material = this._materials.get(colorKey);

        if (!material) {
            material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', color);
            this._materials.set(colorKey, material);
        }

        renderer.material = material;
        return node;
    }

    /**
     * 清理材质缓存
     */
    public static clearCache(): void {
        this._materials.clear();
    }
}
