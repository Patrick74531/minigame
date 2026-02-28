/**
 * realtime-bridge.ts
 * 桥接 @devvit/web/client 的 connectRealtime API 到全局 window，
 * 使 Cocos Creator 构建的游戏代码 (CoopNetManager) 可以访问 Devvit Realtime。
 *
 * 由 esbuild 打包为 webroot/realtime-bridge.js，
 * 通过 patch-csp.cjs 注入到 game index.html。
 */
import { connectRealtime, disconnectRealtime, isRealtimeConnected } from '@devvit/realtime/client';

interface DevvitRealtimeBridge {
    connectRealtime: typeof connectRealtime;
    disconnectRealtime: typeof disconnectRealtime;
    isRealtimeConnected: typeof isRealtimeConnected;
}

// Expose on global window for Cocos game code access
(window as any).__DEVVIT_REALTIME__ = {
    connectRealtime,
    disconnectRealtime,
    isRealtimeConnected,
} satisfies DevvitRealtimeBridge;

console.log('[realtime-bridge] Devvit Realtime API exposed on window.__DEVVIT_REALTIME__');
