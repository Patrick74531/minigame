import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    Label,
    Button,
    UITransform,
    Widget,
    Color,
    Layers,
    view,
    resources,
    Texture2D,
    ImageAsset,
    Graphics,
    tween,
    Vec3,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { GameManager } from '../../core/managers/GameManager';
import { HUDSettingsModule } from '../hud/HUDSettingsModule';
import { applyGameLabelStyle } from '../hud/HUDCommon';
import { LocalizationComp } from '../LocalizationComp';
import { UIResponsive } from '../UIResponsive';
import { RedditBridge, type RedditBridgeCallback } from '../../core/reddit/RedditBridge';
import { LeaderboardPanel } from './LeaderboardPanel';

const { ccclass } = _decorator;

@ccclass('HomePage')
export class HomePage extends Component {
    private _backgroundNode: Node | null = null;
    private _backgroundSprite: Sprite | null = null;
    private _contentNode: Node | null = null;
    private _settingsModule: HUDSettingsModule | null = null;
    private _uiLayer: number = Layers.Enum.UI_2D;

    private _titleNode: Node | null = null;
    private _subtitleNode: Node | null = null;
    private _noticeNode: Node | null = null;
    private _startBtn: Node | null = null;
    private _leaderboardBtn: Node | null = null;
    private _subscribeBtn: Node | null = null;
    private _leaderboardPanel: LeaderboardPanel | null = null;
    private _bridgeListener: ((e: RedditBridgeCallback) => void) | null = null;
    private _onStartRequested: (() => void) | null = null;

    public onLoad() {
        this._uiLayer = this.node.parent?.layer ?? Layers.Enum.UI_2D;
        this.node.layer = this._uiLayer;

        this.ensureRootLayout();
        this.createUI();

        this._settingsModule = new HUDSettingsModule(() => {
            this.refreshText();
        });
        this._settingsModule.initialize(this.node);

        view.on('canvas-resize', this.onCanvasResize, this);
        this.onCanvasResize();
        this.scheduleOnce(() => this.onCanvasResize(), 0);

        this._initRedditBridge();
    }

    public onDestroy() {
        view.off('canvas-resize', this.onCanvasResize, this);
        this._settingsModule?.cleanup();
        if (this._bridgeListener) {
            RedditBridge.instance.removeListener(this._bridgeListener);
        }
    }

    private ensureRootLayout() {
        const rootTf = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        const size = this.getCanvasSize();
        rootTf.setContentSize(size.width, size.height);

        const rootWidget = this.node.getComponent(Widget) ?? this.node.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;
        rootWidget.top = 0;
        rootWidget.bottom = 0;
        rootWidget.left = 0;
        rootWidget.right = 0;
        rootWidget.updateAlignment();
    }

