import { Color, Graphics, Label, Node, UIOpacity, UITransform } from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { Enemy } from '../../gameplay/units/Enemy';
import { UIResponsive } from '../UIResponsive';
import { applyGameLabelStyle, applyLayerRecursive, HUD_UI_LAYER } from './HUDCommon';
import type { HUDModule } from './HUDModule';

// ─── Configurable constants ───
const MINIMAP_UPDATE_INTERVAL_S = 0.08; // ~12 Hz
const MINIMAP_MIN_SIZE = 108;
const MINIMAP_MAX_SIZE = 216;
const MINIMAP_BG_COLOR = new Color(10, 14, 22, 170);
const MINIMAP_BORDER_COLOR = new Color(180, 190, 210, 200);
const MINIMAP_BORDER_WIDTH = 1.5;
const TERRAIN_FILL_COLOR = new Color(52, 82, 57, 168);
const TERRAIN_OUTLINE_COLOR = new Color(118, 168, 122, 150);
const TERRAIN_RIDGE_COLOR = new Color(132, 168, 122, 90);
const ROAD_BODY_COLOR = new Color(74, 80, 86, 214);
const ROAD_EDGE_COLOR = new Color(102, 109, 116, 144);
const ROAD_CENTER_COLOR = new Color(130, 136, 142, 98);
const ROAD_WIDTH_RATIO = 0.088;
const ROAD_EDGE_WIDTH_RATIO = 0.05;
const ROAD_CENTER_WIDTH_RATIO = 0.028;
const ROAD_CURVE_SUBDIVISIONS = 10;
const ROAD_JITTER_WORLD = 0.42;
const HERO_DOT_COLOR = new Color(60, 140, 255, 255);
const HERO_DOT_RADIUS = 3.5;
const ENEMY_DOT_COLOR = new Color(230, 50, 50, 255);
const ENEMY_DOT_RADIUS = 2.1;
const ENEMY_ELITE_DOT_RADIUS = 3.1;
const BOSS_ICON_SIZE = 4.8;
const BOSS_ICON_FILL = new Color(255, 76, 76, 255);
const BOSS_ICON_STROKE = new Color(255, 240, 170, 255);
const ALERT_TRIANGLE_FILL = new Color(255, 56, 56, 238);
const ALERT_TRIANGLE_STROKE = new Color(255, 228, 172, 255);
const ALERT_TRIANGLE_INNER = new Color(120, 10, 10, 120);
const ALERT_ICON_MIN_SIZE = 18;
const ALERT_ICON_MAX_SIZE = 30;
const ALERT_BLINK_SWITCHES = 6;
const ALERT_BLINK_INTERVAL_S = 0.12;
const GAP_BELOW_SETTINGS = 8;

type EnemyProvider = { getEnemies(): Node[] };
type RouteLane = 'top' | 'mid' | 'bottom';
type ForecastLane = 'left' | 'center' | 'right';

type SpawnWarning = {
    node: Node;
    worldX: number;
    worldZ: number;
    blinkTimer: number;
    remainingSwitches: number;
    visible: boolean;
};

export class HUDMinimapModule implements HUDModule {
    private _uiCanvas: Node | null = null;
    private _rootNode: Node | null = null;
    private _bgGraphics: Graphics | null = null;
    private _terrainGraphics: Graphics | null = null;
    private _roadGraphics: Graphics | null = null;
    private _unitGraphics: Graphics | null = null;
    private _warnings: SpawnWarning[] = [];
    private _warningContainer: Node | null = null;

    private _mapSize = 140;
    private _halfWorld = { x: 25, z: 25 };

    private _intervalId: ReturnType<typeof setInterval> | null = null;
    private _settingsButtonNode: Node | null = null;

    // ─── lifecycle ───

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this._halfWorld = {
            x: Math.max(1, GameConfig.MAP.LIMITS.x),
            z: Math.max(1, GameConfig.MAP.LIMITS.z),
        };

        this.createNodes(uiCanvas);
        this.updateLayout();
        this.drawBasemap();

