import {
    BlockInputEvents,
    Button,
    Color,
    EventTouch,
    Graphics,
    Label,
    Node,
    Tween,
    tween,
    UITransform,
    UIOpacity,
    Vec3,
    Widget,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { AudioSettingsManager } from '../../core/managers/AudioSettingsManager';
import { WeaponSFXManager } from '../../gameplay/weapons/WeaponSFXManager';
import { UIResponsive } from '../UIResponsive';
import { applyGameLabelStyle, applyLayerRecursive, HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

const SETTINGS_PANEL_MIN_WIDTH = 360;
const SETTINGS_PANEL_MAX_WIDTH = 620;
const SETTINGS_PANEL_MIN_HEIGHT = 240;
const SETTINGS_PANEL_MAX_HEIGHT = 520;
const SETTINGS_BUTTON_MIN_WIDTH = 132;
const SETTINGS_BUTTON_MAX_WIDTH = 208;
const SETTINGS_BUTTON_MIN_HEIGHT = 48;
const SETTINGS_BUTTON_MAX_HEIGHT = 68;

type AudioSliderKey = 'bgm' | 'sfx';

type VolumeSliderView = {
    key: AudioSliderKey;
    titleKey: string;
    rowNode: Node;
    titleNode: Node;
    titleLabel: Label;
    trackNode: Node;
    trackGraphics: Graphics;
    fillGraphics: Graphics;
    knobNode: Node;
    hitNode: Node;
    valueNode: Node;
    valueLabel: Label;
    width: number;
};

export class HUDSettingsModule implements HUDModule {
    private _uiCanvas: Node | null = null;
    private _settingsButtonNode: Node | null = null;
    private _settingsButtonBg: Graphics | null = null;
    private _settingsPanelRoot: Node | null = null;
    private _settingsPanelNode: Node | null = null;
    private _settingsPanelBg: Graphics | null = null;
    private _settingsPanelOpacity: UIOpacity | null = null;
    private _settingsBgmSlider: VolumeSliderView | null = null;
    private _settingsSfxSlider: VolumeSliderView | null = null;

    public constructor(private readonly _onLanguageChanged: () => void) {}

    public get settingsButtonNode(): Node | null {
        return this._settingsButtonNode;
    }

    public initialize(parent: Node): void {
        this._uiCanvas = parent;
        this.createSettingsUI(parent);
        this.updateSettingsLayout();
    }

    public show(): void {
        if (!this._settingsButtonNode) return;
        this.updateSettingsLayout();
        this._settingsButtonNode.active = true;
        this._settingsButtonNode.setScale(0.96, 0.96, 1);
        tween(this._settingsButtonNode)
            .to(0.3, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    public cleanup(): void {
        if (this._settingsPanelOpacity) {
            Tween.stopAllByTarget(this._settingsPanelOpacity);
        }
        if (this._settingsPanelRoot) {
            Tween.stopAllByTarget(this._settingsPanelRoot);
        }

        this._uiCanvas = null;
        this._settingsButtonNode = null;
        this._settingsButtonBg = null;
        this._settingsPanelRoot = null;
        this._settingsPanelNode = null;
        this._settingsPanelBg = null;
        this._settingsPanelOpacity = null;
        this._settingsBgmSlider = null;
        this._settingsSfxSlider = null;
    }

    public onCanvasResize(): void {
        this.updateSettingsLayout();
    }

    public onLanguageChanged(): void {
        this.refreshText();
    }

    private createSettingsUI(parent: Node): void {
        const buttonNode = new Node('SettingsButton');
        parent.addChild(buttonNode);
        buttonNode.addComponent(UITransform).setContentSize(156, 58);
        const buttonWidget = buttonNode.addComponent(Widget);
        buttonWidget.isAlignTop = true;
        buttonWidget.isAlignRight = true;
        buttonWidget.top = 12;
        buttonWidget.right = 16;

        const button = buttonNode.addComponent(Button);
        button.transition = Button.Transition.NONE;

        this._settingsButtonBg = buttonNode.addComponent(Graphics);
        this.drawSettingsButton(this._settingsButtonBg);

        const buttonLabelNode = new Node('SettingsButtonLabel');
        buttonNode.addChild(buttonLabelNode);
        buttonLabelNode.addComponent(UITransform).setContentSize(104, 50);
        buttonLabelNode.setPosition(14, 0, 0);
        const buttonLabel = buttonLabelNode.addComponent(Label);
        buttonLabel.string = Localization.instance.t('ui.settings.button');
        buttonLabel.fontSize = 28;
        buttonLabel.lineHeight = 32;
        buttonLabel.isBold = true;
        buttonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        buttonLabel.verticalAlign = Label.VerticalAlign.CENTER;
        buttonLabel.overflow = Label.Overflow.SHRINK;
        buttonLabel.color = new Color(34, 19, 8, 255);
        applyGameLabelStyle(buttonLabel, {
            outlineColor: new Color(255, 238, 182, 228),
            outlineWidth: 1,
            shadowColor: new Color(0, 0, 0, 88),
            shadowOffsetX: 1,
            shadowOffsetY: -1,
            shadowBlur: 1,
        });

        const buttonIconNode = new Node('SettingsButtonIcon');
        buttonNode.addChild(buttonIconNode);
        buttonIconNode.addComponent(UITransform).setContentSize(28, 28);
        buttonIconNode.setPosition(-46, 0, 0);
        const buttonIcon = buttonIconNode.addComponent(Graphics);
        this.drawSettingsGearIcon(buttonIcon);

        buttonNode.on(
            Button.EventType.CLICK,
            () => {
                this.toggleSettingsPanel();
            },
            this
        );

        const panelRoot = new Node('SettingsPanelRoot');
        parent.addChild(panelRoot);
        panelRoot.addComponent(UITransform).setContentSize(1280, 720);
        const rootWidget = panelRoot.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;
        this._settingsPanelOpacity = panelRoot.addComponent(UIOpacity);
        this._settingsPanelOpacity.opacity = 0;

        const blocker = new Node('SettingsPanelBlocker');
        panelRoot.addChild(blocker);
        blocker.addComponent(UITransform).setContentSize(1280, 720);
        const blockerWidget = blocker.addComponent(Widget);
        blockerWidget.isAlignTop = true;
        blockerWidget.isAlignBottom = true;
        blockerWidget.isAlignLeft = true;
        blockerWidget.isAlignRight = true;
        blocker.addComponent(BlockInputEvents);
        blocker.on(
            Node.EventType.TOUCH_END,
            () => {
                this.hideSettingsPanel();
            },
            this
        );

        const panel = new Node('SettingsPanel');
        panelRoot.addChild(panel);
        panel.addComponent(UITransform).setContentSize(500, 400);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignTop = true;
        panelWidget.isAlignRight = true;
        panelWidget.top = 70;
        panelWidget.right = 16;

        this._settingsPanelBg = panel.addComponent(Graphics);
        this.drawSettingsPanelBackground(this._settingsPanelBg);

        const titleNode = new Node('SettingsTitle');
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(368, 52);
        titleNode.setPosition(-56, 108, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.settings.title');
        titleLabel.fontSize = 32;
        titleLabel.lineHeight = 38;
        titleLabel.isBold = true;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.overflow = Label.Overflow.SHRINK;
        titleLabel.color = new Color(255, 228, 186, 255);
        applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(54, 26, 8, 255),
            outlineWidth: 3,
        });

        const closeBtnNode = new Node('SettingsCloseButton');
        panel.addChild(closeBtnNode);
        closeBtnNode.addComponent(UITransform).setContentSize(48, 48);
        closeBtnNode.setPosition(210, 164, 0);
        const closeButton = closeBtnNode.addComponent(Button);
        closeButton.transition = Button.Transition.NONE;
        const closeBg = closeBtnNode.addComponent(Graphics);
        this.drawSettingsCloseButton(closeBg);

        const closeIconNode = new Node('SettingsCloseIcon');
        closeBtnNode.addChild(closeIconNode);
        closeIconNode.addComponent(UITransform).setContentSize(24, 24);
        const closeIcon = closeIconNode.addComponent(Graphics);
        this.drawSettingsCloseIcon(closeIcon);
        closeBtnNode.on(
            Button.EventType.CLICK,
            () => {
                this.hideSettingsPanel();
            },
            this
        );

        this._settingsBgmSlider = this.createVolumeSlider(
            panel,
            'SettingsBgmRow',
            'ui.settings.bgm',
            'bgm'
        );
        this._settingsSfxSlider = this.createVolumeSlider(
            panel,
            'SettingsSfxRow',
            'ui.settings.sfx',
            'sfx'
        );
        this.createLanguageRow(panel);

        this._settingsButtonNode = buttonNode;
        this._settingsPanelRoot = panelRoot;
        this._settingsPanelNode = panel;
        this.refreshSettingsPanelUI();
        buttonNode.active = false;
        panelRoot.active = false;
        applyLayerRecursive(buttonNode, HUD_UI_LAYER);
        applyLayerRecursive(panelRoot, HUD_UI_LAYER);
    }

    private createLanguageRow(parent: Node): void {
        const row = new Node('SettingsLangRow');
        parent.addChild(row);
        row.addComponent(UITransform).setContentSize(456, 80);

        const titleNode = new Node('SettingsLangTitle');
        row.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(156, 38);
        titleNode.setPosition(-148, 18, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.settings.language');
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.overflow = Label.Overflow.SHRINK;
        titleLabel.color = new Color(238, 242, 252, 255);
        applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(8, 20, 34, 255),
            outlineWidth: 3,
        });

        const btnContainer = new Node('LangBtnContainer');
        row.addChild(btnContainer);
        btnContainer.addComponent(UITransform).setContentSize(252, 48);
        btnContainer.setPosition(74, 0, 0);

        this.createLanguageButton(btnContainer, 'zh', -66, 'ui.settings.lang.zh');
        this.createLanguageButton(btnContainer, 'en', 66, 'ui.settings.lang.en');
    }

    private createLanguageButton(
        parent: Node,
        langCode: 'zh' | 'en',
        posX: number,
        textKey: string
    ): void {
        const btnNode = new Node(`LangBtn_${langCode}`);
        parent.addChild(btnNode);
        btnNode.addComponent(UITransform).setContentSize(120, 48);
        btnNode.setPosition(posX, 0, 0);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        const bg = btnNode.addComponent(Graphics);
        this.drawLanguageButtonBg(bg, Localization.instance.currentLanguage === langCode);

        const labelNode = new Node('Label');
        btnNode.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(104, 38);
        const label = labelNode.addComponent(Label);
        label.string = Localization.instance.t(textKey);
        label.fontSize = 24;
        label.lineHeight = 28;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.color = new Color(255, 255, 255, 255);
        applyGameLabelStyle(label);

        btnNode.on(Button.EventType.CLICK, () => {
            this.onLanguageSwitch(langCode);
        });
    }

    private drawLanguageButtonBg(bg: Graphics, isSelected: boolean): void {
        const tf = bg.node.getComponent(UITransform);
        const w = Math.round(tf?.contentSize.width ?? 120);
        const h = Math.round(tf?.contentSize.height ?? 48);
        const r = Math.max(8, Math.round(h * 0.22));
        bg.clear();
        if (isSelected) {
            bg.fillColor = new Color(82, 214, 255, 255);
            bg.strokeColor = new Color(255, 255, 255, 255);
        } else {
            bg.fillColor = new Color(28, 42, 58, 255);
            bg.strokeColor = new Color(116, 194, 236, 150);
        }
        bg.lineWidth = 2;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.fill();
        bg.stroke();
    }

    private onLanguageSwitch(lang: 'zh' | 'en'): void {
        if (Localization.instance.currentLanguage === lang) return;

        Localization.instance.setLanguage(lang);
        this._onLanguageChanged();
    }

    private createVolumeSlider(
        parent: Node,
        rowName: string,
        titleKey: string,
        key: AudioSliderKey
    ): VolumeSliderView {
        const row = new Node(rowName);
        parent.addChild(row);
        row.addComponent(UITransform).setContentSize(456, 80);

        const titleNode = new Node(`${rowName}_Title`);
        row.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(172, 38);
        titleNode.setPosition(-148, 18, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t(titleKey);
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.overflow = Label.Overflow.SHRINK;
        titleLabel.color = new Color(238, 242, 252, 255);
        applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(8, 20, 34, 255),
            outlineWidth: 3,
        });

        const trackNode = new Node(`${rowName}_Track`);
        row.addChild(trackNode);
        trackNode.addComponent(UITransform).setContentSize(262, 18);
        trackNode.setPosition(-16, -10, 0);
        const trackBg = trackNode.addComponent(Graphics);
        this.drawSliderTrack(trackBg, 262);

        const fillNode = new Node(`${rowName}_Fill`);
        trackNode.addChild(fillNode);
        fillNode.addComponent(UITransform).setContentSize(262, 18);
        const fillGraphics = fillNode.addComponent(Graphics);

        const knobNode = new Node(`${rowName}_Knob`);
        trackNode.addChild(knobNode);
        knobNode.addComponent(UITransform).setContentSize(28, 28);
        const knobGraphics = knobNode.addComponent(Graphics);
        knobGraphics.fillColor = new Color(255, 246, 220, 255);
        knobGraphics.circle(0, 0, 11);
        knobGraphics.fill();
        knobGraphics.strokeColor = new Color(255, 186, 82, 255);
        knobGraphics.lineWidth = 2;
        knobGraphics.circle(0, 0, 11);
        knobGraphics.stroke();

        const hitNode = new Node(`${rowName}_Hit`);
        row.addChild(hitNode);
        hitNode.addComponent(UITransform).setContentSize(280, 34);
        hitNode.setPosition(-16, -10, 0);
        hitNode.on(
            Node.EventType.TOUCH_START,
            (event: EventTouch) => {
                this.onVolumeSliderTouch(key, event);
            },
            this
        );
        hitNode.on(
            Node.EventType.TOUCH_MOVE,
            (event: EventTouch) => {
                this.onVolumeSliderTouch(key, event);
            },
            this
        );

        const valueNode = new Node(`${rowName}_Value`);
        row.addChild(valueNode);
        valueNode.addComponent(UITransform).setContentSize(88, 38);
        valueNode.setPosition(168, 18, 0);
        const valueLabel = valueNode.addComponent(Label);
        valueLabel.string = '100%';
        valueLabel.fontSize = 24;
        valueLabel.lineHeight = 30;
        valueLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        valueLabel.verticalAlign = Label.VerticalAlign.CENTER;
        valueLabel.overflow = Label.Overflow.SHRINK;
        valueLabel.color = new Color(156, 228, 255, 255);
        applyGameLabelStyle(valueLabel, {
            outlineColor: new Color(10, 24, 34, 255),
            outlineWidth: 3,
        });

        return {
            key,
            titleKey,
            rowNode: row,
            titleNode,
            titleLabel,
            trackNode,
            trackGraphics: trackBg,
            fillGraphics,
            knobNode,
            hitNode,
            valueNode,
            valueLabel,
            width: 262,
        };
    }

    private onVolumeSliderTouch(key: AudioSliderKey, event: EventTouch): void {
        const slider = key === 'bgm' ? this._settingsBgmSlider : this._settingsSfxSlider;
        if (!slider) return;

        const transform = slider.hitNode.getComponent(UITransform);
        if (!transform) return;
        const uiLocation = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
        const ratio = Math.max(0, Math.min(1, (local.x + slider.width * 0.5) / slider.width));

        if (key === 'bgm') {
            AudioSettingsManager.instance.setBgmVolume(ratio);
        } else {
            AudioSettingsManager.instance.setSfxVolume(ratio);
            WeaponSFXManager.refreshVolumes();
        }

        this.refreshSettingsPanelUI();
    }

    private refreshSettingsPanelUI(): void {
        if (this._settingsBgmSlider) {
            this.redrawVolumeSlider(
                this._settingsBgmSlider,
                AudioSettingsManager.instance.bgmVolume
            );
        }
        if (this._settingsSfxSlider) {
            this.redrawVolumeSlider(
                this._settingsSfxSlider,
                AudioSettingsManager.instance.sfxVolume
            );
        }
    }

    private redrawVolumeSlider(slider: VolumeSliderView, ratio: number): void {
        const clamped = Math.max(0, Math.min(1, ratio));
        const left = -slider.width / 2;
        const fillWidth = Math.max(0, Math.round(slider.width * clamped));

        slider.fillGraphics.clear();
        if (fillWidth > 0) {
            slider.fillGraphics.fillColor = new Color(82, 214, 255, 255);
            slider.fillGraphics.roundRect(left, -7, fillWidth, 14, 7);
            slider.fillGraphics.fill();
        }
        slider.knobNode.setPosition(left + slider.width * clamped, 0, 0);
        slider.valueLabel.string = `${Math.round(clamped * 100)}%`;
    }

    private drawSliderTrack(bg: Graphics, width: number): void {
        bg.clear();
        bg.fillColor = new Color(28, 42, 58, 238);
        bg.roundRect(-width / 2, -9, width, 18, 9);
        bg.fill();
        bg.strokeColor = new Color(116, 194, 236, 220);
        bg.lineWidth = 2;
        bg.roundRect(-width / 2, -9, width, 18, 9);
        bg.stroke();
    }

    private drawSettingsButton(bg: Graphics): void {
        const tf = bg.node.getComponent(UITransform);
        const w = Math.round(tf?.contentSize.width ?? 156);
        const h = Math.round(tf?.contentSize.height ?? 58);
        const radius = Math.max(12, Math.round(h * 0.3));
        bg.clear();
        bg.fillColor = new Color(255, 198, 88, 250);
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.fill();
        bg.fillColor = new Color(255, 236, 172, 120);
        bg.roundRect(-w / 2 + 4, h * 0.04, w - 8, h * 0.34, Math.max(8, radius - 5));
        bg.fill();
        bg.strokeColor = new Color(255, 246, 210, 255);
        bg.lineWidth = 3;
        bg.roundRect(-w / 2, -h / 2, w, h, radius);
        bg.stroke();
    }

    private drawSettingsCloseButton(bg: Graphics): void {
        const tf = bg.node.getComponent(UITransform);
        const s = Math.round(tf?.contentSize.width ?? 48);
        const r = Math.max(8, Math.round(s * 0.25));
        bg.clear();
        bg.fillColor = new Color(122, 42, 34, 255);
        bg.roundRect(-s / 2, -s / 2, s, s, r);
        bg.fill();
        bg.strokeColor = new Color(255, 182, 160, 255);
        bg.lineWidth = 2.5;
        bg.roundRect(-s / 2, -s / 2, s, s, r);
        bg.stroke();
    }

    private drawSettingsPanelBackground(bg: Graphics): void {
        const tf = bg.node.getComponent(UITransform);
        const width = Math.round(tf?.contentSize.width ?? 500);
        const height = Math.round(tf?.contentSize.height ?? 400);
        const outerRadius = Math.max(14, Math.round(Math.min(width, height) * 0.04));

        bg.clear();
        bg.fillColor = new Color(10, 20, 34, 238);
        bg.roundRect(-width / 2, -height / 2, width, height, outerRadius);
        bg.fill();

        const insetX = Math.max(8, Math.round(width * 0.02));
        const titleBandTop = Math.round(height * 0.14);
        const titleBandHeight = Math.max(74, Math.round(height * 0.3));
        bg.fillColor = new Color(32, 46, 68, 155);
        bg.roundRect(
            -width / 2 + insetX,
            titleBandTop,
            width - insetX * 2,
            titleBandHeight,
            Math.max(10, outerRadius - 4)
        );
        bg.fill();

        bg.strokeColor = new Color(255, 172, 88, 246);
        bg.lineWidth = 3.5;
        bg.roundRect(-width / 2, -height / 2, width, height, outerRadius);
        bg.stroke();

        const innerInset = Math.max(8, Math.round(width * 0.02));
        bg.strokeColor = new Color(96, 204, 248, 140);
        bg.lineWidth = 1.5;
        bg.roundRect(
            -width / 2 + innerInset,
            -height / 2 + innerInset,
            width - innerInset * 2,
            height - innerInset * 2,
            Math.max(12, outerRadius - 2)
        );
        bg.stroke();
    }

    private drawSettingsGearIcon(bg: Graphics): void {
        bg.clear();
        bg.strokeColor = new Color(62, 34, 8, 255);
        bg.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI / 4) * i;
            const outerX = Math.cos(angle) * 11;
            const outerY = Math.sin(angle) * 11;
            const innerX = Math.cos(angle) * 7;
            const innerY = Math.sin(angle) * 7;
            bg.moveTo(innerX, innerY);
            bg.lineTo(outerX, outerY);
            bg.stroke();
        }
        bg.fillColor = new Color(110, 62, 20, 255);
        bg.circle(0, 0, 7);
        bg.fill();
        bg.fillColor = new Color(255, 230, 168, 255);
        bg.circle(0, 0, 3.2);
        bg.fill();
    }

    private drawSettingsCloseIcon(bg: Graphics): void {
        bg.clear();
        bg.strokeColor = new Color(255, 236, 222, 255);
        bg.lineWidth = 3.5;
        bg.moveTo(-7, -7);
        bg.lineTo(7, 7);
        bg.stroke();
        bg.moveTo(-7, 7);
        bg.lineTo(7, -7);
        bg.stroke();
    }

    private toggleSettingsPanel(): void {
        if (this._settingsPanelRoot?.active) {
            this.hideSettingsPanel();
            return;
        }
        this.showSettingsPanel();
    }

    private showSettingsPanel(): void {
        if (!this._settingsPanelRoot || !this._settingsPanelOpacity) return;

        this.updateSettingsLayout();
        this.refreshSettingsPanelUI();

        this._settingsPanelRoot.active = true;
        const rootParent = this._settingsPanelRoot.parent;
        if (rootParent) {
            this._settingsPanelRoot.setSiblingIndex(rootParent.children.length - 1);
        }
        this._settingsPanelOpacity.opacity = 0;
        Tween.stopAllByTarget(this._settingsPanelOpacity);
        tween(this._settingsPanelOpacity).to(0.14, { opacity: 255 }).start();
    }

    private hideSettingsPanel(): void {
        if (!this._settingsPanelRoot || !this._settingsPanelOpacity) return;
        Tween.stopAllByTarget(this._settingsPanelOpacity);
        tween(this._settingsPanelOpacity)
            .to(0.12, { opacity: 0 })
            .call(() => {
                if (this._settingsPanelRoot) {
                    this._settingsPanelRoot.active = false;
                }
            })
            .start();
    }

    private refreshText(): void {
        const panel = this._settingsPanelNode;
        if (panel) {
            const title = panel.getChildByName('SettingsTitle')?.getComponent(Label);
            if (title) title.string = Localization.instance.t('ui.settings.title');

            if (this._settingsBgmSlider) {
                this._settingsBgmSlider.titleLabel.string = Localization.instance.t(
                    this._settingsBgmSlider.titleKey
                );
            }
            if (this._settingsSfxSlider) {
                this._settingsSfxSlider.titleLabel.string = Localization.instance.t(
                    this._settingsSfxSlider.titleKey
                );
            }

            const langRow = panel.getChildByName('SettingsLangRow');
            if (langRow) {
                const label = langRow.getChildByName('SettingsLangTitle')?.getComponent(Label);
                if (label) label.string = Localization.instance.t('ui.settings.language');

                const container = langRow.getChildByName('LangBtnContainer');
                if (container) {
                    const codes: Array<'zh' | 'en'> = ['zh', 'en'];
                    for (const code of codes) {
                        const btn = container.getChildByName(`LangBtn_${code}`);
                        if (!btn) continue;
                        const bg = btn.getComponent(Graphics);
                        if (bg) {
                            this.drawLanguageButtonBg(
                                bg,
                                Localization.instance.currentLanguage === code
                            );
                        }
                        const buttonLabel = btn.getChildByName('Label')?.getComponent(Label);
                        if (buttonLabel) {
                            buttonLabel.string = Localization.instance.t(
                                `ui.settings.lang.${code}`
                            );
                        }
                    }
                }
            }
        }

        const btnLabel = this._settingsButtonNode
            ?.getChildByName('SettingsButtonLabel')
            ?.getComponent(Label);
        if (btnLabel) {
            btnLabel.string = Localization.instance.t('ui.settings.button');
        }

        this.updateSettingsLayout();
        this.refreshSettingsPanelUI();
    }

    private updateSettingsLayout(): void {
        if (!this._settingsButtonNode || !this._settingsPanelNode) {
            return;
        }

        const vis = UIResponsive.getVisibleSize();
        const viewportW = Math.max(480, Math.round(vis.width));
        const viewportH = Math.max(320, Math.round(vis.height));
        const compact = viewportW < 920 || viewportH < 620;
        const padding = UIResponsive.getControlPadding();

        const buttonW = Math.round(
            UIResponsive.clamp(
                viewportW * (compact ? 0.21 : 0.16),
                SETTINGS_BUTTON_MIN_WIDTH,
                SETTINGS_BUTTON_MAX_WIDTH
            )
        );
        const buttonH = Math.round(
            UIResponsive.clamp(
                viewportH * (compact ? 0.1 : 0.085),
                SETTINGS_BUTTON_MIN_HEIGHT,
                SETTINGS_BUTTON_MAX_HEIGHT
            )
        );
        const buttonTf = this._settingsButtonNode.getComponent(UITransform);
        buttonTf?.setContentSize(buttonW, buttonH);

        // Bypass Widget entirely — position directly relative to the visible viewport center.
        // UICanvas UITransform is hardcoded 1280×720, so Widget.isAlignRight would place
        // elements at canvas-edge ±640, while the camera only shows ±(vis.width/2).
        const topPad = Math.max(10, Math.round(padding.top * 0.45));
        const rightPad = Math.max(10, Math.round(padding.right * 0.55));
        const halfW = vis.width * 0.5;
        const halfH = vis.height * 0.5;

        // Disable Widget entirely so its onEnable() cannot re-apply the original
        // isAlignTop/isAlignRight values and override our explicit setPosition.
        const buttonWidget = this._settingsButtonNode.getComponent(Widget);
        if (buttonWidget) buttonWidget.enabled = false;
        this._settingsButtonNode.setPosition(
            Math.round(halfW - rightPad - buttonW * 0.5),
            Math.round(halfH - topPad - buttonH * 0.5),
            0
        );
        const buttonLabel = this._settingsButtonNode.getChildByName('SettingsButtonLabel');
        const buttonLabelTf = buttonLabel?.getComponent(UITransform);
        buttonLabelTf?.setContentSize(buttonW - 48, buttonH - 8);
        if (buttonLabel) {
            buttonLabel.setPosition(Math.round(buttonW * 0.09), 0, 0);
            const label = buttonLabel.getComponent(Label);
            if (label) {
                label.fontSize = Math.max(22, Math.min(30, Math.round(buttonH * 0.5)));
                label.lineHeight = label.fontSize + 4;
            }
        }
        const buttonIcon = this._settingsButtonNode.getChildByName('SettingsButtonIcon');
        if (buttonIcon) {
            const iconSize = Math.max(20, Math.min(30, Math.round(buttonH * 0.45)));
            buttonIcon.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
            buttonIcon.setPosition(-Math.round(buttonW * 0.32), 0, 0);
        }
        if (this._settingsButtonBg) {
            this.drawSettingsButton(this._settingsButtonBg);
        }

        const panelW = Math.round(
            UIResponsive.clamp(
                viewportW * (compact ? 0.66 : 0.46),
                SETTINGS_PANEL_MIN_WIDTH,
                SETTINGS_PANEL_MAX_WIDTH
            )
        );
        const desiredPanelH = Math.round(
            UIResponsive.clamp(
                viewportH * (compact ? 0.72 : 0.58),
                SETTINGS_PANEL_MIN_HEIGHT,
                SETTINGS_PANEL_MAX_HEIGHT
            )
        );
        const gap = compact ? 8 : 10;
        const panelH = Math.max(SETTINGS_PANEL_MIN_HEIGHT, Math.min(desiredPanelH, viewportH - 16));
        this._settingsPanelNode.getComponent(UITransform)?.setContentSize(panelW, panelH);
        const panelWidget = this._settingsPanelNode.getComponent(Widget);
        if (panelWidget) panelWidget.enabled = false;
        // Panel sits directly below the button, right-aligned to the same edge.
        // panelRoot fills UICanvas (1280×720); local coords are same as UICanvas coords.
        const panelTopFromCenter = halfH - topPad - buttonH - gap;
        const panelY = Math.round(
            Math.max(-(halfH - panelH * 0.5 - 8), panelTopFromCenter - panelH * 0.5)
        );
        this._settingsPanelNode.setPosition(Math.round(halfW - rightPad - panelW * 0.5), panelY, 0);
        if (this._settingsPanelBg) {
            this.drawSettingsPanelBackground(this._settingsPanelBg);
        }

        const titleNode = this._settingsPanelNode.getChildByName('SettingsTitle');
        if (titleNode) {
            titleNode
                .getComponent(UITransform)
                ?.setContentSize(
                    panelW - Math.max(138, Math.round(panelW * 0.27)),
                    Math.max(48, Math.round(panelH * 0.12))
                );
            titleNode.setPosition(-Math.round(panelW * 0.12), Math.round(panelH * 0.31), 0);
            const titleLabel = titleNode.getComponent(Label);
            if (titleLabel) {
                titleLabel.fontSize = Math.max(28, Math.min(38, Math.round(panelH * 0.08)));
                titleLabel.lineHeight = titleLabel.fontSize + 6;
            }
        }

        const closeNode = this._settingsPanelNode.getChildByName('SettingsCloseButton');
        if (closeNode) {
            const closeSize = Math.max(40, Math.min(56, Math.round(panelH * 0.12)));
            closeNode.getComponent(UITransform)?.setContentSize(closeSize, closeSize);
            closeNode.setPosition(panelW / 2 - closeSize * 0.72, panelH / 2 - closeSize * 0.72, 0);
            const closeIcon = closeNode.getChildByName('SettingsCloseIcon');
            if (closeIcon) {
                const iconSize = Math.max(20, Math.round(closeSize * 0.5));
                closeIcon.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
            }
            const closeBg = closeNode.getComponent(Graphics);
            if (closeBg) {
                this.drawSettingsCloseButton(closeBg);
            }
        }

        const rowWidth = panelW - Math.max(36, Math.round(panelW * 0.1));
        const rowHeight = Math.max(72, Math.min(98, Math.round(panelH * 0.19)));
        const rowBaseY = Math.round(panelH * 0.17);
        const rowGap = Math.round(rowHeight * 0.93);

        this.layoutVolumeSlider(this._settingsBgmSlider, rowBaseY, rowWidth, rowHeight);
        this.layoutVolumeSlider(this._settingsSfxSlider, rowBaseY - rowGap, rowWidth, rowHeight);
        this.layoutLanguageRow(rowBaseY - rowGap * 2, rowWidth, rowHeight);
    }

    private layoutVolumeSlider(
        slider: VolumeSliderView | null,
        posY: number,
        rowWidth: number,
        rowHeight: number
    ): void {
        if (!slider) return;

        slider.rowNode.getComponent(UITransform)?.setContentSize(rowWidth, rowHeight);
        slider.rowNode.setPosition(0, posY, 0);

        const titleW = Math.max(156, Math.min(252, Math.round(rowWidth * 0.42)));
        const valueW = Math.max(74, Math.min(108, Math.round(rowWidth * 0.18)));
        const sliderW = Math.max(132, Math.min(340, rowWidth - titleW - valueW - 58));
        slider.width = sliderW;

        const left = -rowWidth / 2 + 8;
        const titleCenterX = left + titleW / 2;
        const titleY = 0;
        slider.titleNode
            .getComponent(UITransform)
            ?.setContentSize(titleW, Math.round(rowHeight * 0.52));
        slider.titleNode.setPosition(titleCenterX, titleY, 0);
        slider.titleLabel.fontSize = Math.max(20, Math.min(28, Math.round(rowHeight * 0.33)));
        slider.titleLabel.lineHeight = slider.titleLabel.fontSize + 6;

        const trackLeft = left + titleW + 14;
        const trackCenterX = trackLeft + sliderW / 2;
        const trackY = 0;
        slider.trackNode.getComponent(UITransform)?.setContentSize(sliderW, 18);
        slider.trackNode.setPosition(trackCenterX, trackY, 0);
        this.drawSliderTrack(slider.trackGraphics, sliderW);

        slider.hitNode.getComponent(UITransform)?.setContentSize(sliderW + 18, 36);
        slider.hitNode.setPosition(trackCenterX, trackY, 0);

        const valueCenterX = rowWidth / 2 - valueW / 2 - 4;
        slider.valueNode
            .getComponent(UITransform)
            ?.setContentSize(valueW, Math.round(rowHeight * 0.5));
        slider.valueNode.setPosition(valueCenterX, titleY, 0);
        slider.valueLabel.fontSize = Math.max(20, Math.min(26, Math.round(rowHeight * 0.31)));
        slider.valueLabel.lineHeight = slider.valueLabel.fontSize + 6;

        this.redrawVolumeSlider(
            slider,
            slider.key === 'bgm'
                ? AudioSettingsManager.instance.bgmVolume
                : AudioSettingsManager.instance.sfxVolume
        );
    }

    private layoutLanguageRow(posY: number, rowWidth: number, rowHeight: number): void {
        const row = this._settingsPanelNode?.getChildByName('SettingsLangRow');
        if (!row) return;

        row.getComponent(UITransform)?.setContentSize(rowWidth, rowHeight);
        row.setPosition(0, posY, 0);

        const titleNode = row.getChildByName('SettingsLangTitle');
        const titleLabel = titleNode?.getComponent(Label);
        const titleW = Math.max(138, Math.min(224, Math.round(rowWidth * 0.36)));
        const titleY = 0;
        const left = -rowWidth / 2 + 8;
        titleNode?.getComponent(UITransform)?.setContentSize(titleW, Math.round(rowHeight * 0.52));
        titleNode?.setPosition(left + titleW / 2, titleY, 0);
        if (titleLabel) {
            titleLabel.fontSize = Math.max(20, Math.min(28, Math.round(rowHeight * 0.33)));
            titleLabel.lineHeight = titleLabel.fontSize + 6;
        }

        const container = row.getChildByName('LangBtnContainer');
        if (!container) return;

        const containerW = Math.max(198, rowWidth - titleW - 34);
        container
            .getComponent(UITransform)
            ?.setContentSize(containerW, Math.round(rowHeight * 0.62));
        const containerCenterX = left + titleW + 14 + containerW / 2;
        container.setPosition(containerCenterX, 0, 0);

        const buttonGap = 14;
        const buttonW = Math.max(92, Math.min(168, Math.round((containerW - buttonGap) * 0.5)));
        const buttonH = Math.max(40, Math.min(54, Math.round(rowHeight * 0.62)));
        const halfDistance = Math.round((buttonW + buttonGap) * 0.5);

        const codes: Array<'zh' | 'en'> = ['zh', 'en'];
        for (const code of codes) {
            const btn = container.getChildByName(`LangBtn_${code}`);
            if (!btn) continue;
            btn.getComponent(UITransform)?.setContentSize(buttonW, buttonH);
            btn.setPosition(code === 'zh' ? -halfDistance : halfDistance, 0, 0);

            const labelNode = btn.getChildByName('Label');
            const label = labelNode?.getComponent(Label);
            labelNode?.getComponent(UITransform)?.setContentSize(buttonW - 10, buttonH - 8);
            if (label) {
                label.fontSize = Math.max(20, Math.min(26, Math.round(buttonH * 0.48)));
                label.lineHeight = label.fontSize + 4;
            }

            const bg = btn.getComponent(Graphics);
            if (bg) {
                this.drawLanguageButtonBg(bg, Localization.instance.currentLanguage === code);
            }
        }
    }
}
