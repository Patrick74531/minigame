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
    assetManager,
    AssetManager,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { GameManager } from '../../core/managers/GameManager';
import { EventManager } from '../../core/managers/EventManager';
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
import { GameEvents } from '../../data/GameEvents';
import { PendingScoreSubmissionStore } from '../../core/settlement/PendingScoreSubmissionStore';
import {
    TikTokMissionService,
    type TikTokMissionActionResult,
    type TikTokMissionState,
} from '../../core/tiktok/TikTokMissionService';

const { ccclass } = _decorator;

type TikTokMissionActionIcon = 'shortcut' | 'profile';
type TikTokMissionVisualState = 'pending' | 'done' | 'unavailable' | 'processing' | 'guide';
type TikTokGuideStepIcon = 'profile' | 'sidebar' | 'game';

@ccclass('HomePage')
export class HomePage extends Component {
    private _backgroundNode: Node | null = null;
    private _backgroundSprite: Sprite | null = null;
    private _backgroundFallbackNode: Node | null = null;
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
    private _tiktokMissionPanel: Node | null = null;
    private _tiktokShortcutBtn: Node | null = null;
    private _tiktokProfileBtn: Node | null = null;
    private _tiktokMissionBodyNode: Node | null = null;
    private _tiktokMissionState: TikTokMissionState | null = null;
    private _tiktokShortcutBusy = false;
    private _tiktokProfileBusy = false;

    public onLoad() {
        this._uiLayer = this.node.parent?.layer ?? Layers.Enum.UI_2D;
        this.node.layer = this._uiLayer;

        this.ensureRootLayout();
        this.createUI();

        this.hideHomeOnlyHudEntries();
        EventManager.instance.on(GameEvents.LANGUAGE_CHANGED, this.onLanguageChanged, this);

        view.on('canvas-resize', this.onCanvasResize, this);
        this.onCanvasResize();
        this.scheduleOnce(() => this.onCanvasResize(), 0);

        // Show buttons immediately — don't wait for background texture
        this._revealContent();

        this._initSocialBridge();
        void this._refreshTikTokMissionState();
    }

    public onDestroy() {
        view.off('canvas-resize', this.onCanvasResize, this);
        EventManager.instance.off(GameEvents.LANGUAGE_CHANGED, this.onLanguageChanged, this);
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
        this.node.getChildByName('HomeBackgroundFallback')?.destroy();
        this.node.getChildByName('HomeBackground')?.destroy();
        this.node.getChildByName('HomeContent')?.destroy();

        this._backgroundFallbackNode = new Node('HomeBackgroundFallback');
        this._backgroundFallbackNode.layer = this._uiLayer;
        this.node.addChild(this._backgroundFallbackNode);
        this._backgroundFallbackNode.addComponent(UITransform);
        const fallbackWidget = this._backgroundFallbackNode.addComponent(Widget);
        fallbackWidget.isAlignHorizontalCenter = true;
        fallbackWidget.isAlignVerticalCenter = true;
        fallbackWidget.horizontalCenter = 0;
        fallbackWidget.verticalCenter = 0;
        this._backgroundFallbackNode.addComponent(Graphics);

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
        this.createTikTokMissionPanel();

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
        // Home page should not show in-game currency HUD.
        this._currencyPanelNode.active = false;
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

        this.updateBackgroundFallbackLayout();
        this.updateContentLayout();
    }

    private createTikTokMissionPanel(): void {
        this._tiktokMissionPanel = null;
        this._tiktokShortcutBtn = null;
        this._tiktokProfileBtn = null;
        this._tiktokMissionBodyNode = null;

        if (!this._contentNode || !this.isTikTokRuntime()) {
            return;
        }

        const panel = new Node('TikTokMissionPanel');
        panel.layer = this._uiLayer;
        panel.addComponent(UITransform).setContentSize(360, 74);
        this._contentNode.addChild(panel);
        this._tiktokMissionPanel = panel;

        this._tiktokShortcutBtn = this.createTikTokMissionActionButton(
            'TikTokShortcutButton',
            'ui.home.tiktok.shortcut.cta',
            () => this.onTikTokShortcutClick()
        );
        panel.addChild(this._tiktokShortcutBtn);

        this._tiktokProfileBtn = this.createTikTokMissionActionButton(
            'TikTokProfileButton',
            'ui.home.tiktok.profile.cta',
            () => this.onTikTokProfileClick()
        );
        panel.addChild(this._tiktokProfileBtn);

        this._applyTikTokMissionState();
    }

    private updateBackgroundFallbackLayout(): void {
        if (!this._backgroundFallbackNode) return;

        const tf =
            this._backgroundFallbackNode.getComponent(UITransform) ??
            this._backgroundFallbackNode.addComponent(UITransform);
        const size = this.getBackgroundCoverageSize();
        tf.setContentSize(Math.max(1, size.width), Math.max(1, size.height));
        this._backgroundFallbackNode.getComponent(Widget)?.updateAlignment();

        const g =
            this._backgroundFallbackNode.getComponent(Graphics) ??
            this._backgroundFallbackNode.addComponent(Graphics);
        const width = tf.contentSize.width;
        const height = tf.contentSize.height;
        const longSide = Math.max(width, height);

        g.clear();
        g.fillColor = new Color(11, 22, 33, 255);
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();

        g.fillColor = new Color(28, 68, 56, 200);
        g.circle(-width * 0.26, height * 0.08, longSide * 0.22);
        g.fill();

        g.fillColor = new Color(214, 129, 59, 132);
        g.circle(width * 0.33, height * 0.2, longSide * 0.16);
        g.fill();

        g.fillColor = new Color(81, 111, 142, 128);
        g.circle(width * 0.14, -height * 0.28, longSide * 0.2);
        g.fill();

        g.fillColor = new Color(250, 214, 124, 46);
        g.roundRect(-width * 0.46, -height * 0.44, width * 0.92, height * 0.18, 26);
        g.fill();
    }

    private loadBackgroundTexture() {
        if (this.isTikTokRuntime()) {
            this.loadTikTokBackgroundTexture();
            return;
        }

        this.loadBackgroundFromResources('ui/homepage', err => {
            console.warn('Failed to load homepage background', err);
        });
    }

    private loadTikTokBackgroundTexture(): void {
        const defaultPath = 'ui/homepage';
        const portraitPath = 'ui/homepage_tiktok_portrait';
        const preferredPath = UIResponsive.isTikTokPhonePortraitProfile()
            ? portraitPath
            : defaultPath;

        this.ensureResourcesBundleForTikTok()
            .then(bundle => {
                this.loadBackgroundFromBundle(bundle, preferredPath, err => {
                    if (preferredPath === defaultPath) {
                        console.warn(
                            'Failed to load homepage background from TikTok resources bundle',
                            err
                        );
                        return;
                    }

                    this.loadBackgroundFromBundle(bundle, defaultPath, fallbackErr => {
                        console.warn(
                            'Failed to load homepage background from TikTok resources bundle',
                            fallbackErr ?? err
                        );
                    });
                });
            })
            .catch(err => {
                console.warn(
                    'Failed to prepare TikTok resources bundle for homepage background',
                    err
                );
                // Fallback to the default resources API.
                this.loadBackgroundFromResources(preferredPath, preferredErr => {
                    if (preferredPath === defaultPath) {
                        console.warn('Failed to load homepage background', preferredErr);
                        return;
                    }
                    this.loadBackgroundFromResources(defaultPath, fallbackErr => {
                        console.warn(
                            'Failed to load homepage background',
                            fallbackErr ?? preferredErr
                        );
                    });
                });
            });
    }

    private loadBackgroundFromResources(path: string, onFail: (err: unknown) => void): void {
        resources.load(path, Texture2D, (textureErr, texture) => {
            if (!textureErr && texture) {
                this.applyBackgroundTexture(texture);
                return;
            }

            resources.load(path, ImageAsset, (imageErr, imageAsset) => {
                if (!imageErr && imageAsset) {
                    const fallbackTexture = new Texture2D();
                    fallbackTexture.image = imageAsset;
                    this.applyBackgroundTexture(fallbackTexture);
                    return;
                }
                onFail(imageErr ?? textureErr);
            });
        });
    }

    private loadBackgroundFromBundle(
        bundle: AssetManager.Bundle,
        path: string,
        onFail: (err: unknown) => void
    ): void {
        bundle.load(path, Texture2D, (textureErr, texture) => {
            if (!textureErr && texture) {
                this.applyBackgroundTexture(texture);
                return;
            }

            bundle.load(path, ImageAsset, (imageErr, imageAsset) => {
                if (!imageErr && imageAsset) {
                    const fallbackTexture = new Texture2D();
                    fallbackTexture.image = imageAsset;
                    this.applyBackgroundTexture(fallbackTexture);
                    return;
                }
                onFail(imageErr ?? textureErr);
            });
        });
    }