        this.eventManager.on(GameEvents.WAVE_FORECAST, this.onWaveForecast, this);
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.UNIT_SPAWNED, this.onUnitSpawned, this);

        this._intervalId = setInterval(() => {
            this.refreshUnits();
            this.tickWarnings(MINIMAP_UPDATE_INTERVAL_S);
        }, MINIMAP_UPDATE_INTERVAL_S * 1000);
    }

    public cleanup(): void {
        if (this._intervalId !== null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this.eventManager.offAllByTarget(this);
        this.clearWarnings();
        if (this._rootNode && this._rootNode.isValid) {
            this._rootNode.destroy();
        }
        this._rootNode = null;
        this._bgGraphics = null;
        this._terrainGraphics = null;
        this._roadGraphics = null;
        this._unitGraphics = null;
        this._warningContainer = null;
        this._uiCanvas = null;
        this._settingsButtonNode = null;
    }

    public onCanvasResize(): void {
        this.updateLayout();
        this.drawBasemap();
        this.repositionWarnings();
    }

    /** Provide a reference to the settings button so minimap can position below it */
    public setSettingsButtonRef(node: Node | null): void {
        this._settingsButtonNode = node;
    }

    // ─── node creation ───

    private createNodes(parent: Node): void {
        const root = new Node('MinimapRoot');
        root.layer = HUD_UI_LAYER;
        const rootTf = root.addComponent(UITransform);
        rootTf.setAnchorPoint(0.5, 0.5);
        parent.addChild(root);
        this._rootNode = root;

        // Background
        const bgNode = new Node('MinimapBg');
        bgNode.layer = HUD_UI_LAYER;
        bgNode.addComponent(UITransform);
        const bg = bgNode.addComponent(Graphics);
        root.addChild(bgNode);
        this._bgGraphics = bg;

        // Terrain contour
        const terrainNode = new Node('MinimapTerrain');
        terrainNode.layer = HUD_UI_LAYER;
        terrainNode.addComponent(UITransform);
        const terrainGfx = terrainNode.addComponent(Graphics);
        root.addChild(terrainNode);
        this._terrainGraphics = terrainGfx;

        // Roads
        const roadNode = new Node('MinimapRoads');
        roadNode.layer = HUD_UI_LAYER;
        roadNode.addComponent(UITransform);
        const roadGfx = roadNode.addComponent(Graphics);
        root.addChild(roadNode);
        this._roadGraphics = roadGfx;

        // Unit dots
        const unitNode = new Node('MinimapUnits');
        unitNode.layer = HUD_UI_LAYER;
        unitNode.addComponent(UITransform);
        const unitGfx = unitNode.addComponent(Graphics);
        root.addChild(unitNode);
        this._unitGraphics = unitGfx;

        // Alert container (children are "!" labels)
        const alertNode = new Node('MinimapAlerts');
        alertNode.layer = HUD_UI_LAYER;
        alertNode.addComponent(UITransform);
        root.addChild(alertNode);
        this._warningContainer = alertNode;

        applyLayerRecursive(root, HUD_UI_LAYER);
    }

    // ─── layout ───

    private updateLayout(): void {
        if (!this._rootNode) return;
        const vis = UIResponsive.getVisibleSize();
        const viewportW = Math.max(480, Math.round(vis.width));
        const viewportH = Math.max(320, Math.round(vis.height));
        const compact = viewportW < 920 || viewportH < 620;
        const padding = UIResponsive.getControlPadding();

        this._mapSize = Math.round(
            UIResponsive.clamp(
                Math.min(viewportW, viewportH) * (compact ? 0.22 : 0.18),
                MINIMAP_MIN_SIZE,
                MINIMAP_MAX_SIZE
            )
        );

        const rootTf = this._rootNode.getComponent(UITransform);
        if (rootTf) rootTf.setContentSize(this._mapSize, this._mapSize);

        const halfW = vis.width * 0.5;
        const halfH = vis.height * 0.5;
        const topPad = Math.max(10, Math.round(padding.top * 0.45));
        const rightPad = Math.max(10, Math.round(padding.right * 0.55));

        // Position below settings button if available
        const topOffset = topPad;
        if (this._settingsButtonNode && this._settingsButtonNode.isValid) {
            const btnTf = this._settingsButtonNode.getComponent(UITransform);
            const btnW = btnTf ? Math.round(btnTf.contentSize.width) : 156;
            const btnH = btnTf ? btnTf.contentSize.height : 56;
            const btnPos = this._settingsButtonNode.position;

            // Keep minimap width aligned with settings button width.
            this._mapSize = Math.round(
                UIResponsive.clamp(btnW, MINIMAP_MIN_SIZE, MINIMAP_MAX_SIZE)
            );
            if (rootTf) rootTf.setContentSize(this._mapSize, this._mapSize);

            // Settings button center Y is btnPos.y, its bottom edge:
            const btnBottom = btnPos.y - btnH * 0.5;
            // We want minimap top edge at btnBottom - gap
            const minimapCenterY = btnBottom - GAP_BELOW_SETTINGS - this._mapSize * 0.5;
            this._rootNode.setPosition(Math.round(btnPos.x), Math.round(minimapCenterY), 0);
        } else {
            // Fallback: top-right corner
            this._rootNode.setPosition(
                Math.round(halfW - rightPad - this._mapSize * 0.5),
                Math.round(halfH - topOffset - this._mapSize * 0.5),
                0
            );
        }
    }

    // ─── basemap drawing ───

    private drawBasemap(): void {
        this.drawBackground();
        this.drawTerrain();
        this.drawRoads();
        this.drawRouteAnchors();
    }

    private drawBackground(): void {
        const g = this._bgGraphics;
        if (!g) return;
        g.clear();
        const s = this._mapSize;
        const hs = s * 0.5;
        const r = 6; // corner radius

        // Filled rounded rect
        g.fillColor = MINIMAP_BG_COLOR;
        g.roundRect(-hs, -hs, s, s, r);
        g.fill();

        // Border
        g.strokeColor = MINIMAP_BORDER_COLOR;
        g.lineWidth = MINIMAP_BORDER_WIDTH;
        g.roundRect(-hs, -hs, s, s, r);
        g.stroke();
    }

    private drawTerrain(): void {
        const g = this._terrainGraphics;
        if (!g) return;
        g.clear();

        const contour = [
            this.normalizedToWorld(0.03, 0.98),
            this.normalizedToWorld(0.18, 0.99),
            this.normalizedToWorld(0.46, 0.98),
            this.normalizedToWorld(0.82, 0.95),
            this.normalizedToWorld(0.97, 0.84),
            this.normalizedToWorld(0.99, 0.58),
            this.normalizedToWorld(0.97, 0.23),
            this.normalizedToWorld(0.88, 0.07),
            this.normalizedToWorld(0.58, 0.03),
            this.normalizedToWorld(0.26, 0.02),
            this.normalizedToWorld(0.06, 0.09),
            this.normalizedToWorld(0.03, 0.37),
        ];
        if (contour.length >= 3) {
            const first = this.worldToMinimap(contour[0].x, contour[0].z);
            g.moveTo(first.x, first.y);
            for (let i = 1; i < contour.length; i++) {
                const p = this.worldToMinimap(contour[i].x, contour[i].z);
                g.lineTo(p.x, p.y);
            }
            g.close();
            g.fillColor = TERRAIN_FILL_COLOR;
            g.fill();

            const first2 = this.worldToMinimap(contour[0].x, contour[0].z);
            g.moveTo(first2.x, first2.y);
            for (let i = 1; i < contour.length; i++) {
                const p = this.worldToMinimap(contour[i].x, contour[i].z);
                g.lineTo(p.x, p.y);
            }
            g.close();
            g.strokeColor = TERRAIN_OUTLINE_COLOR;
            g.lineWidth = 1.2;
            g.stroke();
        }

        const ridgeA = [
            this.normalizedToWorld(0.11, 0.86),
            this.normalizedToWorld(0.34, 0.75),
            this.normalizedToWorld(0.56, 0.66),
            this.normalizedToWorld(0.77, 0.54),
        ];
        const ridgeB = [
            this.normalizedToWorld(0.17, 0.56),
            this.normalizedToWorld(0.39, 0.47),
            this.normalizedToWorld(0.64, 0.39),
            this.normalizedToWorld(0.86, 0.29),
        ];
        g.strokeColor = TERRAIN_RIDGE_COLOR;
        g.lineWidth = 1;
        this.strokeWorldPolyline(g, ridgeA);
        this.strokeWorldPolyline(g, ridgeB);
    }

    private drawRoads(): void {
        const g = this._roadGraphics;
        if (!g) return;
        g.clear();

        const polylines = this.getLanePolylines();
        const bodyW = Math.max(5.5, this._mapSize * ROAD_WIDTH_RATIO);
        const edgeW = Math.max(2.2, this._mapSize * ROAD_EDGE_WIDTH_RATIO);
        const centerW = Math.max(1.2, this._mapSize * ROAD_CENTER_WIDTH_RATIO);

        for (const lane of ['top', 'mid', 'bottom'] as const) {
            const rawPts = polylines[lane];
            const pts = this.buildNaturalRoadPolyline(rawPts, lane);
            if (pts.length < 2) continue;

            g.strokeColor = ROAD_BODY_COLOR;
            g.lineWidth = lane === 'mid' ? bodyW * 0.92 : bodyW;
            this.strokeWorldPolyline(g, pts);

            g.strokeColor = ROAD_EDGE_COLOR;
            g.lineWidth = edgeW;
            this.strokeWorldPolyline(g, pts);

            g.strokeColor = ROAD_CENTER_COLOR;
            g.lineWidth = centerW;
            this.strokeWorldPolyline(g, pts);
        }
    }

    private drawRouteAnchors(): void {
        const g = this._roadGraphics;
        if (!g) return;

        // Base marker
        const baseX = GameConfig.MAP.BASE_SPAWN.x;
        const baseZ = GameConfig.MAP.BASE_SPAWN.z;
        const bp = this.worldToMinimap(baseX, baseZ);
        g.fillColor = new Color(60, 200, 120, 220);
        g.rect(bp.x - 3.5, bp.y - 3.5, 7, 7);
        g.fill();

        // Enemy-side lane anchors
        const polylines = this.getLanePolylines();
        g.fillColor = new Color(255, 124, 92, 232);
        for (const lane of ['top', 'mid', 'bottom'] as const) {
            const pts = polylines[lane];
            if (pts.length <= 0) continue;
            const end = pts[pts.length - 1];
            const p = this.worldToMinimap(end.x, end.z);
            g.circle(p.x, p.y, 2.1);
            g.fill();
        }
    }

    private getLanePolylines(): Record<'top' | 'mid' | 'bottom', Array<{ x: number; z: number }>> {
        const n2w = (nx: number, nz: number) => this.normalizedToWorld(nx, nz);

        return {
            top: [
                n2w(0.05, 0.95),
                n2w(0.12, 0.91),
                n2w(0.26, 0.915),
                n2w(0.47, 0.905),
                n2w(0.69, 0.918),
                n2w(0.95, 0.92),
            ],
            mid: [
                n2w(0.05, 0.95),
                n2w(0.35, 0.65),
                n2w(0.5, 0.5),
                n2w(0.65, 0.35),
                n2w(0.95, 0.05),
            ],
            bottom: [
                n2w(0.05, 0.95),
                n2w(0.082, 0.9),
                n2w(0.074, 0.72),
                n2w(0.088, 0.52),
                n2w(0.072, 0.3),
                n2w(0.084, 0.05),
            ],
        };
    }

    // ─── coordinate mapping ───

    /** World XZ → minimap local pixel coords (origin = center of minimap) */
    private worldToMinimap(worldX: number, worldZ: number): { x: number; y: number } {
        const hw = this._halfWorld;
        const hs = this._mapSize * 0.5;
        const margin = 4; // pixel margin inside border
        const usable = hs - margin;

        // Normalize to [-1, 1] and clamp
        const nx = Math.max(-1, Math.min(1, worldX / hw.x));
        const nz = Math.max(-1, Math.min(1, worldZ / hw.z));

        return {
            x: nx * usable,
            // Flip Z so base at (-x, -z) appears in top-left of minimap.
            y: -nz * usable,
        };
    }

    private normalizedToWorld(nx: number, nz: number): { x: number; z: number } {
        const halfW = this._halfWorld.x;
        const halfH = this._halfWorld.z;
        return {
            x: nx * (halfW * 2) - halfW,
            z: (1 - nz) * (halfH * 2) - halfH,
        };
    }

    private strokeWorldPolyline(g: Graphics, pts: Array<{ x: number; z: number }>): void {
        if (pts.length < 2) return;
        const first = this.worldToMinimap(pts[0].x, pts[0].z);
        g.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.worldToMinimap(pts[i].x, pts[i].z);
            g.lineTo(p.x, p.y);
        }
        g.stroke();
    }

    private buildNaturalRoadPolyline(
        controlPoints: Array<{ x: number; z: number }>,
        lane: 'top' | 'mid' | 'bottom'
    ): Array<{ x: number; z: number }> {
        if (controlPoints.length < 2) return controlPoints.slice();

        const dense: Array<{ x: number; z: number }> = [];
        for (let i = 0; i < controlPoints.length - 1; i++) {
            const p0 = controlPoints[Math.max(0, i - 1)];
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];
            const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];

            for (let s = 0; s < ROAD_CURVE_SUBDIVISIONS; s++) {
                const t = s / ROAD_CURVE_SUBDIVISIONS;
                dense.push({
                    x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, t),
                    z: this.catmullRom(p0.z, p1.z, p2.z, p3.z, t),
                });
            }
        }
        dense.push(controlPoints[controlPoints.length - 1]);

        const laneSeed = lane === 'mid' ? 1.63 : lane === 'top' ? 0.92 : 2.27;
        const freq = lane === 'mid' ? 1.65 : 1.22;
        const amplitude = lane === 'mid' ? ROAD_JITTER_WORLD * 1.25 : ROAD_JITTER_WORLD;
        const halfW = this._halfWorld.x * 0.98;
        const halfH = this._halfWorld.z * 0.98;

        for (let i = 1; i < dense.length - 1; i++) {
            const prev = dense[i - 1];
            const cur = dense[i];
            const next = dense[i + 1];
            const dx = next.x - prev.x;
            const dz = next.z - prev.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len <= 0.0001) continue;

            const nx = -dz / len;
            const nz = dx / len;
            const progress = i / (dense.length - 1);
            const waveA = Math.sin(progress * Math.PI * 2 * freq + laneSeed);
            const waveB = Math.sin(progress * Math.PI * 2 * (freq * 2.45) + laneSeed * 1.77) * 0.4;
            const offset = (waveA + waveB) * amplitude;
            cur.x = Math.max(-halfW, Math.min(halfW, cur.x + nx * offset));
            cur.z = Math.max(-halfH, Math.min(halfH, cur.z + nz * offset));
        }

        dense[0] = controlPoints[0];
        dense[dense.length - 1] = controlPoints[controlPoints.length - 1];
        return dense;
    }

    private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
        const t2 = t * t;
        const t3 = t2 * t;
        return (
            0.5 *
            (2 * p1 +
                (-p0 + p2) * t +
                (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
        );
    }

    // ─── unit refresh ───

    private refreshUnits(): void {
        const g = this._unitGraphics;
        if (!g) return;
        g.clear();

        // Hero
        const heroNode = GameManager.instance.hero;
        if (heroNode && heroNode.isValid) {
            const hp = this.worldToMinimap(heroNode.position.x, heroNode.position.z);
            g.fillColor = HERO_DOT_COLOR;
            g.circle(hp.x, hp.y, HERO_DOT_RADIUS);
            g.fill();
        }

        // Enemies
        const provider = ServiceRegistry.get<EnemyProvider>('EnemyProvider');
        if (!provider) return;
        const enemies = provider.getEnemies();
        for (let i = 0, len = enemies.length; i < len; i++) {
            const e = enemies[i];
            if (!e || !e.isValid) continue;
            const ep = this.worldToMinimap(e.position.x, e.position.z);
            const enemy = e.getComponent(Enemy);
            const spawnType = enemy?.spawnType ?? (enemy?.isElite ? 'elite' : 'regular');
            if (spawnType === 'boss') {
                this.drawBossIcon(g, ep.x, ep.y, BOSS_ICON_SIZE);
                continue;
            }
            g.fillColor = ENEMY_DOT_COLOR;
            g.circle(ep.x, ep.y, spawnType === 'elite' ? ENEMY_ELITE_DOT_RADIUS : ENEMY_DOT_RADIUS);
            g.fill();
        }
    }

    private drawBossIcon(g: Graphics, x: number, y: number, size: number): void {
        // Fill
        g.fillColor = BOSS_ICON_FILL;
        g.moveTo(x, y + size);
        g.lineTo(x + size, y);
        g.lineTo(x, y - size);
        g.lineTo(x - size, y);
        g.close();
        g.fill();

        // Outline
        g.strokeColor = BOSS_ICON_STROKE;
        g.lineWidth = 1.2;
        g.moveTo(x, y + size);
        g.lineTo(x + size, y);
        g.lineTo(x, y - size);
        g.lineTo(x - size, y);
        g.close();
        g.stroke();

        g.fillColor = new Color(255, 246, 194, 255);
        g.circle(x, y, size * 0.3);
        g.fill();
    }

    // ─── pre-spawn warning ───

    private onWaveForecast(data: {
        lane?: ForecastLane;
        spawnType?: 'regular' | 'elite' | 'boss';
    }): void {
        const lane = this.resolveForecastLane(data.lane, data.spawnType);
        const spawnPoint = this.resolveLaneSpawnWorldPoint(lane);
        this.clearWarnings();
        this.addWarning(spawnPoint.x, spawnPoint.z);
    }

    private onWaveStart(): void {
        // Keep warning until actual spawn event so players can still track forecast during countdown.
    }

    private onUnitSpawned(data: { unitType: string; node?: Node }): void {
        if (data.unitType !== 'enemy' || !data.node || !data.node.isValid) return;
        this.clearWarnings();
    }

    private resolveForecastLane(
        lane: ForecastLane | undefined,
        spawnType: 'regular' | 'elite' | 'boss' | undefined
    ): RouteLane {
        if (spawnType === 'boss') return 'mid';
        if (lane === 'left') return 'top';
        if (lane === 'right') return 'bottom';
        return 'mid';
    }

    private resolveLaneSpawnWorldPoint(lane: RouteLane): { x: number; z: number } {
        const lanes = this.getLanePolylines();
        const lanePoints = lanes[lane];
        if (lanePoints.length <= 0) return { x: 0, z: 0 };
        return lanePoints[lanePoints.length - 1];
    }

    private addWarning(worldX: number, worldZ: number): void {
        if (!this._warningContainer) return;
        const pos = this.worldToMinimap(worldX, worldZ);
        const iconSize = Math.max(
            ALERT_ICON_MIN_SIZE,
            Math.min(ALERT_ICON_MAX_SIZE, Math.round(this._mapSize * 0.16))
        );

        const alertNode = new Node('MinimapAlert');
        alertNode.layer = HUD_UI_LAYER;
        const tf = alertNode.addComponent(UITransform);
        tf.setContentSize(iconSize, iconSize);
        tf.setAnchorPoint(0.5, 0.5);

        const icon = alertNode.addComponent(Graphics);
        this.drawWarningTriangle(icon, iconSize);

        const labelNode = new Node('AlertMark');
        labelNode.layer = HUD_UI_LAYER;
        labelNode.addComponent(UITransform).setContentSize(iconSize * 0.42, iconSize * 0.58);
        labelNode.setPosition(0, -iconSize * 0.06, 0);
        alertNode.addChild(labelNode);

        const label = labelNode.addComponent(Label);
        label.string = '!';
        label.fontSize = Math.max(12, Math.round(iconSize * 0.54));
        label.lineHeight = label.fontSize + 1;
        label.color = new Color(255, 246, 206, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.NONE;
        label.isBold = true;
        applyGameLabelStyle(label, {
            outlineColor: new Color(120, 0, 0, 255),
            outlineWidth: 2,
        });

        const opacity = alertNode.addComponent(UIOpacity);
        opacity.opacity = 255;

        alertNode.setPosition(pos.x, pos.y, 0);
        this._warningContainer.addChild(alertNode);
        applyLayerRecursive(alertNode, HUD_UI_LAYER);

        this._warnings.push({
            node: alertNode,
            worldX,
            worldZ,
            blinkTimer: ALERT_BLINK_INTERVAL_S,
            remainingSwitches: ALERT_BLINK_SWITCHES,
            visible: true,
        });
    }

    private drawWarningTriangle(g: Graphics, iconSize: number): void {
        const half = iconSize * 0.5;
        const topY = half * 0.82;
        const botY = -half * 0.72;
        const sideX = half * 0.74;

        g.clear();
        g.fillColor = ALERT_TRIANGLE_FILL;
        g.moveTo(0, topY);
        g.lineTo(sideX, botY);
        g.lineTo(-sideX, botY);
        g.close();
        g.fill();

        g.strokeColor = ALERT_TRIANGLE_STROKE;
        g.lineWidth = Math.max(1.5, iconSize * 0.08);
        g.moveTo(0, topY);
        g.lineTo(sideX, botY);
        g.lineTo(-sideX, botY);
        g.close();
        g.stroke();

        g.fillColor = ALERT_TRIANGLE_INNER;
        const inset = iconSize * 0.13;
        g.moveTo(0, topY - inset);
        g.lineTo(sideX - inset, botY + inset * 0.88);
        g.lineTo(-(sideX - inset), botY + inset * 0.88);
        g.close();
        g.fill();
    }

    private tickWarnings(dt: number): void {
        let write = 0;
        for (let i = 0; i < this._warnings.length; i++) {
            const warning = this._warnings[i];
            if (!warning.node.isValid) {
                continue;
            }

            const pos = this.worldToMinimap(warning.worldX, warning.worldZ);
            warning.node.setPosition(pos.x, pos.y, 0);

            if (warning.remainingSwitches > 0) {
                warning.blinkTimer -= dt;
                while (warning.blinkTimer <= 0 && warning.remainingSwitches > 0) {
                    warning.visible = !warning.visible;
                    warning.remainingSwitches--;
                    const opacity = warning.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = warning.visible ? 255 : 45;
                    warning.blinkTimer += ALERT_BLINK_INTERVAL_S;
                }
                if (warning.remainingSwitches <= 0) {
                    warning.visible = true;
                    const opacity = warning.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                }
            }

            this._warnings[write++] = warning;
        }
        this._warnings.length = write;
    }

    private clearWarnings(): void {
        for (let i = 0; i < this._warnings.length; i++) {
            const warning = this._warnings[i];
            if (warning.node.isValid) warning.node.destroy();
        }
        this._warnings.length = 0;
    }

    private repositionWarnings(): void {
        for (let i = 0; i < this._warnings.length; i++) {
            const warning = this._warnings[i];
            if (!warning.node.isValid) continue;
            const pos = this.worldToMinimap(warning.worldX, warning.worldZ);
            warning.node.setPosition(pos.x, pos.y, 0);
        }
    }

    // ─── helpers ───

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
