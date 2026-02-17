import {
    Color,
    Graphics,
    Label,
    Node,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { UIResponsive } from '../UIResponsive';
import { applyGameLabelStyle, HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

const LANE_UNLOCK_DEFAULT_SECONDS = 2.4;
const WAVE_FORECAST_MIN_WIDTH = 420;
const WAVE_FORECAST_MAX_WIDTH = 980;
const WAVE_FORECAST_MIN_HEIGHT = 66;
const WAVE_FORECAST_MAX_HEIGHT = 106;
const LANE_DIALOG_MIN_WIDTH = 520;
const LANE_DIALOG_MAX_WIDTH = 1120;
const LANE_DIALOG_MIN_HEIGHT = 88;
const LANE_DIALOG_MAX_HEIGHT = 156;
const HERO_RESPAWN_MIN_WIDTH = 520;
const HERO_RESPAWN_MAX_WIDTH = 1020;
const HERO_RESPAWN_MIN_HEIGHT = 220;
const HERO_RESPAWN_MAX_HEIGHT = 360;

export type WaveForecastPayload = {
    wave?: number;
    archetypeId?: string;
    lane?: 'left' | 'center' | 'right';
    spawnType?: 'regular' | 'elite' | 'boss';
};

export type LaneUnlockImminentPayload = {
    lane: 'top' | 'mid' | 'bottom';
    focusPosition?: Vec3;
    padFocusPosition?: Vec3;
    remainSeconds?: number;
};

type RespawnMode = 'none' | 'countdown' | 'ready';

export class HUDWaveNoticeModule implements HUDModule {
    private _uiCanvas: Node | null = null;

    private _waveForecastRoot: Node | null = null;
    private _waveForecastLabel: Label | null = null;
    private _waveForecastBg: Graphics | null = null;
    private _waveForecastOpacity: UIOpacity | null = null;
    private _waveForecastWidth = 620;
    private _waveForecastHeight = 66;
    private _waveForecastIsBoss = false;

    private _laneUnlockDialogRoot: Node | null = null;
    private _laneUnlockDialogLabel: Label | null = null;
    private _laneUnlockDialogBg: Graphics | null = null;
    private _laneUnlockDialogOpacity: UIOpacity | null = null;
    private _laneUnlockDialogWidth = 920;
    private _laneUnlockDialogHeight = 96;
    private _laneUnlockDialogToken = 0;

    private _heroRespawnRoot: Node | null = null;
    private _heroRespawnBg: Graphics | null = null;
    private _heroRespawnCountdownLabel: Label | null = null;
    private _heroRespawnMessageLabel: Label | null = null;
    private _heroRespawnOpacity: UIOpacity | null = null;
    private _heroRespawnWidth = 920;
    private _heroRespawnHeight = 260;
    private _heroRespawnToken = 0;

    private _respawnMode: RespawnMode = 'none';
    private _respawnSeconds = 0;

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.createWaveForecastBanner(uiCanvas);
        this.createLaneUnlockDialog(uiCanvas);
        this.createHeroRespawnDialog(uiCanvas);
        this.applyResponsiveLayout();
    }

    public cleanup(): void {
        if (this._waveForecastRoot) {
            Tween.stopAllByTarget(this._waveForecastRoot);
        }
        if (this._waveForecastOpacity) {
            Tween.stopAllByTarget(this._waveForecastOpacity);
        }
        if (this._laneUnlockDialogRoot) {
            Tween.stopAllByTarget(this._laneUnlockDialogRoot);
        }
        if (this._laneUnlockDialogOpacity) {
            Tween.stopAllByTarget(this._laneUnlockDialogOpacity);
        }
        if (this._heroRespawnRoot) {
            Tween.stopAllByTarget(this._heroRespawnRoot);
        }
        if (this._heroRespawnOpacity) {
            Tween.stopAllByTarget(this._heroRespawnOpacity);
        }

        this._uiCanvas = null;
        this._waveForecastRoot = null;
        this._waveForecastLabel = null;
        this._waveForecastBg = null;
        this._waveForecastOpacity = null;

        this._laneUnlockDialogRoot = null;
        this._laneUnlockDialogLabel = null;
        this._laneUnlockDialogBg = null;
        this._laneUnlockDialogOpacity = null;

        this._heroRespawnRoot = null;
        this._heroRespawnBg = null;
        this._heroRespawnCountdownLabel = null;
        this._heroRespawnMessageLabel = null;
        this._heroRespawnOpacity = null;

        this._respawnMode = 'none';
        this._respawnSeconds = 0;
    }

    public onCanvasResize(): void {
        this.applyResponsiveLayout();
    }

    public setVisible(visible: boolean): void {
        // These are transient dialogs, usually we just want to hide them if they are showing.
        // Or if 'visible' is true, we don't necessarily show them (they show on event).
        // So this might just be "force hide" if false.
        if (!visible) {
             if (this._waveForecastRoot) this._waveForecastRoot.active = false;
             if (this._laneUnlockDialogRoot) this._laneUnlockDialogRoot.active = false;
             if (this._heroRespawnRoot) this._heroRespawnRoot.active = false;
        }
    }

    public onLanguageChanged(): void {
        this.applyResponsiveLayout();
        if (this._respawnMode === 'countdown' && this._heroRespawnRoot?.active) {
            this.renderRespawnCountdownText(this._respawnSeconds);
        } else if (this._respawnMode === 'ready' && this._heroRespawnRoot?.active) {
            this.renderRespawnReadyText();
        }
    }

    public showWaveForecast(data: WaveForecastPayload): void {
        const archetypeId = (data.archetypeId ?? '').trim();
        if (!archetypeId) return;

        const lane = data.lane ?? 'center';
        const spawnType = data.spawnType ?? 'regular';
        const enemyName = this.resolveForecastEnemyName(archetypeId);
        const laneName = Localization.instance.t(`ui.waveForecast.lane.${lane}`);
        const header = Localization.instance.t(
            spawnType === 'boss' ? 'ui.waveForecast.header.boss' : 'ui.waveForecast.header.normal'
        );
        const body = Localization.instance.t(
            spawnType === 'boss'
                ? 'ui.waveForecast.message.boss'
                : 'ui.waveForecast.message.normal',
            {
                enemy: enemyName,
                lane: laneName,
            }
        );

        this.showWaveForecastBanner(`${header} ${body}`, spawnType === 'boss');
    }

    public showLaneUnlockImminent(
        data: LaneUnlockImminentPayload,
        playCinematic: (focus: Vec3, padFocus: Vec3 | undefined, holdSeconds: number) => void
    ): void {
        if (!data?.lane) return;

        const laneName = this.resolveLocalizedByKey(`ui.laneRoute.${data.lane}`, data.lane);
        const text = Localization.instance.t('ui.laneUnlock.imminent', { lane: laneName });
        const holdSeconds = Math.max(0.8, data.remainSeconds ?? LANE_UNLOCK_DEFAULT_SECONDS);

        this.showLaneUnlockDialog(text, holdSeconds);

        if (data.focusPosition) {
            playCinematic(data.focusPosition, data.padFocusPosition, holdSeconds);
        }
    }

    public showHeroRespawnCountdown(seconds: number): void {
        if (
            !this._heroRespawnRoot ||
            !this._heroRespawnCountdownLabel ||
            !this._heroRespawnMessageLabel ||
            !this._heroRespawnOpacity
        ) {
            return;
        }

        this._heroRespawnToken += 1;
        this._respawnMode = 'countdown';
        this._respawnSeconds = seconds;

        this._heroRespawnRoot.active = true;
        this._heroRespawnOpacity.opacity = 255;
        this._heroRespawnRoot.setScale(1, 1, 1);
        this.renderRespawnCountdownText(seconds);

        Tween.stopAllByTarget(this._heroRespawnRoot);
        Tween.stopAllByTarget(this._heroRespawnOpacity);
    }

    public updateHeroRespawnCountdown(seconds: number): void {
        if (
            !this._heroRespawnRoot ||
            !this._heroRespawnRoot.active ||
            !this._heroRespawnCountdownLabel ||
            !this._heroRespawnMessageLabel
        ) {
            return;
        }

        this._respawnMode = 'countdown';
        this._respawnSeconds = seconds;
        this.renderRespawnCountdownText(seconds);
    }

    public showHeroRespawnReadyPrompt(): void {
        if (
            !this._heroRespawnRoot ||
            !this._heroRespawnCountdownLabel ||
            !this._heroRespawnMessageLabel ||
            !this._heroRespawnOpacity
        ) {
            return;
        }

        this._heroRespawnToken += 1;
        const token = this._heroRespawnToken;

        this._respawnMode = 'ready';
        this._respawnSeconds = 0;

        this._heroRespawnRoot.active = true;
        this._heroRespawnOpacity.opacity = 255;
        this._heroRespawnRoot.setScale(1, 1, 1);
        this.renderRespawnReadyText();

        Tween.stopAllByTarget(this._heroRespawnRoot);
        Tween.stopAllByTarget(this._heroRespawnOpacity);

        tween(this._heroRespawnRoot)
            .to(0.12, { scale: new Vec3(1.06, 1.06, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._heroRespawnOpacity)
            .delay(2.2)
            .to(0.24, { opacity: 0 })
            .call(() => {
                if (token !== this._heroRespawnToken) return;
                if (this._heroRespawnRoot) {
                    this._heroRespawnRoot.active = false;
                }
                this._respawnMode = 'none';
            })
            .start();
    }

    public hideHeroRespawnCountdown(): void {
        if (!this._heroRespawnRoot || !this._heroRespawnOpacity) return;

        this._heroRespawnToken += 1;
        this._respawnMode = 'none';

        Tween.stopAllByTarget(this._heroRespawnRoot);
        Tween.stopAllByTarget(this._heroRespawnOpacity);
        this._heroRespawnOpacity.opacity = 0;
        this._heroRespawnRoot.active = false;
    }

    private renderRespawnCountdownText(seconds: number): void {
        if (!this._heroRespawnCountdownLabel || !this._heroRespawnMessageLabel) return;

        this._heroRespawnCountdownLabel.string = Localization.instance.t(
            'ui.hero.respawn.countdown.value',
            { seconds }
        );
        this._heroRespawnMessageLabel.string = Localization.instance.t(
            'ui.hero.respawn.countdown.message',
            { seconds }
        );
    }

    private renderRespawnReadyText(): void {
        if (!this._heroRespawnCountdownLabel || !this._heroRespawnMessageLabel) return;

        this._heroRespawnCountdownLabel.string = Localization.instance.t(
            'ui.hero.respawn.ready.tag'
        );
        this._heroRespawnMessageLabel.string = Localization.instance.t(
            'ui.hero.respawn.ready.message'
        );
    }

    private createWaveForecastBanner(parent: Node): void {
        const root = new Node('WaveForecastBanner');
        root.layer = HUD_UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._waveForecastWidth, this._waveForecastHeight);

        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 74;

        this._waveForecastOpacity = root.addComponent(UIOpacity);
        this._waveForecastOpacity.opacity = 0;

        const bgNode = new Node('WaveForecastBg');
        bgNode.layer = HUD_UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._waveForecastBg = bgNode.addComponent(Graphics);

        const labelNode = new Node('WaveForecastText');
        labelNode.layer = HUD_UI_LAYER;
        root.addChild(labelNode);
        labelNode.addComponent(UITransform);
        this._waveForecastLabel = labelNode.addComponent(Label);
        this._waveForecastLabel.string = '';
        this._waveForecastLabel.fontSize = 30;
        this._waveForecastLabel.lineHeight = 36;
        this._waveForecastLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._waveForecastLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._waveForecastLabel.overflow = Label.Overflow.SHRINK;
        this._waveForecastLabel.color = new Color(120, 235, 255, 255);
        applyGameLabelStyle(this._waveForecastLabel, {
            outlineColor: new Color(8, 24, 40, 255),
            outlineWidth: 4,
        });

        this._waveForecastRoot = root;
        this.drawWaveForecastBackground(false);
        root.active = false;
    }

    private resolveForecastEnemyName(archetypeId: string): string {
        const key = `enemy.archetype.${archetypeId}`;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return archetypeId;
        }
        return localized;
    }

    private drawWaveForecastBackground(isBoss: boolean): void {
        if (!this._waveForecastBg) return;

        const bg = this._waveForecastBg;
        const width = this._waveForecastWidth;
        const height = this._waveForecastHeight;
        const radius = Math.max(12, Math.round(height * 0.22));

        bg.clear();
        bg.fillColor = isBoss ? new Color(78, 20, 18, 236) : new Color(10, 30, 52, 232);
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = isBoss ? new Color(255, 124, 124, 255) : new Color(96, 220, 255, 255);
        bg.lineWidth = 3.5;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();
        bg.strokeColor = isBoss ? new Color(255, 186, 162, 112) : new Color(164, 236, 255, 96);
        bg.lineWidth = 1.2;
        bg.roundRect(
            -width / 2 + 7,
            -height / 2 + 7,
            width - 14,
            height - 14,
            Math.max(9, radius - 4)
        );
        bg.stroke();
    }

    private showWaveForecastBanner(text: string, isBoss: boolean): void {
        if (!this._waveForecastRoot || !this._waveForecastLabel || !this._waveForecastOpacity) {
            return;
        }

        this.applyResponsiveLayout();
        this._waveForecastIsBoss = isBoss;
        this._waveForecastLabel.string = text;
        this._waveForecastLabel.color = isBoss
            ? new Color(255, 130, 130, 255)
            : new Color(120, 235, 255, 255);
        this.drawWaveForecastBackground(isBoss);

        Tween.stopAllByTarget(this._waveForecastRoot);
        Tween.stopAllByTarget(this._waveForecastOpacity);

        this._waveForecastRoot.active = true;
        this._waveForecastRoot.setScale(0.92, 0.92, 1);
        this._waveForecastOpacity.opacity = 0;

        tween(this._waveForecastRoot)
            .to(0.14, { scale: new Vec3(1.03, 1.03, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._waveForecastOpacity)
            .to(0.14, { opacity: 255 })
            .delay(2.2)
            .to(0.25, { opacity: 0 })
            .call(() => {
                if (this._waveForecastRoot) {
                    this._waveForecastRoot.active = false;
                }
            })
            .start();
    }

    private createLaneUnlockDialog(parent: Node): void {
        const root = new Node('LaneUnlockDialog');
        root.layer = HUD_UI_LAYER;
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(
            this._laneUnlockDialogWidth,
            this._laneUnlockDialogHeight
        );
        const widget = root.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 22;

        this._laneUnlockDialogOpacity = root.addComponent(UIOpacity);
        this._laneUnlockDialogOpacity.opacity = 0;

        const bgNode = new Node('LaneUnlockDialogBg');
        bgNode.layer = HUD_UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._laneUnlockDialogBg = bgNode.addComponent(Graphics);
        this.drawLaneUnlockDialogBackground();

        const textNode = new Node('LaneUnlockDialogText');
        textNode.layer = HUD_UI_LAYER;
        root.addChild(textNode);
        textNode
            .addComponent(UITransform)
            .setContentSize(this._laneUnlockDialogWidth - 56, this._laneUnlockDialogHeight - 18);
        this._laneUnlockDialogLabel = textNode.addComponent(Label);
        this._laneUnlockDialogLabel.string = '';
        this._laneUnlockDialogLabel.fontSize = 30;
        this._laneUnlockDialogLabel.lineHeight = 36;
        this._laneUnlockDialogLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._laneUnlockDialogLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._laneUnlockDialogLabel.enableWrapText = true;
        this._laneUnlockDialogLabel.overflow = Label.Overflow.SHRINK;
        this._laneUnlockDialogLabel.color = new Color(255, 225, 176, 255);
        applyGameLabelStyle(this._laneUnlockDialogLabel, {
            outlineColor: new Color(34, 18, 8, 255),
            outlineWidth: 4,
        });

        this._laneUnlockDialogRoot = root;
        root.active = false;
    }

    private drawLaneUnlockDialogBackground(): void {
        if (!this._laneUnlockDialogBg) return;

        const bg = this._laneUnlockDialogBg;
        const width = this._laneUnlockDialogWidth;
        const height = this._laneUnlockDialogHeight;
        const radius = Math.max(12, Math.round(height * 0.2));
        bg.clear();
        bg.fillColor = new Color(34, 20, 10, 236);
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = new Color(255, 186, 92, 255);
        bg.lineWidth = 3.5;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();
        bg.strokeColor = new Color(255, 228, 182, 120);
        bg.lineWidth = 1.5;
        bg.roundRect(
            -width / 2 + 8,
            -height / 2 + 8,
            width - 16,
            height - 16,
            Math.max(9, radius - 4)
        );
        bg.stroke();
    }

    private showLaneUnlockDialog(text: string, holdSeconds: number): void {
        if (
            !this._laneUnlockDialogRoot ||
            !this._laneUnlockDialogLabel ||
            !this._laneUnlockDialogOpacity
        ) {
            return;
        }

        this.applyResponsiveLayout();
        this._laneUnlockDialogToken += 1;
        const token = this._laneUnlockDialogToken;
        this._laneUnlockDialogLabel.string = text;

        Tween.stopAllByTarget(this._laneUnlockDialogRoot);
        Tween.stopAllByTarget(this._laneUnlockDialogOpacity);
        this._laneUnlockDialogRoot.active = true;
        this._laneUnlockDialogRoot.setScale(0.95, 0.95, 1);
        this._laneUnlockDialogOpacity.opacity = 0;

        tween(this._laneUnlockDialogRoot)
            .to(0.16, { scale: new Vec3(1.01, 1.01, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._laneUnlockDialogOpacity)
            .to(0.16, { opacity: 255 })
            .delay(Math.max(0.8, holdSeconds))
            .to(0.22, { opacity: 0 })
            .call(() => {
                if (token !== this._laneUnlockDialogToken) return;
                if (this._laneUnlockDialogRoot) {
                    this._laneUnlockDialogRoot.active = false;
                }
            })
            .start();
    }

    private createHeroRespawnDialog(parent: Node): void {
        const root = new Node('HeroRespawnDialog');
        root.layer = HUD_UI_LAYER;
        parent.addChild(root);

        root.addComponent(UITransform).setContentSize(
            this._heroRespawnWidth,
            this._heroRespawnHeight
        );
        const widget = root.addComponent(Widget);
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter = true;

        this._heroRespawnOpacity = root.addComponent(UIOpacity);
        this._heroRespawnOpacity.opacity = 0;

        const bgNode = new Node('HeroRespawnDialogBg');
        bgNode.layer = HUD_UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._heroRespawnBg = bgNode.addComponent(Graphics);
        this.drawHeroRespawnBackground();

        const countNode = new Node('HeroRespawnCount');
        countNode.layer = HUD_UI_LAYER;
        root.addChild(countNode);
        countNode
            .addComponent(UITransform)
            .setContentSize(this._heroRespawnWidth - 60, this._heroRespawnHeight * 0.58);
        countNode.setPosition(0, 34, 0);
        this._heroRespawnCountdownLabel = countNode.addComponent(Label);
        this._heroRespawnCountdownLabel.string = '10';
        this._heroRespawnCountdownLabel.fontSize = 124;
        this._heroRespawnCountdownLabel.lineHeight = 132;
        this._heroRespawnCountdownLabel.isBold = true;
        this._heroRespawnCountdownLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._heroRespawnCountdownLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._heroRespawnCountdownLabel.overflow = Label.Overflow.SHRINK;
        this._heroRespawnCountdownLabel.color = new Color(255, 222, 130, 255);

        const msgNode = new Node('HeroRespawnText');
        msgNode.layer = HUD_UI_LAYER;
        root.addChild(msgNode);
        msgNode
            .addComponent(UITransform)
            .setContentSize(this._heroRespawnWidth - 80, this._heroRespawnHeight * 0.44);
        msgNode.setPosition(0, -76, 0);
        this._heroRespawnMessageLabel = msgNode.addComponent(Label);
        this._heroRespawnMessageLabel.string = '';
        this._heroRespawnMessageLabel.fontSize = 34;
        this._heroRespawnMessageLabel.lineHeight = 42;
        this._heroRespawnMessageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._heroRespawnMessageLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._heroRespawnMessageLabel.enableWrapText = true;
        this._heroRespawnMessageLabel.overflow = Label.Overflow.SHRINK;
        this._heroRespawnMessageLabel.color = new Color(255, 241, 210, 255);

        this._heroRespawnRoot = root;
        root.active = false;
    }

    private drawHeroRespawnBackground(): void {
        if (!this._heroRespawnBg) return;
        const bg = this._heroRespawnBg;
        const width = this._heroRespawnWidth;
        const height = this._heroRespawnHeight;
        const radius = Math.max(14, Math.round(Math.min(width, height) * 0.06));

        bg.clear();
        bg.fillColor = new Color(18, 12, 8, 232);
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = new Color(255, 136, 56, 255);
        bg.lineWidth = 4;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();
    }

    private applyResponsiveLayout(): void {
        const canvasTransform = this._uiCanvas?.getComponent(UITransform);
        if (!canvasTransform) return;

        const viewportW = Math.max(480, Math.round(canvasTransform.contentSize.width));
        const viewportH = Math.max(320, Math.round(canvasTransform.contentSize.height));
        const compact = viewportW < 900 || viewportH < 620;
        const padding = UIResponsive.getControlPadding();

        this._waveForecastWidth = Math.round(
            UIResponsive.clamp(
                viewportW * (compact ? 0.82 : 0.6),
                WAVE_FORECAST_MIN_WIDTH,
                WAVE_FORECAST_MAX_WIDTH
            )
        );
        this._waveForecastHeight = Math.round(
            UIResponsive.clamp(
                viewportH * (compact ? 0.14 : 0.1),
                WAVE_FORECAST_MIN_HEIGHT,
                WAVE_FORECAST_MAX_HEIGHT
            )
        );

        this._waveForecastRoot
            ?.getComponent(UITransform)
            ?.setContentSize(this._waveForecastWidth, this._waveForecastHeight);
        const waveWidget = this._waveForecastRoot?.getComponent(Widget);
        if (waveWidget) {
            waveWidget.top = Math.max(10, Math.round(padding.top * 0.56));
            waveWidget.updateAlignment();
        }
        this._waveForecastLabel?.node
            .getComponent(UITransform)
            ?.setContentSize(this._waveForecastWidth - 44, this._waveForecastHeight - 12);
        if (this._waveForecastLabel) {
            this._waveForecastLabel.fontSize = Math.max(
                22,
                Math.min(34, Math.round(this._waveForecastHeight * 0.46))
            );
            this._waveForecastLabel.lineHeight = this._waveForecastLabel.fontSize + 6;
        }
        this.drawWaveForecastBackground(this._waveForecastIsBoss);

        this._laneUnlockDialogWidth = Math.round(
            UIResponsive.clamp(viewportW * 0.84, LANE_DIALOG_MIN_WIDTH, LANE_DIALOG_MAX_WIDTH)
        );
        this._laneUnlockDialogHeight = Math.round(
            UIResponsive.clamp(
                viewportH * (compact ? 0.18 : 0.13),
                LANE_DIALOG_MIN_HEIGHT,
                LANE_DIALOG_MAX_HEIGHT
            )
        );
        this._laneUnlockDialogRoot
            ?.getComponent(UITransform)
            ?.setContentSize(this._laneUnlockDialogWidth, this._laneUnlockDialogHeight);
        const laneWidget = this._laneUnlockDialogRoot?.getComponent(Widget);
        if (laneWidget) {
            laneWidget.bottom = Math.max(16, Math.round(padding.bottom * 0.35));
            laneWidget.updateAlignment();
        }
        this._laneUnlockDialogLabel?.node
            .getComponent(UITransform)
            ?.setContentSize(this._laneUnlockDialogWidth - 52, this._laneUnlockDialogHeight - 20);
        if (this._laneUnlockDialogLabel) {
            this._laneUnlockDialogLabel.fontSize = Math.max(
                24,
                Math.min(34, Math.round(this._laneUnlockDialogHeight * 0.32))
            );
            this._laneUnlockDialogLabel.lineHeight = this._laneUnlockDialogLabel.fontSize + 6;
        }
        this.drawLaneUnlockDialogBackground();

        this._heroRespawnWidth = Math.round(
            UIResponsive.clamp(
                viewportW * (compact ? 0.86 : 0.74),
                HERO_RESPAWN_MIN_WIDTH,
                HERO_RESPAWN_MAX_WIDTH
            )
        );
        this._heroRespawnHeight = Math.round(
            UIResponsive.clamp(
                viewportH * (compact ? 0.54 : 0.41),
                HERO_RESPAWN_MIN_HEIGHT,
                HERO_RESPAWN_MAX_HEIGHT
            )
        );
        this._heroRespawnRoot
            ?.getComponent(UITransform)
            ?.setContentSize(this._heroRespawnWidth, this._heroRespawnHeight);
        this.drawHeroRespawnBackground();

        const countNode = this._heroRespawnCountdownLabel?.node;
        countNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                this._heroRespawnWidth - 64,
                Math.round(this._heroRespawnHeight * 0.54)
            );
        countNode?.setPosition(0, Math.round(this._heroRespawnHeight * 0.16), 0);
        if (this._heroRespawnCountdownLabel) {
            this._heroRespawnCountdownLabel.fontSize = Math.max(
                84,
                Math.min(138, Math.round(this._heroRespawnHeight * 0.47))
            );
            this._heroRespawnCountdownLabel.lineHeight =
                this._heroRespawnCountdownLabel.fontSize + 8;
        }

        const msgNode = this._heroRespawnMessageLabel?.node;
        msgNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                this._heroRespawnWidth - 88,
                Math.round(this._heroRespawnHeight * 0.42)
            );
        msgNode?.setPosition(0, -Math.round(this._heroRespawnHeight * 0.29), 0);
        if (this._heroRespawnMessageLabel) {
            this._heroRespawnMessageLabel.fontSize = Math.max(
                24,
                Math.min(40, Math.round(this._heroRespawnHeight * 0.14))
            );
            this._heroRespawnMessageLabel.lineHeight = this._heroRespawnMessageLabel.fontSize + 8;
        }
    }

    private resolveLocalizedByKey(key: string, fallback: string): string {
        if (!key) return fallback;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return fallback;
        }
        return localized;
    }
}
