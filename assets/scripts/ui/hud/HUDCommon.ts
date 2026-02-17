import { Color, Label, LabelOutline, LabelShadow, Node } from 'cc';

export const HUD_UI_LAYER = 33554432;

export type GameLabelStyleOptions = {
    outlineColor?: Color;
    outlineWidth?: number;
    shadowColor?: Color;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    shadowBlur?: number;
};

export function applyGameLabelStyle(label: Label, options?: GameLabelStyleOptions): void {
    const outline = label.node.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline);
    outline.color = options?.outlineColor ?? new Color(10, 16, 28, 255);
    outline.width = options?.outlineWidth ?? 3;

    const shadow = label.node.getComponent(LabelShadow) ?? label.node.addComponent(LabelShadow);
    shadow.color = options?.shadowColor ?? new Color(0, 0, 0, 180);
    shadow.offset.set(options?.shadowOffsetX ?? 2, options?.shadowOffsetY ?? -2);
    shadow.blur = options?.shadowBlur ?? 2;
}

export function applyLayerRecursive(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) {
        applyLayerRecursive(child, layer);
    }
}
