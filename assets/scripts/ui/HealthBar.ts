import { _decorator, Component, Node, UITransform, Color, Billboard, RenderRoot2D, Graphics } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Health Bar Component
 * Displays a billboarded health bar above the entity using simple Graphics
 */
@ccclass('HealthBar')
export class HealthBar extends Component {

    @property
    public width: number = 100;

    @property
    public height: number = 10;

    @property
    public yOffset: number = 2.5;

    private _fgGraphics: Graphics | null = null;
    private _bgGraphics: Graphics | null = null;

    protected start(): void {
        this.createVisuals();
    }

    private createVisuals(): void {
        // Container
        const root = new Node('HealthBarRoot');
        this.node.addChild(root);
        root.setPosition(0, this.yOffset, 0);
        
        // Billboard
        root.addComponent(RenderRoot2D);
        root.addComponent(Billboard);
        root.setScale(0.02, 0.02, 0.02); // Adjust scale for world space

        // Background (Red/Black)
        const bgNode = new Node('Background');
        root.addChild(bgNode);
        this._bgGraphics = bgNode.addComponent(Graphics);
        this._bgGraphics.fillColor = new Color(50, 0, 0, 255);
        this._bgGraphics.rect(-this.width/2, -this.height/2, this.width, this.height);
        this._bgGraphics.fill();

        // Foreground (Green)
        const fgNode = new Node('Foreground');
        root.addChild(fgNode);
        this._fgGraphics = fgNode.addComponent(Graphics);
        this._fgGraphics.fillColor = new Color(0, 255, 0, 255);
        this._fgGraphics.rect(0, 0, this.width, this.height); // Draw 0 to width, handle offset in node
        this._fgGraphics.fill();
        
        // Offset FG node to start at left edge
        fgNode.setPosition(-this.width/2, -this.height/2, 0);
    }

    public updateHealth(current: number, max: number): void {
        if (!this._fgGraphics) return;

        const ratio = Math.max(0, Math.min(1, current / max));
        this._fgGraphics.node.setScale(ratio, 1, 1);
        
        // Color change? Green -> Yellow -> Red
        if (ratio > 0.5) {
             this._fgGraphics.fillColor = new Color(0, 255, 0, 255);
        } else if (ratio > 0.2) {
             this._fgGraphics.fillColor = new Color(255, 255, 0, 255);
        } else {
             this._fgGraphics.fillColor = new Color(255, 0, 0, 255);
        }
        
        // Re-fill to apply color change
        this._fgGraphics.clear();
        this._fgGraphics.rect(0, 0, this.width, this.height);
        this._fgGraphics.fill();
    }
}
