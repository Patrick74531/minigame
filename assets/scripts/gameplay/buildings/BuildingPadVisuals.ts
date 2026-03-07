import {
    Color,
    Graphics,
    Label,
    LabelOutline,
    LabelShadow,
    Node,
    RenderRoot2D,
    UITransform,
} from 'cc';
import { BuildingText } from './BuildingText';
import { BuildingPadIconFactory, type BuildingPadIconKind } from './BuildingPadIconFactory';

export type BuildingPadVisualRefs = {
    label: Label;
    costLabelNode: Node;
    coinIconNode: Node;
    functionIconNode: Node | null;
    levelBadgeNode: Node | null;
    levelBadgeLabel: Label | null;
};

type BuildingPadDisplayState = {
    label: Label | null;
    costLabelNode: Node | null;
    coinIconNode: Node | null;
    functionIconNode: Node | null;
    levelBadgeNode: Node | null;
    levelBadgeLabel: Label | null;
    requiredCoins: number;
    collectedCoins: number;
    progress: number;
    currentLevel: number;
    showLevelBadge: boolean;
};

type FunctionRowRefs = {
    rowNode: Node;
    levelBadgeNode: Node;
    levelBadgeLabel: Label;
};

export class BuildingPadVisuals {
    public static createVisuals(
        hostNode: Node,
        buildingTypeId: string,
        requiredCoins: number
    ): BuildingPadVisualRefs {
        const visualRoot = new Node('VisualRoot');
        hostNode.addChild(visualRoot);
        visualRoot.setPosition(0, 0.045, 0);

        const flatRoot = new Node('FlatRoot');
        visualRoot.addChild(flatRoot);
        flatRoot.setRotationFromEuler(-90, 0, 0);
        flatRoot.addComponent(RenderRoot2D);
        flatRoot.setScale(0.008, 0.008, 0.008);

        const ctx = flatRoot.addComponent(Graphics);
        ctx.lineJoin = Graphics.LineJoin.ROUND;
        ctx.lineCap = Graphics.LineCap.ROUND;

        const w = 172;
        const h = 172;
        this.drawPadOutline(ctx, -w / 2, -h / 2, w, h);

        const contentNode = new Node('Content');
        flatRoot.addChild(contentNode);
        contentNode.setPosition(0, -8, 0);

        const iconKind = this.resolveIconKind(buildingTypeId);
        const hasFunctionIcon = iconKind !== null;
        const costRowY = hasFunctionIcon ? -18 : -2;

        const labelNode = new Node('CostLabel');
        contentNode.addChild(labelNode);
        labelNode.setPosition(-14, costRowY, 0);

        const uiTransform = labelNode.addComponent(UITransform);
        uiTransform.setContentSize(108, 54);

        const label = labelNode.addComponent(Label);
        label.string = `${requiredCoins}`;
        label.fontSize = 44;
        label.lineHeight = 48;
        label.color = new Color(248, 224, 132, 240);
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.RIGHT;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(18, 12, 6, 220);
        outline.width = 3;

        const shadow = labelNode.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 140);
        shadow.offset.set(2, -1);
        shadow.blur = 1;

        const coinNode = new Node('CoinInline');
        contentNode.addChild(coinNode);
        coinNode.setPosition(38, costRowY, 0);

        coinNode.addComponent(UITransform).setContentSize(34, 34);
        const coinG = coinNode.addComponent(Graphics);
        coinG.fillColor = new Color(236, 188, 72, 230);
        coinG.circle(0, 0, 14);
        coinG.fill();
        coinG.strokeColor = new Color(116, 68, 18, 220);
        coinG.lineWidth = 2;
        coinG.circle(0, 0, 14);
        coinG.stroke();
        coinG.fillColor = new Color(255, 236, 156, 220);
        coinG.circle(-2.5, 3.5, 4.3);
        coinG.fill();

        const functionRow = this.createFunctionIcon(contentNode, iconKind);

