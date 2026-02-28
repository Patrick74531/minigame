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
    EditBox,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { GameManager } from '../../core/managers/GameManager';
import { HUDSettingsModule } from '../hud/HUDSettingsModule';
import { applyGameLabelStyle } from '../hud/HUDCommon';
import { LocalizationComp } from '../LocalizationComp';
import { UIResponsive } from '../UIResponsive';
import { RedditBridge, type RedditBridgeCallback } from '../../core/reddit/RedditBridge';
import { LeaderboardPanel } from './LeaderboardPanel';
import { GameSaveManager } from '../../core/managers/GameSaveManager';
import { DiamondService } from '../../core/diamond/DiamondService';
import { ShopPanel } from './ShopPanel';
import { UIFactory } from '../UIFactory';

const { ccclass } = _decorator;

@ccclass('HomePage')
export class HomePage extends Component {
    private static readonly COOP_CREATE_MATCH_SENTINEL = '__create__';
    private _backgroundNode: Node | null = null;
    private _backgroundSprite: Sprite | null = null;
    private _contentNode: Node | null = null;
    private _settingsModule: HUDSettingsModule | null = null;
    private _uiLayer: number = Layers.Enum.UI_2D;

    private _titleNode: Node | null = null;
    private _subtitleNode: Node | null = null;
    private _startBtn: Node | null = null;
    private _coopBtn: Node | null = null;
    private _leaderboardBtn: Node | null = null;
    private _subscribeBtn: Node | null = null;
    private _leaderboardPanel: LeaderboardPanel | null = null;
    private _bridgeListener: ((e: RedditBridgeCallback) => void) | null = null;
    private _continueBtn: Node | null = null;
    private _onStartRequested: (() => void) | null = null;
    private _onContinueRequested: (() => void) | null = null;
    private _onCoopRequested: ((matchId: string) => void) | null = null;
    private _shopBtn: Node | null = null;
    private _shopPanel: ShopPanel | null = null;
    private _coinsLabel: Label | null = null;
    private _diamondLabel: Label | null = null;
    private _currencyPanelNode: Node | null = null;
    private _diamondListener: ((balance: number) => void) | null = null;
    private _coopModalNode: Node | null = null;
    private _coopPanelNode: Node | null = null;
    private _coopInviteEditBox: EditBox | null = null;

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

