import {
    _decorator,
    Component,
    Node,
    Color,
    Material,
    MeshRenderer,
    primitives,
    utils,
    BoxCollider,
    Mesh,
    resources,
    Texture2D,
    ImageAsset,
    Vec3,
    Vec4,
    EffectAsset,
    Prefab,
    instantiate,
} from 'cc';
import { GameConfig } from '../../data/GameConfig';
import { ProjectileBlocker } from '../combat/ProjectileBlocker';

const { ccclass, property } = _decorator;

type NatureCategory = 'tree' | 'rock' | 'bush' | 'grass';

type NatureModelDef = {
    basePath: string;
    category: NatureCategory;
    weight: number;
    scaleMin: number;
    scaleMax: number;
    radius: number;
    avoidLaneWorld: number;
    edgeBias: number;
    clusterChance: number;
    grassPattern?: 'scatter' | 'patch';
};

type NatureModelPrefab = NatureModelDef & {
    prefab: Prefab;
    modelName: string;
};

type NaturePlacement = {
    x: number;
    z: number;
    radius: number;
    category: NatureCategory;
};

type NatureZone = {
    x: number;
    z: number;
    radius: number;
};

export enum TileType {
    EMPTY = 0,
    FLOOR = 1,
    WALL = 2,
    ENEMY_SPAWN = 3,
    PLAYER_SPAWN = 4,
    LANE = 5,
}

@ccclass('MapGenerator')
export class MapGenerator extends Component {
    private static readonly GENERATED_ROOT_NAME = '__GeneratedMap';
    private static readonly PHYSICS_GROUP_PROJECTILE_BLOCKER = 1 << 6;
    private static readonly NATURE_BLOCKER_TREE_RADIUS_SCALE = 0.28;
    private static readonly NATURE_BLOCKER_ROCK_RADIUS_SCALE = 0.42;
    private static readonly NATURE_BLOCKER_MIN_RADIUS = 0.16;
    private static readonly NATURE_BLOCKER_FOOTPRINT_SCALE = 0.65;
    private static readonly NATURE_BLOCKER_HEIGHT = 3.6;
    private static readonly NATURE_BLOCKER_CENTER_Y = 1.55;

    // Texture paths (with Cocos sub-asset fallbacks)
    private static readonly GRASS_TEX_PATHS: ReadonlyArray<string> = [
        'floor/grass/texture',
        'floor/grass',
        'floor/grass.webp',
    ];
    private static readonly DIRT_TEX_PATHS: ReadonlyArray<string> = [
        'floor/Dirt_02/texture',
        'floor/Dirt_02',
        'floor/Dirt_02.webp',
    ];
    private static readonly SPLAT_EFFECT_PATH = 'shaders/terrain-splat';

    // Splatmap resolution (pixels)
    private static readonly SPLAT_SIZE = 256;
    private static readonly LANE_HALF_WIDTH_NORM = 0.028;
    private static readonly LANE_HALF_WIDTH_WIDE_NORM = 0.045;
    private static readonly LANE_EDGE_SOFTNESS_NORM = 0.025;
    private static readonly LANE_NOISE_PAD_NORM = 0.018;

    @property
    public mapWidth: number = 28;

    @property
    public mapHeight: number = 28;

    @property
    public tileSize: number = 2;

    private _colorMaterials: Map<string, Material> = new Map();
    private _sharedTileMesh: Mesh | null = null;
    private _sharedGroundMesh: Mesh | null = null;
    private _buildRoot: Node | null = null;
    private _terrainMaterial: Material | null = null;

    protected start(): void {
        // 由 GameStartFlow 主动触发 generateProceduralMap
    }

    public generateProceduralMap(): void {
        const mapGrid: number[][] = [];
        const width = this.mapWidth;
        const height = this.mapHeight;

        for (let z = 0; z < height; z++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                row.push(TileType.FLOOR);
            }
            mapGrid.push(row);
        }

        const spawnGrid = this.worldToGrid(
            GameConfig.MAP.BASE_SPAWN.x,
            GameConfig.MAP.BASE_SPAWN.z,
            width,
            height
        );
        this.clearArea(mapGrid, spawnGrid.x, spawnGrid.z, 2);
        mapGrid[spawnGrid.z][spawnGrid.x] = TileType.PLAYER_SPAWN;

