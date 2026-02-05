/**
 * 游戏配置常量
 * 集中管理所有可调参数，便于平衡和调试
 *
 * NOTE: 新增数值请优先放在这里，保持单一事实来源。
 */
export const GameConfig = {
    // === 游戏通用 ===
    GAME: {
        /** 目标帧率 */
        TARGET_FPS: 60,
        /** 游戏速度倍率 */
        TIME_SCALE: 1,
    },

    // === 关卡/生成点 ===
    MAP: {
        /** 基地出生点 (World XZ) */
        BASE_SPAWN: { x: -9, z: -9 },
        /** 英雄相对基地的偏移 */
        HERO_SPAWN_OFFSET: { x: 2, z: 2 },
        /** 可移动范围限制 */
        LIMITS: { x: 25, z: 25 },
    },

    // === 物理/高度 ===
    PHYSICS: {
        /** 敌人/士兵/英雄的默认高度（Y） */
        ENEMY_Y: 0.5,
        SOLDIER_Y: 1.0,
        HERO_Y: 1.0,
        /** 金币默认高度（Y） */
        COIN_Y: 0.5,
        /** 远程武器子弹出生高度偏移 */
        PROJECTILE_SPAWN_OFFSET_Y: 1.0,
        /** 单位刚体阻尼 */
        UNIT_LINEAR_DAMPING: 0.5,
    },

    // === 经济系统 ===
    ECONOMY: {
        /** 初始金币 */
        INITIAL_COINS: 100,
        /** 金币飞行到HUD的时间（秒） */
        COIN_FLY_DURATION: 0.5,
        /** 金币收集范围 (3D units) */
        COIN_COLLECT_RANGE: 2.5,
        /** 金币磁吸速度 */
        COIN_MAGNET_SPEED: 15.0,
        /** 金币自动回收时间（秒） */
        COIN_LIFETIME: 15,
        /** 金币浮动动画速度 */
        COIN_FLOAT_SPEED: 5,
        /** 金币浮动动画幅度 */
        COIN_FLOAT_AMPLITUDE: 0.1,
        /** 金币吸附时的高度偏移（更像吸到身体中心） */
        COIN_MAGNET_HEIGHT_OFFSET: 0.5,
    },

    // === 建筑系统 ===
    BUILDING: {
        /** 兵营产兵间隔（秒）（legacy fallback） */
        SPAWN_INTERVAL: 4.5,
        /** 兵营最大产兵数（legacy fallback） */
        MAX_SOLDIERS_PER_BARRACKS: 3,
        /** 建筑血量（legacy fallback） */
        BASE_HP: 500,
        /** 基地初始血量（与建筑默认 HP 区分，避免误改） */
        BASE_START_HP: 100,
        /** 全局默认升级上限 */
        DEFAULT_MAX_LEVEL: 5,
        /** 全局默认升级成本倍率 */
        DEFAULT_COST_MULTIPLIER: 1.45,
        /**
         * 建筑类型配置
         * NOTE: 建筑战斗/成长数值统一维护在这里，避免分散硬编码。
         */
        TYPES: {
            barracks: {
                name: '兵营',
                cost: 6,
                buildTime: 0,
                description: '自动生产士兵，稳定提供前线肉盾',
                role: 'barracks',
                visual: {
                    colorHex: '#64B464',
                    scale: { x: 0.45, y: 0.45, z: 0.45 },
                },
                stats: {
                    hp: 180,
                },
                features: {
                    spawnInterval: 4.5,
                    maxUnits: 3,
                },
                upgrades: {
                    maxLevel: 5,
                    costMultiplier: 1.4,
                    statMultiplier: 1.18,
                    spawnIntervalMultiplier: 0.92,
                    maxUnitsPerLevel: 1,
                },
            },
            tower: {
                name: '机炮塔',
                cost: 10,
                buildTime: 0,
                description: '高频单体输出，稳定击杀前排目标',
                role: 'tower',
                visual: {
                    colorHex: '#DCDC3C',
                    scale: { x: 0.4, y: 0.8, z: 0.4 },
                },
                stats: {
                    hp: 300,
                    attackRange: 18,
                    attackDamage: 26,
                    attackInterval: 0.45,
                },
                upgrades: {
                    maxLevel: 5,
                    costMultiplier: 1.45,
                    statMultiplier: 1.2,
                    attackMultiplier: 1.22,
                    rangeMultiplier: 1.03,
                    intervalMultiplier: 0.95,
                },
            },
            frost_tower: {
                name: '冰霜塔',
                cost: 12,
                buildTime: 0,
                description: '范围减速并补伤害，负责控场',
                role: 'tower',
                visual: {
                    colorHex: '#3C64DC',
                    scale: { x: 0.4, y: 0.8, z: 0.4 },
                },
                stats: {
                    hp: 280,
                    attackRange: 16,
                    attackDamage: 12,
                    attackInterval: 0.8,
                },
                features: {
                    bulletColorHex: '#0096FF',
                    bulletExplosionRadius: 2.8,
                    bulletSlowPercent: 0.45,
                    bulletSlowDuration: 2.2,
                },
                upgrades: {
                    maxLevel: 5,
                    costMultiplier: 1.45,
                    statMultiplier: 1.18,
                    attackMultiplier: 1.15,
                    rangeMultiplier: 1.03,
                    intervalMultiplier: 0.96,
                },
            },
            lightning_tower: {
                name: '闪电塔',
                cost: 14,
                buildTime: 0,
                description: '弹射打击，适合清理中后排',
                role: 'tower',
                visual: {
                    colorHex: '#800080',
                    scale: { x: 0.4, y: 0.8, z: 0.4 },
                },
                stats: {
                    hp: 260,
                    attackRange: 17,
                    attackDamage: 20,
                    attackInterval: 0.95,
                },
                features: {
                    chainCount: 2,
                    chainRange: 6,
                    bulletColorHex: '#A020F0',
                },
                upgrades: {
                    maxLevel: 5,
                    costMultiplier: 1.48,
                    statMultiplier: 1.2,
                    attackMultiplier: 1.2,
                    rangeMultiplier: 1.03,
                    intervalMultiplier: 0.95,
                    chainRangePerLevel: 0.5,
                },
            },
            farm: {
                name: '回收工坊',
                cost: 18,
                buildTime: 0,
                description: '将残骸转化为额外资源',
                role: 'building',
                visual: {
                    colorHex: '#8B4513',
                    scale: { x: 0.6, y: 0.3, z: 0.6 },
                },
                stats: {
                    hp: 150,
                },
                features: {
                    incomePerTick: 2,
                    incomeInterval: 6,
                },
                upgrades: {
                    maxLevel: 5,
                    costMultiplier: 1.42,
                    statMultiplier: 1.18,
                    incomeMultiplier: 1.25,
                },
            },
            wall: {
                name: '焊接墙',
                cost: 6,
                buildTime: 0,
                description: '高生命值防线，拖住敌人推进',
                role: 'building',
                visual: {
                    colorHex: '#808080',
                    scale: { x: 0.8, y: 0.8, z: 0.8 },
                },
                stats: {
                    hp: 1100,
                },
                upgrades: {
                    maxLevel: 5,
                    costMultiplier: 1.35,
                    statMultiplier: 1.25,
                },
            },
        },
        /**
         * 初始建造点配置 (World XZ)
         * NOTE: 扩展新建造点请优先修改此处，避免在 GameController 中硬编码。
         */
        PADS: [
            { x: -13, z: -6, type: 'barracks' },
            { x: -5, z: -6, type: 'lightning_tower' },
            { x: -13, z: -12, type: 'frost_tower' },
            { x: -5, z: -12, type: 'tower' },
            { x: -9, z: -3, type: 'wall' },
            { x: -11, z: -3, type: 'wall' },
            { x: -7, z: -3, type: 'wall' },
        ],
    },

    // === 士兵系统 ===
    SOLDIER: {
        /** 基础移动速度 (units/second) - Was 100/60 ~ 1.6 */
        MOVE_SPEED: 3.5,
        /** 基础攻击力 */
        BASE_ATTACK: 10,
        /** 基础血量 */
        BASE_HP: 50,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 1,
        /** 攻击范围 (3D units) */
        ATTACK_RANGE: 1.5,
    },

    // === 敌人系统 ===
    ENEMY: {
        /** 基础移动速度 - Was 60/60 ~ 1 */
        MOVE_SPEED: 2.5,
        /** 基础攻击力 */
        BASE_ATTACK: 8,
        /** 基础血量 */
        BASE_HP: 30,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 1.2,
        /** 攻击范围 */
        ATTACK_RANGE: 1.2,
        /** 死亡掉落金币 */
        COIN_DROP: 5,
        /** 死亡掉落随机浮动 */
        COIN_DROP_VARIANCE: 3,
        /** 精英敌人数值倍率 */
        ELITE: {
            HP_MULTIPLIER: 3.2,
            ATTACK_MULTIPLIER: 1.4,
            SPEED_MULTIPLIER: 1.1,
            SCALE_MULTIPLIER: 1.35,
            COIN_DROP_MULTIPLIER: 3.0,
        },
    },

    // === 英雄系统 ===
    HERO: {
        /** 基础血量 */
        BASE_HP: 200,
        /** 基础攻击力 */
        BASE_ATTACK: 25,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 0.8,
        /** 攻击范围 */
        ATTACK_RANGE: 2.5,
        /** 移动速度 - Was 120/60 ~ 2. Now using Physics Velocity directly */
        MOVE_SPEED: 6.0,
        /**
         * 模型资源配置
         * 说明：
         * - glb 必须放在 assets/resources 下
         * - Prefab 子资源路径格式：character/<glb_name>/<glb_name>
         * - AnimationClip 子资源路径格式：character/<glb_name>/<clip_name>
         */
        MODEL_PRESET: 'meshy',
        MODEL_PRESETS: {
            meshy: {
                key: 'meshy',
                prefab: {
                    path: 'character/Meshy_AI_Animation_Running_withSkin/Meshy_AI_Animation_Running_withSkin',
                    fallbacks: ['character/Meshy_AI_Animation_Running_withSkin'],
                },
                clips: {
                    run: {
                        path: 'character/Meshy_AI_Animation_Running_withSkin/Armature|running|baselayer',
                        fallbacks: ['character/Meshy_AI_Animation_Running_withSkin'],
                    },
                    idle: {
                        path: 'character/Meshy_AI_Animation_Idle_withSkin/Armature|Idle|baselayer',
                        fallbacks: ['character/Meshy_AI_Animation_Idle_withSkin'],
                    },
                },
                transform: {
                    scale: 2.0,
                    offsetY: 0.0,
                    rotY: 180,
                },
                animRootScale: {
                    lock: true,
                    scale: 1.0,
                },
                stack: {
                    offsetY: 2.2,
                    itemHeight: 0.15,
                    itemScale: 0.6,
                },
            },
        },
        /** 角色模型缩放（legacy fallback） */
        MODEL_SCALE: 2.0,
        /** 角色模型高度偏移（legacy fallback） */
        MODEL_OFFSET_Y: 0.0,
        /** 角色模型朝向偏移（Y轴角度，度）（legacy fallback） */
        MODEL_ROT_Y: 180,
        /** 金币堆叠容器高度 */
        STACK_OFFSET_Y: 2.2,
        /** 金币堆叠间距 */
        STACK_ITEM_HEIGHT: 0.15,
        /** 金币堆叠缩放 */
        STACK_ITEM_SCALE: 0.6,
        /** 锁定动画根节点缩放，避免不同动画导致大小变化（legacy fallback） */
        LOCK_ANIM_ROOT_SCALE: true,
        /** 动画根节点锁定缩放值（legacy fallback） */
        ANIM_ROOT_SCALE: 1.0,
    },

    // === 波次系统 ===
    WAVE: {
        /** 波次间隔（秒） */
        WAVE_INTERVAL: 5,
        /** 敌人生成间隔（秒） */
        SPAWN_INTERVAL: 0.5,
        /** 每波难度递增系数 */
        DIFFICULTY_MULTIPLIER: 1.1,
        /**
         * 无限波次模式参数
         * NOTE: 仅用于 gameplay/wave/WaveManager (Infinite Mode)。
         */
        INFINITE: {
            BASE_COUNT: 6,
            COUNT_PER_WAVE: 1,
            COUNT_GROWTH_STEP_WAVES: 5,
            COUNT_GROWTH_STEP_BONUS: 2,
            BASE_HP_MULT: 1,
            HP_MULT_PER_WAVE: 0.16,
            BASE_SPEED_MULT: 1,
            SPEED_MULT_PER_WAVE: 0.015,
            MAX_SPEED_MULT: 1.45,
            BASE_SPAWN_INTERVAL: 0.95,
            SPAWN_INTERVAL_DECAY_PER_WAVE: 0.03,
            MIN_SPAWN_INTERVAL: 0.35,
            BONUS_PER_WAVE: 20,
            BONUS_GROWTH_PER_WAVE: 4,
            SPAWN_RANGE: 6,
            ELITE: {
                START_WAVE: 4,
                INTERVAL: 3,
                BASE_COUNT: 1,
                COUNT_GROWTH_STEP_WAVES: 6,
                MAX_COUNT: 3,
                SPAWN_EVERY: 5,
            },
        },
    },

    // === 对象池 ===
    POOL: {
        /** 敌人预创建数量 */
        ENEMY_INITIAL_SIZE: 30,
        /** 士兵预创建数量 */
        SOLDIER_INITIAL_SIZE: 20,
        /** 金币预创建数量 */
        COIN_INITIAL_SIZE: 50,
        /** 特效预创建数量 */
        EFFECT_INITIAL_SIZE: 20,
    },

    // === 战斗系统 ===
    COMBAT: {
        /** 碰撞检测网格大小 */
        GRID_CELL_SIZE: 64,
        /** 伤害数字显示时间 */
        DAMAGE_NUMBER_DURATION: 0.8,
        /** 战斗系统的目标检测间隔 */
        TARGET_CHECK_INTERVAL: 0.5,
    },
} as const;

/** 游戏配置类型 */
export type GameConfigType = typeof GameConfig;
