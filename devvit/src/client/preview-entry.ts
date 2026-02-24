import { requestExpandedMode } from '@devvit/web/client';

document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const bgVideo = document.getElementById('bg-video') as HTMLVideoElement | null;
    let expandedTriggered = false;

    const tryPlayPreview = (): void => {
        if (!bgVideo) return;
        bgVideo.muted = true;
        bgVideo.defaultMuted = true;
        bgVideo.playsInline = true;
        bgVideo.playbackRate = 0.5;
        const maybePromise = bgVideo.play();
        if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {
                // Ignore autoplay rejections; user interaction path still works.
            });
        }
    };

    const launchGame = async (event?: Event): Promise<void> => {
        if (expandedTriggered) return;
        expandedTriggered = true;
        try {
            await requestExpandedMode((event ?? new PointerEvent('click')) as PointerEvent, 'game');
        } catch (err) {
            expandedTriggered = false;
            console.error('[preview] Failed to enter expanded mode:', err);
        }
    };

    // 自动尝试进入全屏游戏视图（部分 Reddit 客户端允许无手势触发）
    const autoExpand = (): void => {
        if (expandedTriggered) return;
        void launchGame();
    };

    if (bgVideo) {
        bgVideo.setAttribute('muted', '');
        bgVideo.setAttribute('playsinline', '');
        bgVideo.setAttribute('webkit-playsinline', '');
        bgVideo.preload = 'auto';
        bgVideo.addEventListener('loadedmetadata', () => {
            bgVideo.playbackRate = 0.5;
        });
        bgVideo.addEventListener('loadeddata', tryPlayPreview, { once: true });
        bgVideo.addEventListener('canplay', tryPlayPreview, { once: true });
        if (bgVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            tryPlayPreview();
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) tryPlayPreview();
        });
    }

    if (playBtn) {
        playBtn.addEventListener('click', async (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            await launchGame(event);
        });
    }

    // 首次可见时自动尝试扩展，失败则用户点击 Play 按钮降级
    setTimeout(autoExpand, 300);
});
