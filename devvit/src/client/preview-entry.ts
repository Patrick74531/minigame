import { requestExpandedMode } from '@devvit/web/client';

document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const launchRoot = document.getElementById('launch-root');

    const launchGame = async (event: Event): Promise<void> => {
        try {
            await requestExpandedMode(event as PointerEvent, 'game');
        } catch (err) {
            console.error('[preview] Failed to enter expanded mode:', err);
        }
    };

    if (playBtn) {
        playBtn.addEventListener('click', async (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            await launchGame(event);
        });
    }

    if (launchRoot) {
        launchRoot.addEventListener('click', async (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('#play-btn')) return;
            await launchGame(event);
        });
    }
});
