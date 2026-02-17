import {
    BlockInputEvents,
    Button,
    Color,
    EventTouch,
    Graphics,
    Node,
    Tween,
    tween,
    UITransform,
    UIOpacity,
    Vec3,
    Widget,
    Label,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { AudioSettingsManager } from '../../core/managers/AudioSettingsManager';
import { WeaponSFXManager } from '../../gameplay/weapons/WeaponSFXManager';
import { applyGameLabelStyle, applyLayerRecursive, HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

const SETTINGS_PANEL_WIDTH = 500;
const SETTINGS_PANEL_HEIGHT = 400;
const SETTINGS_SLIDER_WIDTH = 262;
const SETTINGS_BUTTON_WIDTH = 156;
const SETTINGS_BUTTON_HEIGHT = 58;
const SETTINGS_CLOSE_SIZE = 48;

type AudioSliderKey = 'bgm' | 'sfx';

type VolumeSliderView = {
    key: AudioSliderKey;
    hitNode: Node;
    fillGraphics: Graphics;
    knobNode: Node;
    valueLabel: Label;
    width: number;
};

export class HUDSettingsModule implements HUDModule {
    private _settingsButtonNode: Node | null = null;
    private _settingsPanelRoot: Node | null = null;
    private _settingsPanelOpacity: UIOpacity | null = null;
    private _settingsBgmSlider: VolumeSliderView | null = null;
    private _settingsSfxSlider: VolumeSliderView | null = null;

    public constructor(private readonly _onLanguageChanged: () => void) {}

    public initialize(parent: Node): void {
        this.createSettingsUI(parent);
    }

    public cleanup(): void {
        if (this._settingsPanelOpacity) {
            Tween.stopAllByTarget(this._settingsPanelOpacity);
        }
        if (this._settingsPanelRoot) {
            Tween.stopAllByTarget(this._settingsPanelRoot);
        }

        this._settingsButtonNode = null;
        this._settingsPanelRoot = null;
        this._settingsPanelOpacity = null;
        this._settingsBgmSlider = null;
        this._settingsSfxSlider = null;
    }

    public onLanguageChanged(): void {
        this.refreshText();
    }

    private createSettingsUI(parent: Node): void {
        const buttonNode = new Node('SettingsButton');
        parent.addChild(buttonNode);
        buttonNode
            .addComponent(UITransform)
            .setContentSize(SETTINGS_BUTTON_WIDTH, SETTINGS_BUTTON_HEIGHT);
        const buttonWidget = buttonNode.addComponent(Widget);
        buttonWidget.isAlignTop = true;
        buttonWidget.isAlignRight = true;
        buttonWidget.top = 12;
        buttonWidget.right = 16;

        const button = buttonNode.addComponent(Button);
        button.transition = Button.Transition.NONE;

        const buttonBg = buttonNode.addComponent(Graphics);
        this.drawSettingsButton(buttonBg);

        const buttonLabelNode = new Node('SettingsButtonLabel');
        buttonNode.addChild(buttonLabelNode);
        buttonLabelNode
            .addComponent(UITransform)
            .setContentSize(SETTINGS_BUTTON_WIDTH - 52, SETTINGS_BUTTON_HEIGHT - 8);
        buttonLabelNode.setPosition(14, 0, 0);
        const buttonLabel = buttonLabelNode.addComponent(Label);
        buttonLabel.string = Localization.instance.t('ui.settings.button');
        buttonLabel.fontSize = 28;
        buttonLabel.lineHeight = 32;
        buttonLabel.isBold = true;
        buttonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        buttonLabel.verticalAlign = Label.VerticalAlign.CENTER;
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
        buttonIconNode.setPosition(-SETTINGS_BUTTON_WIDTH * 0.3, 0, 0);
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
        panel.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH, SETTINGS_PANEL_HEIGHT);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignTop = true;
        panelWidget.isAlignRight = true;
        panelWidget.top = 70;
        panelWidget.right = 16;

        const panelBg = panel.addComponent(Graphics);
        this.drawSettingsPanelBackground(panelBg);

        const titleNode = new Node('SettingsTitle');
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH - 132, 46);
        titleNode.setPosition(-56, 108, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.settings.title');
        titleLabel.fontSize = 32;
        titleLabel.lineHeight = 38;
        titleLabel.isBold = true;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(255, 228, 186, 255);
        applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(54, 26, 8, 255),
            outlineWidth: 3,
        });

        const closeBtnNode = new Node('SettingsCloseButton');
        panel.addChild(closeBtnNode);
        closeBtnNode
            .addComponent(UITransform)
            .setContentSize(SETTINGS_CLOSE_SIZE, SETTINGS_CLOSE_SIZE);
        closeBtnNode.setPosition(SETTINGS_PANEL_WIDTH / 2 - 40, SETTINGS_PANEL_HEIGHT / 2 - 36, 0);
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
            60,
            'bgm'
        );
        this._settingsSfxSlider = this.createVolumeSlider(
            panel,
            'SettingsSfxRow',
            'ui.settings.sfx',
            -20,
            'sfx'
        );

        this.createLanguageRow(panel, -100);

        this._settingsButtonNode = buttonNode;
        this._settingsPanelRoot = panelRoot;
        this.refreshSettingsPanelUI();
        panelRoot.active = false;
        applyLayerRecursive(buttonNode, HUD_UI_LAYER);
        applyLayerRecursive(panelRoot, HUD_UI_LAYER);
    }

    private createLanguageRow(parent: Node, posY: number): void {
        const row = new Node('SettingsLangRow');
        parent.addChild(row);
        row.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH - 44, 80);
        row.setPosition(0, posY, 0);

        const titleNode = new Node('SettingsLangTitle');
        row.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(128, 36);
        titleNode.setPosition(-162, 18, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.settings.language');
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(238, 242, 252, 255);
        applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(8, 20, 34, 255),
            outlineWidth: 3,
        });

        const btnContainer = new Node('LangBtnContainer');
        row.addChild(btnContainer);
        btnContainer.setPosition(60, 0, 0);

        this.createLanguageButton(btnContainer, 'zh', -70, 'ui.settings.lang.zh');
        this.createLanguageButton(btnContainer, 'en', 70, 'ui.settings.lang.en');
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
        const label = labelNode.addComponent(Label);
        label.string = Localization.instance.t(textKey);
        label.fontSize = 24;
        label.lineHeight = 28;
        label.color = new Color(255, 255, 255, 255);
        applyGameLabelStyle(label);

        btnNode.on('click', () => {
            this.onLanguageSwitch(langCode);
        });
    }

    private drawLanguageButtonBg(bg: Graphics, isSelected: boolean): void {
        bg.clear();
        const w = 120;
        const h = 48;
        const r = 8;
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
        posY: number,
        key: AudioSliderKey
    ): VolumeSliderView {
        const row = new Node(rowName);
        parent.addChild(row);
        row.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH - 44, 80);
        row.setPosition(0, posY, 0);

        const titleNode = new Node(`${rowName}_Title`);
        row.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(128, 36);
        titleNode.setPosition(-162, 18, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t(titleKey);
        titleLabel.fontSize = 26;
        titleLabel.lineHeight = 32;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.color = new Color(238, 242, 252, 255);
        applyGameLabelStyle(titleLabel, {
            outlineColor: new Color(8, 20, 34, 255),
            outlineWidth: 3,
        });

        const trackNode = new Node(`${rowName}_Track`);
        row.addChild(trackNode);
        trackNode.addComponent(UITransform).setContentSize(SETTINGS_SLIDER_WIDTH, 18);
        trackNode.setPosition(-16, -10, 0);
        const trackBg = trackNode.addComponent(Graphics);
        trackBg.fillColor = new Color(28, 42, 58, 238);
        trackBg.roundRect(-SETTINGS_SLIDER_WIDTH / 2, -9, SETTINGS_SLIDER_WIDTH, 18, 9);
        trackBg.fill();
        trackBg.strokeColor = new Color(116, 194, 236, 220);
        trackBg.lineWidth = 2;
        trackBg.roundRect(-SETTINGS_SLIDER_WIDTH / 2, -9, SETTINGS_SLIDER_WIDTH, 18, 9);
        trackBg.stroke();

        const fillNode = new Node(`${rowName}_Fill`);
        trackNode.addChild(fillNode);
        fillNode.addComponent(UITransform).setContentSize(SETTINGS_SLIDER_WIDTH, 18);
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
        hitNode.addComponent(UITransform).setContentSize(SETTINGS_SLIDER_WIDTH + 18, 34);
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
        valueNode.addComponent(UITransform).setContentSize(80, 36);
        valueNode.setPosition(168, 18, 0);
        const valueLabel = valueNode.addComponent(Label);
        valueLabel.string = '100%';
        valueLabel.fontSize = 24;
        valueLabel.lineHeight = 30;
        valueLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        valueLabel.verticalAlign = Label.VerticalAlign.CENTER;
        valueLabel.color = new Color(156, 228, 255, 255);
        applyGameLabelStyle(valueLabel, {
            outlineColor: new Color(10, 24, 34, 255),
            outlineWidth: 3,
        });

        return {
            key,
            hitNode,
            fillGraphics,
            knobNode,
            valueLabel,
            width: SETTINGS_SLIDER_WIDTH,
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

    private drawSettingsButton(bg: Graphics): void {
        const tf = bg.node.getComponent(UITransform);
        const w = Math.round(tf?.contentSize.width ?? SETTINGS_BUTTON_WIDTH);
        const h = Math.round(tf?.contentSize.height ?? SETTINGS_BUTTON_HEIGHT);
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
        const s = Math.round(tf?.contentSize.width ?? SETTINGS_CLOSE_SIZE);
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
        bg.clear();
        bg.fillColor = new Color(10, 20, 34, 238);
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2,
            -SETTINGS_PANEL_HEIGHT / 2,
            SETTINGS_PANEL_WIDTH,
            SETTINGS_PANEL_HEIGHT,
            18
        );
        bg.fill();
        bg.fillColor = new Color(32, 46, 68, 155);
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2 + 10,
            SETTINGS_PANEL_HEIGHT * 0.14,
            SETTINGS_PANEL_WIDTH - 20,
            SETTINGS_PANEL_HEIGHT * 0.3,
            12
        );
        bg.fill();
        bg.strokeColor = new Color(255, 172, 88, 246);
        bg.lineWidth = 3.5;
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2,
            -SETTINGS_PANEL_HEIGHT / 2,
            SETTINGS_PANEL_WIDTH,
            SETTINGS_PANEL_HEIGHT,
            18
        );
        bg.stroke();
        bg.strokeColor = new Color(96, 204, 248, 140);
        bg.lineWidth = 1.5;
        bg.roundRect(
            -SETTINGS_PANEL_WIDTH / 2 + 10,
            -SETTINGS_PANEL_HEIGHT / 2 + 10,
            SETTINGS_PANEL_WIDTH - 20,
            SETTINGS_PANEL_HEIGHT - 20,
            14
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
        const panel = this._settingsPanelRoot?.getChildByName('SettingsPanel');
        if (panel) {
            const title = panel.getChildByName('SettingsTitle')?.getComponent(Label);
            if (title) title.string = Localization.instance.t('ui.settings.title');

            const bgmRow = panel.getChildByName('SettingsBgmRow');
            if (bgmRow) {
                const label = bgmRow.getChildByName('SettingsBgmRow_Title')?.getComponent(Label);
                if (label) label.string = Localization.instance.t('ui.settings.bgm');
            }
            const sfxRow = panel.getChildByName('SettingsSfxRow');
            if (sfxRow) {
                const label = sfxRow.getChildByName('SettingsSfxRow_Title')?.getComponent(Label);
                if (label) label.string = Localization.instance.t('ui.settings.sfx');
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
        if (btnLabel) btnLabel.string = Localization.instance.t('ui.settings.button');
    }
}