        this._initRedditBridge();
    }

    public onDestroy() {
        view.off('canvas-resize', this.onCanvasResize, this);
        this._settingsModule?.cleanup();
        if (this._bridgeListener) {
            RedditBridge.instance.removeListener(this._bridgeListener);
        }
        if (this._diamondListener) {
            DiamondService.instance.removeListener(this._diamondListener);
        }
        if (this._shopPanel) {
            this._shopPanel.destroy();
            this._shopPanel = null;
        }
        this._closeCoopModal();
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
        this._coopBtn = this.createGameButton('CoopButton', 'ui.home.coop', 0, 60, () =>
            this.onCoopClick()
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
        this._contentNode.addChild(this._coopBtn);
        this._contentNode.addChild(this._leaderboardBtn);
        this._contentNode.addChild(this._shopBtn);
        this._contentNode.addChild(this._subscribeBtn);

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
        this.updateCoopModalLayout();
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

        // Button stack: continue(opt) > start > coop > leaderboard > shop > subscribe
        const btnCount = hasContinue ? 6 : 5;
        // Keep button stack lower to avoid title overlap on dense menus.
        const stackCenter = -step * 2.9;

        let slot = btnCount - 1;
        if (hasContinue) {
            this.layoutButton(this._continueBtn, buttonW, buttonH, stackCenter + step * slot);
            this.redrawContinueButton(this._continueBtn, buttonW, buttonH);
            slot--;
        }
        this.layoutButton(this._startBtn, buttonW, buttonH, stackCenter + step * slot);
        slot--;
        this.layoutButton(this._coopBtn, buttonW, buttonH, stackCenter + step * slot);
        slot--;
        this.layoutButton(this._leaderboardBtn, buttonW, buttonH, stackCenter + step * slot);
        slot--;
        this.layoutButton(this._shopBtn, buttonW, buttonH, stackCenter + step * slot);
        this.redrawShopButton(this._shopBtn, buttonW, buttonH);
        slot--;
        this.layoutButton(this._subscribeBtn, buttonW, buttonH, stackCenter + step * slot);

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
        if (this._coopBtn) {
            const comp = this._coopBtn.getChildByName('Label')?.getComponent(LocalizationComp);
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
        this.updateCoopModalLayout();
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

    public setOnContinueRequested(cb: () => void): void {
        this._onContinueRequested = cb;
    }

    public setOnCoopRequested(cb: (matchId: string) => void): void {
        this._onCoopRequested = cb;
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
        this._setRuntimeMode('solo');
        if (this._onStartRequested) {
            this._onStartRequested();
        } else {
            GameManager.instance.startGame();
            this.node.destroy();
        }
    }

    private onContinueClick() {
        this._setRuntimeMode('solo');
        if (this._onContinueRequested) {
            this._onContinueRequested();
        }
    }

    private onCoopClick() {
        this._openCoopModal();
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
        const bridge = RedditBridge.instance;
        if (!bridge.isRedditEnvironment) {
            this._showToast(Localization.instance.t('ui.home.subscribe.already'));
            return;
        }
        bridge.requestSubscribe();
    }

    private _updateDiamondDisplay(): void {
        if (!this._diamondLabel) return;
        const ds = DiamondService.instance;
        this._diamondLabel.string = String(ds.balance);
    }

    private _openCoopModal(initialValue: string = ''): void {
        if (this._coopModalNode && this._coopModalNode.isValid) return;

        const modal = new Node('CoopModal');
        modal.layer = this._uiLayer;
        const modalTf = modal.addComponent(UITransform);
        const canvasSize = this.getCanvasSize();
        modalTf.setContentSize(canvasSize.width, canvasSize.height);
        const modalWidget = modal.addComponent(Widget);
        modalWidget.isAlignTop = true;
        modalWidget.isAlignBottom = true;
        modalWidget.isAlignLeft = true;
        modalWidget.isAlignRight = true;
        modalWidget.top = 0;
        modalWidget.bottom = 0;
        modalWidget.left = 0;
        modalWidget.right = 0;

        modal.addComponent(Graphics);
        const blocker = modal.addComponent(Button);
        blocker.transition = Button.Transition.NONE;
        modal.on(Button.EventType.CLICK, () => {
            // Consume clicks so underlying home buttons are blocked.
        });

        const panel = new Node('CoopModalPanel');
        panel.layer = this._uiLayer;
        panel.addComponent(UITransform);
        panel.addComponent(Graphics);
        modal.addChild(panel);

        const titleNode = new Node('Title');
        titleNode.layer = this._uiLayer;
        titleNode.addComponent(UITransform);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.isBold = true;
        titleLabel.color = new Color(255, 233, 143, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(titleLabel, { outlineWidth: 3, outlineColor: new Color(0, 0, 0, 210) });
        panel.addChild(titleNode);

        const descNode = new Node('Description');
        descNode.layer = this._uiLayer;
        descNode.addComponent(UITransform);
        const descLabel = descNode.addComponent(Label);
        descLabel.color = new Color(235, 239, 255, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        descLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        panel.addChild(descNode);

        const inputNode = new Node('InviteInput');
        inputNode.layer = this._uiLayer;
        inputNode.addComponent(UITransform);
        inputNode.addComponent(Graphics);
        panel.addChild(inputNode);

        const inputLabelNode = new Node('InputLabel');
        inputLabelNode.layer = this._uiLayer;
        inputNode.addChild(inputLabelNode);
        inputLabelNode.addComponent(UITransform);
        const inputLabel = inputLabelNode.addComponent(Label);
        inputLabel.color = new Color(250, 251, 255, 255);
        inputLabel.fontSize = 24;
        inputLabel.lineHeight = 30;
        inputLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        inputLabel.verticalAlign = Label.VerticalAlign.CENTER;
        inputLabel.overflow = Label.Overflow.SHRINK;

        const placeholderNode = new Node('PlaceholderLabel');
        placeholderNode.layer = this._uiLayer;
        inputNode.addChild(placeholderNode);
        placeholderNode.addComponent(UITransform);
        const placeholderLabel = placeholderNode.addComponent(Label);
        placeholderLabel.color = new Color(156, 169, 196, 255);
        placeholderLabel.fontSize = 22;
        placeholderLabel.lineHeight = 28;
        placeholderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        placeholderLabel.verticalAlign = Label.VerticalAlign.CENTER;
        placeholderLabel.overflow = Label.Overflow.SHRINK;

        const inputEditBox = inputNode.addComponent(EditBox);
        inputEditBox.maxLength = 120;
        inputEditBox.string = initialValue;
        inputEditBox.textLabel = inputLabel;
        inputEditBox.placeholderLabel = placeholderLabel;
        this._coopInviteEditBox = inputEditBox;
        const isForcedLandscape =
            typeof window !== 'undefined' && (window as any).__BOOT_FORCE_LANDSCAPE__ === true;
        if (isForcedLandscape && typeof window !== 'undefined') {
            inputEditBox.enabled = false;
            const tapInput = inputNode.addComponent(Button);
            tapInput.transition = Button.Transition.NONE;
            inputNode.on(
                Button.EventType.CLICK,
                () => {
                    this._showDomInputOverlay();
                },
                this
            );
        }

        const createBtn = this._createCoopModalButton(
            panel,
            'CreateBtn',
            Localization.instance.t('ui.home.coop.create'),
            () => {
                this._closeCoopModal();
                this._requestCoopStart(HomePage.COOP_CREATE_MATCH_SENTINEL);
            }
        );
        const joinBtn = this._createCoopModalButton(
            panel,
            'JoinBtn',
            Localization.instance.t('ui.home.coop.join'),
            () => {
                let input = this._coopInviteEditBox?.string?.trim() ?? '';
                if (isForcedLandscape && typeof window !== 'undefined' && !input) {
                    const prompted = window.prompt(
                        Localization.instance.t('ui.home.coop.prompt') ||
                            'Enter invite code / 输入邀请码'
                    );
                    if (prompted === null) return; // cancelled
                    input = prompted.trim();
                    if (this._coopInviteEditBox) {
                        this._coopInviteEditBox.string = input;
                    }
                }
                const matchId = this._extractMatchId(input);
                if (!matchId) {
                    const msgKey = input ? 'ui.home.coop.invalid' : 'ui.home.coop.empty';
                    this._showToast(Localization.instance.t(msgKey));
                    return;
                }
                this._closeCoopModal();
                this._requestCoopStart(matchId);
            }
        );
        const cancelBtn = this._createCoopModalButton(
            panel,
            'CancelBtn',
            Localization.instance.t('ui.home.coop.cancel'),
            () => this._closeCoopModal()
        );

        this._coopModalNode = modal;
        this._coopPanelNode = panel;
        this.node.addChild(modal);
        this.updateCoopModalLayout();

        // draw theme colors after size is known
        this._redrawCoopModalButton(createBtn, new Color(72, 192, 96, 255), Color.WHITE);
        this._redrawCoopModalButton(joinBtn, new Color(255, 198, 88, 255), Color.WHITE);
        this._redrawCoopModalButton(
            cancelBtn,
            new Color(86, 98, 128, 255),
            new Color(240, 244, 255, 255)
        );
    }

    private _closeCoopModal(): void {
        if (this._coopModalNode && this._coopModalNode.isValid) {
            this._coopModalNode.destroy();
        }
        this._coopModalNode = null;
        this._coopPanelNode = null;
        this._coopInviteEditBox = null;
    }

    private updateCoopModalLayout(): void {
        if (!this._coopModalNode || !this._coopModalNode.isValid) return;
        const modal = this._coopModalNode;
        const size = this.getCanvasSize();
        modal.getComponent(UITransform)?.setContentSize(size.width, size.height);
        modal.getComponent(Widget)?.updateAlignment();

        const mask = modal.getComponent(Graphics);
        if (mask) {
            mask.clear();
            mask.fillColor = new Color(10, 14, 26, 190);
            mask.rect(-size.width * 0.5, -size.height * 0.5, size.width, size.height);
            mask.fill();
        }

        const panel = this._coopPanelNode;
        if (!panel || !panel.isValid) return;

        const shortSide = Math.min(size.width, size.height);
        const panelW = Math.round(UIResponsive.clamp(shortSide * 0.84, 320, 560));
        const panelH = Math.round(UIResponsive.clamp(shortSide * 0.64, 280, 430));
        panel.getComponent(UITransform)?.setContentSize(panelW, panelH);
        panel.setPosition(0, -Math.round(shortSide * 0.04), 0);

        const panelBg = panel.getComponent(Graphics);
        if (panelBg) {
            const radius = Math.max(16, Math.round(panelH * 0.07));
            panelBg.clear();
            panelBg.fillColor = new Color(23, 32, 55, 242);
            panelBg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
            panelBg.fill();
            panelBg.strokeColor = new Color(255, 216, 120, 220);
            panelBg.lineWidth = Math.max(2, Math.round(panelH * 0.012));
            panelBg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
            panelBg.stroke();
        }

        const titleNode = panel.getChildByName('Title');
        const descNode = panel.getChildByName('Description');
        const inputNode = panel.getChildByName('InviteInput');
        const createBtn = panel.getChildByName('CreateBtn');
        const joinBtn = panel.getChildByName('JoinBtn');
        const cancelBtn = panel.getChildByName('CancelBtn');

        const titleY = panelH * 0.33;
        const descY = panelH * 0.18;
        const inputY = panelH * 0.02;
        const actionY = -panelH * 0.23;
        const cancelY = -panelH * 0.38;

        const titleLabel = titleNode?.getComponent(Label);
        if (titleNode && titleLabel) {
            titleNode.getComponent(UITransform)?.setContentSize(panelW - 56, 54);
            titleNode.setPosition(0, titleY, 0);
            titleLabel.fontSize = Math.round(UIResponsive.clamp(panelH * 0.1, 30, 46));
            titleLabel.lineHeight = titleLabel.fontSize + 8;
            titleLabel.string = Localization.instance.t('ui.home.coop.modal.title');
        }

        const descLabel = descNode?.getComponent(Label);
        if (descNode && descLabel) {
            descNode.getComponent(UITransform)?.setContentSize(panelW - 72, 62);
            descNode.setPosition(0, descY, 0);
            descLabel.fontSize = Math.round(UIResponsive.clamp(panelH * 0.05, 20, 28));
            descLabel.lineHeight = descLabel.fontSize + 6;
            descLabel.string = Localization.instance.t('ui.home.coop.modal.desc');
        }

        const inputW = panelW - 72;
        const inputH = Math.round(UIResponsive.clamp(panelH * 0.19, 52, 74));
        const inputBg = inputNode?.getComponent(Graphics);
        if (inputNode && inputBg) {
            inputNode.getComponent(UITransform)?.setContentSize(inputW, inputH);
            inputNode.setPosition(0, inputY, 0);
            inputBg.clear();
            inputBg.fillColor = new Color(14, 20, 37, 255);
            inputBg.roundRect(-inputW / 2, -inputH / 2, inputW, inputH, 12);
            inputBg.fill();
            inputBg.strokeColor = new Color(106, 124, 170, 220);
            inputBg.lineWidth = 2;
            inputBg.roundRect(-inputW / 2, -inputH / 2, inputW, inputH, 12);
            inputBg.stroke();
        }

        const inputLabel = inputNode?.getChildByName('InputLabel')?.getComponent(Label);
        const placeholderLabel = inputNode?.getChildByName('PlaceholderLabel')?.getComponent(Label);
        if (inputLabel) {
            const textW = inputW - 30;
            const textH = inputH - 8;
            inputLabel.node.getComponent(UITransform)?.setContentSize(textW, textH);
            inputLabel.node.setPosition(4, 0, 0);
            inputLabel.fontSize = Math.round(UIResponsive.clamp(inputH * 0.38, 20, 30));
            inputLabel.lineHeight = inputLabel.fontSize + 6;
        }
        if (placeholderLabel) {
            const textW = inputW - 30;
            const textH = inputH - 8;
            placeholderLabel.node.getComponent(UITransform)?.setContentSize(textW, textH);
            placeholderLabel.node.setPosition(4, 0, 0);
            placeholderLabel.fontSize = Math.round(UIResponsive.clamp(inputH * 0.34, 18, 26));
            placeholderLabel.lineHeight = placeholderLabel.fontSize + 6;
            placeholderLabel.string = Localization.instance.t('ui.home.coop.input_placeholder');
        }

        const actionBtnW = Math.round((panelW - 84) * 0.5);
        const actionBtnH = Math.round(UIResponsive.clamp(panelH * 0.16, 48, 66));
        if (createBtn) {
            createBtn.getComponent(UITransform)?.setContentSize(actionBtnW, actionBtnH);
            createBtn.setPosition(-Math.round(actionBtnW * 0.52), actionY, 0);
        }
        if (joinBtn) {
            joinBtn.getComponent(UITransform)?.setContentSize(actionBtnW, actionBtnH);
            joinBtn.setPosition(Math.round(actionBtnW * 0.52), actionY, 0);
        }
        if (cancelBtn) {
            const cancelW = Math.round(UIResponsive.clamp(panelW * 0.4, 140, 220));
            const cancelH = Math.round(UIResponsive.clamp(panelH * 0.13, 42, 56));
            cancelBtn.getComponent(UITransform)?.setContentSize(cancelW, cancelH);
            cancelBtn.setPosition(0, cancelY, 0);
        }

        if (createBtn) {
            const l = createBtn.getChildByName('Label')?.getComponent(Label);
            if (l) l.string = Localization.instance.t('ui.home.coop.create');
            this._redrawCoopModalButton(createBtn, new Color(72, 192, 96, 255), Color.WHITE);
        }
        if (joinBtn) {
            const l = joinBtn.getChildByName('Label')?.getComponent(Label);
            if (l) l.string = Localization.instance.t('ui.home.coop.join');
            this._redrawCoopModalButton(joinBtn, new Color(255, 198, 88, 255), Color.WHITE);
        }
        if (cancelBtn) {
            const l = cancelBtn.getChildByName('Label')?.getComponent(Label);
            if (l) l.string = Localization.instance.t('ui.home.coop.cancel');
            this._redrawCoopModalButton(
                cancelBtn,
                new Color(86, 98, 128, 255),
                new Color(240, 244, 255, 255)
            );
        }
    }

    private _createCoopModalButton(
        parent: Node,
        name: string,
        text: string,
        onClick: () => void
    ): Node {
        const btnNode = new Node(name);
        btnNode.layer = this._uiLayer;
        btnNode.addComponent(UITransform).setContentSize(200, 56);
        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.96;
        btnNode.addComponent(Graphics);

        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        btnNode.addChild(labelNode);
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.isBold = true;
        label.fontSize = 30;
        label.lineHeight = 36;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 180) });

        btnNode.on(Button.EventType.CLICK, onClick, this);
        parent.addChild(btnNode);
        return btnNode;
    }

    private _redrawCoopModalButton(btnNode: Node, fillColor: Color, textColor: Color): void {
        const tf = btnNode.getComponent(UITransform);
        const bg = btnNode.getComponent(Graphics);
        if (!tf || !bg) return;

        const width = tf.contentSize.width;
        const height = tf.contentSize.height;
        const radius = Math.max(10, Math.round(height * 0.25));
        bg.clear();
        bg.fillColor = fillColor;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 180);
        bg.lineWidth = Math.max(2, Math.round(height * 0.06));
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();

        const labelNode = btnNode.getChildByName('Label');
        const labelTf = labelNode?.getComponent(UITransform);
        const label = labelNode?.getComponent(Label);
        if (labelTf) {
            labelTf.setContentSize(Math.max(80, width - 24), height - 6);
        }
        if (label) {
            label.color = textColor;
            label.fontSize = Math.round(UIResponsive.clamp(height * 0.46, 20, 34));
            label.lineHeight = label.fontSize + 6;
        }
    }

    private _extractMatchId(raw: string): string {
        const text = raw.trim();
        if (!text) return '';
        const idPattern = /^[a-z0-9]+-[a-z0-9]+$/i;
        if (idPattern.test(text)) return text;
        try {
            const parsed = new URL(text, window.location.origin);
            const matchId = parsed.searchParams.get('matchId')?.trim() ?? '';
            if (idPattern.test(matchId)) return matchId;
        } catch {
            // ignore parse failure
        }
        return '';
    }

    private _setRuntimeMode(mode: 'solo' | 'coop'): void {
        try {
            window.localStorage?.setItem('KS_RUNTIME_MODE', mode);
            if (mode !== 'coop') {
                window.localStorage?.removeItem('KS_COOP_MATCH_ID');
            }
        } catch {
            // ignore localStorage failures
        }
    }

    private _requestCoopStart(matchId: string): void {
        if (this._onCoopRequested) {
            this._onCoopRequested(matchId);
            return;
        }
        this._showToast('双人模式初始化失败，请返回首页重试');
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

    private _showDomInputOverlay(): void {
        if (typeof document === 'undefined') return;
        const OVERLAY_ID = 'ks-coop-input-overlay';
        const existing = document.getElementById(OVERLAY_ID);
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        // No rotation — portrait modal so the input card and iOS keyboard
        // are both in portrait orientation and fully usable together.
        overlay.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:100vw',
            'height:100vh',
            'z-index:99999',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'background:rgba(0,0,0,0.75)',
        ].join(';');

        const card = document.createElement('div');
        card.style.cssText = [
            'background:#1a243c',
            'padding:24px',
            'border-radius:16px',
            'border:2px solid #ffd970',
            'width:320px',
            'display:flex',
            'flex-direction:column',
            'gap:12px',
            'box-sizing:border-box',
        ].join(';');

        const title = document.createElement('p');
        title.textContent = '输入邀请码 / Enter Invite Code';
        title.style.cssText =
            'margin:0;color:#ffe891;font-size:15px;text-align:center;font-family:sans-serif;font-weight:bold;';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = this._coopInviteEditBox?.string ?? '';
        input.maxLength = 120;
        input.autocomplete = 'off';
        input.autocapitalize = 'none';
        input.style.cssText = [
            'width:100%',
            'box-sizing:border-box',
            'padding:10px 14px',
            'font-size:18px',
            'border-radius:8px',
            'border:none',
            'outline:none',
            'background:#eef0ff',
            'color:#111',
        ].join(';');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText =
            'flex:1;padding:10px;background:#5a628f;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-family:sans-serif;';

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认';
        confirmBtn.style.cssText =
            'flex:1;padding:10px;background:#48c060;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-family:sans-serif;';

        const dismiss = (): void => {
            const el = document.getElementById(OVERLAY_ID);
            if (el) el.remove();
        };

        cancelBtn.onclick = () => dismiss();
        confirmBtn.onclick = () => {
            if (this._coopInviteEditBox) {
                this._coopInviteEditBox.string = input.value.trim();
            }
            dismiss();
        };
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        card.appendChild(title);
        card.appendChild(input);
        card.appendChild(btnRow);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Focus after a short delay so the keyboard appears
        setTimeout(() => input.focus(), 80);
    }
}
