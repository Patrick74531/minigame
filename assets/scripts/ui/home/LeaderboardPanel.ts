import {
    Node,
    UITransform,
    Widget,
    Label,
    Button,
    Graphics,
    Color,
    Layers,
    ScrollView,
    Layout,
    view,
} from 'cc';
import type { LeaderboardEntry } from '../../core/reddit/RedditBridge';
import { Localization } from '../../core/i18n/Localization';
import { applyGameLabelStyle } from '../hud/HUDCommon';
import { UIResponsive } from '../UIResponsive';

const ROW_H = 56;
const GOLD = new Color(255, 198, 88, 255);
const SILVER = new Color(192, 192, 192, 255);
const BRONZE = new Color(205, 127, 50, 255);
const BG_DARK = new Color(18, 18, 36, 230);
const ROW_ODD = new Color(28, 28, 50, 200);
const ROW_EVEN = new Color(22, 22, 42, 200);
const TEXT_WHITE = new Color(255, 255, 255, 255);
const TEXT_DIM = new Color(180, 180, 200, 255);

export class LeaderboardPanel {
    private _root: Node;
    private _listContent: Node | null = null;
    private _statusLabel: Label | null = null;
    private _uiLayer: number;
    private _onClose: (() => void) | null = null;
    private _panelW: number = 520;
    private _panelH: number = 600;
    private _showRedditPrefix: boolean = true;
    private _isTikTokPortrait = false;
    private _isCompact = false;
    private _listWidth = 0;
    private _rowHeight = ROW_H;

    constructor(parent: Node, onClose: () => void, showRedditPrefix: boolean = true) {
        this._uiLayer = parent.layer ?? Layers.Enum.UI_2D;
        this._onClose = onClose;
        this._showRedditPrefix = showRedditPrefix;
        const vs = view.getVisibleSize();
        this._isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();
        this._isCompact = this._isTikTokPortrait || Math.min(vs.width, vs.height) < 700;
        this._panelW = Math.round(
            UIResponsive.clamp(
                vs.width * (this._isTikTokPortrait ? 0.94 : 0.88),
                this._isTikTokPortrait ? 300 : 360,
                520
            )
        );
        this._panelH = Math.round(
            UIResponsive.clamp(
                vs.height * (this._isTikTokPortrait ? 0.9 : 0.88),
                this._isTikTokPortrait ? 500 : 430,
                this._isTikTokPortrait ? 760 : 620
            )
        );
        this._rowHeight = this._isTikTokPortrait ? 62 : this._isCompact ? 52 : ROW_H;
        this._root = this._buildPanel(parent);
    }

    public get node(): Node {
        return this._root;
    }

    public showError(): void {
        if (this._listContent) {
            this._listContent.removeAllChildren();
        }
        if (this._statusLabel) {
            this._statusLabel.string = Localization.instance.t('ui.leaderboard.error');
        }
    }

    public showLoading(): void {
        if (this._listContent) {
            this._listContent.removeAllChildren();
        }
        if (this._statusLabel) {
            this._statusLabel.string = Localization.instance.t('ui.leaderboard.loading');
        }
    }

    public showEntries(entries: LeaderboardEntry[]): void {
        if (this._statusLabel) {
            this._statusLabel.string = '';
        }
        if (!this._listContent) return;
        this._listContent.removeAllChildren();

        if (entries.length === 0) {
            if (this._statusLabel) {
                this._statusLabel.string = Localization.instance.t('ui.leaderboard.empty');
                this._statusLabel.overflow = Label.Overflow.NONE;
                this._statusLabel.enableWrapText = true;
            }
            return;
        }

        entries.forEach((entry, idx) => {
            const row = this._buildRow(entry, idx);
            this._listContent!.addChild(row);
        });
    }

    public destroy(): void {
        this._root.destroy();
    }