    private ensureResourcesBundleForTikTok(): Promise<AssetManager.Bundle> {
        const existing = assetManager.getBundle('resources');
        if (existing) return Promise.resolve(existing);

        const loadBundle = () =>
            new Promise<AssetManager.Bundle>((resolve, reject) => {
                assetManager.loadBundle('resources', (err, bundle) => {
                    if (err || !bundle) {
                        reject(err ?? new Error('resources bundle load returned empty bundle'));
                        return;
                    }
                    resolve(bundle);
                });
            });

        return loadBundle().catch(firstErr => {
            const ttLike = (
                globalThis as unknown as {
                    tt?: {
                        loadSubpackage?: (options: {
                            name: string;
                            success?: () => void;
                            fail?: (err: unknown) => void;
                        }) => void;
                    };
                }
            ).tt;

            if (!ttLike?.loadSubpackage) {
                throw firstErr;
            }

            return new Promise<AssetManager.Bundle>((resolve, reject) => {
                ttLike.loadSubpackage?.({
                    name: 'resources',
                    success: () => {
                        loadBundle().then(resolve).catch(reject);
                    },
                    fail: reject,
                });
            });
        });
    }

    private isTikTokRuntime(): boolean {
        const g = globalThis as unknown as { __GVR_PLATFORM__?: unknown; tt?: unknown };
        return g.__GVR_PLATFORM__ === 'tiktok' || typeof g.tt !== 'undefined';
    }

    private _revealContent(): void {
        if (!this._contentNode || !this._contentNode.isValid) return;
        this._contentNode.active = true;
        this._contentNode.setScale(0.96, 0.96, 1);
        tween(this._contentNode)
            .to(0.3, { scale: new Vec3(1, 1, 1) })
            .start();
        this.scheduleOnce(() => {
            if (!this.isValid) return;
            this._hideStartupLoadingOverlays();
        }, 0.15);
    }

