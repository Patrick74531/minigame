import { BALANCE } from './balance';

/**
 * 英雄系统配置
 */
export const HERO_CONFIG = {
    /** 基础血量 */
    BASE_HP: BALANCE.hero.baseHp,
    /** 基础攻击力 */
    BASE_ATTACK: BALANCE.hero.baseAttack,
    /** 攻击间隔（秒） */
    ATTACK_INTERVAL: BALANCE.hero.attackInterval,
    /** 攻击范围 */
    ATTACK_RANGE: BALANCE.hero.attackRange,
    /** 移动速度 */
    MOVE_SPEED: BALANCE.hero.moveSpeed,
    /** 暴击率 (0~1) */
    CRIT_RATE: BALANCE.hero.critRate,
    /** 暴击伤害倍率 (1.5 = 150%) */
    CRIT_DAMAGE: BALANCE.hero.critDamage,
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
                path: 'character/Firing Rifle Run Compressed/out_optimized/out_optimized',
            },
            clips: {
                run: {
                    path: 'character/Firing Rifle Run Compressed/out_optimized/mixamo.com',
                },
                idle: {
                    path: 'character/Firing Rifle Idle Compressed/out_optimized/mixamo.com',
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
} as const;