    private _buildPanel(parent: Node): Node {
        const overlay = new Node('LeaderboardOverlay');
        overlay.layer = this._uiLayer;
        parent.addChild(overlay);
        const overlayTf = overlay.addComponent(UITransform);
        overlayTf.setContentSize(99999, 99999);
        const overlayWidget = overlay.addComponent(Widget);
        overlayWidget.isAlignLeft = overlayWidget.isAlignRight = true;
        overlayWidget.isAlignTop = overlayWidget.isAlignBottom = true;
        overlayWidget.left = overlayWidget.right = overlayWidget.top = overlayWidget.bottom = 0;
        overlayWidget.updateAlignment();

        const overlayBg = overlay.addComponent(Graphics);
        overlayBg.fillColor = new Color(0, 0, 0, 160);
        overlayBg.fillRect(-49999, -49999, 99999, 99999);
        overlayBg.fill();
        overlay.on(Node.EventType.TOUCH_START, () => {}, this);

        const panel = new Node('LeaderboardPanel');
        panel.layer = this._uiLayer;
        overlay.addChild(panel);

        const panelTf = panel.addComponent(UITransform);
        panelTf.setContentSize(this._panelW, this._panelH);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignHorizontalCenter = panelWidget.isAlignVerticalCenter = true;
        panelWidget.horizontalCenter = 0;
        panelWidget.verticalCenter = this._isTikTokPortrait
            ? -Math.round(UIResponsive.getControlPadding().top * 0.18)
            : 0;
        panelWidget.updateAlignment();

        const panelBg = panel.addComponent(Graphics);
        this._drawRoundRect(panelBg, this._panelW, this._panelH, 18, BG_DARK);

        this._buildTitle(panel);
        this._buildList(panel);
        this._buildCloseButton(panel);

        return overlay;
    }

    private _buildTitle(panel: Node): void {
        const W = this._panelW;
        const H = this._panelH;
        const titleNode = new Node('Title');
        titleNode.layer = this._uiLayer;
        panel.addChild(titleNode);
        const titleTf = titleNode.addComponent(UITransform);
        const titleH = this._isTikTokPortrait ? 54 : 60;
        titleTf.setContentSize(W - (this._isTikTokPortrait ? 36 : 40), titleH);
        titleNode.setPosition(0, H / 2 - (this._isTikTokPortrait ? 42 : 40), 0);

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.leaderboard.title');
        label.fontSize = Math.round(
            UIResponsive.clamp(
                H * (this._isTikTokPortrait ? 0.056 : 0.06),
                this._isTikTokPortrait ? 26 : 30,
                42
            )
        );
        label.lineHeight = label.fontSize + 6;
        label.isBold = true;
        label.color = GOLD;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(label, {
            outlineWidth: this._isTikTokPortrait ? 2 : 3,
            outlineColor: new Color(0, 0, 0, 200),
        });

        const divider = new Node('Divider');
        divider.layer = this._uiLayer;
        panel.addChild(divider);
        const dTf = divider.addComponent(UITransform);
        const dividerW = W - (this._isTikTokPortrait ? 48 : 60);
        dTf.setContentSize(dividerW, 2);
        divider.setPosition(0, H / 2 - (this._isTikTokPortrait ? 74 : 72), 0);
        const dg = divider.addComponent(Graphics);
        dg.fillColor = GOLD;
        dg.fillRect(-dividerW / 2, -1, dividerW, 2);
        dg.fill();
    }

