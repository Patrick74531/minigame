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
import {
    getSocialBridge,
    type SocialBridge,
    type SocialBridgeCallback,
} from '../../core/reddit/RedditBridge';
import { LeaderboardPanel } from './LeaderboardPanel';
import { GameSaveManager } from '../../core/managers/GameSaveManager';
import { DiamondService } from '../../core/diamond/DiamondService';
import { ShopPanel } from './ShopPanel';
import { UIFactory } from '../UIFactory';

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
    private _startBtn: Node | null = null;
    private _leaderboardBtn: Node | null = null;
    private _subscribeBtn: Node | null = null;
    private _leaderboardPanel: LeaderboardPanel | null = null;
    private _bridgeListener: ((e: SocialBridgeCallback) => void) | null = null;
    private _continueBtn: Node | null = null;
    private _onStartRequested: (() => void) | null = null;
    private _onContinueRequested: (() => void) | null = null;
    private _shopBtn: Node | null = null;
    private _shopPanel: ShopPanel | null = null;
    private _coinsLabel: Label | null = null;
    private _diamondLabel: Label | null = null;
    private _currencyPanelNode: Node | null = null;
    private _diamondListener: ((balance: number) => void) | null = null;
    private readonly _socialBridge: SocialBridge = getSocialBridge();

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

        // Show buttons immediately — don't wait for background texture
        this._revealContent();

        this._initSocialBridge();
    }

    public onDestroy() {
        view.off('canvas-resize', this.onCanvasResize, this);
        this._settingsModule?.cleanup();
        if (this._bridgeListener) {
            this._socialBridge.removeListener(this._bridgeListener);
        }
        if (this._diamondListener) {
            DiamondService.instance.removeListener(this._diamondListener);
        }
        if (this._shopPanel) {
            this._shopPanel.destroy();
            this._shopPanel = null;
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
        this._contentNode.addChild(this._titleNode);

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
        if (this._socialBridge.supportsSubscribe) {
            this._subscribeBtn = this.createGameButton(
                'SubscribeButton',
                'ui.home.subscribe',
                0,
                -120,
                () => this.onSubscribeClick()
            );
        } else {
            this._subscribeBtn = null;
        }

        this._shopBtn = this.createGameButton('ShopButton', 'ui.home.shop', 0, -120, () =>
            this.onShopClick()
        );
        // Shop button: purple theme
        const shopBg = this._shopBtn.getComponent(Graphics);
        if (shopBg) {
            const stf = this._shopBtn.getComponent(UITransform)!;
            const sw = stf.contentSize.width;
            const sh = stf.contentSize.height;
            const sr = Math.max(12, Math.round(sh * 0.22));
            shopBg.clear();
            shopBg.fillColor = new Color(138, 92, 246, 255);
            shopBg.roundRect(-sw / 2, -sh / 2, sw, sh, sr);
            shopBg.fill();
            shopBg.strokeColor = new Color(255, 255, 255, 200);
            shopBg.lineWidth = Math.max(2, Math.round(sh * 0.05));
            shopBg.roundRect(-sw / 2, -sh / 2, sw, sh, sr);
            shopBg.stroke();
        }

        // Currency panel (coins + diamonds) at top-left
        const cp = UIFactory.createCurrencyPanel(this.node);
        this._coinsLabel = cp.coinsLabel;
        this._diamondLabel = cp.diamondsLabel;
        this._currencyPanelNode = cp.panelNode;
        const cpWidget = this._currencyPanelNode.addComponent(Widget);
        cpWidget.isAlignTop = true;
        cpWidget.isAlignLeft = true;
        cpWidget.top = 10;
        cpWidget.left = 10;
        // Register listener so diamond display auto-updates when balance changes
        this._diamondListener = () => this._updateDiamondDisplay();
        DiamondService.instance.addListener(this._diamondListener);
        this._updateDiamondDisplay();

        this._contentNode.addChild(this._startBtn);
        this._contentNode.addChild(this._leaderboardBtn);
        this._contentNode.addChild(this._shopBtn);
        if (this._subscribeBtn) {
            this._contentNode.addChild(this._subscribeBtn);
        }

        if (GameSaveManager.instance.hasSave()) {
            this._continueBtn = this.createGameButton(
                'ContinueButton',
                'ui.home.continue',
                0,
                0,
                () => this.onContinueClick()
            );
            const bg = this._continueBtn.getComponent(Graphics);
            if (bg) {
                const tf = this._continueBtn.getComponent(UITransform)!;
                const w = tf.contentSize.width;
                const h = tf.contentSize.height;
                const r = Math.max(12, Math.round(h * 0.22));
                bg.clear();
                bg.fillColor = new Color(72, 192, 96, 255);
                bg.roundRect(-w / 2, -h / 2, w, h, r);
                bg.fill();
                bg.strokeColor = new Color(255, 255, 255, 200);
                bg.lineWidth = Math.max(2, Math.round(h * 0.05));
                bg.roundRect(-w / 2, -h / 2, w, h, r);
                bg.stroke();
            }
            this._contentNode.addChild(this._continueBtn);
        }

        this.updateContentLayout();
    }

    private loadBackgroundTexture() {
        resources.load('ui/homepage', Texture2D, (textureErr, texture) => {
            if (!textureErr && texture) {
                this.applyBackgroundTexture(texture);
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
        const buttonW = Math.round(UIResponsive.clamp(shortSide * 0.34, 130, 300));
        const buttonH = Math.round(UIResponsive.clamp(shortSide * 0.09, 38, 76));
        const gap = Math.round(UIResponsive.clamp(shortSide * 0.022, 6, 24));
        const step = buttonH + gap;
        const hasContinue = !!this._continueBtn;
        const hasSubscribe = !!this._subscribeBtn;

        // Button stack: continue(opt) > start > leaderboard > shop > subscribe(opt)
        const btnCount = (hasContinue ? 1 : 0) + 3 + (hasSubscribe ? 1 : 0);
        const stackCenter = -step * 2.0;

        let slot = btnCount - 1;
        if (hasContinue) {
            this.layoutButton(this._continueBtn, buttonW, buttonH, stackCenter + step * slot);
            this.redrawContinueButton(this._continueBtn, buttonW, buttonH);
            slot--;
        }
        this.layoutButton(this._startBtn, buttonW, buttonH, stackCenter + step * slot);
        slot--;
        this.layoutButton(this._leaderboardBtn, buttonW, buttonH, stackCenter + step * slot);
        slot--;
        this.layoutButton(this._shopBtn, buttonW, buttonH, stackCenter + step * slot);
        this.redrawShopButton(this._shopBtn, buttonW, buttonH);
        if (hasSubscribe) {
            slot--;
            this.layoutButton(this._subscribeBtn, buttonW, buttonH, stackCenter + step * slot);
        }

        const topSlot = btnCount - 1;
        const topBtnY = stackCenter + step * topSlot;

        const titleFontSize = Math.round(UIResponsive.clamp(shortSide * 0.072, 36, 60));
        const titleW = Math.round(Math.min(size.width - 40, 600));
        const titleH = titleFontSize + 16;

        const desiredTitleY = topBtnY + step * 1.3;
        const padding = UIResponsive.getControlPadding();
        const halfHeight = size.height * 0.5;
        const topSafeMargin =
            padding.top + Math.round(UIResponsive.clamp(shortSide * 0.04, 14, 28));
        const maxTitleY = halfHeight - topSafeMargin - titleH * 0.5;
        const titleY = Math.min(desiredTitleY, maxTitleY);

        this.layoutTextNode(this._titleNode, titleW, titleH, titleY, titleFontSize);
    }

    private redrawShopButton(btnNode: Node | null, width: number, height: number): void {
        if (!btnNode) return;
        const bg = btnNode.getComponent(Graphics);
        if (!bg) return;
        const r = Math.max(12, Math.round(height * 0.22));
        bg.clear();
        bg.fillColor = new Color(138, 92, 246, 255);
        bg.roundRect(-width / 2, -height / 2, width, height, r);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 200);
        bg.lineWidth = Math.max(2, Math.round(height * 0.05));
        bg.roundRect(-width / 2, -height / 2, width, height, r);
        bg.stroke();
    }

    private redrawContinueButton(btnNode: Node | null, width: number, height: number): void {
        if (!btnNode) return;
        const bg = btnNode.getComponent(Graphics);
        if (!bg) return;
        const r = Math.max(12, Math.round(height * 0.22));
        bg.clear();
        bg.fillColor = new Color(72, 192, 96, 255);
        bg.roundRect(-width / 2, -height / 2, width, height, r);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 200);
        bg.lineWidth = Math.max(2, Math.round(height * 0.05));
        bg.roundRect(-width / 2, -height / 2, width, height, r);
        bg.stroke();
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
            label.fontSize = Math.round(UIResponsive.clamp(height * 0.42, 20, 36));
            label.lineHeight = label.fontSize + 6;
        }
    }

    private refreshText() {
        this._settingsModule?.onLanguageChanged();

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
        if (this._continueBtn) {
            const comp = this._continueBtn.getChildByName('Label')?.getComponent(LocalizationComp);
            comp?.refresh();
        }
        if (this._shopBtn) {
            const comp = this._shopBtn.getChildByName('Label')?.getComponent(LocalizationComp);
            comp?.refresh();
        }
    }

    private _initSocialBridge(): void {
        this._bridgeListener = (event: SocialBridgeCallback) => {
            this._onBridgeEvent(event);
        };
        this._socialBridge.addListener(this._bridgeListener);
        this._socialBridge.requestInit();
    }

    private _onBridgeEvent(event: SocialBridgeCallback): void {
        switch (event.type) {
            case 'init':
                this._updateSubscribeButton(event.data.isSubscribed);
                if (this._leaderboardPanel && event.data.leaderboard) {
                    this._leaderboardPanel.showEntries(event.data.leaderboard);
                }
                DiamondService.instance.setInitialBalance(event.data.diamonds);
                this._updateDiamondDisplay();
                // Drain any pending settlement that failed to complete last session
                {
                    const pending = DiamondService.drainPendingSettlement();
                    if (pending && pending.wave > 0) {
                        DiamondService.instance.settleRun(
                            pending.wave,
                            pending.runId,
                            (_earned, _bal) => {
                                DiamondService.instance.refreshBalance();
                                this._updateDiamondDisplay();
                            }
                        );
                    }
                }
                break;
            case 'leaderboard':
                this._leaderboardPanel?.showEntries(event.entries);
                break;
            case 'score_submitted':
                // Cache/UI refresh is handled inside active bridge.submitScore().
                break;
            case 'subscription_result':
                if (event.success) {
                    if (event.diamondsGranted > 0) {
                        DiamondService.instance.setInitialBalance(event.newBalance);
                        this._showToast(Localization.instance.t('ui.subscribe.claimed'));
                    } else {
                        this._showToast(Localization.instance.t('ui.subscribe.already_claimed'));
                    }
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

    public setOnContinueRequested(cb: () => void): void {
        this._onContinueRequested = cb;
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

    private onContinueClick() {
        if (this._onContinueRequested) {
            this._onContinueRequested();
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
        const bridge = this._socialBridge;
        const cached = bridge.cachedLeaderboard;
        if (cached.length > 0) {
            this._leaderboardPanel.showEntries(cached);
        } else {
            this._leaderboardPanel.showLoading();
        }
        bridge.requestLeaderboard();
    }

    private onShopClick() {
        if (this._shopPanel) {
            this._shopPanel.destroy();
            this._shopPanel = null;
            return;
        }
        this._shopPanel = new ShopPanel(this.node, () => {
            this._shopPanel?.destroy();
            this._shopPanel = null;
            this._updateDiamondDisplay();
        });
    }

    private onSubscribeClick() {
        if (!this._socialBridge.supportsSubscribe) return;
        this._showSubscribeConfirmDialog();
    }

    private _showSubscribeConfirmDialog(): void {
        if (!this._contentNode) return;

        const overlay = new Node('SubscribeDialogOverlay');
        overlay.layer = this._uiLayer;
        const overlayTf = overlay.addComponent(UITransform);
        const size = this.getCanvasSize();
        overlayTf.setContentSize(size.width, size.height);
        const overlayBg = overlay.addComponent(Graphics);
        overlayBg.fillColor = new Color(0, 0, 0, 160);
        overlayBg.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        overlayBg.fill();
        this._contentNode.addChild(overlay);

        const dialog = new Node('SubscribeDialog');
        dialog.layer = this._uiLayer;
        const dialogW = Math.round(
            UIResponsive.clamp(Math.min(size.width, size.height) * 0.7, 260, 420)
        );
        const dialogH = Math.round(dialogW * 0.52);
        const dialogTf = dialog.addComponent(UITransform);
        dialogTf.setContentSize(dialogW, dialogH);
        const dialogBg = dialog.addComponent(Graphics);
        const dr = Math.max(12, Math.round(dialogH * 0.1));
        dialogBg.fillColor = new Color(20, 28, 44, 255);
        dialogBg.roundRect(-dialogW / 2, -dialogH / 2, dialogW, dialogH, dr);
        dialogBg.fill();
        dialogBg.strokeColor = new Color(255, 200, 80, 220);
        dialogBg.lineWidth = 2;
        dialogBg.roundRect(-dialogW / 2, -dialogH / 2, dialogW, dialogH, dr);
        dialogBg.stroke();
        overlay.addChild(dialog);

        const bodyNode = new Node('DialogBody');
        bodyNode.layer = this._uiLayer;
        dialog.addChild(bodyNode);
        bodyNode.addComponent(UITransform).setContentSize(dialogW - 24, Math.round(dialogH * 0.44));
        bodyNode.setPosition(0, Math.round(dialogH * 0.14), 0);
        const bodyLabel = bodyNode.addComponent(Label);
        bodyLabel.string = Localization.instance.t('ui.subscribe.dialog.body');
        bodyLabel.fontSize = Math.max(18, Math.round(dialogH * 0.14));
        bodyLabel.lineHeight = Math.max(22, Math.round(dialogH * 0.18));
        bodyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
        bodyLabel.overflow = Label.Overflow.SHRINK;
        bodyLabel.color = new Color(255, 240, 180, 255);
        applyGameLabelStyle(bodyLabel, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 180) });

        const btnY = -Math.round(dialogH * 0.26);
        const btnW = Math.round(dialogW * 0.38);
        const btnH = Math.round(dialogH * 0.22);
        const btnGap = Math.round(dialogW * 0.08);

        const confirmBtn = this._createDialogButton(
            dialog,
            'ConfirmBtn',
            Localization.instance.t('ui.subscribe.dialog.confirm'),
            btnW,
            btnH,
            btnGap * 0.5 + btnW * 0.5,
            btnY,
            new Color(72, 192, 96, 255),
            () => {
                overlay.destroy();
                if (!this._socialBridge.supportsSubscribe) {
                    return;
                }
                this._socialBridge.requestSubscribe();
            }
        );
        void confirmBtn;

        const cancelBtn = this._createDialogButton(
            dialog,
            'CancelBtn',
            Localization.instance.t('ui.subscribe.dialog.cancel'),
            btnW,
            btnH,
            -(btnGap * 0.5 + btnW * 0.5),
            btnY,
            new Color(80, 90, 110, 255),
            () => {
                overlay.destroy();
            }
        );
        void cancelBtn;
    }

    private _createDialogButton(
        parent: Node,
        name: string,
        text: string,
        w: number,
        h: number,
        x: number,
        y: number,
        bgColor: Color,
        onClick: () => void
    ): Node {
        const btn = new Node(name);
        btn.layer = this._uiLayer;
        btn.addComponent(UITransform).setContentSize(w, h);
        btn.setPosition(x, y, 0);
        const bg = btn.addComponent(Graphics);
        const r = Math.max(8, Math.round(h * 0.22));
        bg.fillColor = bgColor;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 160);
        bg.lineWidth = 1.5;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.stroke();
        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        btn.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(w - 8, h);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = Math.max(16, Math.round(h * 0.38));
        label.isBold = true;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 160) });
        btn.addComponent(Button).transition = Button.Transition.SCALE;
        btn.on(Button.EventType.CLICK, onClick, this);
        parent.addChild(btn);
        return btn;
    }

    private _updateDiamondDisplay(): void {
        if (!this._diamondLabel) return;
        const ds = DiamondService.instance;
        this._diamondLabel.string = String(ds.balance);
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
