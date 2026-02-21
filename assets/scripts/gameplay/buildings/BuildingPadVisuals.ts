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
    tempLabelNode?: Node;
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
        requiredCoins: number,
        padIndex?: number
    ): BuildingPadVisualRefs {
        const visualRoot = new Node('VisualRoot');
        hostNode.addChild(visualRoot);
        visualRoot.setPosition(0, 0.05, 0);

        const flatRoot = new Node('FlatRoot');
        visualRoot.addChild(flatRoot);
        flatRoot.setRotationFromEuler(-90, 0, 0);
        flatRoot.addComponent(RenderRoot2D);
        flatRoot.setScale(0.009, 0.009, 0.009);

        let tempLabelNode: Node | undefined;
        if (padIndex !== undefined && padIndex >= 0) {
            tempLabelNode = new Node('TempLabelRoot');
            hostNode.addChild(tempLabelNode);
            tempLabelNode.setPosition(0, 2.5, 0);

            tempLabelNode.addComponent(RenderRoot2D);
            const billboard = tempLabelNode.addComponent('cc.Billboard') as any;
            if (!billboard) {
                // simple fallback if Billboard not imported
                const bb = tempLabelNode.addComponent('cc.Billboard');
            }
            tempLabelNode.setScale(0.015, 0.015, 0.015);

            const tNode = new Node('Text');
            tempLabelNode.addChild(tNode);
            const uiTransform = tNode.addComponent(UITransform);
            uiTransform.setContentSize(400, 100);

            const tempLabel = tNode.addComponent(Label);
            tempLabel.string = `${padIndex}`; // Use simple number or #number
            tempLabel.fontSize = 80;
            tempLabel.lineHeight = 84;
            tempLabel.color = new Color(255, 50, 50, 255);
            tempLabel.isBold = true;
            tempLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            tempLabel.verticalAlign = Label.VerticalAlign.CENTER;

            const tOutline = tNode.addComponent(LabelOutline);
            tOutline.color = new Color(0, 0, 0, 255);
            tOutline.width = 4;
            
            const tShadow = tNode.addComponent(LabelShadow);
            tShadow.color = new Color(0, 0, 0, 180);
            tShadow.offset.set(4, -4);
            tShadow.blur = 3;
        }

        const ctx = flatRoot.addComponent(Graphics);
        ctx.lineWidth = 5;
        ctx.strokeColor = new Color(220, 242, 255, 255);
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
        label.fontSize = 56;
        label.lineHeight = 60;
        label.color = new Color(255, 236, 154, 255);
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.RIGHT;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(18, 12, 6, 255);
        outline.width = 5;

        const shadow = labelNode.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 210);
        shadow.offset.set(3, -2);
        shadow.blur = 2;

        const coinNode = new Node('CoinInline');
        contentNode.addChild(coinNode);
        coinNode.setPosition(48, costRowY, 0);

        coinNode.addComponent(UITransform).setContentSize(40, 40);
        const coinG = coinNode.addComponent(Graphics);
        coinG.fillColor = new Color(246, 198, 72, 255);
        coinG.circle(0, 0, 17);
        coinG.fill();
        coinG.strokeColor = new Color(124, 70, 18, 255);
        coinG.lineWidth = 3;
        coinG.circle(0, 0, 17);
        coinG.stroke();
        coinG.fillColor = new Color(255, 240, 156, 255);
        coinG.circle(-3, 4, 5.4);
        coinG.fill();

        const functionIconNode = this.createFunctionIcon(contentNode, iconKind);

        return {
            label,
            costLabelNode: labelNode,
            coinIconNode: coinNode,
            functionIconNode,
            tempLabelNode,
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
            label.fontSize = 30;
            label.lineHeight = 36;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            if (costLabelNode) costLabelNode.setPosition(0, completeCostY, 0);
            if (coinIconNode) coinIconNode.active = false;
            if (functionIconNode) functionIconNode.active = false;
        } else {
            label.string = `${remaining}`;
            label.fontSize = 56;
            label.lineHeight = 60;
            label.horizontalAlign = Label.HorizontalAlign.RIGHT;
            if (costLabelNode) costLabelNode.setPosition(-18, activeCostY, 0);
            if (coinIconNode) coinIconNode.active = true;
            if (functionIconNode) functionIconNode.active = true;
        }

        if (progress >= 1) {
            label.color = new Color(118, 255, 136, 255);
        } else if (progress >= 0.5) {
            label.color = new Color(255, 236, 120, 255);
        } else {
            label.color = new Color(255, 216, 82, 255);
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