    private _buildList(panel: Node): void {
        const W = this._panelW;
        const H = this._panelH;
        const listH = H - (this._isTikTokPortrait ? 188 : this._isCompact ? 162 : 150);
        const listW = W - (this._isTikTokPortrait ? 20 : 32);
        this._listWidth = listW;

        const scrollNode = new Node('Scroll');
        scrollNode.layer = this._uiLayer;
        panel.addChild(scrollNode);
        const scrollTf = scrollNode.addComponent(UITransform);
        scrollTf.setContentSize(listW, listH);
        scrollNode.setPosition(0, this._isTikTokPortrait ? -24 : -32, 0);

        const scroll = scrollNode.addComponent(ScrollView);
        scroll.vertical = true;
        scroll.horizontal = false;
        scroll.inertia = true;
        scroll.brake = 0.75;

        const content = new Node('Content');
        content.layer = this._uiLayer;
        scrollNode.addChild(content);
        const contentTf = content.addComponent(UITransform);
        contentTf.setContentSize(listW, 0);

        const layout = content.addComponent(Layout);
        layout.type = Layout.Type.VERTICAL;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.spacingY = this._isTikTokPortrait ? 6 : 4;
        layout.paddingTop = this._isTikTokPortrait ? 6 : 4;
        layout.paddingBottom = this._isTikTokPortrait ? 6 : 4;

        scroll.content = content;
        this._listContent = content;

        const statusNode = new Node('Status');
        statusNode.layer = this._uiLayer;
        panel.addChild(statusNode);
        const sTf = statusNode.addComponent(UITransform);
        sTf.setContentSize(listW, Math.round(listH * 0.7));
        statusNode.setPosition(0, this._isTikTokPortrait ? -14 : -8, 0);
        this._statusLabel = statusNode.addComponent(Label);
        this._statusLabel.fontSize = this._isTikTokPortrait ? 18 : 22;
        this._statusLabel.lineHeight = this._statusLabel.fontSize + 6;
        this._statusLabel.color = TEXT_DIM;
        this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._statusLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._statusLabel.enableWrapText = true;
        this._statusLabel.overflow = Label.Overflow.SHRINK;
    }

    private _buildRow(entry: LeaderboardEntry, idx: number): Node {
        const listW = this._listWidth > 0 ? this._listWidth : this._panelW - 32;
        const rowH = this._rowHeight;
        const hideScoreInTikTokPortrait = this._isTikTokPortrait;
        const row = new Node(`Row_${idx}`);
        row.layer = this._uiLayer;
        const rowTf = row.addComponent(UITransform);
        rowTf.setContentSize(listW, rowH);

        const bg = row.addComponent(Graphics);
        const rowColor = idx % 2 === 0 ? ROW_ODD : ROW_EVEN;
        this._drawRoundRect(bg, listW, rowH, this._isTikTokPortrait ? 8 : 6, rowColor);

        const innerPad = this._isTikTokPortrait ? 12 : 10;
        const colGap = this._isTikTokPortrait ? 6 : 8;
        const rankW = Math.round(UIResponsive.clamp(listW * 0.15, 44, 68));
        const scoreW = hideScoreInTikTokPortrait
            ? 0
            : Math.round(UIResponsive.clamp(listW * 0.22, 96, 146));
        const waveW = Math.round(
            UIResponsive.clamp(listW * (this._isTikTokPortrait ? 0.16 : 0.18), 56, 90)
        );
        const scoreSectionW = hideScoreInTikTokPortrait ? 0 : scoreW + colGap;
        const nameW = Math.max(
            80,
            listW - innerPad * 2 - rankW - waveW - scoreSectionW - colGap * 2
        );
        let cursor = -listW / 2 + innerPad;

        const rankColor =
            entry.rank === 1
                ? GOLD
                : entry.rank === 2
                  ? SILVER
                  : entry.rank === 3
                    ? BRONZE
                    : TEXT_DIM;

        const rankNode = this._makeLabel(
            `#${entry.rank}`,
            this._isTikTokPortrait ? 20 : 22,
            rankColor,
            true
        );
        rankNode.getComponent(UITransform)?.setContentSize(rankW, rowH);
        rankNode.setPosition(cursor + rankW * 0.5, 0, 0);
        row.addChild(rankNode);
        cursor += rankW + colGap;

        const usernameNode = this._makeLabel(
            this._formatUsername(entry.username),
            this._isTikTokPortrait ? 18 : 20,
            TEXT_WHITE,
            false,
            Label.HorizontalAlign.LEFT
        );
        usernameNode.getComponent(UITransform)?.setContentSize(nameW, rowH);
        usernameNode.setPosition(cursor + nameW * 0.5, 0, 0);
        row.addChild(usernameNode);
        cursor += nameW + colGap;

        const waveText = Localization.instance.t('ui.leaderboard.wave_short', {
            wave: String(entry.wave),
        });
        const waveNode = this._makeLabel(
            this._isTikTokPortrait ? `W${entry.wave}` : waveText,
            this._isTikTokPortrait ? 13 : 18,
            TEXT_DIM,
            false,
            Label.HorizontalAlign.CENTER
        );
        waveNode.getComponent(UITransform)?.setContentSize(waveW, rowH);
        waveNode.setPosition(cursor + waveW * 0.5, 0, 0);
        row.addChild(waveNode);
        cursor += waveW + (hideScoreInTikTokPortrait ? 0 : colGap);

        if (!hideScoreInTikTokPortrait) {
            const scoreStr = entry.score.toLocaleString();
            const scoreNode = this._makeLabel(
                scoreStr,
                22,
                GOLD,
                true,
                Label.HorizontalAlign.RIGHT
            );
            scoreNode.getComponent(UITransform)?.setContentSize(scoreW, rowH);
            scoreNode.setPosition(cursor + scoreW * 0.5, 0, 0);
            row.addChild(scoreNode);
        }

        return row;
    }

