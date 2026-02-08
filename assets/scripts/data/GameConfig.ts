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

    // === VFX 视觉参数 ===
    VFX: {
        CANNON_BEAM: {
            maxLevel: 5,
            beamColorStart: [255, 120, 40, 255],
            beamColorEnd: [255, 70, 30, 255],
            coreColorStart: [255, 245, 220, 255],
            coreColorEnd: [255, 255, 255, 255],
            width: { base: 0.22, perLevel: 0.05 },
            duration: { base: 0.1, perLevel: 0.015 },
            beamWidth: { base: 0.1, perLevel: 0.01 },
            glowWidth: { base: 0.55, perLevel: 0.05 },
            pulseSpeed: { base: 6.0, perLevel: 0.4 },
            pulseScale: { base: 0.18, perLevel: 0.03 },
            noiseScale: { base: 9.0, perLevel: 1.2 },
            noiseAmp: { base: 0.025, perLevel: 0.004 },
            intensity: { base: 2.2, perLevel: 0.5 },
            fadeIn: 0.03,
            fadeOut: 0.05,
        },
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
        /** 升级投放区（建造后）参数 */
        UPGRADE_PAD: {
            /** 投放区半径（视觉与触发区共用） */
            RADIUS: 0.6,
            /** 建筑“前方”方向（世界坐标） */
            FORWARD_DIR: { x: 0, z: 1 },
            /** 与建筑前缘的额外间距 */
            GAP: 0.2,
        },
        /** 基地升级系统 */
        BASE_UPGRADE: {
            /** 基地升级起始花费（英雄携带金币） */
            START_COST: 20,
            /** 基地升级花费倍率 */
            COST_MULTIPLIER: 1.6,
            /** 基地最大等级 */
            MAX_LEVEL: 5,
            /** 每次升级基地血量倍率 */
            HP_MULTIPLIER: 1.45,
            /** 基地自动收集金币半径 */
            COLLECT_RADIUS: 3.0,
            /** 每次收集金币数量 */
            COLLECT_RATE: 2,
            /** 收集间隔（秒） */
            COLLECT_INTERVAL: 0.1,
            /** 基地每次升级对英雄的增益 */
            HERO_BUFF: {
                HP_MULTIPLIER: 1.12,
                ATTACK_MULTIPLIER: 1.12,
                ATTACK_INTERVAL_MULTIPLIER: 0.97,
                MOVE_SPEED_MULTIPLIER: 1.03,
                ATTACK_RANGE_BONUS: 0.1,
                HEAL_PERCENT: 0.35,
            },
        },
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
        /** 攻击范围（近战默认：需要贴近目标） */
        ATTACK_RANGE: 0.85,
        /** 索敌范围（仅用于锁定目标，不代表可造成伤害） */
        AGGRO_RANGE: 3.0,
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
        BASE_HP: 60,
        /** 基础攻击力 */
        BASE_ATTACK: 12,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 0.9,
        /** 攻击范围 */
        ATTACK_RANGE: 2.5,
        /** 移动速度 */
        MOVE_SPEED: 5.5,
        /** 暴击率 (0~1) */
        CRIT_RATE: 0.05,
        /** 暴击伤害倍率 (1.5 = 150%) */
        CRIT_DAMAGE: 1.5,
        /**
         * 模型资源配置
         * 说明：
         * - 角色模型资源必须放在 assets/resources 下
         * - Prefab 子资源路径格式：character/<model_name>/<prefab_name>
         * - AnimationClip 子资源路径格式：character/<model_name>/<clip_name>
         */
        MODEL_PRESET: 'firingRifle',
        MODEL_PRESETS: {
            firingRifle: {
                key: 'firingRifle',
                prefab: {
                    path: 'character/Firing Rifle Run Compressed/out/out',
                },
                clips: {
                    run: {
                        path: 'character/Firing Rifle Run Compressed/out/mixamo.com',
                    },
                    idle: {
                        path: 'character/Firing Rifle Idle Compressed/out/mixamo.com',
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
        /** 英雄武器挂点可视模型（按武器类型切换显示） */
        WEAPON_VISUALS: {
            machine_gun: {
                handBone: 'mixamorig:RightHand',
                prefab: {
                    path: 'weapons/blaster-h/blaster-h',
                    fallbacks: [],
                },
                transform: {
                    position: { x: 0.03, y: 0.01, z: -0.14 },
                    rotation: { x: 0, y: 0, z: 90 },
                    scale: 1.6,
                },
            },
            flamethrower: {
                handBone: 'mixamorig:RightHand',
                prefab: {
                    path: 'weapons/blaster-h/blaster-h',
                    fallbacks: [],
                },
                transform: {
                    position: { x: 0.03, y: 0.01, z: -0.14 },
                    rotation: { x: 0, y: 0, z: 90 },
                    scale: 1.6,
                },
            },
        },
        /** 武器挂点调试配置（仅调试用） */
        WEAPON_VISUAL_DEBUG: {
            /** true: 忽略当前武器类型，两把枪都常显 */
            FORCE_SHOW_ALL: false,
        },
        /** 武器挂点运行时修正（按状态附加） */
        WEAPON_VISUAL_RUNTIME: {
            /** 仅在 run 状态附加的 Y 偏移（负值 = 更低） */
            RUN_SOCKET_OFFSET_Y: 0.08,
            /** 基于角色世界右方向的恒定偏移（用于从左肩移到右肩） */
            WORLD_RIGHT_OFFSET: 0.08,
            /** 手骨到英雄根节点的最大合理距离平方（超出视为绑定异常） */
            MAX_BONE_DISTANCE_SQ: 16,
            /** 挂点到英雄根节点的最大合理距离平方（超出强制回拉） */
            MAX_SOCKET_DISTANCE_SQ: 25,
            /** 用于判断“是否在移动”的位移阈值平方 */
            MOVEMENT_DETECT_EPSILON_SQ: 0.0004,
            /** 启动阶段强制追手骨的帧数（用于缩短武器落地可见时间） */
            STARTUP_SNAP_FRAMES: 12,
            /** 是否使用骨骼位置跟随（true = 位置跟手骨，参数调节更直观） */
            FOLLOW_BONE_POSITION: true,
            /** 是否使用骨骼旋转跟随（false = 跟角色朝向，避免骨骼姿态引入90度偏转） */
            FOLLOW_BONE_ROTATION: false,
            /** 向右移动时，额外把枪往屏幕外侧推一点 */
            RIGHT_MOVE_SOCKET_OFFSET: { x: 0.0, y: 0.0, z: 0.0 },
            /** 判定“向右移动”的最小 X 位移阈值 */
            RIGHT_MOVE_DETECT_X: 0.002,
            /** X 分量相对 Z 分量的主导系数（越大越严格） */
            RIGHT_MOVE_DOMINANCE: 0.6,
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

    // === 英雄成长系统 ===
    HERO_LEVEL: {
        /** 最大等级 */
        MAX_LEVEL: 30,
        /** 升级所需经验基础值 */
        XP_BASE: 20,
        /** 每级经验增长倍率 */
        XP_GROWTH: 1.18,
        /** 击杀普通敌人获得的经验 */
        XP_PER_KILL: 5,
        /** 击杀精英敌人获得的经验 */
        XP_PER_ELITE_KILL: 20,
        /**
         * 每级属性增长（复合倍率 / 加算）
         * multiply: 每级乘算倍率（如 1.08 = +8%/级）
         * add:      每级加算值
         * cap:      属性上限（可选）
         */
        GROWTH: {
            maxHp: { multiply: 1.03 },
            attack: { multiply: 1.08 },
            critRate: { add: 0.012, cap: 0.5 },
            critDamage: { add: 0.06 },
            moveSpeed: { multiply: 1.015 },
            attackRange: { multiply: 1.005 },
            attackInterval: { multiply: 0.985 },
        } as Record<string, { multiply?: number; add?: number; cap?: number }>,
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
         * 设计原则：敌人成长略快于英雄，迫使玩家利用建筑和卡牌体系
         */
        INFINITE: {
            BASE_COUNT: 30,
            COUNT_PER_WAVE: 6,
            COUNT_GROWTH_STEP_WAVES: 3,
            COUNT_GROWTH_STEP_BONUS: 8,
            BASE_HP_MULT: 1,
            HP_MULT_PER_WAVE: 0.18,
            BASE_ATTACK_MULT: 1,
            ATTACK_MULT_PER_WAVE: 0.1,
            BASE_SPEED_MULT: 1,
            SPEED_MULT_PER_WAVE: 0.015,
            MAX_SPEED_MULT: 1.55,
            BASE_SPAWN_INTERVAL: 0.35,
            SPAWN_INTERVAL_DECAY_PER_WAVE: 0.02,
            MIN_SPAWN_INTERVAL: 0.12,
            BONUS_PER_WAVE: 20,
            BONUS_GROWTH_PER_WAVE: 4,
            SPAWN_RANGE: 8,
            /**
             * 固定刷怪口设置
             * - 基于“离基地最近角之外”的三个方向生成刷怪口
             * - 三个刷怪口与基地保持等距，并按波次逐步解锁
             * - 通过边缘留白避免刷在地图最角落
             */
            SPAWN_PORTALS: {
                /** 第 2 个刷怪口解锁波次（含） */
                OPEN_WAVE_2: 4,
                /** 第 3 个刷怪口解锁波次（含） */
                OPEN_WAVE_3: 8,
                /** 刷怪口距离地图边缘的最小留白（世界坐标） */
                EDGE_MARGIN: 4.0,
                /** 共享刷怪半径比例（1 = 顶到边缘留白线） */
                DISTANCE_FACTOR: 0.9,
                /** 每个刷怪口的随机抖动半径 */
                JITTER_RADIUS: 1.2,
            },
            ELITE: {
                START_WAVE: 3,
                INTERVAL: 2,
                BASE_COUNT: 1,
                COUNT_GROWTH_STEP_WAVES: 4,
                MAX_COUNT: 6,
                SPAWN_EVERY: 4,
            },
        },
    },

    // === 肉鸽卡牌系统 ===
    // 稀有度: gold(金) = 高词条+高数值, purple(紫) = 中词条+中数值, blue(蓝) = 低词条+低数值
    BUFF_CARDS: {
        /** 每次升级展示的卡牌数量 */
        PICK_COUNT: 3,

        /** 稀有度颜色映射（边框 + 顶部色条） */
        RARITY_COLORS: {
            gold: '#FFD700',
            purple: '#B24BF3',
            blue: '#4A9FD9',
        } as Record<string, string>,

        /** 卡牌定义（id 全局唯一，rarity 决定颜色与强度） */
        POOL: [
            // ========== 蓝色卡牌 (Blue) — 1 词条，数值较低 ==========
            {
                id: 'blue_attack',
                name: '锋刃磨砺',
                rarity: 'blue',
                effects: { attack: { multiply: 1.1 } },
            },
            {
                id: 'blue_speed',
                name: '迅捷之风',
                rarity: 'blue',
                effects: { moveSpeed: { multiply: 1.08 } },
            },
            {
                id: 'blue_range',
                name: '精准射击',
                rarity: 'blue',
                effects: { attackRange: { add: 0.15 } },
            },
            {
                id: 'blue_rapid',
                name: '快速连击',
                rarity: 'blue',
                effects: { attackInterval: { multiply: 0.95 } },
            },
            {
                id: 'blue_crit_chance',
                name: '锐利直觉',
                rarity: 'blue',
                effects: { critRate: { add: 0.05 } },
            },
            {
                id: 'blue_crit_power',
                name: '致命一击',
                rarity: 'blue',
                effects: { critDamage: { add: 0.2 } },
            },

            // ========== 紫色卡牌 (Purple) — 2~3 词条，数值适中 ==========
            {
                id: 'purple_warrior',
                name: '战士之力',
                rarity: 'purple',
                effects: {
                    attack: { multiply: 1.15 },
                    critRate: { add: 0.05 },
                },
            },
            {
                id: 'purple_hunter',
                name: '疾风猎手',
                rarity: 'purple',
                effects: {
                    moveSpeed: { multiply: 1.12 },
                    attackInterval: { multiply: 0.92 },
                },
            },
            {
                id: 'purple_assassin',
                name: '暗影刺客',
                rarity: 'purple',
                effects: {
                    critRate: { add: 0.08 },
                    critDamage: { add: 0.3 },
                },
            },
            {
                id: 'purple_sniper',
                name: '远程精通',
                rarity: 'purple',
                effects: {
                    attackRange: { add: 0.25 },
                    attack: { multiply: 1.1 },
                },
            },
            {
                id: 'purple_training',
                name: '全面训练',
                rarity: 'purple',
                effects: {
                    attack: { multiply: 1.08 },
                    moveSpeed: { multiply: 1.05 },
                    critRate: { add: 0.03 },
                },
            },

            // ========== 金色卡牌 (Gold) — 3~5 词条，数值很高 ==========
            {
                id: 'gold_wargod',
                name: '战神降临',
                rarity: 'gold',
                effects: {
                    attack: { multiply: 1.25 },
                    attackInterval: { multiply: 0.9 },
                    attackRange: { add: 0.2 },
                },
            },
            {
                id: 'gold_deathblow',
                name: '死神之手',
                rarity: 'gold',
                effects: {
                    critRate: { add: 0.12 },
                    critDamage: { add: 0.5 },
                    attack: { multiply: 1.1 },
                },
            },
            {
                id: 'gold_berserker',
                name: '狂战之魂',
                rarity: 'gold',
                effects: {
                    attack: { multiply: 1.2 },
                    attackInterval: { multiply: 0.92 },
                    moveSpeed: { multiply: 1.08 },
                    critRate: { add: 0.05 },
                },
            },
            {
                id: 'gold_perfection',
                name: '完美强化',
                rarity: 'gold',
                effects: {
                    attack: { multiply: 1.12 },
                    attackInterval: { multiply: 0.95 },
                    moveSpeed: { multiply: 1.06 },
                    attackRange: { add: 0.1 },
                    critRate: { add: 0.06 },
                    critDamage: { add: 0.25 },
                },
            },
        ],
    },

    // === 空投武器系统 ===
    WEAPON_SYSTEM: {
        /** 每次空投展示的武器数量 */
        PICK_COUNT: 3,
        /** 空投箱下落速度 */
        CRATE_FALL_SPEED: 8,
        /** 空投箱停留高度 (Y) */
        CRATE_LAND_Y: 0.5,
        /** 空投随机偏移范围 (相对于基地) */
        AIRDROP_RANGE: 5,
        /** 武器最大等级 */
        MAX_WEAPON_LEVEL: 5,

        /** 武器定义 */
        WEAPONS: {
            machine_gun: {
                id: 'machine_gun',
                name: '寡妇制造者',
                description: '高射速曳光机枪，以炽热弹幕切割敌人',
                iconColor: '#FF4500',
                levels: [
                    { damage: 8, attackInterval: 0.12, range: 6.5, projectileSpeed: 28, spread: 4 },
                    {
                        damage: 10,
                        attackInterval: 0.1,
                        range: 7,
                        projectileSpeed: 30,
                        spread: 5,
                    },
                    {
                        damage: 12,
                        attackInterval: 0.08,
                        range: 7.5,
                        projectileSpeed: 32,
                        spread: 6,
                    },
                    {
                        damage: 15,
                        attackInterval: 0.06,
                        range: 8,
                        projectileSpeed: 34,
                        spread: 7,
                    },
                    {
                        damage: 18,
                        attackInterval: 0.04,
                        range: 8.5,
                        projectileSpeed: 36,
                        spread: 8,
                    },
                ],
            },
            flamethrower: {
                id: 'flamethrower',
                name: '堆肥喷火器',
                description: '喷射粘稠废油，抛物线落地后猛烈燃烧',
                iconColor: '#8B0000',
                levels: [
                    {
                        damage: 15,
                        attackInterval: 0.3,
                        range: 3,
                        projectileSpeed: 10,
                        gravity: 8,
                        burnDuration: 1.5,
                    },
                    {
                        damage: 20,
                        attackInterval: 0.27,
                        range: 3.5,
                        projectileSpeed: 11,
                        gravity: 8,
                        burnDuration: 2.0,
                    },
                    {
                        damage: 26,
                        attackInterval: 0.24,
                        range: 4,
                        projectileSpeed: 12,
                        gravity: 7,
                        burnDuration: 2.5,
                    },
                    {
                        damage: 33,
                        attackInterval: 0.21,
                        range: 4.5,
                        projectileSpeed: 13,
                        gravity: 7,
                        burnDuration: 3.0,
                    },
                    {
                        damage: 42,
                        attackInterval: 0.18,
                        range: 5,
                        projectileSpeed: 14,
                        gravity: 6,
                        burnDuration: 3.5,
                    },
                ],
            },
            cannon: {
                id: 'cannon',
                name: '断桩机加农炮',
                description: '发射旋转螺纹钢，巨大冲击力附带范围伤害',
                iconColor: '#708090',
                levels: [
                    {
                        damage: 40,
                        attackInterval: 1.2,
                        range: 9,
                        projectileSpeed: 18,
                        explosionRadius: 1.5,
                        spinSpeed: 15,
                    },
                    {
                        damage: 55,
                        attackInterval: 1.1,
                        range: 9.5,
                        projectileSpeed: 19,
                        explosionRadius: 1.8,
                        spinSpeed: 18,
                    },
                    {
                        damage: 72,
                        attackInterval: 1.0,
                        range: 10,
                        projectileSpeed: 20,
                        explosionRadius: 2.1,
                        spinSpeed: 20,
                    },
                    {
                        damage: 92,
                        attackInterval: 0.9,
                        range: 10.5,
                        projectileSpeed: 21,
                        explosionRadius: 2.5,
                        spinSpeed: 22,
                    },
                    {
                        damage: 115,
                        attackInterval: 0.8,
                        range: 11,
                        projectileSpeed: 22,
                        explosionRadius: 3.0,
                        spinSpeed: 25,
                    },
                ],
            },
            glitch_wave: {
                id: 'glitch_wave',
                name: '模拟回音',
                description: '释放故障能量波，对范围内所有敌人造成伤害',
                iconColor: '#00FFFF',
                levels: [
                    { damage: 30, attackInterval: 2.0, range: 5, waveSpeed: 8, waveRadius: 4 },
                    { damage: 42, attackInterval: 1.8, range: 5.5, waveSpeed: 9, waveRadius: 4.5 },
                    { damage: 56, attackInterval: 1.6, range: 6, waveSpeed: 10, waveRadius: 5 },
                    { damage: 72, attackInterval: 1.4, range: 6.5, waveSpeed: 11, waveRadius: 5.5 },
                    { damage: 90, attackInterval: 1.2, range: 7, waveSpeed: 12, waveRadius: 6 },
                ],
            },
        } as Record<string, any>,
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
