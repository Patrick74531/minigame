import { Color, Graphics, Label, LabelOutline, Node, RenderRoot2D, UITransform } from 'cc';
import { BuildingText } from './BuildingText';
import { BuildingPadIconFactory, type BuildingPadIconKind } from './BuildingPadIconFactory';

export type BuildingPadVisualRefs = {
    label: Label;
    costLabelNode: Node;
    coinIconNode: Node;
    functionIconNode: Node | null;
};

type BuildingPadDisplayState = {
    label: Label | null;
    costLabelNode: Node | null;
    coinIconNode: Node | null;
    functionIconNode: Node | null;
    requiredCoins: number;
    collectedCoins: number;
    progress: number;
};

export class BuildingPadVisuals {
    public static createVisuals(
        hostNode: Node,
        buildingTypeId: string,
        requiredCoins: number
    ): BuildingPadVisualRefs {
        const visualRoot = new Node('VisualRoot');
        hostNode.addChild(visualRoot);
        visualRoot.setPosition(0, 0.05, 0);

        const flatRoot = new Node('FlatRoot');
        visualRoot.addChild(flatRoot);
        flatRoot.setRotationFromEuler(-90, 0, 0);
        flatRoot.addComponent(RenderRoot2D);
        flatRoot.setScale(0.009, 0.009, 0.009);

        const ctx = flatRoot.addComponent(Graphics);
        ctx.lineWidth = 4;
        ctx.strokeColor = Color.WHITE;
        ctx.lineJoin = Graphics.LineJoin.ROUND;
        ctx.lineCap = Graphics.LineCap.ROUND;

        const w = 196;
        const h = 196;
        this.drawDashedRectSimple(ctx, -w / 2, -h / 2, w, h, 14, 9);

        const contentNode = new Node('Content');
        flatRoot.addChild(contentNode);
        contentNode.setPosition(0, -6, 0);

        const iconKind = this.resolveIconKind(buildingTypeId);
        const hasFunctionIcon = iconKind !== null;
        const costRowY = hasFunctionIcon ? -16 : 0;

        const labelNode = new Node('CostLabel');
        contentNode.addChild(labelNode);
        labelNode.setPosition(-18, costRowY, 0);

        const uiTransform = labelNode.addComponent(UITransform);
        uiTransform.setContentSize(128, 64);

        const label = labelNode.addComponent(Label);
        label.string = `${requiredCoins}`;
        label.fontSize = 50;
        label.lineHeight = 54;
        label.color = new Color(255, 235, 160, 255);
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.RIGHT;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = labelNode.addComponent(LabelOutline);
        outline.color = Color.BLACK;
        outline.width = 4;

        const coinNode = new Node('CoinInline');
        contentNode.addChild(coinNode);
        coinNode.setPosition(48, costRowY, 0);

        coinNode.addComponent(UITransform).setContentSize(40, 40);
        const coinG = coinNode.addComponent(Graphics);
        coinG.fillColor = new Color(240, 190, 60, 255);
        coinG.circle(0, 0, 16);
        coinG.fill();
        coinG.strokeColor = new Color(120, 80, 20, 255);
        coinG.lineWidth = 2.5;
        coinG.circle(0, 0, 16);
        coinG.stroke();
        coinG.fillColor = new Color(255, 225, 120, 255);
        coinG.circle(-3, 3, 5);
        coinG.fill();

        const functionIconNode = this.createFunctionIcon(contentNode, iconKind);

        return {
            label,
            costLabelNode: labelNode,
            coinIconNode: coinNode,
            functionIconNode,
        };
    }

    public static updateDisplay(state: BuildingPadDisplayState): void {
        const {
            label,
            costLabelNode,
            coinIconNode,
            functionIconNode,
            requiredCoins,
            collectedCoins,
            progress,
        } = state;

        if (!label) return;

        const remaining = requiredCoins - collectedCoins;
        const hasFunctionIcon = !!functionIconNode;
        const activeCostY = hasFunctionIcon ? -16 : 0;
        const completeCostY = hasFunctionIcon ? -8 : 0;

        if (remaining <= 0) {
            label.string = BuildingText.constructingLabel();
            label.fontSize = 24;
            label.lineHeight = 30;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            if (costLabelNode) costLabelNode.setPosition(0, completeCostY, 0);
            if (coinIconNode) coinIconNode.active = false;
            if (functionIconNode) functionIconNode.active = false;
        } else {
            label.string = `${remaining}`;
            label.fontSize = 50;
            label.lineHeight = 54;
            label.horizontalAlign = Label.HorizontalAlign.RIGHT;
            if (costLabelNode) costLabelNode.setPosition(-18, activeCostY, 0);
            if (coinIconNode) coinIconNode.active = true;
            if (functionIconNode) functionIconNode.active = true;
        }

        if (progress >= 1) {
            label.color = new Color(0, 255, 0, 255);
        } else if (progress >= 0.5) {
            label.color = new Color(255, 255, 0, 255);
        } else {
            label.color = new Color(255, 215, 0, 255);
        }
    }

    private static createFunctionIcon(
        contentNode: Node,
        kind: BuildingPadIconKind | null
    ): Node | null {
        if (!kind) return null;
        const iconNode = new Node('FunctionIcon');
        contentNode.addChild(iconNode);
        iconNode.setPosition(0, 50, 0);
        BuildingPadIconFactory.createFunctionIcon(iconNode, kind);
        return iconNode;
    }

    private static resolveIconKind(buildingTypeId: string): BuildingPadIconKind | null {
        if (buildingTypeId === 'tower') return 'tower';
        if (buildingTypeId === 'farm') return 'farm';
        if (buildingTypeId === 'barracks') return 'barracks';
        if (buildingTypeId === 'wall') return 'wall';
        return null;
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