        return {
            label,
            costLabelNode: labelNode,
            coinIconNode: coinNode,
            functionIconNode: functionRow?.rowNode ?? null,
            levelBadgeNode: functionRow?.levelBadgeNode ?? null,
            levelBadgeLabel: functionRow?.levelBadgeLabel ?? null,
        };
    }

    public static updateDisplay(state: BuildingPadDisplayState): void {
        const {
            label,
            costLabelNode,
            coinIconNode,
            functionIconNode,
            levelBadgeNode,
            levelBadgeLabel,
            requiredCoins,
            collectedCoins,
            progress,
            currentLevel,
            showLevelBadge,
        } = state;

        if (!label) return;

        const remaining = requiredCoins - collectedCoins;
        const hasFunctionIcon = !!functionIconNode;
        const activeCostY = hasFunctionIcon ? -18 : -2;
        const completeCostY = hasFunctionIcon ? -8 : -2;
        const iconNode = functionIconNode?.getChildByName('FunctionIcon') ?? null;
        const shouldShowLevelBadge =
            !!functionIconNode &&
            !!levelBadgeNode &&
            showLevelBadge &&
            currentLevel > 0 &&
            remaining > 0;

        if (remaining <= 0) {
            label.string = BuildingText.constructingLabel();
            label.fontSize = 24;
            label.lineHeight = 28;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            if (costLabelNode) costLabelNode.setPosition(0, completeCostY, 0);
            if (coinIconNode) coinIconNode.active = false;
            if (functionIconNode) functionIconNode.active = false;
        } else {
            label.string = `${remaining}`;
            label.fontSize = 44;
            label.lineHeight = 48;
            label.horizontalAlign = Label.HorizontalAlign.RIGHT;
            if (costLabelNode) costLabelNode.setPosition(-14, activeCostY, 0);
            if (coinIconNode) coinIconNode.active = true;
            if (functionIconNode) functionIconNode.active = true;
        }

        if (progress >= 1) {
            label.color = new Color(110, 240, 126, 240);
        } else if (progress >= 0.5) {
            label.color = new Color(245, 228, 116, 238);
        } else {
            label.color = new Color(244, 208, 88, 232);
        }

        if (iconNode?.isValid) {
            iconNode.setPosition(shouldShowLevelBadge ? -22 : 0, 0, 0);
            iconNode.setScale(
                shouldShowLevelBadge ? 0.78 : 0.88,
                shouldShowLevelBadge ? 0.78 : 0.88,
                1
            );
        }
        if (levelBadgeNode?.isValid) {
            levelBadgeNode.active = shouldShowLevelBadge;
            if (shouldShowLevelBadge) {
                levelBadgeNode.setPosition(24, 0, 0);
                const levelText = `${Math.max(1, Math.floor(currentLevel))}`;
                if (levelBadgeLabel) {
                    levelBadgeLabel.string = levelText;
                    levelBadgeLabel.fontSize = levelText.length >= 2 ? 16 : 18;
                    levelBadgeLabel.lineHeight = levelBadgeLabel.fontSize + 2;
                }
                this.drawLevelBadge(levelBadgeNode.getComponent(Graphics));
            }
        }
    }

    private static createFunctionIcon(
        contentNode: Node,
        kind: BuildingPadIconKind | null
    ): FunctionRowRefs | null {
        if (!kind) return null;
        const rowNode = new Node('FunctionRow');
        contentNode.addChild(rowNode);
        rowNode.setPosition(0, 42, 0);
        rowNode.addComponent(UITransform).setContentSize(72, 30);

        const iconNode = new Node('FunctionIcon');
        rowNode.addChild(iconNode);
        iconNode.setScale(0.88, 0.88, 1);
        BuildingPadIconFactory.createFunctionIcon(iconNode, kind);

        const levelBadgeNode = new Node('LevelBadge');
        rowNode.addChild(levelBadgeNode);
        levelBadgeNode.addComponent(UITransform).setContentSize(46, 26);
        const levelBadgeBg = levelBadgeNode.addComponent(Graphics);
        this.drawLevelBadge(levelBadgeBg);

        const levelLabelNode = new Node('LevelLabel');
        levelBadgeNode.addChild(levelLabelNode);
        levelLabelNode.addComponent(UITransform).setContentSize(46, 26);
        const levelBadgeLabel = levelLabelNode.addComponent(Label);
        levelBadgeLabel.string = '1';
        levelBadgeLabel.fontSize = 18;
        levelBadgeLabel.lineHeight = 20;
        levelBadgeLabel.isBold = true;
        levelBadgeLabel.color = new Color(255, 244, 204, 255);
        levelBadgeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        levelBadgeLabel.verticalAlign = Label.VerticalAlign.CENTER;

        const levelOutline = levelLabelNode.addComponent(LabelOutline);
        levelOutline.color = new Color(26, 14, 6, 230);
        levelOutline.width = 2;

        const levelShadow = levelLabelNode.addComponent(LabelShadow);
        levelShadow.color = new Color(0, 0, 0, 120);
        levelShadow.offset.set(1, -1);
        levelShadow.blur = 1;

        levelBadgeNode.active = false;

        return {
            rowNode,
            levelBadgeNode,
            levelBadgeLabel,
        };
    }

    private static resolveIconKind(buildingTypeId: string): BuildingPadIconKind | null {
        if (
            buildingTypeId === 'tower' ||
            buildingTypeId === 'frost_tower' ||
            buildingTypeId === 'lightning_tower'
        ) {
            return 'tower';
        }
        if (buildingTypeId === 'farm') return 'farm';
        if (buildingTypeId === 'barracks') return 'barracks';
        if (buildingTypeId === 'wall') return 'wall';
        return null;
    }

    private static drawLevelBadge(graphics: Graphics | null): void {
        if (!graphics) return;
        graphics.clear();
        graphics.fillColor = new Color(255, 255, 255, 244);
        graphics.circle(0, 0, 13);
        graphics.fill();
        graphics.strokeColor = new Color(220, 184, 92, 236);
        graphics.lineWidth = 2;
        graphics.circle(0, 0, 12);
        graphics.stroke();
        graphics.fillColor = new Color(255, 218, 120, 40);
        graphics.circle(-3.5, 4, 4);
        graphics.fill();
    }

    private static drawPadOutline(
        ctx: Graphics,
        x: number,
        y: number,
        w: number,
        h: number
    ): void {
        ctx.lineWidth = 12;
        ctx.strokeColor = new Color(12, 18, 12, 164);
        this.drawDashedRectSimple(ctx, x, y, w, h, 24, 4);

        ctx.lineWidth = 7;
        ctx.strokeColor = new Color(255, 255, 255, 252);
        this.drawDashedRectSimple(ctx, x, y, w, h, 24, 4);

        ctx.lineWidth = 3.5;
        ctx.strokeColor = new Color(255, 246, 214, 255);
        this.drawDashedRectSimple(ctx, x, y, w, h, 16, 8);

        this.drawPadCornerAccent(ctx, x, y, w, h);
    }

    private static drawPadCornerAccent(
        ctx: Graphics,
        x: number,
        y: number,
        w: number,
        h: number
    ): void {
        const accentLen = Math.min(26, Math.min(w, h) * 0.18);
        const inset = 7;

        ctx.lineWidth = 9;
        ctx.strokeColor = new Color(30, 22, 8, 132);
        this.strokeCornerBracket(ctx, x + inset, y + inset, accentLen, false, false);
        this.strokeCornerBracket(ctx, x + w - inset, y + inset, accentLen, true, false);
        this.strokeCornerBracket(ctx, x + inset, y + h - inset, accentLen, false, true);
        this.strokeCornerBracket(ctx, x + w - inset, y + h - inset, accentLen, true, true);

        ctx.lineWidth = 5;
        ctx.strokeColor = new Color(255, 248, 226, 255);
        this.strokeCornerBracket(ctx, x + inset, y + inset, accentLen, false, false);
        this.strokeCornerBracket(ctx, x + w - inset, y + inset, accentLen, true, false);
        this.strokeCornerBracket(ctx, x + inset, y + h - inset, accentLen, false, true);
        this.strokeCornerBracket(ctx, x + w - inset, y + h - inset, accentLen, true, true);
    }

    private static strokeCornerBracket(
        ctx: Graphics,
        cornerX: number,
        cornerY: number,
        len: number,
        flipX: boolean,
        flipY: boolean
    ): void {
        const dirX = flipX ? -1 : 1;
        const dirY = flipY ? -1 : 1;
        ctx.moveTo(cornerX, cornerY);
        ctx.lineTo(cornerX + dirX * len, cornerY);
        ctx.stroke();
        ctx.moveTo(cornerX, cornerY);
        ctx.lineTo(cornerX, cornerY + dirY * len);
        ctx.stroke();
    }

    private static drawDashedRectSimple(
        ctx: Graphics,
        x: number,
        y: number,
        w: number,
        h: number,
        dash: number,
        gap: number
    ): void {
        const cornerGap = Math.min(20, Math.min(w, h) * 0.16);
        this.drawDashedLine(ctx, x + cornerGap, y + h, x + w - cornerGap, y + h, dash, gap);
        this.drawDashedLine(ctx, x + w, y + h - cornerGap, x + w, y + cornerGap, dash, gap);
        this.drawDashedLine(ctx, x + w - cornerGap, y, x + cornerGap, y, dash, gap);
        this.drawDashedLine(ctx, x, y + cornerGap, x, y + h - cornerGap, dash, gap);
    }

    private static drawDashedLine(
        ctx: Graphics,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        dashLen: number,
        gapLen: number
    ): void {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / len;
        const dirY = dy / len;

        let current = 0;
        let drawing = true;

        while (current < len) {
            const segLen = Math.min(drawing ? dashLen : gapLen, len - current);
            if (drawing) {
                ctx.moveTo(x1 + dirX * current, y1 + dirY * current);
                ctx.lineTo(x1 + dirX * (current + segLen), y1 + dirY * (current + segLen));
                ctx.stroke();
            }

            current += segLen;
            drawing = !drawing;
        }
    }
}