    private createUI() {
        this.node.getChildByName('HomeBackground')?.destroy();
        this.node.getChildByName('HomeContent')?.destroy();

        this._backgroundNode = new Node('HomeBackground');
        this._backgroundNode.layer = this._uiLayer;
        this.node.addChild(this._backgroundNode);

        this._backgroundNode.addComponent(UITransform);
        const bgWidget = this._backgroundNode.addComponent(Widget);
        bgWidget.isAlignHorizontalCenter = true;
        bgWidget.isAlignVerticalCenter = true;
        bgWidget.horizontalCenter = 0;
        bgWidget.verticalCenter = 0;

        this._backgroundSprite = this._backgroundNode.addComponent(Sprite);
        this._backgroundSprite.type = Sprite.Type.SIMPLE;
        this._backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        this.loadBackgroundTexture();

        this._contentNode = new Node('HomeContent');
        this._contentNode.layer = this._uiLayer;
        this._contentNode.active = false;
        this.node.addChild(this._contentNode);

        this._contentNode.addComponent(UITransform);

        const contentWidget = this._contentNode.addComponent(Widget);
        contentWidget.isAlignVerticalCenter = true;
        contentWidget.isAlignHorizontalCenter = true;
        contentWidget.verticalCenter = 0;
        contentWidget.horizontalCenter = 0;

        this._titleNode = this.createTextNode('GameTitle', 'Granny vs Robot', {
            fontSize: 52,
            bold: true,
            color: new Color(255, 230, 80, 255),
            outlineColor: new Color(40, 18, 4, 255),
            outlineWidth: 5,
        });
        this._subtitleNode = this.createTextNode('GameSubtitle', 'Tower Defence', {
            fontSize: 26,
            bold: false,
            color: new Color(220, 220, 220, 230),
            outlineColor: new Color(0, 0, 0, 180),
            outlineWidth: 3,
        });
        this._noticeNode = this.createLocalizedTextNode('LoadNotice', 'ui.home.first_load_notice', {
            fontSize: 20,
            bold: false,
            color: new Color(200, 200, 200, 180),
            outlineColor: new Color(0, 0, 0, 160),
            outlineWidth: 2,
        });
        this._contentNode.addChild(this._titleNode);
        this._contentNode.addChild(this._subtitleNode);
        this._contentNode.addChild(this._noticeNode);

        this._startBtn = this.createGameButton('StartButton', 'ui.home.start', 0, 120, () =>
            this.onStartClick()
        );
        this._leaderboardBtn = this.createGameButton(
            'LeaderboardButton',
            'ui.home.leaderboard',
            0,
            0,
            () => this.onLeaderboardClick()
        );
        this._subscribeBtn = this.createGameButton(
            'SubscribeButton',
            'ui.home.subscribe',
            0,
            -120,
            () => this.onSubscribeClick()
        );

        this._contentNode.addChild(this._startBtn);
        this._contentNode.addChild(this._leaderboardBtn);
        this._contentNode.addChild(this._subscribeBtn);
        this.updateContentLayout();
    }

    private loadBackgroundTexture() {
        resources.load('ui/homepage', Texture2D, (textureErr, texture) => {
            if (!textureErr && texture) {
                this.applyBackgroundTexture(texture);
                this._revealContent();
                return;
            }

            resources.load('ui/homepage', ImageAsset, (imageErr, imageAsset) => {
                if (!imageErr && imageAsset) {
                    const fallbackTexture = new Texture2D();
                    fallbackTexture.image = imageAsset;
                    this.applyBackgroundTexture(fallbackTexture);
                } else {
                    console.warn('Failed to load homepage background', imageErr ?? textureErr);
                }
                this._revealContent();
            });
        });
    }

    private _revealContent(): void {
        if (!this._contentNode || !this._contentNode.isValid) return;
        this._contentNode.active = true;
        this._contentNode.setScale(0.96, 0.96, 1);
        tween(this._contentNode)
            .to(0.3, { scale: new Vec3(1, 1, 1) })
            .start();
        // Show settings button at the same time as content buttons.
        this._settingsModule?.show();
        // Delay hiding the HTML boot splash by ~3 frames so the GPU has time to
        // upload the background texture and render at least one full frame before
        // the HTML overlay starts fading. Without this delay a 1-frame black flash
        // is visible as the HTML splash fades to reveal an empty canvas.
        this.scheduleOnce(() => {
            if (!this.isValid) return;
            const w = window as unknown as { _hideSplash?: () => void };
            if (typeof w._hideSplash === 'function') w._hideSplash();
        }, 0.15);
    }

    private applyBackgroundTexture(texture: Texture2D) {
        if (!this._backgroundSprite) return;
        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        this._backgroundSprite.spriteFrame = spriteFrame;
        this.updateBackgroundLayout();
    }

    private createGameButton(
        name: string,
        locKey: string,
        x: number,
        y: number,
        onClick: () => void
    ): Node {
        const btnNode = new Node(name);
        btnNode.layer = this._uiLayer;
        const tf = btnNode.addComponent(UITransform);
        tf.setContentSize(240, 80);
        btnNode.setPosition(x, y, 0);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        const bg = btnNode.addComponent(Graphics);
        this.drawButton(bg);

        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        btnNode.addChild(labelNode);
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.fontSize = 32;
        label.isBold = true;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.string = Localization.instance.t(locKey);
        applyGameLabelStyle(label, { outlineWidth: 3, outlineColor: new Color(0, 0, 0, 200) });

        const locComp = labelNode.addComponent(LocalizationComp);
        locComp.key = locKey;

        btnNode.on(Button.EventType.CLICK, onClick, this);
        return btnNode;
    }

