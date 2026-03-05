import { TikTokRewardAdSlot, TIKTOK_REWARDED_AD_PLACEMENTS } from '../reddit/TikTokAdsConfig';

/**
 * TikTokAdService
 * 封装 TikTok 激励广告的加载、展示和奖励回调。
 * 仅在 TikTok Minis 环境下可用。
 */
export class TikTokAdService {
    private static _lastCloseRewarded = false;
    private static _lastCloseHandled = false;
    private static _sessionUnlockSlots: Set<TikTokRewardAdSlot> = new Set();

    public static resetSessionUnlocks(): void {
        this._sessionUnlockSlots.clear();
    }

    public static unlockSessionSlot(slot: TikTokRewardAdSlot): void {
        this._sessionUnlockSlots.add(slot);
    }

    public static isSessionSlotUnlocked(slot: TikTokRewardAdSlot): boolean {
        return this._sessionUnlockSlots.has(slot);
    }

    public static wasLastAdCancelled(): boolean {
        return this._lastCloseHandled && !this._lastCloseRewarded;
    }

    private static markCloseResult(rewarded: boolean): void {
        this._lastCloseHandled = true;
        this._lastCloseRewarded = rewarded;
    }

    private static markNonCloseFailure(): void {
        this._lastCloseHandled = false;
        this._lastCloseRewarded = false;
    }

    private static handleAdError(err: any, slot: TikTokRewardAdSlot): void {
        const errorCode = Number(err?.errorCode);
        const subErrorCode = Number(err?.subErrorCode);

        if (errorCode === 20003 && subErrorCode === 20001) {
            this.showToast(
                'Ad placement inactive. Please enable this placement in TikTok Console.'
            );
            console.warn(
                `[TikTokAdService] Placement inactive for slot=${slot}. Check Monetization > In-App Ads > Ad placements.`
            );
            return;
        }

        this.showToast('Ad is temporarily unavailable. Please try again later.');
    }

    private static offIfPossible(
        adInstance: any,
        eventName: 'offClose' | 'offError',
        fn: any
    ): void {
        if (typeof adInstance?.[eventName] === 'function') {
            adInstance[eventName](fn);
        }
    }

    private static showWithBestEffort(adInstance: any): Promise<void> {
        if (typeof adInstance?.show !== 'function') {
            return Promise.reject(new Error('Rewarded ad instance has no show()'));
        }

        const runShow = () => {
            const showResult = adInstance.show();
            if (showResult && typeof showResult.then === 'function') {
                return showResult;
            }
            return Promise.resolve();
        };

        if (typeof adInstance?.load !== 'function') {
            // Some TikTok runtimes only expose show() without load().
            return runShow();
        }

        const loadResult = adInstance.load();
        if (loadResult && typeof loadResult.then === 'function') {
            return loadResult.then(() => runShow());
        }

        return runShow();
    }

    /** 检测当前是否运行在 TikTok 环境 */
    public static isTikTokRuntime(): boolean {
        const g = globalThis as any;
        return g?.__GVR_PLATFORM__ === 'tiktok' || typeof g?.tt !== 'undefined';
    }

    /** 检测 TikTok 广告 SDK 是否可用 */
    public static isAdAvailable(): boolean {
        if (!this.isTikTokRuntime()) return false;
        const g = globalThis as any;
        return typeof g?.tt?.createRewardedVideoAd === 'function';
    }

    /** 在 TikTok 端显示轻提示 */
    public static showToast(message: string): void {
        const g = globalThis as any;
        try {
            if (typeof g?.tt?.showToast === 'function') {
                g.tt.showToast({
                    title: message,
                    icon: 'none',
                    duration: 1500,
                });
                return;
            }
        } catch (err) {
            console.warn('[TikTokAdService] showToast failed:', err);
        }
        console.warn(`[TikTokAdService] ${message}`);
    }

    /**
     * 展示激励广告并等待结果
     * @param slot 广告位标识
     * @returns true 表示用户看完广告获得奖励，false 表示中途关闭或出错
     */
    public static showRewardedAd(slot: TikTokRewardAdSlot): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this.markNonCloseFailure();
            if (!this.isAdAvailable()) {
                console.warn('[TikTokAdService] Ad SDK not available');
                this.showToast('Ad is temporarily unavailable. Please try again later.');
                resolve(false);
                return;
            }

            const placementId = TIKTOK_REWARDED_AD_PLACEMENTS[slot];
            if (!placementId) {
                console.warn(`[TikTokAdService] No placement ID for slot: ${slot}`);
                this.showToast('Ad placement is not configured yet.');
                resolve(false);
                return;
            }

            const tt = (globalThis as any).tt;

            try {
                // TikTok rewardedVideoAd 实例只能展示一次；每次展示都新建实例
                const adInstance = tt.createRewardedVideoAd({ adUnitId: placementId });

                let settled = false;
                const settleOnce = (rewarded: boolean) => {
                    if (settled) return;
                    settled = true;
                    resolve(rewarded);
                };

                // 绑定关闭回调（一次性）
                const onClose = (res: { isEnded: boolean }) => {
                    this.offIfPossible(adInstance, 'offClose', onClose);
                    this.offIfPossible(adInstance, 'offError', onError);
                    const rewarded = res?.isEnded === true;
                    this.markCloseResult(rewarded);
                    console.log(`[TikTokAdService] Ad closed, rewarded=${rewarded}, slot=${slot}`);
                    settleOnce(rewarded);
                };

                const onError = (err: any) => {
                    this.offIfPossible(adInstance, 'offClose', onClose);
                    this.offIfPossible(adInstance, 'offError', onError);
                    this.markNonCloseFailure();
                    console.error(`[TikTokAdService] Ad error for slot=${slot}:`, err);
                    this.handleAdError(err, slot);
                    settleOnce(false);
                };

                if (typeof adInstance?.onClose === 'function') {
                    adInstance.onClose(onClose);
                }
                if (typeof adInstance?.onError === 'function') {
                    adInstance.onError(onError);
                }

                // 加载并展示
                this.showWithBestEffort(adInstance).catch((err: any) => {
                    this.offIfPossible(adInstance, 'offClose', onClose);
                    this.offIfPossible(adInstance, 'offError', onError);
                    this.markNonCloseFailure();
                    console.error(
                        `[TikTokAdService] Failed to load/show ad for slot=${slot}:`,
                        err
                    );
                    this.handleAdError(err, slot);
                    settleOnce(false);
                });
            } catch (err) {
                this.markNonCloseFailure();
                console.error(`[TikTokAdService] Exception for slot=${slot}:`, err);
                this.handleAdError(err, slot);
                resolve(false);
            }
        });
    }
}
