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
} from 'cc';
import type { LeaderboardEntry } from '../../core/reddit/RedditBridge';
import { Localization } from '../../core/i18n/Localization';
import { applyGameLabelStyle } from '../hud/HUDCommon';

const PANEL_W = 520;
const PANEL_H = 600;
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

    constructor(parent: Node, onClose: () => void) {
        this._uiLayer = parent.layer ?? Layers.Enum.UI_2D;
        this._onClose = onClose;
        this._root = this._buildPanel(parent);
    }

    public get node(): Node {
        return this._root;
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
            const emptyLabel = this._makeLabel(
                Localization.instance.t('ui.leaderboard.empty'),
                24,
                TEXT_DIM
            );
            const emptyNode = new Node('Empty');
            emptyNode.layer = this._uiLayer;
            emptyNode.addComponent(UITransform)?.setContentSize(PANEL_W - 40, ROW_H);
            emptyNode.addChild(emptyLabel);
            this._listContent.addChild(emptyNode);
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
        panelTf.setContentSize(PANEL_W, PANEL_H);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignHorizontalCenter = panelWidget.isAlignVerticalCenter = true;
        panelWidget.horizontalCenter = panelWidget.verticalCenter = 0;
        panelWidget.updateAlignment();

        const panelBg = panel.addComponent(Graphics);
        this._drawRoundRect(panelBg, PANEL_W, PANEL_H, 18, BG_DARK);

        this._buildTitle(panel);
        this._buildList(panel);
        this._buildCloseButton(panel);

        return overlay;
    }

    private _buildTitle(panel: Node): void {
        const titleNode = new Node('Title');
        titleNode.layer = this._uiLayer;
        panel.addChild(titleNode);
        const titleTf = titleNode.addComponent(UITransform);
        titleTf.setContentSize(PANEL_W - 40, 60);
        titleNode.setPosition(0, PANEL_H / 2 - 40, 0);

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.leaderboard.title');
        label.fontSize = 36;
        label.isBold = true;
        label.color = GOLD;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        applyGameLabelStyle(label, { outlineWidth: 3, outlineColor: new Color(0, 0, 0, 200) });

        const divider = new Node('Divider');
        divider.layer = this._uiLayer;
        panel.addChild(divider);
        const dTf = divider.addComponent(UITransform);
        dTf.setContentSize(PANEL_W - 60, 2);
        divider.setPosition(0, PANEL_H / 2 - 72, 0);
        const dg = divider.addComponent(Graphics);
        dg.fillColor = GOLD;
        dg.fillRect(-(PANEL_W - 60) / 2, -1, PANEL_W - 60, 2);
        dg.fill();
    }

    private _buildList(panel: Node): void {
        const listH = PANEL_H - 150;
        const listW = PANEL_W - 32;

        const scrollNode = new Node('Scroll');
        scrollNode.layer = this._uiLayer;
        panel.addChild(scrollNode);
        const scrollTf = scrollNode.addComponent(UITransform);
        scrollTf.setContentSize(listW, listH);
        scrollNode.setPosition(0, -32, 0);

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
        layout.spacingY = 4;
        layout.paddingTop = 4;
        layout.paddingBottom = 4;

        scroll.content = content;
        this._listContent = content;

        const statusNode = new Node('Status');
        statusNode.layer = this._uiLayer;
        panel.addChild(statusNode);
        const sTf = statusNode.addComponent(UITransform);
        sTf.setContentSize(listW, 48);
        statusNode.setPosition(0, -32, 0);
        this._statusLabel = statusNode.addComponent(Label);
        this._statusLabel.fontSize = 22;
        this._statusLabel.color = TEXT_DIM;
        this._statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._statusLabel.verticalAlign = Label.VerticalAlign.CENTER;
    }

    private _buildRow(entry: LeaderboardEntry, idx: number): Node {
        const listW = PANEL_W - 32;
        const row = new Node(`Row_${idx}`);
        row.layer = this._uiLayer;
        const rowTf = row.addComponent(UITransform);
        rowTf.setContentSize(listW, ROW_H);

        const bg = row.addComponent(Graphics);
        const rowColor = idx % 2 === 0 ? ROW_ODD : ROW_EVEN;
        this._drawRoundRect(bg, listW, ROW_H, 6, rowColor);

        const rankColor =
            entry.rank === 1
                ? GOLD
                : entry.rank === 2
                  ? SILVER
                  : entry.rank === 3
                    ? BRONZE
                    : TEXT_DIM;

        const rankNode = this._makeLabel(`#${entry.rank}`, 22, rankColor, true);
        rankNode.getComponent(UITransform)?.setContentSize(60, ROW_H);
        rankNode.setPosition(-listW / 2 + 36, 0, 0);
        row.addChild(rankNode);

        const usernameNode = this._makeLabel(`u/${entry.username}`, 20, TEXT_WHITE);
        usernameNode.getComponent(UITransform)?.setContentSize(200, ROW_H);
        usernameNode.setPosition(-listW / 2 + 150, 0, 0);
        row.addChild(usernameNode);

        const waveText = Localization.instance.t('ui.leaderboard.wave_short', {
            wave: String(entry.wave),
        });
        const waveNode = this._makeLabel(waveText, 18, TEXT_DIM);
        waveNode.getComponent(UITransform)?.setContentSize(100, ROW_H);
        waveNode.setPosition(listW / 2 - 160, 0, 0);
        row.addChild(waveNode);

        const scoreStr = entry.score.toLocaleString();
        const scoreNode = this._makeLabel(scoreStr, 22, GOLD, true);
        scoreNode.getComponent(UITransform)?.setContentSize(110, ROW_H);
        scoreNode.setPosition(listW / 2 - 60, 0, 0);
        row.addChild(scoreNode);

        return row;
    }

    private _buildCloseButton(panel: Node): void {
        const btnNode = new Node('CloseBtn');
        btnNode.layer = this._uiLayer;
        panel.addChild(btnNode);
        const btnTf = btnNode.addComponent(UITransform);
        btnTf.setContentSize(180, 54);
        btnNode.setPosition(0, -PANEL_H / 2 + 36, 0);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        const bg = btnNode.addComponent(Graphics);
        this._drawRoundRect(bg, 180, 54, 10, GOLD);

        const lNode = new Node('L');
        lNode.layer = this._uiLayer;
        btnNode.addChild(lNode);
        lNode.addComponent(UITransform)?.setContentSize(160, 48);
        const l = lNode.addComponent(Label);
        l.string = Localization.instance.t('ui.leaderboard.close');
        l.fontSize = 26;
        l.isBold = true;
        l.color = new Color(18, 18, 36, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;

        btnNode.on(Button.EventType.CLICK, () => this._onClose?.(), this);
    }

    private _makeLabel(text: string, fontSize: number, color: Color, bold = false): Node {
        const n = new Node('Lbl');
        n.layer = this._uiLayer;
        n.addComponent(UITransform);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.isBold = bold;
        lbl.color = color;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
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