    private _formatUsername(rawName: string): string {
        const name = (rawName ?? '').trim() || 'Player';
        if (this._isTikTokPortrait) {
            const plain = name.startsWith('u/') ? name.slice(2) : name;
            if (plain.length <= 11) return plain;
            return `${plain.slice(0, 10)}…`;
        }
        if (!this._showRedditPrefix) return name;
        if (name.startsWith('u/')) return name;
        return `u/${name}`;
    }

    private _buildCloseButton(panel: Node): void {
        const btnNode = new Node('CloseBtn');
        btnNode.layer = this._uiLayer;
        panel.addChild(btnNode);
        const btnTf = btnNode.addComponent(UITransform);
        const btnW = this._isTikTokPortrait
            ? Math.round(UIResponsive.clamp(this._panelW * 0.62, 168, 240))
            : 180;
        const btnH = this._isTikTokPortrait ? 50 : 54;
        btnTf.setContentSize(btnW, btnH);
        btnNode.setPosition(0, -this._panelH / 2 + (this._isTikTokPortrait ? 50 : 36), 0);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        const bg = btnNode.addComponent(Graphics);
        this._drawRoundRect(bg, btnW, btnH, 10, GOLD);

        const lNode = new Node('L');
        lNode.layer = this._uiLayer;
        btnNode.addChild(lNode);
        lNode.addComponent(UITransform)?.setContentSize(btnW - 20, btnH - 6);
        const l = lNode.addComponent(Label);
        l.string = Localization.instance.t('ui.leaderboard.close');
        l.fontSize = this._isTikTokPortrait ? 22 : 26;
        l.lineHeight = l.fontSize + 6;
        l.isBold = true;
        l.color = new Color(18, 18, 36, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.SHRINK;

        btnNode.on(Button.EventType.CLICK, () => this._onClose?.(), this);
    }

    private _makeLabel(
        text: string,
        fontSize: number,
        color: Color,
        bold = false,
        align: Label.HorizontalAlign = Label.HorizontalAlign.CENTER
    ): Node {
        const n = new Node('Lbl');
        n.layer = this._uiLayer;
        n.addComponent(UITransform);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.lineHeight = fontSize + 4;
        lbl.isBold = bold;
        lbl.color = color;
        lbl.horizontalAlign = align;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.enableWrapText = false;
        lbl.overflow = Label.Overflow.SHRINK;
        return n;
    }

    private _drawRoundRect(g: Graphics, w: number, h: number, r: number, fillColor: Color): void {
        g.clear();
        g.fillColor = fillColor;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
    }
}
