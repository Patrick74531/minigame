import { requestExpandedMode } from '@devvit/web/client';

document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const bgVideo = document.getElementById('bg-video') as HTMLVideoElement | null;

    // Inject first-load notice below play button
    const savedLang = (() => {
        try {
            return localStorage.getItem('kingshit.lang');
        } catch {
            return null;
        }
    })();
    const browserLang = (navigator.language || '').toLowerCase();
    const lang =
        savedLang === 'zh' || savedLang === 'en'
            ? savedLang
            : browserLang.startsWith('zh')
            ? 'zh'
            : 'en';
    const noticeText =
        lang === 'zh'
            ? '首次加载可能需要较长时间，请耐心等待'
            : 'First load may take a while — please be patient';
    const root = document.getElementById('launch-root');
    if (root && playBtn) {
        const notice = document.createElement('p');
        notice.textContent = noticeText;
        notice.style.cssText = [
            'position:absolute',
            'bottom:14%',
            'left:0',
            'right:0',
            'margin:0',
            'text-align:center',
            'font-family:sans-serif',
            'font-size:13px',
            'color:rgba(255,255,255,0.75)',
            'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
            'pointer-events:none',
        ].join(';');
        root.appendChild(notice);
    }

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

    const launchGame = async (event: Event): Promise<void> => {
        try {
            await requestExpandedMode(event as PointerEvent, 'game');
        } catch (err) {
            console.error('[preview] Failed to enter expanded mode:', err);
        }
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
});