    private drawButton(g: Graphics) {
        const tf = g.node.getComponent(UITransform);
        const width = Math.round(tf?.contentSize.width ?? 240);
        const height = Math.round(tf?.contentSize.height ?? 80);
        const radius = Math.max(12, Math.round(height * 0.22));
        g.clear();
        g.fillColor = new Color(255, 198, 88, 255);
        g.roundRect(-width / 2, -height / 2, width, height, radius);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 200);
        g.lineWidth = Math.max(2, Math.round(height * 0.05));
        g.roundRect(-width / 2, -height / 2, width, height, radius);
        g.stroke();
    }

    private onCanvasResize() {
        this.ensureRootLayout();
        this.updateBackgroundLayout();
        this.updateContentLayout();
        this._settingsModule?.onCanvasResize();
    }

    private updateBackgroundLayout() {
        if (!this._backgroundNode) return;

        const bgTransform = this._backgroundNode.getComponent(UITransform);
        if (!bgTransform) return;

        const size = this.getBackgroundCoverageSize();
        bgTransform.setContentSize(Math.max(1, size.width), Math.max(1, size.height));
        this._backgroundNode.getComponent(Widget)?.updateAlignment();
    }

    private getCanvasSize(): { width: number; height: number } {
        const parentTf = this.node.parent?.getComponent(UITransform);
        if (parentTf) {
            return {
                width: Math.max(1, parentTf.contentSize.width),
                height: Math.max(1, parentTf.contentSize.height),
            };
        }

        const visible = UIResponsive.getVisibleSize();
        if (visible.width > 1 && visible.height > 1) {
            return { width: visible.width, height: visible.height };
        }

        return { width: 1280, height: 720 };
    }

    // Background needs to cover full visible viewport under SHOW_ALL, while other UI keeps layout size.
    private getBackgroundCoverageSize(): { width: number; height: number } {
        const layout = this.getCanvasSize();
        let width = layout.width;
        let height = layout.height;

        const visible = UIResponsive.getVisibleSize();
        width = Math.max(width, visible.width);
        height = Math.max(height, visible.height);

        const frame = view.getFrameSize();
        const scaleXGetter = (view as unknown as { getScaleX?: () => number }).getScaleX;
        const scaleYGetter = (view as unknown as { getScaleY?: () => number }).getScaleY;
        const scaleX = typeof scaleXGetter === 'function' ? scaleXGetter.call(view) : 0;
        const scaleY = typeof scaleYGetter === 'function' ? scaleYGetter.call(view) : 0;
        if (scaleX > 0 && scaleY > 0) {
            width = Math.max(width, frame.width / scaleX);
            height = Math.max(height, frame.height / scaleY);
        }

        return {
            width: Math.ceil(width + 2),
            height: Math.ceil(height + 2),
        };
    }

    private updateContentLayout() {
        if (!this._contentNode) return;
        const size = this.getCanvasSize();
        const contentTf = this._contentNode.getComponent(UITransform);
        contentTf?.setContentSize(size.width, size.height);
        this._contentNode.getComponent(Widget)?.updateAlignment();

        const shortSide = Math.min(size.width, size.height);
        const buttonW = Math.round(UIResponsive.clamp(shortSide * 0.38, 220, 360));
        const buttonH = Math.round(UIResponsive.clamp(shortSide * 0.12, 72, 108));
        const gap = Math.round(UIResponsive.clamp(shortSide * 0.045, 24, 42));
        const step = buttonH + gap;
        const centerY = 0;

        this.layoutButton(this._startBtn, buttonW, buttonH, centerY + step);
        this.layoutButton(this._leaderboardBtn, buttonW, buttonH, centerY);
        this.layoutButton(this._subscribeBtn, buttonW, buttonH, centerY - step);

        const titleFontSize = Math.round(UIResponsive.clamp(shortSide * 0.072, 36, 60));
        const subtitleFontSize = Math.round(UIResponsive.clamp(shortSide * 0.034, 20, 30));
        const noticeFontSize = Math.round(UIResponsive.clamp(shortSide * 0.026, 16, 22));
        const titleW = Math.round(Math.min(size.width - 40, 600));

        this.layoutTextNode(
            this._titleNode,
            titleW,
            titleFontSize + 16,
            centerY + step * 2.6,
            titleFontSize
        );
        this.layoutTextNode(
            this._subtitleNode,
            titleW,
            subtitleFontSize + 12,
            centerY + step * 2.1,
            subtitleFontSize
        );
        this.layoutTextNode(
            this._noticeNode,
            titleW,
            noticeFontSize + 10,
            centerY - step * 2.1,
            noticeFontSize
        );
    }

    private layoutButton(btnNode: Node | null, width: number, height: number, y: number) {
        if (!btnNode) return;
        btnNode.getComponent(UITransform)?.setContentSize(width, height);
        btnNode.setPosition(0, y, 0);
        btnNode.getComponent(Widget)?.updateAlignment();

        const bg = btnNode.getComponent(Graphics);
        if (bg) {
            this.drawButton(bg);
        }

        const labelNode = btnNode.getChildByName('Label');
        labelNode?.getComponent(UITransform)?.setContentSize(Math.max(120, width - 32), height - 8);
        const label = labelNode?.getComponent(Label);
        if (label) {
            label.fontSize = Math.round(UIResponsive.clamp(height * 0.42, 28, 44));
            label.lineHeight = label.fontSize + 6;
        }
    }

    private refreshText() {
        this._settingsModule?.onLanguageChanged();
        const noticeComp = this._noticeNode
            ?.getChildByName('Label')
            ?.getComponent(LocalizationComp);
        noticeComp?.refresh();

        if (this._startBtn) {
            const comp = this._startBtn.getChildByName('Label')?.getComponent(LocalizationComp);
            comp?.refresh();
        }
        if (this._leaderboardBtn) {
            const comp = this._leaderboardBtn
                .getChildByName('Label')
                ?.getComponent(LocalizationComp);
            comp?.refresh();
        }
        if (this._subscribeBtn) {
            const comp = this._subscribeBtn.getChildByName('Label')?.getComponent(LocalizationComp);
            comp?.refresh();
        }
    }

    private _initRedditBridge(): void {
        const bridge = RedditBridge.instance;
        this._bridgeListener = (event: RedditBridgeCallback) => {
            this._onBridgeEvent(event);
        };
        bridge.addListener(this._bridgeListener);
        bridge.requestInit();
    }

    private _onBridgeEvent(event: RedditBridgeCallback): void {
        switch (event.type) {
            case 'init':
                this._updateSubscribeButton(event.data.isSubscribed);
                if (this._leaderboardPanel && event.data.leaderboard) {
                    this._leaderboardPanel.showEntries(event.data.leaderboard);
                }
                break;
            case 'leaderboard':
                this._leaderboardPanel?.showEntries(event.entries);
                break;
            case 'score_submitted':
                // Cache/UI refresh is handled inside RedditBridge.submitScore().
                break;
            case 'subscription_result':
                if (event.success) {
                    this._updateSubscribeButton(true);
                    const msgKey = event.alreadySubscribed
                        ? 'ui.home.subscribe.already'
                        : 'ui.home.subscribe.success';
                    this._showToast(Localization.instance.t(msgKey));
                }
                break;
            case 'error':
                this._leaderboardPanel?.showError();
                break;
        }
    }

    private _updateSubscribeButton(isSubscribed: boolean): void {
        if (!this._subscribeBtn) return;
        const locKey = isSubscribed ? 'ui.home.subscribed' : 'ui.home.subscribe';
        const comp = this._subscribeBtn.getChildByName('Label')?.getComponent(LocalizationComp);
        if (comp) {
            comp.key = locKey;
            comp.refresh();
        }
    }

    public setOnStartRequested(cb: () => void): void {
        this._onStartRequested = cb;
    }

    private createTextNode(
        name: string,
        text: string,
        style: {
            fontSize: number;
            bold: boolean;
            color: Color;
            outlineColor: Color;
            outlineWidth: number;
        }
    ): Node {
        const node = new Node(name);
        node.layer = this._uiLayer;
        node.addComponent(UITransform).setContentSize(400, style.fontSize + 16);
        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        node.addChild(labelNode);
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = style.fontSize;
        label.isBold = style.bold;
        label.color = style.color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, {
            outlineWidth: style.outlineWidth,
            outlineColor: style.outlineColor,
        });
        return node;
    }

    private createLocalizedTextNode(
        name: string,
        locKey: string,
        style: {
            fontSize: number;
            bold: boolean;
            color: Color;
            outlineColor: Color;
            outlineWidth: number;
        }
    ): Node {
        const node = this.createTextNode(name, Localization.instance.t(locKey), style);
        const locComp = node.getChildByName('Label')!.addComponent(LocalizationComp);
        locComp.key = locKey;
        return node;
    }

    private layoutTextNode(
        node: Node | null,
        width: number,
        height: number,
        y: number,
        fontSize: number
    ) {
        if (!node) return;
        node.getComponent(UITransform)?.setContentSize(width, height);
        node.setPosition(0, y, 0);
        const label = node.getChildByName('Label')?.getComponent(Label);
        if (label) {
            label.fontSize = fontSize;
            label.lineHeight = fontSize + 6;
            node.getChildByName('Label')
                ?.getComponent(UITransform)
                ?.setContentSize(width - 20, height);
        }
    }

    private onStartClick() {
        if (this._onStartRequested) {
            this._onStartRequested();
        } else {
            GameManager.instance.startGame();
            this.node.destroy();
        }
    }

    private onLeaderboardClick() {
        if (this._leaderboardPanel) {
            this._leaderboardPanel.destroy();
            this._leaderboardPanel = null;
            return;
        }
        this._leaderboardPanel = new LeaderboardPanel(this.node, () => {
            this._leaderboardPanel?.destroy();
            this._leaderboardPanel = null;
        });
        const bridge = RedditBridge.instance;
        const cached = bridge.cachedLeaderboard;
        if (cached.length > 0) {
            this._leaderboardPanel.showEntries(cached);
        } else {
            this._leaderboardPanel.showLoading();
        }
        bridge.requestLeaderboard();
    }

    private onSubscribeClick() {
        const bridge = RedditBridge.instance;
        if (!bridge.isRedditEnvironment) {
            this._showToast(Localization.instance.t('ui.home.subscribe.already'));
            return;
        }
        bridge.requestSubscribe();
    }

    private _showToast(text: string): void {
        if (!this._contentNode) return;
        const toast = new Node('Toast');
        toast.layer = this._uiLayer;
        const tf = toast.addComponent(UITransform);
        tf.setContentSize(360, 70);
        const bg = toast.addComponent(Graphics);
        bg.fillColor = new Color(30, 30, 30, 220);
        bg.roundRect(-180, -35, 360, 70, 16);
        bg.fill();
        const labelNode = new Node('ToastLabel');
        labelNode.layer = this._uiLayer;
        toast.addChild(labelNode);
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 30;
        label.isBold = true;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 180) });
        const size = this.getCanvasSize();
        toast.setPosition(0, -size.height * 0.3, 0);
        this._contentNode.addChild(toast);
        const totalMs = 2200;
        const fadeMs = 600;
        const holdMs = totalMs - fadeMs;
        let elapsed = 0;
        const id = setInterval(() => {
            if (!toast.isValid || !label.isValid) {
                clearInterval(id);
                return;
            }
            elapsed += 16;
            if (elapsed >= holdMs) {
                const t = Math.min(1, (elapsed - holdMs) / fadeMs);
                const alpha = Math.round(255 * (1 - t));
                label.color = new Color(255, 255, 255, alpha);
                bg.clear();
                bg.fillColor = new Color(30, 30, 30, Math.round(220 * (1 - t)));
                bg.roundRect(-180, -35, 360, 70, 16);
                bg.fill();
            }
            if (elapsed >= totalMs) {
                clearInterval(id);
                if (toast.isValid) toast.destroy();
            }
        }, 16);
    }
}