    private _hideStartupLoadingOverlays(): void {
        try {
            const w = window as unknown as {
                _hideSplash?: () => void;
                __GVR_HIDE_TIKTOK_NATIVE_LOADING__?: () => void;
            };
            if (typeof w._hideSplash === 'function') {
                w._hideSplash();
            }
            if (typeof w.__GVR_HIDE_TIKTOK_NATIVE_LOADING__ === 'function') {
                w.__GVR_HIDE_TIKTOK_NATIVE_LOADING__();
            }
        } catch {
            // Ignore missing DOM-style globals in mini-game runtimes.
        }

        try {
            const g = globalThis as Record<string, unknown> & {
                __GVR_HIDE_TIKTOK_NATIVE_LOADING__?: () => void;
            };
            if (typeof g.__GVR_HIDE_TIKTOK_NATIVE_LOADING__ === 'function') {
                g.__GVR_HIDE_TIKTOK_NATIVE_LOADING__();
            }
        } catch {
            // Ignore missing global loading hooks.
        }
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

    private createTikTokMissionActionButton(
        name: string,
        locKey: string,
        onClick: () => void
    ): Node {
        const btnNode = new Node(name);
        btnNode.layer = this._uiLayer;
        btnNode.addComponent(UITransform).setContentSize(140, 66);
        const button = btnNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        btnNode.addComponent(Graphics);

        const iconNode = new Node('Icon');
        iconNode.layer = this._uiLayer;
        iconNode.addComponent(UITransform).setContentSize(28, 28);
        iconNode.addComponent(Graphics);
        btnNode.addChild(iconNode);

        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        labelNode.addComponent(UITransform).setContentSize(112, 20);
        const label = labelNode.addComponent(Label);
        label.string = Localization.instance.t(locKey);
        label.fontSize = 13;
        label.isBold = true;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 168) });
        const locComp = labelNode.addComponent(LocalizationComp);
        locComp.key = locKey;
        btnNode.addChild(labelNode);

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
        this.updateBackgroundFallbackLayout();
        this.updateBackgroundLayout();
        this.updateContentLayout();
        this._settingsModule?.onCanvasResize();
        this.hideHomeOnlyHudEntries();
    }

    private hideHomeOnlyHudEntries(): void {
        if (this._currencyPanelNode?.isValid) {
            this._currencyPanelNode.active = false;
        }

        const settingsBtn = this._settingsModule?.settingsButtonNode;
        if (settingsBtn?.isValid) {
            this.disableInteractionNode(settingsBtn);
        }

        const settingsPanelRoot = this.node.getChildByName('SettingsPanelRoot');
        if (settingsPanelRoot?.isValid) {
            this.disableInteractionNode(settingsPanelRoot);
        }

        // Home should not expose settings triggers from any leaked HUD node.
        this.disableNamedNodeRecursively(this.node, 'SettingsButton');
        this.disableNamedNodeRecursively(this.node, 'SettingsPanelRoot');
        const parentNode = this.node.parent;
        if (parentNode && parentNode !== this.node) {
            this.disableNamedNodeRecursively(parentNode, 'SettingsButton');
            this.disableNamedNodeRecursively(parentNode, 'SettingsPanelRoot');
        }
    }

    private disableNamedNodeRecursively(root: Node, nodeName: string): void {
        if (!root?.isValid) return;
        const stack: Node[] = [root];
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current || !current.isValid) continue;
            if (current.name === nodeName) {
                this.disableInteractionNode(current);
            }
            for (const child of current.children) {
                stack.push(child);
            }
        }
    }

    private disableInteractionNode(node: Node): void {
        if (!node?.isValid) return;
        node.active = false;
        const btn = node.getComponent(Button);
        if (btn) {
            btn.interactable = false;
            btn.enabled = false;
        }
        node.pauseSystemEvents(true);
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
        const isTikTokPortraitProfile =
            UIResponsive.getRuntimeDisplayProfile() === 'tiktok_phone_portrait';
        const buttonWidthFactor = isTikTokPortraitProfile ? 0.44 : 0.34;
        const buttonHeightFactor = isTikTokPortraitProfile ? 0.086 : 0.09;
        const buttonW = Math.round(
            UIResponsive.clamp(
                shortSide * buttonWidthFactor,
                isTikTokPortraitProfile ? 160 : 130,
                320
            )
        );
        const buttonH = Math.round(
            UIResponsive.clamp(
                shortSide * buttonHeightFactor,
                isTikTokPortraitProfile ? 40 : 38,
                isTikTokPortraitProfile ? 62 : 84
            )
        );
        const gap = Math.round(
            UIResponsive.clamp(
                shortSide * (isTikTokPortraitProfile ? 0.017 : 0.022),
                isTikTokPortraitProfile ? 8 : 6,
                isTikTokPortraitProfile ? 14 : 24
            )
        );
        const buttonNodes: Node[] = [];
        if (this._continueBtn) {
            buttonNodes.push(this._continueBtn);
        }
        if (this._startBtn) {
            buttonNodes.push(this._startBtn);
        }
        if (this._leaderboardBtn) {
            buttonNodes.push(this._leaderboardBtn);
        }
        if (this._shopBtn) {
            buttonNodes.push(this._shopBtn);
        }
        if (this._subscribeBtn) {
            buttonNodes.push(this._subscribeBtn);
        }

        const titleFontSize = Math.round(
            UIResponsive.clamp(
                shortSide * (isTikTokPortraitProfile ? 0.056 : 0.072),
                isTikTokPortraitProfile ? 28 : 36,
                isTikTokPortraitProfile ? 46 : 60
            )
        );
        const titleW = Math.round(Math.min(size.width - 40, 600));
        const titleH = titleFontSize + 12;
        const padding = UIResponsive.getControlPadding();
        const halfHeight = size.height * 0.5;
        const topSafeMargin =
            padding.top +
            Math.round(
                UIResponsive.clamp(
                    shortSide * (isTikTokPortraitProfile ? 0.02 : 0.03),
                    isTikTokPortraitProfile ? 10 : 12,
                    isTikTokPortraitProfile ? 18 : 24
                )
            );
        const bottomSafeMargin =
            padding.bottom +
            Math.round(
                UIResponsive.clamp(
                    shortSide * (isTikTokPortraitProfile ? 0.02 : 0.025),
                    10,
                    isTikTokPortraitProfile ? 18 : 22
                )
            );
        const hasTikTokMissionPanel = !!this._tiktokMissionPanel?.isValid;
        const panelGap = hasTikTokMissionPanel
            ? Math.round(
                  UIResponsive.clamp(
                      shortSide * (isTikTokPortraitProfile ? 0.012 : 0.014),
                      6,
                      14
                  )
              )
            : 0;
        const panelW = Math.round(
            Math.min(
                size.width - (isTikTokPortraitProfile ? 28 : 88),
                isTikTokPortraitProfile ? 352 : 380
            )
        );
        let panelH = hasTikTokMissionPanel
            ? Math.round(
                  UIResponsive.clamp(
                      shortSide * (isTikTokPortraitProfile ? 0.102 : 0.085),
                      isTikTokPortraitProfile ? 64 : 58,
                      isTikTokPortraitProfile ? 82 : 74
                  )
              )
            : 0;
        const buttonStackHeight =
            buttonNodes.length > 0
                ? buttonNodes.length * buttonH + Math.max(0, buttonNodes.length - 1) * gap
                : 0;
        const totalAvailableHeight = size.height - topSafeMargin - bottomSafeMargin;
        const mainUsedHeight =
            titleH +
            (buttonNodes.length > 0 ? panelGap + buttonStackHeight : 0);
        let overflow = Math.max(
            0,
            mainUsedHeight + (hasTikTokMissionPanel ? panelGap + panelH : 0) - totalAvailableHeight
        );
        if (overflow > 0 && hasTikTokMissionPanel) {
            const panelMinH = isTikTokPortraitProfile ? 54 : 50;
            const shrink = Math.min(overflow, Math.max(0, panelH - panelMinH));
            panelH -= shrink;
            overflow -= shrink;
        }
        const reservedBottomHeight = hasTikTokMissionPanel ? panelGap + panelH : 0;
        const mainAvailableHeight = Math.max(1, totalAvailableHeight - reservedBottomHeight);
        const verticalSlack = Math.max(0, mainAvailableHeight - mainUsedHeight);
        const contentTop = halfHeight - topSafeMargin - Math.round(verticalSlack * 0.2);

        let currentTop = contentTop;

        const titleY = currentTop - titleH * 0.5;
        this.layoutTextNode(this._titleNode, titleW, titleH, titleY, titleFontSize);

        currentTop -= titleH;

        if (buttonNodes.length === 0) {
            if (hasTikTokMissionPanel) {
                const missionY = -halfHeight + bottomSafeMargin + panelH * 0.5;
                this.layoutTikTokMissionPanel(panelW, panelH, missionY);
            }
            return;
        }

        currentTop -= panelGap;
        for (const btnNode of buttonNodes) {
            const btnY = currentTop - buttonH * 0.5;
            this.layoutButton(btnNode, buttonW, buttonH, btnY);
            if (btnNode === this._continueBtn) {
                this.redrawContinueButton(btnNode, buttonW, buttonH);
            } else if (btnNode === this._shopBtn) {
                this.redrawShopButton(btnNode, buttonW, buttonH);
            }
            currentTop -= buttonH + gap;
        }

        if (hasTikTokMissionPanel) {
            const missionY = -halfHeight + bottomSafeMargin + panelH * 0.5;
            this.layoutTikTokMissionPanel(panelW, panelH, missionY);
        }
    }

    private layoutTikTokMissionPanel(width: number, height: number, y: number): void {
        if (!this._tiktokMissionPanel) return;

        const panel = this._tiktokMissionPanel;
        panel.active = true;
        panel.getComponent(UITransform)?.setContentSize(width, height);
        panel.setPosition(0, y, 0);
        const buttonGap = Math.round(UIResponsive.clamp(width * 0.034, 10, 16));
        const buttonW = Math.round(UIResponsive.clamp((width - buttonGap) * 0.5, 136, 168));
        const buttonH = Math.round(UIResponsive.clamp(height * 0.92, 52, 72));
        const buttonY = 0;
        this.layoutTikTokMissionActionButton(
            this._tiktokShortcutBtn,
            buttonW,
            buttonH,
            -(buttonW * 0.5 + buttonGap * 0.5),
            buttonY
        );
        this.layoutTikTokMissionActionButton(
            this._tiktokProfileBtn,
            buttonW,
            buttonH,
            buttonW * 0.5 + buttonGap * 0.5,
            buttonY
        );

        this._refreshTikTokMissionButtonVisuals();
    }

    private layoutTikTokMissionActionButton(
        btnNode: Node | null,
        width: number,
        height: number,
        x: number,
        y: number
    ): void {
        if (!btnNode) return;
        const isTikTokPortraitProfile = UIResponsive.isTikTokPhonePortraitProfile();
        btnNode.getComponent(UITransform)?.setContentSize(width, height);
        btnNode.setPosition(x, y, 0);

        const iconNode = btnNode.getChildByName('Icon');
        const iconSize = Math.round(
            UIResponsive.clamp(Math.min(width, height) * 0.34, isTikTokPortraitProfile ? 20 : 22, 32)
        );
        iconNode?.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
        iconNode?.setPosition(0, Math.round(height * 0.16), 0);

        const labelNode = btnNode.getChildByName('Label');
        labelNode
            ?.getComponent(UITransform)
            ?.setContentSize(Math.max(72, width - 12), Math.max(18, Math.round(height * 0.24)));
        labelNode?.setPosition(0, -Math.round(height * 0.24), 0);
        const label = labelNode?.getComponent(Label);
        if (label) {
            label.fontSize = Math.round(
                UIResponsive.clamp(height * 0.2, isTikTokPortraitProfile ? 11 : 12, 15)
            );
            label.lineHeight = label.fontSize + 2;
        }
    }

    private redrawTikTokMissionPanel(panel: Node, width: number, height: number): void {
        void panel;
        void width;
        void height;
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
        const isTikTokPortraitProfile = UIResponsive.isTikTokPhonePortraitProfile();
        btnNode.getComponent(UITransform)?.setContentSize(width, height);
        btnNode.setPosition(0, y, 0);
        btnNode.getComponent(Widget)?.updateAlignment();

        const bg = btnNode.getComponent(Graphics);
        if (bg) {
            this.drawButton(bg);
        }

        const labelNode = btnNode.getChildByName('Label');
        labelNode
            ?.getComponent(UITransform)
            ?.setContentSize(
                Math.max(
                    isTikTokPortraitProfile ? 128 : 120,
                    width - (isTikTokPortraitProfile ? 22 : 32)
                ),
                height - (isTikTokPortraitProfile ? 6 : 8)
            );
        const label = labelNode?.getComponent(Label);
        if (label) {
            label.fontSize = Math.round(
                UIResponsive.clamp(
                    height * (isTikTokPortraitProfile ? 0.37 : 0.42),
                    isTikTokPortraitProfile ? 18 : 20,
                    isTikTokPortraitProfile ? 30 : 36
                )
            );
            label.lineHeight = label.fontSize + (isTikTokPortraitProfile ? 4 : 6);
        }
    }

    private async _refreshTikTokMissionState(): Promise<void> {
        if (!this.isTikTokRuntime()) {
            this._tiktokMissionState = null;
            this._applyTikTokMissionState();
            return;
        }

        try {
            this._tiktokMissionState = await TikTokMissionService.getMissionState();
        } catch (err) {
            console.warn('[HomePage] TikTok mission state refresh failed:', err);
            this._tiktokMissionState = {
                isTikTokRuntime: true,
                shortcutSupported: false,
                shortcutAdded: false,
                entranceSupported: false,
                entrancePrompted: false,
                launchedFromShortcut: false,
                launchedFromProfile: false,
            };
        }

        this._applyTikTokMissionState();
    }

    private _applyTikTokMissionState(): void {
        if (!this._tiktokMissionPanel) return;

        const state = this._tiktokMissionState;
        const shortcutDone = !!state && (state.shortcutAdded || state.launchedFromShortcut);
        const profileDone = !!state && state.launchedFromProfile;
        const profilePrompted = !!state?.entrancePrompted && !profileDone;

        const shortcutButtonKey = this._tiktokShortcutBusy
            ? 'ui.home.tiktok.action.processing'
            : !state
              ? 'ui.home.tiktok.action.processing'
              : !state.shortcutSupported
                ? 'ui.home.tiktok.action.unavailable'
                : shortcutDone
                  ? 'ui.home.tiktok.shortcut.done'
                  : 'ui.home.tiktok.shortcut.cta';
        const profileButtonKey = this._tiktokProfileBusy
            ? 'ui.home.tiktok.action.processing'
            : !state
              ? 'ui.home.tiktok.action.processing'
              : !state.entranceSupported
                ? 'ui.home.tiktok.action.unavailable'
                : profilePrompted
                  ? 'ui.home.tiktok.profile.guide'
                : profileDone
                  ? 'ui.home.tiktok.profile.done'
                  : 'ui.home.tiktok.profile.cta';

        this._setButtonLocalizationKey(this._tiktokShortcutBtn, shortcutButtonKey);
        this._setButtonLocalizationKey(this._tiktokProfileBtn, profileButtonKey);

        this._setButtonInteractable(
            this._tiktokShortcutBtn,
            !this._tiktokShortcutBusy && !!state?.shortcutSupported && !shortcutDone
        );
        this._setButtonInteractable(
            this._tiktokProfileBtn,
            !this._tiktokProfileBusy && !!state?.entranceSupported && !profileDone
        );
        this._refreshTikTokMissionButtonVisuals();
    }

    private _setTikTokMissionSummaryText(locKey: string): void {
        const label = this._tiktokMissionBodyNode?.getChildByName('Label')?.getComponent(Label);
        if (!label) return;
        label.string = Localization.instance.t(locKey);
    }

    private _refreshTikTokMissionButtonVisuals(): void {
        const state = this._tiktokMissionState;
        const shortcutDone = !!state && (state.shortcutAdded || state.launchedFromShortcut);
        const profileDone = !!state && state.launchedFromProfile;
        const profilePrompted = !!state?.entrancePrompted && !profileDone;

        this.redrawTikTokMissionActionButton(
            this._tiktokShortcutBtn,
            'shortcut',
            this._tiktokShortcutBusy
                ? 'processing'
                : !state?.shortcutSupported
                  ? 'unavailable'
                  : shortcutDone
                    ? 'done'
                    : 'pending'
        );
        this.redrawTikTokMissionActionButton(
            this._tiktokProfileBtn,
            'profile',
            this._tiktokProfileBusy
                ? 'processing'
                : !state?.entranceSupported
                  ? 'unavailable'
                  : profileDone
                    ? 'done'
                    : profilePrompted
                      ? 'guide'
                      : 'pending'
        );
    }

    private redrawTikTokMissionActionButton(
        btnNode: Node | null,
        iconType: TikTokMissionActionIcon,
        state: TikTokMissionVisualState
    ): void {
        if (!btnNode) return;
        const bg = btnNode.getComponent(Graphics);
        const tf = btnNode.getComponent(UITransform);
        if (!bg || !tf) return;

        const width = tf.contentSize.width;
        const height = tf.contentSize.height;
        const radius = Math.max(10, Math.round(height * 0.26));

        let fill = new Color(21, 35, 50, 228);
        let stroke = new Color(255, 203, 96, 210);
        let labelColor = new Color(255, 244, 220, 255);
        let iconColor = new Color(255, 205, 96, 255);
        if (state === 'done') {
            fill = new Color(34, 88, 62, 232);
            stroke = new Color(117, 236, 165, 220);
            iconColor = new Color(126, 240, 170, 255);
        } else if (state === 'unavailable') {
            fill = new Color(51, 58, 69, 214);
            stroke = new Color(154, 163, 176, 140);
            labelColor = new Color(207, 214, 224, 220);
            iconColor = new Color(180, 188, 198, 220);
        } else if (state === 'processing') {
            fill = new Color(28, 66, 112, 232);
            stroke = new Color(116, 186, 255, 220);
            iconColor = new Color(138, 203, 255, 255);
        } else if (state === 'guide') {
            fill = new Color(31, 58, 100, 232);
            stroke = new Color(120, 195, 255, 220);
            iconColor = new Color(134, 214, 255, 255);
        }

        bg.clear();
        bg.fillColor = fill;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = stroke;
        bg.lineWidth = Math.max(1.5, Math.round(height * 0.045));
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();

        const label = btnNode.getChildByName('Label')?.getComponent(Label);
        if (label) {
            label.color = labelColor;
        }

        this.redrawTikTokMissionActionIcon(btnNode.getChildByName('Icon'), iconType, iconColor);
    }

    private redrawTikTokMissionActionIcon(
        iconNode: Node | null,
        iconType: TikTokMissionActionIcon,
        color: Color
    ): void {
        const g = iconNode?.getComponent(Graphics);
        const tf = iconNode?.getComponent(UITransform);
        if (!g || !tf) return;

        const size = Math.min(tf.contentSize.width, tf.contentSize.height);
        const line = Math.max(2, Math.round(size * 0.1));

        g.clear();
        g.strokeColor = color;
        g.fillColor = color;
        g.lineWidth = line;

        if (iconType === 'shortcut') {
            const box = size * 0.72;
            const radius = Math.max(4, Math.round(size * 0.16));
            g.roundRect(-box * 0.5, -box * 0.5, box, box, radius);
            g.stroke();

            g.moveTo(0, -size * 0.18);
            g.lineTo(0, size * 0.18);
            g.moveTo(-size * 0.18, 0);
            g.lineTo(size * 0.18, 0);
            g.stroke();
            return;
        }

        g.circle(0, size * 0.14, size * 0.16);
        g.stroke();

        g.arc(0, -size * 0.08, size * 0.24, Math.PI * 0.08, Math.PI * 0.92, true);
        g.stroke();

        const arrowRadius = size * 0.3;
        g.arc(size * 0.05, size * 0.02, arrowRadius, Math.PI * 0.18, Math.PI * 1.05, true);
        g.stroke();

        const tipX = -size * 0.14;
        const tipY = size * 0.18;
        g.moveTo(tipX, tipY);
        g.lineTo(tipX + size * 0.16, tipY + size * 0.01);
        g.lineTo(tipX + size * 0.07, tipY - size * 0.11);
        g.stroke();
    }

    private _setButtonLocalizationKey(btnNode: Node | null, locKey: string): void {
        if (!btnNode) return;
        const labelNode = btnNode.getChildByName('Label');
        const comp = labelNode?.getComponent(LocalizationComp);
        if (comp) {
            comp.key = locKey;
            comp.refresh();
            return;
        }

        const label = labelNode?.getComponent(Label);
        if (label) {
            label.string = Localization.instance.t(locKey);
        }
    }

    private _setButtonInteractable(btnNode: Node | null, enabled: boolean): void {
        if (!btnNode) return;
        const button = btnNode.getComponent(Button);
        if (button) {
            button.interactable = enabled;
        }
    }

    private onTikTokShortcutClick(): void {
        if (this._tiktokShortcutBusy) return;
        this._tiktokShortcutBusy = true;
        this._applyTikTokMissionState();

        TikTokMissionService.requestShortcut()
            .then((result: TikTokMissionActionResult) => {
                this._tiktokMissionState = result.state;
                if (result.code !== 'prompt_requested' && result.code !== 'completed') {
                    this._showToast(
                        Localization.instance.t(this._getTikTokShortcutToastKey(result))
                    );
                }
            })
            .catch((err: unknown) => {
                console.warn('[HomePage] TikTok shortcut request failed:', err);
                this._showToast(Localization.instance.t('ui.home.tiktok.shortcut.toast.failed'));
            })
            .finally(() => {
                this._tiktokShortcutBusy = false;
                this._applyTikTokMissionState();
                this.scheduleOnce(() => {
                    void this._refreshTikTokMissionState();
                }, 0.8);
            });
    }

    private onTikTokProfileClick(): void {
        if (this._tiktokProfileBusy) return;
        const state = this._tiktokMissionState;
        const profileDone = !!state?.launchedFromProfile;
        const profilePrompted = !!state?.entrancePrompted && !profileDone;
        if (profilePrompted) {
            this._showTikTokProfileGuideDialog();
            return;
        }

        this._tiktokProfileBusy = true;
        this._applyTikTokMissionState();

        TikTokMissionService.requestEntranceMission()
            .then((result: TikTokMissionActionResult) => {
                this._tiktokMissionState = result.state;
                this._showToast(Localization.instance.t(this._getTikTokProfileToastKey(result)));
                if (
                    result.code === 'prompt_requested' ||
                    (result.code === 'already_done' &&
                        result.state.entrancePrompted &&
                        !result.state.launchedFromProfile)
                ) {
                    this._showTikTokProfileGuideDialog();
                }
            })
            .catch((err: unknown) => {
                console.warn('[HomePage] TikTok entrance mission request failed:', err);
                this._showToast(Localization.instance.t('ui.home.tiktok.profile.toast.failed'));
            })
            .finally(() => {
                this._tiktokProfileBusy = false;
                this._applyTikTokMissionState();
                this.scheduleOnce(() => {
                    void this._refreshTikTokMissionState();
                }, 0.8);
            });
    }

    private _getTikTokShortcutToastKey(result: TikTokMissionActionResult): string {
        switch (result.code) {
            case 'completed':
                return 'ui.home.tiktok.shortcut.toast.completed';
            case 'already_done':
                return 'ui.home.tiktok.shortcut.toast.already';
            case 'prompt_requested':
                return 'ui.home.tiktok.shortcut.toast.prompt_requested';
            case 'unsupported':
                return 'ui.home.tiktok.shortcut.toast.unsupported';
            case 'failed':
            default:
                return 'ui.home.tiktok.shortcut.toast.failed';
        }
    }

    private _getTikTokProfileToastKey(result: TikTokMissionActionResult): string {
        switch (result.code) {
            case 'completed':
                return 'ui.home.tiktok.profile.toast.completed';
            case 'already_done':
                return 'ui.home.tiktok.profile.toast.already';
            case 'prompt_requested':
                return 'ui.home.tiktok.profile.toast.prompt_requested';
            case 'unsupported':
                return 'ui.home.tiktok.profile.toast.unsupported';
            case 'failed':
            default:
                return 'ui.home.tiktok.profile.toast.failed';
        }
    }

    private _showTikTokProfileGuideDialog(): void {
        if (!this._contentNode) return;

        this._contentNode.getChildByName('TikTokProfileGuideOverlay')?.destroy();

        const overlay = new Node('TikTokProfileGuideOverlay');
        overlay.layer = this._uiLayer;
        overlay.addComponent(UITransform).setContentSize(1, 1);
        const overlayWidget = overlay.addComponent(Widget);
        overlayWidget.isAlignTop = true;
        overlayWidget.isAlignBottom = true;
        overlayWidget.isAlignLeft = true;
        overlayWidget.isAlignRight = true;
        overlayWidget.top = 0;
        overlayWidget.bottom = 0;
        overlayWidget.left = 0;
        overlayWidget.right = 0;
        const overlayBg = overlay.addComponent(Graphics);
        const size = this.getCanvasSize();
        overlayBg.fillColor = new Color(0, 0, 0, 172);
        overlayBg.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        overlayBg.fill();
        this._contentNode.addChild(overlay);

        const isPortrait = size.height >= size.width;
        const stage = new Node('TikTokProfileGuideStage');
        stage.layer = this._uiLayer;
        const stageW = Math.round(
            UIResponsive.clamp(
                Math.min(size.width, size.height) * (isPortrait ? 0.84 : 0.92),
                280,
                540
            )
        );
        const stageH = Math.round(UIResponsive.clamp(stageW * (isPortrait ? 1.24 : 0.66), 300, 520));
        stage.addComponent(UITransform).setContentSize(stageW, stageH);
        overlay.addChild(stage);

        const cardW = Math.round(
            UIResponsive.clamp(isPortrait ? stageW * 0.78 : stageW * 0.28, 136, 188)
        );
        const cardH = Math.round(
            UIResponsive.clamp(isPortrait ? stageH * 0.19 : stageH * 0.42, 84, 120)
        );
        const cards = [
            this._createTikTokGuideStepCard(
                stage,
                'GuideStep1',
                1,
                'ui.home.tiktok.profile.guide.step1',
                'profile',
                cardW,
                cardH,
                new Color(255, 176, 92, 220)
            ),
            this._createTikTokGuideStepCard(
                stage,
                'GuideStep2',
                2,
                'ui.home.tiktok.profile.guide.step2',
                'sidebar',
                cardW,
                cardH,
                new Color(114, 198, 255, 236)
            ),
            this._createTikTokGuideStepCard(
                stage,
                'GuideStep3',
                3,
                'ui.home.tiktok.profile.guide.step3',
                'game',
                cardW,
                cardH,
                new Color(124, 236, 173, 228)
            ),
        ];

        if (isPortrait) {
            const topY = Math.round(stageH * 0.23);
            const middleY = Math.round(stageH * 0.03);
            const bottomY = -Math.round(stageH * 0.17);
            cards[0].setPosition(0, topY, 0);
            cards[1].setPosition(0, middleY, 0);
            cards[2].setPosition(0, bottomY, 0);
            this._createTikTokGuideArrow(
                stage,
                'GuideArrowTop',
                false,
                Math.round(cardW * 0.42),
                Math.round(stageH * 0.08),
                0,
                Math.round((topY + middleY) * 0.5),
                new Color(114, 198, 255, 236)
            );
            this._createTikTokGuideArrow(
                stage,
                'GuideArrowBottom',
                false,
                Math.round(cardW * 0.42),
                Math.round(stageH * 0.08),
                0,
                Math.round((middleY + bottomY) * 0.5),
                new Color(255, 102, 138, 210)
            );
        } else {
            const offsetX = Math.round(stageW * 0.32);
            cards[0].setPosition(-offsetX, 0, 0);
            cards[1].setPosition(0, 0, 0);
            cards[2].setPosition(offsetX, 0, 0);
            this._createTikTokGuideArrow(
                stage,
                'GuideArrowLeft',
                true,
                Math.round(stageW * 0.12),
                Math.round(cardH * 0.34),
                -Math.round(stageW * 0.16),
                0,
                new Color(114, 198, 255, 236)
            );
            this._createTikTokGuideArrow(
                stage,
                'GuideArrowRight',
                true,
                Math.round(stageW * 0.12),
                Math.round(cardH * 0.34),
                Math.round(stageW * 0.16),
                0,
                new Color(255, 102, 138, 210)
            );
        }

        tween(cards[1])
            .repeatForever(
                tween()
                    .to(0.55, { scale: new Vec3(1.04, 1.04, 1) })
                    .to(0.55, { scale: new Vec3(1, 1, 1) })
            )
            .start();

        this._createDialogButton(
            stage,
            'GuideConfirmBtn',
            Localization.instance.t('ui.home.tiktok.profile.guide.confirm'),
            Math.round(stageW * 0.42),
            Math.round(stageH * 0.12),
            0,
            -Math.round(stageH * 0.34),
            new Color(68, 148, 232, 255),
            () => {
                overlay.destroy();
            }
        );
    }

    private _createTikTokGuideStepCard(
        parent: Node,
        name: string,
        step: number,
        locKey: string,
        iconType: TikTokGuideStepIcon,
        width: number,
        height: number,
        accent: Color
    ): Node {
        const card = new Node(name);
        card.layer = this._uiLayer;
        card.addComponent(UITransform).setContentSize(width, height);
        const bg = card.addComponent(Graphics);
        const radius = Math.max(12, Math.round(height * 0.18));
        bg.fillColor = new Color(13, 22, 37, 236);
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.fill();
        bg.strokeColor = accent;
        bg.lineWidth = 2;
        bg.roundRect(-width / 2, -height / 2, width, height, radius);
        bg.stroke();

        const badge = new Node('Badge');
        badge.layer = this._uiLayer;
        const badgeSize = Math.round(UIResponsive.clamp(height * 0.34, 24, 32));
        badge.addComponent(UITransform).setContentSize(badgeSize, badgeSize);
        badge.setPosition(-width * 0.38, height * 0.28, 0);
        const badgeBg = badge.addComponent(Graphics);
        badgeBg.fillColor = accent;
        badgeBg.circle(0, 0, badgeSize * 0.5);
        badgeBg.fill();
        const badgeLabelNode = new Node('Label');
        badgeLabelNode.layer = this._uiLayer;
        badge.addChild(badgeLabelNode);
        badgeLabelNode.addComponent(UITransform).setContentSize(badgeSize, badgeSize);
        const badgeLabel = badgeLabelNode.addComponent(Label);
        badgeLabel.string = String(step);
        badgeLabel.fontSize = Math.max(14, Math.round(badgeSize * 0.48));
        badgeLabel.isBold = true;
        badgeLabel.color = new Color(9, 18, 28, 255);
        badgeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        badgeLabel.verticalAlign = Label.VerticalAlign.CENTER;
        card.addChild(badge);

        const iconNode = new Node('Icon');
        iconNode.layer = this._uiLayer;
        const iconSize = Math.round(UIResponsive.clamp(height * 0.42, 30, 42));
        iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
        iconNode.setPosition(0, Math.round(height * 0.12), 0);
        card.addChild(iconNode);
        this._drawTikTokGuideStepIcon(iconNode, iconType, accent);

        const labelNode = new Node('Label');
        labelNode.layer = this._uiLayer;
        labelNode.addComponent(UITransform).setContentSize(width - 24, Math.round(height * 0.24));
        labelNode.setPosition(0, -Math.round(height * 0.24), 0);
        const label = labelNode.addComponent(Label);
        label.string = Localization.instance.t(locKey);
        label.fontSize = Math.max(13, Math.round(height * 0.14));
        label.lineHeight = label.fontSize + 2;
        label.isBold = true;
        label.color = new Color(240, 247, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 150) });
        card.addChild(labelNode);

        parent.addChild(card);
        return card;
    }

    private _drawTikTokGuideStepIcon(
        iconNode: Node,
        iconType: TikTokGuideStepIcon,
        accent: Color
    ): void {
        const g = iconNode.getComponent(Graphics) ?? iconNode.addComponent(Graphics);
        const tf = iconNode.getComponent(UITransform);
        if (!tf) return;

        const size = Math.min(tf.contentSize.width, tf.contentSize.height);
        const line = Math.max(2, Math.round(size * 0.09));
        const soft = new Color(accent.r, accent.g, accent.b, 92);
        g.clear();
        g.lineWidth = line;
        g.strokeColor = accent;
        g.fillColor = soft;

        if (iconType === 'profile') {
            g.circle(0, size * 0.14, size * 0.18);
            g.stroke();
            g.arc(0, -size * 0.08, size * 0.28, Math.PI * 0.1, Math.PI * 0.9, true);
            g.stroke();
            g.moveTo(-size * 0.4, size * 0.34);
            g.lineTo(size * 0.4, size * 0.34);
            g.stroke();
            return;
        }

        if (iconType === 'sidebar') {
            const phoneW = size * 0.62;
            const phoneH = size * 0.92;
            const sideW = size * 0.16;
            const radius = Math.max(4, Math.round(size * 0.12));
            g.roundRect(-phoneW * 0.5, -phoneH * 0.5, phoneW, phoneH, radius);
            g.stroke();
            g.roundRect(phoneW * 0.16, -phoneH * 0.24, sideW, phoneH * 0.48, radius * 0.7);
            g.fill();
            g.stroke();
            g.moveTo(-phoneW * 0.28, phoneH * 0.16);
            g.lineTo(phoneW * 0.08, phoneH * 0.16);
            g.moveTo(-phoneW * 0.28, 0);
            g.lineTo(phoneW * 0.08, 0);
            g.stroke();
            return;
        }

        const cardW = size * 0.82;
        const cardH = size * 0.58;
        const radius = Math.max(4, Math.round(size * 0.12));
        g.roundRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH, radius);
        g.stroke();
        g.moveTo(-size * 0.08, 0);
        g.lineTo(size * 0.14, size * 0.14);
        g.lineTo(size * 0.14, -size * 0.14);
        g.close();
        g.fill();
        g.stroke();
        g.moveTo(-cardW * 0.14, -cardH * 0.72);
        g.lineTo(cardW * 0.14, -cardH * 0.72);
        g.stroke();
    }

    private _createTikTokGuideArrow(
        parent: Node,
        name: string,
        horizontal: boolean,
        width: number,
        height: number,
        x: number,
        y: number,
        color: Color
    ): void {
        const node = new Node(name);
        node.layer = this._uiLayer;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y, 0);
        const g = node.addComponent(Graphics);
        g.clear();
        g.lineWidth = Math.max(3, Math.round(Math.min(width, height) * 0.08));
        g.strokeColor = color;
        g.fillColor = color;

        if (horizontal) {
            const startX = -width * 0.38;
            const endX = width * 0.26;
            g.moveTo(startX, 0);
            g.lineTo(endX, 0);
            g.stroke();
            g.moveTo(endX, 0);
            g.lineTo(endX - width * 0.18, height * 0.22);
            g.lineTo(endX - width * 0.18, -height * 0.22);
            g.close();
            g.fill();
        } else {
            const startY = height * 0.34;
            const endY = -height * 0.18;
            g.moveTo(0, startY);
            g.lineTo(0, endY);
            g.stroke();
            g.moveTo(0, endY);
            g.lineTo(-width * 0.16, endY + height * 0.22);
            g.lineTo(width * 0.16, endY + height * 0.22);
            g.close();
            g.fill();
        }

        parent.addChild(node);
    }

    private refreshText() {
        try {
            this._settingsModule?.onLanguageChanged();
        } catch (err) {
            console.error('[HomePage] settings language refresh failed:', err);
        }
        this.refreshLocalizedTree(this._contentNode);
        this._applyTikTokMissionState();
    }

    private onLanguageChanged(): void {
        this.refreshText();
        this.updateContentLayout();
    }

    private refreshLocalizedTree(root: Node | null): void {
        if (!root) return;

        const stack: Node[] = [root];
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) continue;

            try {
                current.getComponent(LocalizationComp)?.refresh();
            } catch (err) {
                console.error('[HomePage] localized label refresh failed:', err);
            }

            for (const child of current.children) {
                stack.push(child);
            }
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
                {
                    const pendingScore = PendingScoreSubmissionStore.peekAll(
                        this._socialBridge.platform
                    )[0];
                    if (pendingScore && pendingScore.wave >= 0 && pendingScore.score >= 0) {
                        this._socialBridge.submitScore(
                            pendingScore.score,
                            pendingScore.wave,
                            pendingScore.runId
                        );
                    }
                }
                if (this._socialBridge.platform === 'tiktok') {
                    this._socialBridge.requestLeaderboard();
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
        this._refreshTikTokIdentityOnGesture()
            .catch((err: unknown) => {
                console.warn('[HomePage] TikTok identity refresh skipped:', err);
            })
            .finally(() => {
                if (this._onStartRequested) {
                    this._onStartRequested();
                } else {
                    GameManager.instance.startGame();
                    this.node.destroy();
                }
            });
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
        this._leaderboardPanel = new LeaderboardPanel(
            this.node,
            () => {
                this._leaderboardPanel?.destroy();
                this._leaderboardPanel = null;
            },
            this._socialBridge.platform === 'reddit'
        );
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

    private async _refreshTikTokIdentityOnGesture(): Promise<void> {
        if (this._socialBridge.platform !== 'tiktok') return;
        const candidates = this._collectTikTokHosts();
        if (candidates.length === 0) {
            console.log('[HomePage] TikTok host missing for identity refresh');
            return;
        }

        let profile: { userId: string; displayName: string; avatarUrl: string } | null = null;
        for (const candidate of candidates) {
            this._logTikTokHostCapabilities(candidate.name, candidate.api);
            profile = await this._requestTikTokProfile(candidate.api, candidate.name);
            if (profile?.userId && profile.displayName) break;
        }
        if (!profile) {
            console.log('[HomePage] TikTok profile unavailable after user gesture');
            return;
        }
        this._applyTikTokIdentityProfile(profile, 'gesture');
    }

    private _collectTikTokHosts(): Array<{ name: string; api: Record<string, unknown> }> {
        const g = globalThis as unknown as Record<string, unknown>;
        const out: Array<{ name: string; api: Record<string, unknown> }> = [];
        const push = (name: string, api: unknown) => {
            if (!api || typeof api !== 'object') return;
            const ref = api as Record<string, unknown>;
            if (out.some(item => item.api === ref)) return;
            out.push({ name, api: ref });
        };

        push('tt', g['tt']);
        const ttMinis = g['TTMinis'] as Record<string, unknown> | undefined;
        push('TTMinis', ttMinis);
        push('TTMinis.game', ttMinis?.['game']);
        return out;
    }

    private _logTikTokHostCapabilities(hostName: string, host: Record<string, unknown>): void {
        const keys = Object.keys(host)
            .filter(key => /user|auth|profile|account|login|open|nick/i.test(key))
            .slice(0, 40);
        console.log(
            `[HomePage] ${hostName} candidate APIs: ${keys.length > 0 ? keys.join(',') : 'none'}`
        );
    }

    private _requestTikTokProfile(
        host: Record<string, unknown>,
        hostName: string
    ): Promise<{ userId: string; displayName: string; avatarUrl: string } | null> {
        type AuthProbe = {
            profile: { userId: string; displayName: string; avatarUrl: string } | null;
            code: string;
        };

        const requestCodeFromApi = (
            apiName: 'authorize' | 'login',
            extraArgs: Record<string, unknown> = {}
        ) =>
            new Promise<AuthProbe>(resolve => {
                let settled = false;
                const settle = (value: AuthProbe) => {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                };
                const fn = host[apiName] as
                    | ((args: Record<string, unknown>) => unknown)
                    | undefined;
                if (typeof fn !== 'function') {
                    console.log(`[HomePage] ${hostName}.${apiName} API missing`);
                    settle({ profile: null, code: '' });
                    return;
                }

                const onResponse = (raw: unknown) => {
                    console.log(
                        `[HomePage] ${hostName}.${apiName} response: ${this._describeTikTokRaw(raw)}`
                    );
                    settle({
                        profile: this._extractTikTokProfile(raw),
                        code: this._extractTikTokAuthCode(raw),
                    });
                };
                try {
                    const req: Record<string, unknown> = {
                        ...extraArgs,
                        success: (res: unknown) => {
                            console.log(`[HomePage] ${hostName}.${apiName} success`);
                            onResponse(res);
                        },
                        fail: (err: unknown) => {
                            console.log(
                                `[HomePage] ${hostName}.${apiName} fail: ${this._describeTikTokRaw(err)}`
                            );
                            settle({ profile: null, code: '' });
                        },
                    };
                    const ret = fn.call(host, req);
                    if (ret && typeof (ret as Promise<unknown>).then === 'function') {
                        (ret as Promise<unknown>)
                            .then((res: unknown) => {
                                console.log(`[HomePage] ${hostName}.${apiName} promise resolved`);
                                onResponse(res);
                            })
                            .catch((err: unknown) => {
                                console.log(
                                    `[HomePage] ${hostName}.${apiName} promise rejected: ${this._describeTikTokRaw(err)}`
                                );
                                settle({ profile: null, code: '' });
                            });
                    }
                } catch {
                    console.log(`[HomePage] ${hostName}.${apiName} threw`);
                    settle({ profile: null, code: '' });
                }
            });

        const requestFromApi = (apiName: string) =>
            new Promise<{ userId: string; displayName: string; avatarUrl: string } | null>(
                resolve => {
                    const fn = host[apiName] as
                        | ((args: Record<string, unknown>) => unknown)
                        | undefined;
                    if (typeof fn !== 'function') {
                        console.log(`[HomePage] ${hostName}.${apiName} missing on host`);
                        resolve(null);
                        return;
                    }

                    const done = (raw: unknown) => {
                        console.log(
                            `[HomePage] ${hostName}.${apiName} response: ${this._describeTikTokRaw(raw)}`
                        );
                        resolve(this._extractTikTokProfile(raw));
                    };
                    try {
                        const req: Record<string, unknown> = {
                            withCredentials: true,
                            lang: 'zh_CN',
                            desc: '用于排行榜展示昵称',
                            success: (res: unknown) => done(res),
                            fail: (err: unknown) => {
                                console.log(
                                    `[HomePage] ${hostName}.${apiName} fail: ${this._describeTikTokRaw(err)}`
                                );
                                resolve(null);
                            },
                        };
                        const ret = fn.call(host, req);
                        if (ret && typeof (ret as Promise<unknown>).then === 'function') {
                            (ret as Promise<unknown>).then(done).catch((err: unknown) => {
                                console.log(
                                    `[HomePage] ${hostName}.${apiName} reject: ${this._describeTikTokRaw(err)}`
                                );
                                resolve(null);
                            });
                        }
                    } catch {
                        console.log(`[HomePage] ${hostName}.${apiName} threw`);
                        resolve(null);
                    }
                }
            );

        const timeoutMs = 5000;
        return Promise.race([
            (async () => {
                const seenCodes = new Set<string>();

                const authorized = await requestCodeFromApi('authorize', {
                    scope: 'user.info.basic',
                });
                if (authorized.profile?.userId && authorized.profile.displayName) {
                    return authorized.profile;
                }
                if (authorized.code) {
                    seenCodes.add(authorized.code);
                    const exchanged = await this._exchangeTikTokCodeForProfile(
                        authorized.code,
                        hostName,
                        'authorize'
                    );
                    if (exchanged) return exchanged;
                }

                const loggedIn = await requestCodeFromApi('login');
                if (loggedIn.profile?.userId && loggedIn.profile.displayName) {
                    return loggedIn.profile;
                }
                if (loggedIn.code && !seenCodes.has(loggedIn.code)) {
                    const exchanged = await this._exchangeTikTokCodeForProfile(
                        loggedIn.code,
                        hostName,
                        'login'
                    );
                    if (exchanged) return exchanged;
                }

                const apiCandidates = [
                    'getUserProfile',
                    'getUserInfo',
                    'getUserPublicInfo',
                    'getProfile',
                ];
                for (const apiName of apiCandidates) {
                    const profile = await requestFromApi(apiName);
                    if (profile?.userId && profile.displayName) return profile;
                }
                return null;
            })(),
            new Promise<null>(resolve => {
                globalThis.setTimeout(() => {
                    console.log(
                        `[HomePage] ${hostName} profile probe timed out after ${timeoutMs}ms`
                    );
                    resolve(null);
                }, timeoutMs);
            }),
        ]);
    }

    private async _exchangeTikTokCodeForProfile(
        code: string,
        hostName: string,
        sourceApi: 'authorize' | 'login'
    ): Promise<{ userId: string; displayName: string; avatarUrl: string } | null> {
        const normalized = code.trim();
        if (!normalized) return null;

        const base = this._resolveTikTokApiBase();
        const url = `${base.replace(/\/+$/, '')}/identity/exchange`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
                credentials: 'omit',
                body: JSON.stringify({ code: normalized }),
            });

            let payload: unknown = null;
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }

            const pick = (obj: unknown, paths: string[][]): string => {
                for (const path of paths) {
                    let cursor: unknown = obj;
                    for (const segment of path) {
                        if (!cursor || typeof cursor !== 'object') {
                            cursor = null;
                            break;
                        }
                        cursor = (cursor as Record<string, unknown>)[segment];
                    }
                    if (typeof cursor === 'string' && cursor.trim()) {
                        return cursor.trim();
                    }
                }
                return '';
            };

            if (!response.ok) {
                const bodyCode = pick(payload, [
                    ['code'],
                    ['error'],
                    ['error_code'],
                    ['error', 'code'],
                ]);
                const bodyMessage = pick(payload, [
                    ['message'],
                    ['error_description'],
                    ['description'],
                    ['error', 'message'],
                ]);
                const bodyRequestId = pick(payload, [['requestId'], ['request_id'], ['log_id']]);
                console.log(
                    `[HomePage] code exchange HTTP ${response.status} from ${hostName}.${sourceApi} code=${
                        bodyCode || '-'
                    } message=${bodyMessage || '-'} requestId=${bodyRequestId || '-'}`
                );
                return null;
            }

            const root =
                payload && typeof payload === 'object'
                    ? (payload as Record<string, unknown>)['ok'] === true &&
                      (payload as Record<string, unknown>)['data'] &&
                      typeof (payload as Record<string, unknown>)['data'] === 'object'
                        ? ((payload as Record<string, unknown>)['data'] as Record<string, unknown>)
                        : (payload as Record<string, unknown>)
                    : null;
            const profile = this._extractTikTokProfile(root);
            if (!profile) {
                console.log(
                    `[HomePage] code exchange missing profile from ${hostName}.${sourceApi}: ${this._describeTikTokRaw(
                        payload
                    )}`
                );
                return null;
            }

            console.log(
                `[HomePage] code exchange ok from ${hostName}.${sourceApi} displayName=${profile.displayName}`
            );
            this._applyTikTokIdentityProfile(profile, `${hostName}.${sourceApi}`);
            return profile;
        } catch (err) {
            console.log(
                `[HomePage] code exchange fetch failed from ${hostName}.${sourceApi}: ${String(err)}`
            );
            return null;
        }
    }

    private _applyTikTokIdentityProfile(
        profile: { userId: string; displayName: string; avatarUrl: string },
        source: string
    ): void {
        const userId = (profile.userId || '').trim();
        const displayName = (profile.displayName || '').trim();
        if (!userId || !displayName) return;

        const payload = JSON.stringify({ userId, displayName, avatarUrl: profile.avatarUrl || '' });
        const token = this._base64EncodeUtf8(payload);
        if (!token) return;

        const g = globalThis as unknown as Record<string, unknown>;
        g['__GVR_TIKTOK_USER_ID__'] = userId;
        g['__GVR_TIKTOK_USERNAME__'] = displayName;
        g['__GVR_TIKTOK_TOKEN__'] = token;

        if (typeof window !== 'undefined') {
            const w = window as unknown as Record<string, unknown>;
            w['__GVR_TIKTOK_USER_ID__'] = userId;
            w['__GVR_TIKTOK_USERNAME__'] = displayName;
            w['__GVR_TIKTOK_TOKEN__'] = token;
            if (typeof window.dispatchEvent === 'function') {
                try {
                    if (typeof Event === 'function') {
                        window.dispatchEvent(new Event('gvr:tiktok-identity-ready'));
                    }
                } catch (err) {
                    console.log(`[HomePage] identity-ready dispatch skipped: ${String(err)}`);
                }
            }
        }

        try {
            localStorage.setItem('__gvr_tiktok_uid_v1', userId);
            localStorage.setItem('__gvr_tiktok_identity_v1', payload);
        } catch {
            // ignore
        }
        try {
            const ttHost = (globalThis as unknown as Record<string, unknown>)['tt'] as
                | {
                      setStorageSync?: (key: string, value: string) => void;
                  }
                | undefined;
            if (ttHost?.setStorageSync) {
                ttHost.setStorageSync('__gvr_tiktok_uid_v1', userId);
                ttHost.setStorageSync('__gvr_tiktok_identity_v1', payload);
            }
        } catch {
            // ignore
        }

        console.log(
            `[HomePage] TikTok identity refreshed source=${source} userId=${userId} displayName=${displayName}`
        );

        // Force bridge sync so backend/player display_name is updated immediately.
        this._socialBridge.requestInit();
        this._socialBridge.requestLeaderboard();
    }

    private _resolveTikTokApiBase(): string {
        const localApiBaseKey = 'gvr.tiktok.api_base.v1';
        const fallbackBases = [
            'https://tiktok-leaderboard-prod.mineskystudio.workers.dev/api/tiktok',
            'https://tiktok-leaderboard-staging.mineskystudio.workers.dev/api/tiktok',
            'https://tiktok-leaderboard.mineskystudio.workers.dev/api/tiktok',
        ];
        const read = (obj: Record<string, unknown> | null | undefined): string => {
            if (!obj) return '';
            const value = obj['__GVR_TIKTOK_API_BASE__'];
            if (typeof value !== 'string') return '';
            const normalized = value.trim();
            return normalized || '';
        };
        const readCandidates = (obj: Record<string, unknown> | null | undefined): string => {
            if (!obj) return '';
            const value = obj['__GVR_TIKTOK_API_BASE_CANDIDATES__'];
            if (typeof value !== 'string') return '';
            const normalized = value.trim();
            if (!normalized) return '';
            const list = normalized
                .split(/[\n,;\s]+/g)
                .map(item => item.trim())
                .filter(Boolean);
            return list[0] ?? '';
        };

        const g = globalThis as unknown as Record<string, unknown>;
        const fromGlobal = read(g);
        if (fromGlobal) return fromGlobal;
        if (typeof window !== 'undefined') {
            const fromWindow = read(window as unknown as Record<string, unknown>);
            if (fromWindow) return fromWindow;
            const fromWindowCandidates = readCandidates(
                window as unknown as Record<string, unknown>
            );
            if (fromWindowCandidates) return fromWindowCandidates;
        }
        const fromGlobalCandidates = readCandidates(g);
        if (fromGlobalCandidates) return fromGlobalCandidates;
        try {
            const localBase = localStorage.getItem(localApiBaseKey);
            if (typeof localBase === 'string' && localBase.trim()) return localBase.trim();
        } catch {
            // ignore
        }
        return fallbackBases[0];
    }

    private _extractTikTokAuthCode(raw: unknown): string {
        if (!raw || typeof raw !== 'object') return '';
        const root = raw as Record<string, unknown>;
        const authResponse =
            root['authResponse'] && typeof root['authResponse'] === 'object'
                ? (root['authResponse'] as Record<string, unknown>)
                : null;
        const info =
            root['userInfo'] && typeof root['userInfo'] === 'object'
                ? (root['userInfo'] as Record<string, unknown>)
                : root;

        const pick = (obj: Record<string, unknown> | null, keys: string[]): string => {
            if (!obj) return '';
            for (const key of keys) {
                const value = obj[key];
                if (typeof value === 'string' && value.trim()) return value.trim();
            }
            return '';
        };

        return (
            pick(info, ['code', 'authCode', 'auth_code', 'loginCode', 'login_code']) ||
            pick(root, ['code', 'authCode', 'auth_code', 'loginCode', 'login_code']) ||
            pick(authResponse, ['code', 'authCode', 'auth_code']) ||
            ''
        );
    }

    private _extractTikTokProfile(raw: unknown): {
        userId: string;
        displayName: string;
        avatarUrl: string;
    } | null {
        if (!raw || typeof raw !== 'object') return null;
        const root = raw as Record<string, unknown>;
        const info =
            root['userInfo'] && typeof root['userInfo'] === 'object'
                ? (root['userInfo'] as Record<string, unknown>)
                : root;

        const pick = (keys: string[]): string => {
            for (const key of keys) {
                const value = info[key];
                if (typeof value === 'string' && value.trim()) return value.trim();
            }
            return '';
        };

        const userId = pick(['openId', 'openid', 'unionId', 'unionid', 'userId', 'uid']);
        const displayName = pick([
            'nickName',
            'nick_name',
            'nickname',
            'userName',
            'user_name',
            'screenName',
            'screen_name',
            'displayName',
            'display_name',
            'name',
        ]);
        const avatarUrl = pick(['avatarUrl', 'avatar_url', 'avatar']);
        if (!userId || !displayName) {
            console.log(
                `[HomePage] profile missing required fields: ${this._describeTikTokRaw(raw)}`
            );
            return null;
        }
        return { userId, displayName, avatarUrl };
    }

    private _describeTikTokRaw(raw: unknown): string {
        if (!raw || typeof raw !== 'object') return `raw=${typeof raw}`;
        const root = raw as Record<string, unknown>;
        const info =
            root['userInfo'] && typeof root['userInfo'] === 'object'
                ? (root['userInfo'] as Record<string, unknown>)
                : root;
        const rootKeys = Object.keys(root).slice(0, 16).join(',');
        const infoKeys = Object.keys(info).slice(0, 16).join(',');
        const probeKeys = [
            'code',
            'authCode',
            'auth_code',
            'openId',
            'openid',
            'unionId',
            'unionid',
            'userId',
            'uid',
            'nickName',
            'nick_name',
            'nickname',
            'userName',
            'user_name',
            'screenName',
            'screen_name',
            'displayName',
            'display_name',
            'name',
        ];
        const candidates: string[] = [];
        for (const k of probeKeys) {
            const v = info[k];
            if (typeof v === 'string' && v.trim()) {
                candidates.push(`${k}=${v.trim().slice(0, 48)}`);
            }
        }
        return `rootKeys=[${rootKeys}] infoKeys=[${infoKeys}] candidates=[${candidates.join(' | ')}]`;
    }

    private _base64EncodeUtf8(input: string): string | null {
        try {
            if (typeof btoa === 'function') {
                const bytes = encodeURIComponent(input).replace(
                    /%([0-9A-F]{2})/g,
                    (_m, p1: string) => String.fromCharCode(parseInt(p1, 16))
                );
                return btoa(bytes);
            }
        } catch {
            // continue
        }
        try {
            const g = globalThis as unknown as {
                Buffer?: {
                    from: (v: string, enc: string) => { toString: (enc: string) => string };
                };
            };
            if (g.Buffer) {
                return g.Buffer.from(input, 'utf8').toString('base64');
            }
        } catch {
            // continue
        }
        return null;
    }

    private _showToast(text: string): void {
        if (!this._contentNode) return;
        const size = this.getCanvasSize();
        const shortSide = Math.min(size.width, size.height);
        const toastW = Math.round(UIResponsive.clamp(size.width * 0.86, 240, 420));
        const fontSize = Math.round(UIResponsive.clamp(shortSide * 0.055, 18, 24));
        const lineHeight = fontSize + 6;
        const paddingX = 18;
        const paddingY = 14;
        const contentW = Math.max(160, toastW - paddingX * 2);
        const charsPerLine = Math.max(8, Math.floor(contentW / Math.max(fontSize * 0.82, 10)));
        const estimatedLineCount = Math.min(
            3,
            text
                .split('\n')
                .reduce(
                    (count, line) => count + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)),
                    0
                )
        );
        const toastH = Math.round(
            UIResponsive.clamp(
                paddingY * 2 + estimatedLineCount * lineHeight,
                54,
                132
            )
        );
        const radius = Math.max(14, Math.round(toastH * 0.22));

        const toast = new Node('Toast');
        toast.layer = this._uiLayer;
        const tf = toast.addComponent(UITransform);
        tf.setContentSize(toastW, toastH);
        const bg = toast.addComponent(Graphics);
        bg.fillColor = new Color(30, 30, 30, 220);
        bg.roundRect(-toastW / 2, -toastH / 2, toastW, toastH, radius);
        bg.fill();
        const labelNode = new Node('ToastLabel');
        labelNode.layer = this._uiLayer;
        toast.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(contentW, toastH - paddingY * 2);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = lineHeight;
        label.isBold = true;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.CLAMP;
        label.enableWrapText = true;
        applyGameLabelStyle(label, { outlineWidth: 2, outlineColor: new Color(0, 0, 0, 180) });
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
                bg.roundRect(-toastW / 2, -toastH / 2, toastW, toastH, radius);
                bg.fill();
            }
            if (elapsed >= totalMs) {
                clearInterval(id);
                if (toast.isValid) toast.destroy();
            }
        }, 16);
    }
}
