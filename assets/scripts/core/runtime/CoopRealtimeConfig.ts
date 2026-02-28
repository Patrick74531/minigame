/**
 * CoopRealtimeConfig
 * 双人模式 Realtime V2 特性开关与调参。
 *
 * COOP_REALTIME_V2 默认开启。设为 false 可一键回退旧逻辑。
 */
export const COOP_REALTIME_V2 = true;

export const CoopRealtimeConfig = {
    // ─── 通道 ──────────────────────────────────────────────────────────
    /** Realtime 断线后 fallback 到 /sync 的轮询间隔 (ms) */
    FALLBACK_SYNC_INTERVAL_MS: 200,
    /** Realtime 恢复后自动回切的检测间隔 (ms) */
    REALTIME_RECOVERY_CHECK_MS: 3000,

    // ─── 高频输入 ─────────────────────────────────────────────────────
    /** 位置输入发送频率 (ms)。V2: 50ms；旧: 100ms */
    INPUT_SEND_INTERVAL_MS: 50,
    /** 远程英雄插值平滑速度 */
    INTERP_SMOOTH_SPEED: 12,
    /** 速度外推时间窗 (秒) */
    INTERP_PREDICT_AHEAD: 0.06,
    /** 超过此距离² 直接 snap */
    INTERP_SNAP_DIST_SQ: 225,

    // ─── Seq 缓冲 ─────────────────────────────────────────────────────
    /** 有序事件的 seq 缓冲超时 (ms) */
    SEQ_BUFFER_TIMEOUT_MS: 150,

    // ─── 服务器权威时钟 ──────────────────────────────────────────────
    /** 客户端请求时钟同步间隔 (ms) */
    CLOCK_SYNC_INTERVAL_MS: 5000,
    /** 时钟偏移校正阈值 (ms)。超过此值才做 soft correction */
    CLOCK_DRIFT_THRESHOLD_MS: 50,
    /** 时钟偏移校正速率 (0-1 per sync) */
    CLOCK_CORRECTION_RATE: 0.3,

    // ─── 卡牌限时选择 ─────────────────────────────────────────────────
    /** 卡牌选择超时 (秒) */
    CARD_SELECT_TIMEOUT_SEC: 12,
    /** 武器选择超时 (秒) */
    WEAPON_SELECT_TIMEOUT_SEC: 15,
    /** 道具确认超时 (秒) */
    ITEM_CONFIRM_TIMEOUT_SEC: 10,

    // ─── 监控 ──────────────────────────────────────────────────────────
    /** RTT 采样保留数 */
    MONITOR_RTT_SAMPLES: 20,
    /** 监控日志输出间隔 (ms) */
    MONITOR_LOG_INTERVAL_MS: 10000,
} as const;