        this.buildMapFromData(mapGrid);
    }

    private pointToSegmentDistance(
        p: { x: number; z: number },
        v: { x: number; z: number },
        w: { x: number; z: number }
    ): number {
        const l2 = (v.x - w.x) ** 2 + (v.z - w.z) ** 2;
        if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.z - v.z) ** 2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.z - v.z) * (w.z - v.z)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = v.x + t * (w.x - v.x);
        const projZ = v.z + t * (w.z - v.z);
        return Math.sqrt((p.x - projX) ** 2 + (p.z - projZ) ** 2);
    }

    private pointToBezierDistance(
        p: { x: number; z: number },
        p0: { x: number; z: number },
        p1: { x: number; z: number },
        p2: { x: number; z: number }
    ): number {
        // Approximate distance by sampling
        // Analytical distance to Bezier is complex (solving 5th deg polynomial)
        // Sampling 20 points matches "rasterization" needs for grid
        let minDist = Number.MAX_VALUE;
        const samples = 30;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const it = 1 - t;
            // Quadratic Bezier: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
            const bx = it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x;
            const bz = it * it * p0.z + 2 * it * t * p1.z + t * t * p2.z;
            const dist = Math.sqrt((p.x - bx) ** 2 + (p.z - bz) ** 2);
            if (dist < minDist) minDist = dist;
        }
        return minDist;
    }

    public generateFromImage(_mapName: string): void {
        this.generateProceduralMap();
    }

    public buildMapFromData(data: number[][]): void {
        this._buildRoot = this.getOrCreateGeneratedRoot();
        this._buildRoot.removeAllChildren();

        const rows = data.length;
        const cols = data[0].length;
        const enemyColor = new Color(168, 73, 73, 255);

        // Single-plane splatmap ground
        this.createSplatmapGround(cols, rows);

        this.createMountainBoundary(cols, rows);

        // Spawn procedural nature dressing (trees/rocks/bushes/grass)
        void this.spawnNatureShowcase(cols, rows).catch(err => {
            console.error('[MapGenerator] spawnNatureShowcase failed:', err);
        });

        const offsetX = (cols * this.tileSize) / 2;
        const offsetZ = (rows * this.tileSize) / 2;
        for (let z = 0; z < rows; z++) {
            for (let x = 0; x < cols; x++) {
                const type = data[z][x];
                if (type !== TileType.ENEMY_SPAWN) continue;

                const posX = x * this.tileSize - offsetX + this.tileSize / 2;
                const posZ = z * this.tileSize - offsetZ + this.tileSize / 2;
                this.createTileCube(posX, 0.2, posZ, enemyColor, 0.2, false);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  SPLATMAP GROUND — single plane, 1 draw call
    // ═══════════════════════════════════════════════════════════

    private createSplatmapGround(cols: number, rows: number): void {
        const worldW = cols * this.tileSize;
        const worldH = rows * this.tileSize;

        // Create a single plane mesh covering the entire map
        const groundNode = new Node('SplatmapGround');
        (this._buildRoot ?? this.node).addChild(groundNode);
        groundNode.setPosition(0, 0, 0);
        groundNode.layer = (this._buildRoot ?? this.node).layer;

        const mesh = utils.MeshUtils.createMesh(
            primitives.plane({
                width: worldW,
                length: worldH,
                widthSegments: 1,
                lengthSegments: 1,
            })
        );

        const renderer = groundNode.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        // Ground should receive projected shadows.
        renderer.receiveShadow = 1;
        renderer.shadowCastingMode = 0;

        // Generate splatmap texture
        const splatTex = this.generateSplatmapTexture(cols, rows);

        // Create material with fallback color first
        const mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_TEXTURE: false },
        });
        mat.setProperty('mainColor', new Color(98, 133, 75, 255)); // fallback grass
        renderer.material = mat;
        this._terrainMaterial = mat;

        // Load effect + textures asynchronously, then swap material
        void this.initSplatmapMaterial(renderer, splatTex);
    }

    private async initSplatmapMaterial(renderer: MeshRenderer, splatTex: Texture2D): Promise<void> {
        // Load grass and dirt textures
        const [grassTex, dirtTex] = await Promise.all([
            this.loadGroundTextureWithFallbacks([...MapGenerator.GRASS_TEX_PATHS]),
            this.loadGroundTextureWithFallbacks([...MapGenerator.DIRT_TEX_PATHS]),
        ]);

        if (!grassTex || !dirtTex) {
            console.warn(
                '[MapGenerator] Failed to load grass or dirt texture, keeping fallback color'
            );
            return;
        }

        // Set wrap modes to repeat
        this.setTextureRepeat(grassTex);
        this.setTextureRepeat(dirtTex);

        // Create splatmap material
        const mat = new Material();

        // Load the effect asset first to ensure it's available
        const effectAsset = await this.loadEffectAsset('shaders/terrain-splat');
        if (!effectAsset) {
            console.error('[MapGenerator] Failed to load terrain-splat effect asset');
            // Fallback to unlit
            mat.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
            mat.setProperty('mainColor', new Color(98, 133, 75, 255));
            renderer.material = mat;
            return;
        }

        try {
            mat.initialize({
                effectAsset: effectAsset,
                defines: {},
            });
        } catch (e) {
            console.error('[MapGenerator] Failed to initialize material with splat effect:', e);
            return;
        }

        // Tiling: reduce tiling for more natural look (less repeated pattern)
        const tilesAcross = Math.max(this.mapWidth, this.mapHeight) / 4;
        mat.setProperty('grassTex', grassTex);
        mat.setProperty('dirtTex', dirtTex);
        mat.setProperty('splatMap', splatTex);
        mat.setProperty('grassTiling', new Vec4(tilesAcross, tilesAcross, 0, 0));
        mat.setProperty('dirtTiling', new Vec4(tilesAcross, tilesAcross, 0, 0));
        mat.setProperty(
            'splatTexel',
            new Vec4(1 / MapGenerator.SPLAT_SIZE, 1 / MapGenerator.SPLAT_SIZE, 0, 0)
        );
        mat.setProperty('lightDir', new Vec4(-0.35, 1.0, 0.25, 0));
        mat.setProperty('lightingParams', new Vec4(0.62, 0.52, 2.4, 0.16));

        renderer.material = mat;
        this._terrainMaterial = mat;
    }

    private setTextureRepeat(tex: Texture2D): void {
        const texAny = tex as Texture2D & { setWrapMode?: (u: number, v: number) => void };
        const wm = (Texture2D as unknown as { WrapMode?: { REPEAT?: number } }).WrapMode?.REPEAT;
        if (texAny.setWrapMode && wm !== undefined) {
            texAny.setWrapMode(wm, wm);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  SPLATMAP GENERATION — distance field + noise
    // ═══════════════════════════════════════════════════════════

    private generateSplatmapTexture(cols: number, rows: number): Texture2D {
        const S = MapGenerator.SPLAT_SIZE;
        const data = new Uint8Array(S * S * 4); // RGBA

        // Base position in normalized [0,1] space
        // Base is at Top-Left (low X, high Z in normalized coords if Z increases down?)
        // Let's assume standard UV: (0,0) is usually Bottom-Left in GL.
        // But if screen output was TR->BL from (0.05,0.05)->(0.95,0.95),
        // MOBA layout: Top-Left base to Bottom-Right base
        // Use actual corners (with minimal padding) so lanes run edge-to-edge
        // Base positions in normalized [0,1] space
        // We use (0.05, 0.95) for Top-Left and (0.95, 0.05) for Bottom-Right to get the TL->BR diagonal.
        const baseNx = 0.05;
        const baseNz = 0.95;
        const enemyNx = 0.95;
        const enemyNz = 0.05;

        // Top/Right Lane: Strictly Top Edge
        // Start TL -> Go along Top edge -> End at TR corner (0.95, 0.95).
        // Removed segment connecting to BR (Right Edge Road).
        const topLane = [
            { x: baseNx, z: baseNz },
            { x: 0.06, z: 0.92 },
            { x: 0.95, z: 0.92 }, // End at TR (inset Y)
        ];

        // Mid Lane: Diagonal TL -> BR (unchanged)
        const midLane = [
            { x: baseNx, z: baseNz },
            { x: 0.35, z: 0.65 },
            { x: 0.5, z: 0.5 },
            { x: 0.65, z: 0.35 },
            { x: enemyNx, z: enemyNz },
        ];

        // Bot/Left Lane: Strictly Left Edge
        // Start TL -> Go along Left edge -> End at BL corner (0.05, 0.05).
        // Removed segment connecting to BR (Bottom Edge Road).
        const botLane = [
            { x: baseNx, z: baseNz },
            { x: 0.08, z: 0.94 },
            { x: 0.08, z: 0.05 }, // End at BL (inset X)
        ];

        // Lane half-width in normalized space
        const laneHalfWidth = MapGenerator.LANE_HALF_WIDTH_NORM;
        // Wider width for Top and Left lanes (user request increased width)
        const laneHalfWidthWide = MapGenerator.LANE_HALF_WIDTH_WIDE_NORM;
        // Smoothstep transition width
        const edgeSoftness = MapGenerator.LANE_EDGE_SOFTNESS_NORM;

        for (let py = 0; py < S; py++) {
            for (let px = 0; px < S; px++) {
                // Normalized coords [0, 1]
                const nx = (px + 0.5) / S;
                const nz = (py + 0.5) / S;

                // Distance to each lane (polyline distance)
                // Top and Bot lanes are wider now
                const dTop = Math.max(
                    0,
                    this.distToPolyline(nx, nz, topLane) - (laneHalfWidthWide - laneHalfWidth)
                );
                const dMid = this.distToPolyline(nx, nz, midLane);
                const dBot = Math.max(
                    0,
                    this.distToPolyline(nx, nz, botLane) - (laneHalfWidthWide - laneHalfWidth)
                );

                const minDist = Math.min(dTop, dMid, dBot);

                // Perlin-like noise for organic edges
                const noiseVal = this.fbmNoise(nx * 18.0, nz * 18.0) * 0.018;
                const adjustedDist = minDist + noiseVal;

                // Smoothstep: 0 at lane center, 1 at edge
                const t = this.smoothstep(
                    laneHalfWidth - edgeSoftness,
                    laneHalfWidth + edgeSoftness,
                    adjustedDist
                );

                // mask: 1 = dirt (inside lane), 0 = grass (outside)
                const mask = 1.0 - t;
                const byte = Math.floor(Math.max(0, Math.min(1, mask)) * 255);

                const idx = (py * S + px) * 4;
                data[idx + 0] = byte; // R
                data[idx + 1] = byte; // G
                data[idx + 2] = byte; // B
                data[idx + 3] = 255; // A
            }
        }

        // Create Texture2D from pixel data
        const tex = new Texture2D();
        // Use Texture2D.PixelFormat if available, otherwise use raw value for RGBA8888
        const pixFmt =
            (Texture2D as unknown as { PixelFormat?: { RGBA8888?: number } }).PixelFormat
                ?.RGBA8888 ?? 35;
        const img = new ImageAsset({
            _data: data,
            _compressed: false,
            width: S,
            height: S,
            format: pixFmt,
        });
        tex.image = img;
        // Set filters: LINEAR = 2
        const filterLinear =
            (Texture2D as unknown as { Filter?: { LINEAR?: number } }).Filter?.LINEAR ?? 2;
        const texAny = tex as Texture2D & {
            setFilters?: (min: number, mag: number) => void;
            setWrapMode?: (u: number, v: number) => void;
        };
        if (texAny.setFilters) {
            texAny.setFilters(filterLinear, filterLinear);
        }
        // CLAMP_TO_EDGE = 0
        const clamp =
            (Texture2D as unknown as { WrapMode?: { CLAMP_TO_EDGE?: number } }).WrapMode
                ?.CLAMP_TO_EDGE ?? 0;
        if (texAny.setWrapMode) {
            texAny.setWrapMode(clamp, clamp);
        }
        return tex;
    }

    /** Distance from point (px,pz) to a polyline defined by an array of points */
    private distToPolyline(px: number, pz: number, points: { x: number; z: number }[]): number {
        let minDist = Number.MAX_VALUE;
        for (let i = 0; i < points.length - 1; i++) {
            const d = this.pointToSegmentDistance({ x: px, z: pz }, points[i], points[i + 1]);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }

    /** Attempt at FBM noise (fractal Brownian motion) for organic edges */
    private fbmNoise(x: number, z: number): number {
        let value = 0;
        let amplitude = 0.5;
        let frequency = 1.0;
        for (let i = 0; i < 4; i++) {
            value += amplitude * (this.valueNoise2D(x * frequency, z * frequency) * 2.0 - 1.0);
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        return value;
    }

    /** Simple 2D value noise */
    private valueNoise2D(x: number, z: number): number {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const fx = x - ix;
        const fz = z - iz;

        // Smoothstep interpolation
        const ux = fx * fx * (3.0 - 2.0 * fx);
        const uz = fz * fz * (3.0 - 2.0 * fz);

        const n00 = this.hash01(ix * 127.1 + iz * 311.7);
        const n10 = this.hash01((ix + 1) * 127.1 + iz * 311.7);
        const n01 = this.hash01(ix * 127.1 + (iz + 1) * 311.7);
        const n11 = this.hash01((ix + 1) * 127.1 + (iz + 1) * 311.7);

        const nx0 = n00 + (n10 - n00) * ux;
        const nx1 = n01 + (n11 - n01) * ux;
        return nx0 + (nx1 - nx0) * uz;
    }

    private smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    private createMountainBoundary(cols: number, rows: number): void {
        for (let x = -1; x <= cols; x++) {
            this.createMountainSegment(x, -1, cols, rows, true);
            this.createMountainSegment(x, rows, cols, rows, true);
        }
        for (let z = 0; z < rows; z++) {
            this.createMountainSegment(-1, z, cols, rows, false);
            this.createMountainSegment(cols, z, cols, rows, false);
        }
    }

    private createMountainSegment(
        gridX: number,
        gridZ: number,
        cols: number,
        rows: number,
        isHorizontalEdge: boolean
    ): void {
        const center = this.gridToWorldCenter(gridX, gridZ, cols, rows);
        const seed = gridX * 131.9 + gridZ * 89.7;
        const noiseA = this.hash01(seed);
        const noiseB = this.hash01(seed + 19.73);
        const noiseC = this.hash01(seed + 51.21);

        const height = this.tileSize * (1.15 + noiseA * 1.05);
        const along = this.tileSize * (1.05 + noiseB * 0.5);
        const thick = this.tileSize * (1.2 + noiseC * 0.65);
        const tangentJitter = (this.hash01(seed + 7.17) - 0.5) * this.tileSize * 0.35;
        const outerPush = this.tileSize * 0.32;

        let x = center.x;
        let z = center.z;
        if (isHorizontalEdge) {
            x += tangentJitter;
            z += gridZ < 0 ? -outerPush : outerPush;
        } else {
            z += tangentJitter;
            x += gridX < 0 ? -outerPush : outerPush;
        }

        const scaleX = isHorizontalEdge ? along : thick;
        const scaleZ = isHorizontalEdge ? thick : along;
        const color = this.pickMountainColor(seed);
        this.createMountainBlock(x, z, scaleX, height, scaleZ, color);

        if (this.hash01(seed + 103.3) > 0.58) {
            const capHeight = height * (0.35 + this.hash01(seed + 61.2) * 0.22);
            const capScaleX = scaleX * (0.5 + this.hash01(seed + 43.9) * 0.2);
            const capScaleZ = scaleZ * (0.5 + this.hash01(seed + 24.4) * 0.2);
            const capOffsetX = (this.hash01(seed + 66.6) - 0.5) * this.tileSize * 0.45;
            const capOffsetZ = (this.hash01(seed + 27.9) - 0.5) * this.tileSize * 0.45;
            this.createMountainBlock(
                x + capOffsetX,
                z + capOffsetZ,
                capScaleX,
                capHeight,
                capScaleZ,
                this.pickMountainColor(seed + 211.7),
                height
            );
        }
    }

    private createMountainBlock(
        x: number,
        z: number,
        scaleX: number,
        scaleY: number,
        scaleZ: number,
        color: Color,
        baseY: number = 0
    ): void {
        const node = new Node('BoundaryMountain');
        (this._buildRoot ?? this.node).addChild(node);
        node.setPosition(x, baseY + scaleY * 0.5, z);
        node.setScale(scaleX, scaleY, scaleZ);
        node.layer = (this._buildRoot ?? this.node).layer;

        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.getSharedTileMesh();
        renderer.material = this.getColorMaterial(color);
        // Boundary mountains are outside the playable area. Letting them cast shadows
        // causes remote-webview-only stray silhouettes when shadow frustum differs.
        renderer.shadowCastingMode = 0;
        renderer.receiveShadow = 0;

        const collider = node.addComponent(BoxCollider);
        collider.setGroup(1);
    }

    private pickMountainColor(seed: number): Color {
        const palette: readonly Color[] = [
            new Color(78, 86, 67, 255),
            new Color(89, 96, 74, 255),
            new Color(102, 108, 82, 255),
            new Color(114, 118, 92, 255),
        ];
        const idx = Math.floor(this.hash01(seed + 3.14) * palette.length) % palette.length;
        return palette[idx];
    }

    private gridToWorldCenter(
        gridX: number,
        gridZ: number,
        cols: number,
        rows: number
    ): { x: number; z: number } {
        const offsetX = (cols * this.tileSize) / 2;
        const offsetZ = (rows * this.tileSize) / 2;
        return {
            x: gridX * this.tileSize - offsetX + this.tileSize / 2,
            z: gridZ * this.tileSize - offsetZ + this.tileSize / 2,
        };
    }

    public generateTestMap(): void {
        const mapData: number[][] = [];
        for (let z = 0; z < this.mapHeight; z++) {
            const row: number[] = [];
            for (let x = 0; x < this.mapWidth; x++) {
                row.push(TileType.FLOOR);
            }
            mapData.push(row);
        }
        this.buildMapFromData(mapData);
    }

    private createTileCube(
        x: number,
        y: number,
        z: number,
        color: Color,
        height: number,
        isObstacle: boolean = false
    ): void {
        const node = new Node('Tile');
        (this._buildRoot ?? this.node).addChild(node);
        node.setPosition(x, y, z);
        node.setScale(this.tileSize, height, this.tileSize);

        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.getSharedTileMesh();
        renderer.material = this.getColorMaterial(color);

        if (isObstacle) {
            const collider = node.addComponent(BoxCollider);
            collider.setGroup(1);
        }
    }

    private hash01(seed: number): number {
        const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return s - Math.floor(s);
    }

    private getColorMaterial(color: Color): Material {
        const key = `${color.r}_${color.g}_${color.b}_${color.a}`;
        let material = this._colorMaterials.get(key);
        if (!material) {
            material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', color);
            this._colorMaterials.set(key, material);
        }
        return material;
    }

    private async loadGroundTextureWithFallbacks(paths: string[]): Promise<Texture2D | null> {
        for (const path of paths) {
            const tex = await this.loadTexture(path);
            if (tex) return tex;
        }
        return null;
    }

    private loadTexture(path: string): Promise<Texture2D | null> {
        return new Promise(resolve => {
            resources.load(path, Texture2D, (err, tex) => {
                if (err || !tex) return resolve(null);
                resolve(tex);
            });
        });
    }

    private loadEffectAsset(path: string): Promise<EffectAsset | null> {
        return new Promise(resolve => {
            resources.load(path, EffectAsset, (err, asset) => {
                if (err || !asset) {
                    console.warn(`[MapGenerator] Effect load failed: ${path}`, err);
                    return resolve(null);
                }
                resolve(asset);
            });
        });
    }

    private worldToGrid(
        worldX: number,
        worldZ: number,
        width: number,
        height: number
    ): { x: number; z: number } {
        const offsetX = (width * this.tileSize) / 2;
        const offsetZ = (height * this.tileSize) / 2;
        const gx = Math.floor((worldX + offsetX) / this.tileSize);
        const gz = Math.floor((worldZ + offsetZ) / this.tileSize);
        return {
            x: Math.max(1, Math.min(width - 2, gx)),
            z: Math.max(1, Math.min(height - 2, gz)),
        };
    }

    private clearArea(grid: number[][], cx: number, cz: number, radius: number): void {
        const height = grid.length;
        const width = grid[0]?.length ?? 0;
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = cx + dx;
                const z = cz + dz;
                if (x < 1 || z < 1 || x >= width - 1 || z >= height - 1) continue;
                grid[z][x] = TileType.FLOOR;
            }
        }
    }

    private getSharedTileMesh(): Mesh {
        if (this._sharedTileMesh) return this._sharedTileMesh;
        this._sharedTileMesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );
        return this._sharedTileMesh;
    }

    private getSharedGroundMesh(): Mesh {
        if (this._sharedGroundMesh) return this._sharedGroundMesh;
        this._sharedGroundMesh = utils.MeshUtils.createMesh(
            primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 })
        );
        return this._sharedGroundMesh;
    }

    private getOrCreateGeneratedRoot(): Node {
        let root = this.node.getChildByName(MapGenerator.GENERATED_ROOT_NAME);
        if (root && root.isValid) return root;

        root = new Node(MapGenerator.GENERATED_ROOT_NAME);
        this.node.addChild(root);
        root.layer = this.node.layer;
        return root;
    }

    private async spawnNatureShowcase(cols: number, rows: number): Promise<void> {
        const modelDefs: NatureModelDef[] = [
            // Trees (keep sparse and large, mostly near edges)
            {
                basePath: 'models/nature/Tree_1_A_Color1',
                category: 'tree',
                weight: 1.0,
                scaleMin: 0.9,
                scaleMax: 1.75,
                radius: 1.9,
                avoidLaneWorld: 5.6,
                edgeBias: 0.08,
                clusterChance: 0.28,
            },
            {
                basePath: 'models/nature/Tree_3_A_Color1',
                category: 'tree',
                weight: 1.0,
                scaleMin: 0.94,
                scaleMax: 1.82,
                radius: 2.1,
                avoidLaneWorld: 5.8,
                edgeBias: 0.08,
                clusterChance: 0.28,
            },
            // Bushes (medium density, often around trees/rocks)
            {
                basePath: 'models/nature/Bush_1_A_Color1',
                category: 'bush',
                weight: 1.35,
                scaleMin: 0.72,
                scaleMax: 1.28,
                radius: 0.95,
                avoidLaneWorld: 2.2,
                edgeBias: 0.12,
                clusterChance: 0.34,
            },
            {
                basePath: 'models/nature/Bush_2_A_Color1',
                category: 'bush',
                weight: 1.35,
                scaleMin: 0.7,
                scaleMax: 1.24,
                radius: 0.9,
                avoidLaneWorld: 2.2,
                edgeBias: 0.12,
                clusterChance: 0.34,
            },
            {
                basePath: 'models/nature/Bush_3_A_Color1',
                category: 'bush',
                weight: 0.95,
                scaleMin: 0.76,
                scaleMax: 1.34,
                radius: 1.0,
                avoidLaneWorld: 2.3,
                edgeBias: 0.12,
                clusterChance: 0.36,
            },
            {
                basePath: 'models/nature/Bush_4_A_Color1',
                category: 'bush',
                weight: 0.95,
                scaleMin: 0.7,
                scaleMax: 1.22,
                radius: 0.92,
                avoidLaneWorld: 2.2,
                edgeBias: 0.12,
                clusterChance: 0.34,
            },
            // Rocks (edge + transition fillers)
            {
                basePath: 'models/nature/Rock_1_A_Color1',
                category: 'rock',
                weight: 1.0,
                scaleMin: 0.9,
                scaleMax: 1.3,
                radius: 1.12,
                avoidLaneWorld: 2.8,
                edgeBias: 0.42,
                clusterChance: 0.46,
            },
            {
                basePath: 'models/nature/Rock_2_A_Color1',
                category: 'rock',
                weight: 1.0,
                scaleMin: 0.9,
                scaleMax: 1.25,
                radius: 1.02,
                avoidLaneWorld: 2.7,
                edgeBias: 0.4,
                clusterChance: 0.46,
            },
            {
                basePath: 'models/nature/Rock_3_A_Color1',
                category: 'rock',
                weight: 1.1,
                scaleMin: 0.9,
                scaleMax: 1.35,
                radius: 1.18,
                avoidLaneWorld: 2.9,
                edgeBias: 0.42,
                clusterChance: 0.46,
            },
            // Grasses (high density, mostly clustered)
            {
                basePath: 'models/nature/Grass_1_A_Color1',
                category: 'grass',
                weight: 1.0,
                scaleMin: 0.45,
                scaleMax: 1.02,
                radius: 0.36,
                avoidLaneWorld: 3.1,
                edgeBias: 0.08,
                clusterChance: 0.96,
                grassPattern: 'patch',
            },
        ];

        const available = await this.loadAvailableNaturePrefabs(modelDefs);
        if (available.length <= 0) {
            console.warn('[MapGenerator] No nature prefabs available, skipping nature placement.');
            return;
        }

        const root = this.getOrCreateGeneratedRoot();
        const natureRoot = new Node('NatureWorld');
        natureRoot.layer = root.layer;
        root.addChild(natureRoot);

        const worldW = cols * this.tileSize;
        const worldH = rows * this.tileSize;
        const halfW = worldW * 0.5;
        const halfH = worldH * 0.5;
        const minEdgeInset = 4.2;
        const edgeBandDepth = 5.0;
        const density = Math.max(0.8, Math.min(1.3, (cols * rows) / (28 * 28)));
        const targetCounts: Record<NatureCategory, number> = {
            tree: Math.max(34, Math.round(64 * density)),
            rock: Math.max(28, Math.round(58 * density)),
            bush: Math.max(30, Math.round(62 * density)),
            grass: 0,
        };
        const grassScatterTarget = 0;
        const grassPatchTarget = Math.max(150, Math.round(320 * density));
        const buildingZones = this.getNatureBuildingExclusionZones();
        const lanePolylines = this.getLanePolylinesNormalized();
        const placed: NaturePlacement[] = [];
        const rng = this.createSeededRandom(cols * 928371 + rows * 364479 + 1337);
        let placedCount = 0;

        const treePool = available.filter(item => item.category === 'tree');
        if (treePool.length > 0) {
            const roadsideMiniTrees = this.placeRoadsideMiniTrees({
                root: natureRoot,
                treeModels: treePool,
                placed,
                buildingZones,
                lanePolylines,
                halfW,
                halfH,
                worldMin: Math.min(worldW, worldH),
                rng,
                startIndex: placedCount,
            });
            placedCount += roadsideMiniTrees;
            console.debug(`[MapGenerator] Roadside mini trees placed: ${roadsideMiniTrees}`);
        }

        const categories: NatureCategory[] = ['tree', 'rock', 'bush'];
        for (const category of categories) {
            const pool = available.filter(item => item.category === category);
            if (pool.length <= 0) continue;
            const totalToPlace = targetCounts[category];
            for (let i = 0; i < totalToPlace; i++) {
                const model = this.pickWeightedNatureModel(pool, rng);
                const scaleT =
                    model.category === 'grass'
                        ? Math.pow(rng(), 1.8)
                        : model.category === 'tree'
                          ? Math.pow(rng(), 0.55)
                          : model.category === 'bush'
                            ? Math.pow(rng(), 1.15)
                            : rng();
                const scale = this.lerp(model.scaleMin, model.scaleMax, scaleT);
                const radius = model.radius * scale;
                const point = this.sampleNaturePoint({
                    model,
                    scale,
                    radius,
                    halfW,
                    halfH,
                    minEdgeInset,
                    edgeBandDepth,
                    placed,
                    buildingZones,
                    lanePolylines,
                    worldMin: Math.min(worldW, worldH),
                    rng,
                });
                if (!point) continue;

                const node = this.instantiateNatureNode(model, natureRoot, placedCount);
                if (!node) continue;

                const tiltX =
                    model.category === 'grass'
                        ? this.lerp(-6, 6, rng())
                        : model.category === 'tree'
                          ? this.lerp(-8, 8, rng())
                          : 0;
                const tiltZ =
                    model.category === 'grass'
                        ? this.lerp(-6, 6, rng())
                        : model.category === 'tree'
                          ? this.lerp(-6, 6, rng())
                          : 0;
                node.setPosition(point.x, 0, point.z);
                node.setRotationFromEuler(tiltX, this.lerp(0, 360, rng()), tiltZ);
                if (model.category === 'tree') {
                    const sx = scale * this.lerp(0.9, 1.16, rng());
                    const sy = scale * this.lerp(0.94, 1.2, rng());
                    const sz = scale * this.lerp(0.9, 1.16, rng());
                    node.setScale(sx, sy, sz);
                } else {
                    node.setScale(scale, scale, scale);
                }

                placed.push({ x: point.x, z: point.z, radius, category: model.category });
                placedCount++;
            }
        }

        const grassPatchPool = available.filter(
            item => item.category === 'grass' && item.grassPattern === 'patch'
        );
        if (grassPatchPool.length > 0) {
            placedCount += this.placeGrassPatchGroups({
                root: natureRoot,
                models: grassPatchPool,
                targetTotal: grassPatchTarget,
                placed,
                buildingZones,
                lanePolylines,
                halfW,
                halfH,
                minEdgeInset,
                worldMin: Math.min(worldW, worldH),
                rng,
                startIndex: placedCount,
            });
        }

        const grassScatterPool = available.filter(
            item => item.category === 'grass' && item.grassPattern !== 'patch'
        );
        if (grassScatterPool.length > 0) {
            for (let i = 0; i < grassScatterTarget; i++) {
                const model = this.pickWeightedNatureModel(grassScatterPool, rng);
                const scaleT = Math.pow(rng(), 1.9);
                const scale = this.lerp(model.scaleMin, model.scaleMax, scaleT);
                const radius = model.radius * scale;
                const point = this.sampleNaturePoint({
                    model,
                    scale,
                    radius,
                    halfW,
                    halfH,
                    minEdgeInset,
                    edgeBandDepth,
                    placed,
                    buildingZones,
                    lanePolylines,
                    worldMin: Math.min(worldW, worldH),
                    rng,
                });
                if (!point) continue;

                const node = this.instantiateNatureNode(model, natureRoot, placedCount);
                if (!node) continue;

                node.setPosition(point.x, 0, point.z);
                node.setRotationFromEuler(
                    this.lerp(-7, 7, rng()),
                    this.lerp(0, 360, rng()),
                    this.lerp(-7, 7, rng())
                );
                node.setScale(scale, scale, scale);

                placed.push({ x: point.x, z: point.z, radius, category: model.category });
                placedCount++;
            }
        }

        console.debug(`[MapGenerator] Nature placed: ${placedCount} instances.`);
    }

    private placeRoadsideMiniTrees(opts: {
        root: Node;
        treeModels: NatureModelPrefab[];
        placed: NaturePlacement[];
        buildingZones: NatureZone[];
        lanePolylines: Array<Array<{ x: number; z: number }>>;
        halfW: number;
        halfH: number;
        worldMin: number;
        rng: () => number;
        startIndex: number;
    }): number {
        const {
            root,
            treeModels,
            placed,
            buildingZones,
            lanePolylines,
            halfW,
            halfH,
            worldMin,
            rng,
            startIndex,
        } = opts;
        if (treeModels.length <= 0) return 0;

        let created = 0;
        const world = Math.max(1, worldMin);
        const spacingWorld = 4.8;
        const startInsetWorld = 1.6;
        const endInsetWorld = 1.2;

        for (let laneIndex = 0; laneIndex < lanePolylines.length; laneIndex++) {
            const lane = lanePolylines[laneIndex];
            if (lane.length < 2) continue;

            const worldPoints = lane.map(p => this.laneNormalizedToWorld(p.x, p.z, halfW, halfH));
            const segLens: number[] = [];
            let totalLen = 0;
            for (let i = 0; i < worldPoints.length - 1; i++) {
                const dx = worldPoints[i + 1].x - worldPoints[i].x;
                const dz = worldPoints[i + 1].z - worldPoints[i].z;
                const len = Math.sqrt(dx * dx + dz * dz);
                segLens.push(len);
                totalLen += len;
            }
            if (totalLen <= startInsetWorld + endInsetWorld + 2.0) continue;

            let walked = 0;
            let nextDist = startInsetWorld;
            for (let s = 0; s < segLens.length; s++) {
                const segLen = segLens[s];
                if (segLen <= 0.001) {
                    walked += segLen;
                    continue;
                }
                const p0 = worldPoints[s];
                const p1 = worldPoints[s + 1];
                const tx = (p1.x - p0.x) / segLen;
                const tz = (p1.z - p0.z) / segLen;
                const nx = -tz;
                const nz = tx;

                while (nextDist <= walked + segLen && nextDist < totalLen - endInsetWorld) {
                    const local = nextDist - walked;
                    const t = local / segLen;
                    const px = this.lerp(p0.x, p1.x, t);
                    const pz = this.lerp(p0.z, p1.z, t);
                    const laneHalfWorld = this.getLaneHalfWidthNormalized(laneIndex) * world;
                    const roadsideEdgeOffset = laneIndex === 1 ? 3.0 : 0.72;
                    const baseOffset = laneHalfWorld + roadsideEdgeOffset;

                    for (const side of [-1, 1]) {
                        if (rng() < 0.35) continue;
                        let planted = false;
                        for (let attempt = 0; attempt < 2 && !planted; attempt++) {
                            const offsetJitter =
                                laneIndex === 1
                                    ? this.lerp(0.2, 0.7, rng())
                                    : this.lerp(-0.12, 0.12, rng());
                            const offset = baseOffset + offsetJitter;
                            const alongJitter = this.lerp(-0.72, 0.72, rng());
                            const x = px + tx * alongJitter + nx * offset * side;
                            const z = pz + tz * alongJitter + nz * offset * side;
                            if (
                                x < -halfW + 1.2 ||
                                x > halfW - 1.2 ||
                                z < -halfH + 1.2 ||
                                z > halfH - 1.2
                            )
                                continue;

                            const model = this.pickWeightedNatureModel(treeModels, rng);
                            const miniScaleFactor = this.lerp(0.48, 0.84, Math.pow(rng(), 0.72));
                            const baseScaleT = Math.pow(rng(), 0.65);
                            const scale =
                                this.lerp(model.scaleMin, model.scaleMax, baseScaleT) *
                                miniScaleFactor;
                            const radius = model.radius * scale * 0.44;
                            if (this.isInsideBuildingKeepout(x, z, buildingZones, 1.0)) continue;
                            if (
                                !this.isRoadsideMiniTreePointValid(
                                    x,
                                    z,
                                    radius,
                                    placed,
                                    buildingZones
                                )
                            )
                                continue;

                            const node = this.instantiateNatureNode(
                                model,
                                root,
                                startIndex + created
                            );
                            if (!node) continue;
                            node.setPosition(x, 0, z);
                            node.setRotationFromEuler(
                                this.lerp(-5, 5, rng()),
                                this.lerp(0, 360, rng()),
                                this.lerp(-4, 4, rng())
                            );
                            node.setScale(
                                scale * this.lerp(0.88, 1.1, rng()),
                                scale * this.lerp(0.92, 1.16, rng()),
                                scale * this.lerp(0.88, 1.1, rng())
                            );
                            placed.push({ x, z, radius, category: 'tree' });
                            created++;
                            planted = true;
                        }
                    }

                    nextDist += spacingWorld + this.lerp(-0.45, 0.45, rng());
                }
                walked += segLen;
            }
        }
        return created;
    }

    private isRoadsideMiniTreePointValid(
        x: number,
        z: number,
        radius: number,
        placed: NaturePlacement[],
        buildingZones: NatureZone[]
    ): boolean {
        for (const zone of buildingZones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            const rr = zone.radius + radius;
            if (dx * dx + dz * dz < rr * rr) return false;
        }
        for (const p of placed) {
            // Allow roadside mini trees to coexist with grass and small bushes.
            if (p.category === 'grass' || p.category === 'bush') continue;
            const dx = x - p.x;
            const dz = z - p.z;
            const rr = p.radius + radius;
            if (dx * dx + dz * dz < rr * rr) return false;
        }
        return true;
    }

    private placeNatureBiomeClusters(opts: {
        root: Node;
        treeModels: NatureModelPrefab[];
        rockModels: NatureModelPrefab[];
        bushModels: NatureModelPrefab[];
        grassModels: NatureModelPrefab[];
        clusterCount: number;
        placed: NaturePlacement[];
        buildingZones: NatureZone[];
        lanePolylines: Array<Array<{ x: number; z: number }>>;
        halfW: number;
        halfH: number;
        minEdgeInset: number;
        worldMin: number;
        rng: () => number;
        startIndex: number;
    }): number {
        const {
            root,
            treeModels,
            rockModels,
            bushModels,
            grassModels,
            clusterCount,
            placed,
            buildingZones,
            lanePolylines,
            halfW,
            halfH,
            minEdgeInset,
            worldMin,
            rng,
            startIndex,
        } = opts;

        let created = 0;
        const world = Math.max(1, worldMin);
        for (let i = 0; i < clusterCount; i++) {
            let cx = 0;
            let cz = 0;
            let foundCenter = false;
            for (let attempt = 0; attempt < 480; attempt++) {
                cx = this.lerp(-halfW + minEdgeInset, halfW - minEdgeInset, rng());
                cz = this.lerp(-halfH + minEdgeInset, halfH - minEdgeInset, rng());
                if (!this.isNaturePointValid(cx, cz, 1.0, placed, buildingZones)) continue;
                if (this.isInsideBuildingKeepout(cx, cz, buildingZones, 1.25)) continue;
                const lanePos = this.worldToLaneNormalized(cx, cz, halfW, halfH);
                const laneInfo = this.getClosestLaneEdgeInfo(lanePos.nx, lanePos.nz, lanePolylines);
                const minCenterClearance = laneInfo.laneIndex === 2 ? 1.6 / world : 2.7 / world;
                if (laneInfo.edgeDist < minCenterClearance) continue;
                foundCenter = true;
                break;
            }
            if (!foundCenter) continue;

            const clusterRadius = this.lerp(2.2, 4.4, rng());
            created += this.placeClusteredNatureSet({
                root,
                models: grassModels,
                category: 'grass',
                count: Math.floor(this.lerp(12, 28, rng())),
                centerX: cx,
                centerZ: cz,
                clusterRadius,
                placed,
                buildingZones,
                lanePolylines,
                halfW,
                halfH,
                worldMin,
                rng,
                startIndex: startIndex + created,
            });
            created += this.placeClusteredNatureSet({
                root,
                models: bushModels,
                category: 'bush',
                count: Math.floor(this.lerp(4, 11, rng())),
                centerX: cx,
                centerZ: cz,
                clusterRadius,
                placed,
                buildingZones,
                lanePolylines,
                halfW,
                halfH,
                worldMin,
                rng,
                startIndex: startIndex + created,
            });
            created += this.placeClusteredNatureSet({
                root,
                models: rockModels,
                category: 'rock',
                count: Math.floor(this.lerp(2, 6, rng())),
                centerX: cx,
                centerZ: cz,
                clusterRadius,
                placed,
                buildingZones,
                lanePolylines,
                halfW,
                halfH,
                worldMin,
                rng,
                startIndex: startIndex + created,
            });
            if (rng() < 0.7) {
                created += this.placeClusteredNatureSet({
                    root,
                    models: treeModels,
                    category: 'tree',
                    count: rng() < 0.32 ? 2 : 1,
                    centerX: cx,
                    centerZ: cz,
                    clusterRadius,
                    placed,
                    buildingZones,
                    lanePolylines,
                    halfW,
                    halfH,
                    worldMin,
                    rng,
                    startIndex: startIndex + created,
                });
            }
        }
        return created;
    }

    private placeClusteredNatureSet(opts: {
        root: Node;
        models: NatureModelPrefab[];
        category: NatureCategory;
        count: number;
        centerX: number;
        centerZ: number;
        clusterRadius: number;
        placed: NaturePlacement[];
        buildingZones: NatureZone[];
        lanePolylines: Array<Array<{ x: number; z: number }>>;
        halfW: number;
        halfH: number;
        worldMin: number;
        rng: () => number;
        startIndex: number;
    }): number {
        const {
            root,
            models,
            category,
            count,
            centerX,
            centerZ,
            clusterRadius,
            placed,
            buildingZones,
            lanePolylines,
            halfW,
            halfH,
            worldMin,
            rng,
            startIndex,
        } = opts;
        if (models.length <= 0 || count <= 0) return 0;

        let created = 0;
        const world = Math.max(1, worldMin);
        const maxAttempts = Math.max(24, count * 18);
        for (let attempt = 0; attempt < maxAttempts && created < count; attempt++) {
            const model = this.pickWeightedNatureModel(models, rng);
            const scaleT = category === 'grass' ? Math.pow(rng(), 1.7) : rng();
            const scale = this.lerp(model.scaleMin, model.scaleMax, scaleT);
            const baseRadius = model.radius * scale;
            const placementRadius =
                category === 'grass'
                    ? baseRadius * 0.42
                    : category === 'bush'
                      ? baseRadius * 0.62
                      : category === 'rock'
                        ? baseRadius * 0.75
                        : baseRadius * 0.8;

            const angle = this.lerp(0, Math.PI * 2, rng());
            const radial = clusterRadius * Math.pow(rng(), 0.6);
            const x = centerX + Math.cos(angle) * radial + this.lerp(-0.2, 0.2, rng());
            const z = centerZ + Math.sin(angle) * radial + this.lerp(-0.2, 0.2, rng());
            if (x < -halfW + 1.2 || x > halfW - 1.2 || z < -halfH + 1.2 || z > halfH - 1.2)
                continue;
            if (category === 'tree') {
                const edgeMarginWorld = 7.2;
                const edgeDistWorld = Math.min(halfW - Math.abs(x), halfH - Math.abs(z));
                if (edgeDistWorld < edgeMarginWorld) continue;
            }
            const buildingPadding =
                category === 'grass'
                    ? 0.95
                    : category === 'bush'
                      ? 0.75
                      : category === 'rock'
                        ? 0.8
                        : 1.1;
            if (this.isInsideBuildingKeepout(x, z, buildingZones, buildingPadding)) continue;
            if (!this.isNaturePointValid(x, z, placementRadius, placed, buildingZones)) continue;

            const lanePos = this.worldToLaneNormalized(x, z, halfW, halfH);
            const laneInfo = this.getClosestLaneEdgeInfo(lanePos.nx, lanePos.nz, lanePolylines);
            const radiusNorm = placementRadius / world;
            const hardLaneKeepoutNorm =
                category === 'grass'
                    ? 1.05 / world
                    : category === 'tree'
                      ? 1.45 / world
                      : 0.92 / world;
            if (laneInfo.edgeDist < hardLaneKeepoutNorm) continue;
            const laneSafetyNorm =
                category === 'grass'
                    ? 0.004 + radiusNorm * 0.3
                    : category === 'rock'
                      ? 0.012 + radiusNorm * 0.62
                      : 0.014 + radiusNorm * 0.66;
            const laneExtraNorm = this.getLaneExtraClearanceNorm(
                laneInfo.laneIndex,
                worldMin,
                category === 'grass'
            );
            const laneThresholdNorm = model.avoidLaneWorld / world;
            if (laneInfo.edgeDist < laneThresholdNorm * 0.52 + laneSafetyNorm + laneExtraNorm)
                continue;

            const node = this.instantiateNatureNode(model, root, startIndex + created);
            if (!node) continue;
            node.setPosition(x, 0, z);
            if (category === 'grass') {
                node.setRotationFromEuler(
                    this.lerp(-5, 5, rng()),
                    this.lerp(0, 360, rng()),
                    this.lerp(-5, 5, rng())
                );
            } else if (category === 'tree') {
                node.setRotationFromEuler(
                    this.lerp(-8, 8, rng()),
                    this.lerp(0, 360, rng()),
                    this.lerp(-6, 6, rng())
                );
            } else {
                node.setRotationFromEuler(0, this.lerp(0, 360, rng()), 0);
            }
            if (category === 'tree') {
                node.setScale(
                    scale * this.lerp(0.9, 1.16, rng()),
                    scale * this.lerp(0.94, 1.2, rng()),
                    scale * this.lerp(0.9, 1.16, rng())
                );
            } else {
                node.setScale(scale, scale, scale);
            }
            placed.push({ x, z, radius: placementRadius, category });
            created++;
        }
        return created;
    }

    private async loadAvailableNaturePrefabs(
        modelDefs: NatureModelDef[]
    ): Promise<NatureModelPrefab[]> {
        const available: NatureModelPrefab[] = [];
        for (const def of modelDefs) {
            const modelName = def.basePath.split('/').pop() || 'NatureModel';
            const prefab = await this.loadPrefabWithFallbacks([
                def.basePath,
                `${def.basePath}/${modelName}`,
            ]);
            if (!prefab) continue;
            available.push({ ...def, prefab, modelName });
        }
        return available;
    }

    private async loadPrefabWithFallbacks(paths: string[]): Promise<Prefab | null> {
        for (const path of paths) {
            const prefab = await this.loadPrefab(path);
            if (prefab) return prefab;
        }
        return null;
    }

    private loadPrefab(path: string): Promise<Prefab | null> {
        return new Promise(resolve => {
            resources.load(path, Prefab, (err, prefab) => {
                if (err || !prefab) return resolve(null);
                resolve(prefab);
            });
        });
    }

    private instantiateNatureNode(
        model: NatureModelPrefab,
        parent: Node,
        index: number
    ): Node | null {
        if (!parent || !parent.isValid) return null;
        const prefab = model.prefab;
        const prefabValid = !!prefab && !!(prefab as unknown as { isValid?: boolean }).isValid;
        if (!prefabValid) return null;
        try {
            const node = instantiate(prefab);
            if (!node || !node.isValid) return null;
            node.name = `${model.modelName}_${index}`;
            this.applyLayerRecursive(node, parent.layer);
            this.applyNatureShadowSettingsRecursive(node, model.category);
            this.applyNatureProjectileBlocker(node, model.category, model.radius);
            parent.addChild(node);
            return node;
        } catch (e) {
            console.warn('[MapGenerator] instantiate nature prefab failed', model.basePath, e);
            return null;
        }
    }

    private applyNatureProjectileBlocker(
        root: Node,
        category: NatureCategory,
        modelBaseRadius: number
    ): void {
        if (category !== 'tree' && category !== 'rock') return;

        const radiusScale =
            category === 'tree'
                ? MapGenerator.NATURE_BLOCKER_TREE_RADIUS_SCALE
                : MapGenerator.NATURE_BLOCKER_ROCK_RADIUS_SCALE;
        const tunedBaseRadius = Math.max(
            MapGenerator.NATURE_BLOCKER_MIN_RADIUS,
            modelBaseRadius * radiusScale
        );
        const blockerRadius = tunedBaseRadius * MapGenerator.NATURE_BLOCKER_FOOTPRINT_SCALE;

        let blocker = root.getComponent(ProjectileBlocker);
        if (!blocker) {
            blocker = root.addComponent(ProjectileBlocker);
        }
        blocker.baseRadius = blockerRadius;

        let collider = root.getComponent(BoxCollider);
        if (!collider) {
            collider = root.addComponent(BoxCollider);
        }
        collider.isTrigger = false;
        collider.size = new Vec3(
            blockerRadius * 2,
            MapGenerator.NATURE_BLOCKER_HEIGHT,
            blockerRadius * 2
        );
        collider.center = new Vec3(0, MapGenerator.NATURE_BLOCKER_CENTER_Y, 0);
        collider.setGroup(MapGenerator.PHYSICS_GROUP_PROJECTILE_BLOCKER);
        collider.setMask(0xffffffff);
    }

    private applyNatureShadowSettingsRecursive(root: Node, category: NatureCategory): void {
        const castShadowEnabled = this.shouldNatureCastShadow(category);
        const renderers = root.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            renderer.shadowCastingMode = castShadowEnabled ? 1 : 0;
            renderer.receiveShadow = 1;
        }
    }

    private shouldNatureCastShadow(_category: NatureCategory): boolean {
        return true;
    }

    private placeGrassPatchGroups(opts: {
        root: Node;
        models: NatureModelPrefab[];
        targetTotal: number;
        placed: NaturePlacement[];
        buildingZones: NatureZone[];
        lanePolylines: Array<Array<{ x: number; z: number }>>;
        halfW: number;
        halfH: number;
        minEdgeInset: number;
        worldMin: number;
        rng: () => number;
        startIndex: number;
    }): number {
        const {
            root,
            models,
            targetTotal,
            placed,
            buildingZones,
            lanePolylines,
            halfW,
            halfH,
            minEdgeInset,
            worldMin,
            rng,
            startIndex,
        } = opts;

        let created = 0;
        const patchCount = Math.max(12, Math.round(targetTotal / 22));
        const laneThresholdNorm = 1.35 / Math.max(1, worldMin);

        for (let p = 0; p < patchCount && created < targetTotal; p++) {
            let centerX = 0;
            let centerZ = 0;
            let foundCenter = false;
            for (let attempt = 0; attempt < 420; attempt++) {
                centerX = this.lerp(-halfW + minEdgeInset, halfW - minEdgeInset, rng());
                centerZ = this.lerp(-halfH + minEdgeInset, halfH - minEdgeInset, rng());
                if (!this.isNaturePointValid(centerX, centerZ, 0.72, placed, buildingZones))
                    continue;
                if (this.isInsideBuildingKeepout(centerX, centerZ, buildingZones, 1.0)) continue;

                const lanePos = this.worldToLaneNormalized(centerX, centerZ, halfW, halfH);
                const laneInfo = this.getClosestLaneEdgeInfo(lanePos.nx, lanePos.nz, lanePolylines);
                const laneEdgeDist = laneInfo.edgeDist;
                const hardLaneKeepoutNorm = 1.15 / Math.max(1, worldMin);
                if (laneEdgeDist < hardLaneKeepoutNorm) continue;
                const laneExtraNorm = this.getLaneExtraClearanceNorm(
                    laneInfo.laneIndex,
                    worldMin,
                    true
                );
                const patchGuardNorm = 0.16 / Math.max(1, worldMin);
                if (laneEdgeDist < laneThresholdNorm * 1.1 + patchGuardNorm + laneExtraNorm)
                    continue;
                foundCenter = true;
                break;
            }
            if (!foundCenter) continue;

            const angle = this.pickGeometricPatchAngle(rng);
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const spacing = this.lerp(0.105, 0.145, rng());
            const cols = Math.floor(this.lerp(4, 8, rng()));
            const rows = Math.floor(this.lerp(4, 7, rng()));
            const halfCols = (cols - 1) * 0.5;
            const halfRows = (rows - 1) * 0.5;

            for (let iz = 0; iz < rows && created < targetTotal; iz++) {
                for (let ix = 0; ix < cols && created < targetTotal; ix++) {
                    if (rng() < 0.03) continue;

                    const localX = (ix - halfCols) * spacing;
                    const localZ = (iz - halfRows) * spacing;
                    const nxRect = Math.abs(ix - halfCols) / Math.max(1, halfCols);
                    const nzRect = Math.abs(iz - halfRows) / Math.max(1, halfRows);
                    // Rounded-rectangle cutoff to keep "geometric patch" silhouette.
                    if (nxRect + nzRect > 1.96) continue;

                    const jitterX = this.lerp(-0.016, 0.016, rng());
                    const jitterZ = this.lerp(-0.016, 0.016, rng());
                    const x = centerX + (localX + jitterX) * cosA - (localZ + jitterZ) * sinA;
                    const z = centerZ + (localX + jitterX) * sinA + (localZ + jitterZ) * cosA;
                    const lanePos = this.worldToLaneNormalized(x, z, halfW, halfH);
                    const model = this.pickWeightedNatureModel(models, rng);
                    const scale = this.lerp(model.scaleMin, model.scaleMax, Math.pow(rng(), 1.55));
                    const radius = 0.07 * scale;
                    const laneInfo = this.getClosestLaneEdgeInfo(
                        lanePos.nx,
                        lanePos.nz,
                        lanePolylines
                    );
                    const laneEdgeDist = laneInfo.edgeDist;
                    const hardLaneKeepoutNorm = 1.05 / Math.max(1, worldMin);
                    if (laneEdgeDist < hardLaneKeepoutNorm) continue;
                    const laneKeepoutNorm =
                        laneThresholdNorm * 0.65 +
                        0.001 +
                        radius / Math.max(1, worldMin) +
                        this.getLaneExtraClearanceNorm(laneInfo.laneIndex, worldMin, true);
                    if (laneEdgeDist < laneKeepoutNorm) continue;
                    if (this.isInsideBuildingKeepout(x, z, buildingZones, 0.85)) continue;
                    if (!this.isNaturePointValid(x, z, radius, placed, buildingZones)) continue;
                    const node = this.instantiateNatureNode(model, root, startIndex + created);
                    if (!node) continue;

                    node.setPosition(x, 0, z);
                    node.setRotationFromEuler(
                        this.lerp(-4, 4, rng()),
                        this.lerp(-12, 12, rng()) + (angle * 180) / Math.PI,
                        this.lerp(-4, 4, rng())
                    );
                    node.setScale(scale, scale, scale);

                    placed.push({ x, z, radius, category: 'grass' });
                    created++;
                }
            }
        }
        return created;
    }

    private pickGeometricPatchAngle(rng: () => number): number {
        const angles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75];
        const idx = Math.floor(rng() * angles.length) % angles.length;
        return angles[idx];
    }

    private sampleNaturePoint(opts: {
        model: NatureModelPrefab;
        scale: number;
        radius: number;
        halfW: number;
        halfH: number;
        minEdgeInset: number;
        edgeBandDepth: number;
        placed: NaturePlacement[];
        buildingZones: NatureZone[];
        lanePolylines: Array<Array<{ x: number; z: number }>>;
        worldMin: number;
        rng: () => number;
    }): { x: number; z: number } | null {
        const {
            model,
            radius,
            halfW,
            halfH,
            minEdgeInset,
            edgeBandDepth,
            placed,
            buildingZones,
            lanePolylines,
            worldMin,
            rng,
        } = opts;

        const anchorCandidates = placed.filter(p =>
            model.category === 'grass'
                ? p.category === 'grass' || p.category === 'bush' || p.category === 'rock'
                : p.category === 'tree' || p.category === 'rock'
        );
        const laneThresholdNorm = model.avoidLaneWorld / Math.max(1, worldMin);
        const minGap = model.category === 'grass' ? 0.01 : model.category === 'rock' ? 0.95 : 0.4;
        const attemptLimit =
            model.category === 'grass' ? 2200 : model.category === 'rock' ? 500 : 260;
        const clusterRadiusMax = model.category === 'grass' ? 1.45 : 4.2;

        for (let attempt = 0; attempt < attemptLimit; attempt++) {
            let x = 0;
            let z = 0;
            const useCluster =
                anchorCandidates.length > 0 &&
                model.clusterChance > 0 &&
                rng() < model.clusterChance;

            if (useCluster) {
                const anchor = anchorCandidates[Math.floor(rng() * anchorCandidates.length)];
                const angle = this.lerp(0, Math.PI * 2, rng());
                const dist = this.lerp(
                    anchor.radius + radius + minGap,
                    anchor.radius + radius + clusterRadiusMax,
                    rng()
                );
                x = anchor.x + Math.cos(angle) * dist;
                z = anchor.z + Math.sin(angle) * dist;
            } else if (rng() < model.edgeBias) {
                const side = Math.floor(rng() * 4);
                if (side === 0) {
                    x = this.lerp(
                        -halfW + minEdgeInset,
                        -halfW + minEdgeInset + edgeBandDepth,
                        rng()
                    );
                    z = this.lerp(-halfH + minEdgeInset, halfH - minEdgeInset, rng());
                } else if (side === 1) {
                    x = this.lerp(
                        halfW - minEdgeInset - edgeBandDepth,
                        halfW - minEdgeInset,
                        rng()
                    );
                    z = this.lerp(-halfH + minEdgeInset, halfH - minEdgeInset, rng());
                } else if (side === 2) {
                    x = this.lerp(-halfW + minEdgeInset, halfW - minEdgeInset, rng());
                    z = this.lerp(
                        -halfH + minEdgeInset,
                        -halfH + minEdgeInset + edgeBandDepth,
                        rng()
                    );
                } else {
                    x = this.lerp(-halfW + minEdgeInset, halfW - minEdgeInset, rng());
                    z = this.lerp(
                        halfH - minEdgeInset - edgeBandDepth,
                        halfH - minEdgeInset,
                        rng()
                    );
                }
            } else {
                x = this.lerp(-halfW + minEdgeInset, halfW - minEdgeInset, rng());
                z = this.lerp(-halfH + minEdgeInset, halfH - minEdgeInset, rng());
            }

            if (model.category === 'tree') {
                // Keep trees away from outer boundary so they sit in central green space.
                const edgeMarginWorld = 7.2;
                const edgeDistWorld = Math.min(halfW - Math.abs(x), halfH - Math.abs(z));
                if (edgeDistWorld < edgeMarginWorld) continue;
            }
            const buildingPadding =
                model.category === 'grass'
                    ? 0.95
                    : model.category === 'bush'
                      ? 0.75
                      : model.category === 'rock'
                        ? 0.8
                        : 1.1;
            if (this.isInsideBuildingKeepout(x, z, buildingZones, buildingPadding)) continue;

            if (!this.isNaturePointValid(x, z, radius, placed, buildingZones)) continue;

            const lanePos = this.worldToLaneNormalized(x, z, halfW, halfH);
            const laneInfo = this.getClosestLaneEdgeInfo(lanePos.nx, lanePos.nz, lanePolylines);
            const laneEdgeDist = laneInfo.edgeDist;
            const radiusNorm = radius / Math.max(1, worldMin);
            const hardLaneKeepoutNorm =
                model.category === 'grass'
                    ? 1.05 / Math.max(1, worldMin)
                    : model.category === 'tree'
                      ? 1.45 / Math.max(1, worldMin)
                      : 0.92 / Math.max(1, worldMin);
            if (laneEdgeDist < hardLaneKeepoutNorm) continue;
            const laneSafetyNorm =
                model.category === 'grass'
                    ? 0.006 + radiusNorm * 0.34
                    : model.category === 'rock'
                      ? 0.018 + radiusNorm * 0.7
                      : 0.022 + radiusNorm * 0.75;
            const laneExtraNorm = this.getLaneExtraClearanceNorm(
                laneInfo.laneIndex,
                worldMin,
                false
            );
            if (laneEdgeDist < laneThresholdNorm + laneSafetyNorm + laneExtraNorm) continue;

            return { x, z };
        }
        return null;
    }

    private isNaturePointValid(
        x: number,
        z: number,
        radius: number,
        placed: NaturePlacement[],
        buildingZones: NatureZone[]
    ): boolean {
        for (const zone of buildingZones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            const rr = zone.radius + radius;
            if (dx * dx + dz * dz < rr * rr) return false;
        }
        for (const p of placed) {
            const dx = x - p.x;
            const dz = z - p.z;
            const rr = p.radius + radius;
            if (dx * dx + dz * dz < rr * rr) return false;
        }
        return true;
    }

    private getClosestLaneEdgeInfo(
        nx: number,
        nz: number,
        lanes: Array<Array<{ x: number; z: number }>>
    ): { edgeDist: number; laneIndex: number } {
        let minEdgeDist = Number.MAX_VALUE;
        let laneIndex = 0;
        for (let i = 0; i < lanes.length; i++) {
            const lane = lanes[i];
            const centerDist = this.distToPolyline(nx, nz, lane);
            const edgeDist = centerDist - this.getLaneHalfWidthNormalized(i);
            if (edgeDist < minEdgeDist) {
                minEdgeDist = edgeDist;
                laneIndex = i;
            }
        }
        return {
            edgeDist:
                minEdgeDist -
                MapGenerator.LANE_EDGE_SOFTNESS_NORM -
                MapGenerator.LANE_NOISE_PAD_NORM,
            laneIndex,
        };
    }

    private getLaneHalfWidthNormalized(index: number): number {
        if (index === 1) return MapGenerator.LANE_HALF_WIDTH_NORM;
        return MapGenerator.LANE_HALF_WIDTH_WIDE_NORM;
    }

    private getLaneExtraClearanceNorm(
        laneIndex: number,
        worldMin: number,
        forPatch: boolean
    ): number {
        const world = Math.max(1, worldMin);
        // top(0)/mid(1) still stricter than bottom(2), but no longer so large that center becomes empty.
        if (laneIndex === 0 || laneIndex === 1) {
            return (forPatch ? 0.95 : 1.5) / world;
        }
        return (forPatch ? 0.45 : 0.55) / world;
    }

    private isInsideBuildingKeepout(
        x: number,
        z: number,
        zones: NatureZone[],
        padding: number
    ): boolean {
        for (const zone of zones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            const rr = zone.radius + padding;
            if (dx * dx + dz * dz < rr * rr) return true;
        }
        return false;
    }

    private worldToLaneNormalized(
        x: number,
        z: number,
        halfW: number,
        halfH: number
    ): { nx: number; nz: number } {
        const nx = (x + halfW) / (halfW * 2);
        // Flip Z so lane sampling matches splatmap coordinate orientation.
        const nz = 1 - (z + halfH) / (halfH * 2);
        return {
            nx: Math.max(0, Math.min(1, nx)),
            nz: Math.max(0, Math.min(1, nz)),
        };
    }

    private laneNormalizedToWorld(
        nx: number,
        nz: number,
        halfW: number,
        halfH: number
    ): { x: number; z: number } {
        const x = nx * (halfW * 2) - halfW;
        const z = (1 - nz) * (halfH * 2) - halfH;
        return { x, z };
    }

    private getLanePolylinesNormalized(): Array<Array<{ x: number; z: number }>> {
        const baseNx = 0.05;
        const baseNz = 0.95;
        const enemyNx = 0.95;
        const enemyNz = 0.05;
        const topLane = [
            { x: baseNx, z: baseNz },
            { x: 0.06, z: 0.92 },
            { x: 0.95, z: 0.92 },
        ];
        const midLane = [
            { x: baseNx, z: baseNz },
            { x: 0.35, z: 0.65 },
            { x: 0.5, z: 0.5 },
            { x: 0.65, z: 0.35 },
            { x: enemyNx, z: enemyNz },
        ];
        const botLane = [
            { x: baseNx, z: baseNz },
            { x: 0.08, z: 0.94 },
            { x: 0.08, z: 0.05 },
        ];
        return [topLane, midLane, botLane];
    }

    private getNatureBuildingExclusionZones(): NatureZone[] {
        const zones: NatureZone[] = [];
        zones.push({
            x: GameConfig.MAP.BASE_SPAWN.x,
            z: GameConfig.MAP.BASE_SPAWN.z,
            radius: 6.2,
        });
        const pads =
            (GameConfig.BUILDING.PADS as ReadonlyArray<{ x: number; z: number; type: string }>) ??
            [];
        for (const pad of pads) {
            let r = 4.2;
            if (pad.type === 'spa') r = 10.2;
            else if (pad.type === 'farm') r = 5.5;
            else if (pad.type === 'barracks') r = 5.6;
            else if (
                pad.type === 'frost_tower' ||
                pad.type === 'lightning_tower' ||
                pad.type === 'tower'
            )
                r = 5.1;
            else if (pad.type === 'wall') r = 4.2;
            zones.push({ x: pad.x, z: pad.z, radius: r });
        }
        return zones;
    }

    private pickWeightedNatureModel(
        models: NatureModelPrefab[],
        rng: () => number
    ): NatureModelPrefab {
        if (models.length === 1) return models[0];
        let total = 0;
        for (const m of models) total += Math.max(0.0001, m.weight);
        let t = rng() * total;
        for (const m of models) {
            t -= Math.max(0.0001, m.weight);
            if (t <= 0) return m;
        }
        return models[models.length - 1];
    }

    private createSeededRandom(seed: number): () => number {
        let s = seed >>> 0 || 1;
        return () => {
            s = (1664525 * s + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    private applyLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) {
            this.applyLayerRecursive(child, layer);
        }
    }
}
