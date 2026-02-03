import { _decorator, Node, MeshRenderer, primitives, utils, Material, Color, Component } from 'cc';
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
        y: number,
        waveMultiplier: number = 1
    ): Node {
        const node = this.createCubeNode('Enemy', new Color(220, 60, 60, 255));
        node.setPosition(x, y, 0);
        node.setScale(0.35, 0.35, 0.35);
        parent.addChild(node);

        const enemy = node.addComponent(Enemy);
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
    public static createSoldier(parent: Node, x: number, y: number): Node {
        const node = this.createCubeNode('Soldier', new Color(60, 140, 220, 255));
        node.setPosition(x, y, 0);
        node.setScale(0.3, 0.3, 0.3);
        parent.addChild(node);

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

    /**
     * 创建英雄
     */
    public static createHero(parent: Node, x: number, y: number): Node {
        const node = this.createCubeNode('Hero', new Color(255, 200, 50, 255));
        node.setPosition(x, y, 0);
        node.setScale(0.5, 0.5, 0.5);
        parent.addChild(node);

        // 英雄使用 Hero 组件
        const hero = node.addComponent(Hero);
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
