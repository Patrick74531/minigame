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
    Vec4,
    EffectAsset,
} from 'cc';
import { GameConfig } from '../../data/GameConfig';

const { ccclass, property } = _decorator;

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

    // Texture paths (with Cocos sub-asset fallbacks)
    private static readonly GRASS_TEX_PATHS: ReadonlyArray<string> = [
        'floor/tileable_grass_02/texture',
        'floor/tileable_grass_02',
        'floor/tileable_grass_02.webp',
        'floor/tileable_grass_01/texture',
        'floor/tileable_grass_01',
        'floor/tileable_grass_01.webp',
    ];
    private static readonly DIRT_TEX_PATHS: ReadonlyArray<string> = [
        'floor/Dirt_02/texture',
        'floor/Dirt_02',
        'floor/Dirt_02.webp',
    ];
    private static readonly SPLAT_EFFECT_PATH = 'shaders/terrain-splat';

    // Splatmap resolution (pixels)
    private static readonly SPLAT_SIZE = 256;

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

    private pointToSegmentDistance(p: {x:number, z:number}, v: {x:number, z:number}, w: {x:number, z:number}): number {
        const l2 = (v.x - w.x)**2 + (v.z - w.z)**2;
        if (l2 === 0) return Math.sqrt((p.x - v.x)**2 + (p.z - v.z)**2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.z - v.z) * (w.z - v.z)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = v.x + t * (w.x - v.x);
        const projZ = v.z + t * (w.z - v.z);
        return Math.sqrt((p.x - projX)**2 + (p.z - projZ)**2);
    }

    private pointToBezierDistance(p: {x:number, z:number}, p0: {x:number, z:number}, p1: {x:number, z:number}, p2: {x:number, z:number}): number {
        // Approximate distance by sampling
        // Analytical distance to Bezier is complex (solving 5th deg polynomial)
        // Sampling 20 points matches "rasterization" needs for grid
        let minDist = Number.MAX_VALUE;
        const samples = 30;
        for(let i=0; i<=samples; i++) {
            const t = i / samples;
            const it = 1 - t;
            // Quadratic Bezier: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
            const bx = it*it*p0.x + 2*it*t*p1.x + t*t*p2.x;
            const bz = it*it*p0.z + 2*it*t*p1.z + t*t*p2.z;
            const dist = Math.sqrt((p.x - bx)**2 + (p.z - bz)**2);
            if(dist < minDist) minDist = dist;
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
            console.warn('[MapGenerator] Failed to load grass or dirt texture, keeping fallback color');
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
            { x: 0.95, z: 0.92 }     // End at TR (inset Y)
        ];

        // Mid Lane: Diagonal TL -> BR (unchanged)
        const midLane = [
            { x: baseNx, z: baseNz },
            { x: 0.35, z: 0.65 },   
            { x: 0.5, z: 0.5 },     
            { x: 0.65, z: 0.35 },   
            { x: enemyNx, z: enemyNz }
        ];

        // Bot/Left Lane: Strictly Left Edge
        // Start TL -> Go along Left edge -> End at BL corner (0.05, 0.05).
        // Removed segment connecting to BR (Bottom Edge Road).
        const botLane = [ 
            { x: baseNx, z: baseNz },
            { x: 0.08, z: 0.94 },   
            { x: 0.08, z: 0.05 }    // End at BL (inset X) 
        ];

        // Lane half-width in normalized space
        const laneHalfWidth = 0.028;
        // Wider width for Top and Left lanes (user request increased width)
        const laneHalfWidthWide = 0.045;
        // Smoothstep transition width
        const edgeSoftness = 0.025;

        for (let py = 0; py < S; py++) {
            for (let px = 0; px < S; px++) {
                // Normalized coords [0, 1]
                const nx = (px + 0.5) / S;
                const nz = (py + 0.5) / S;

                // Distance to each lane (polyline distance)
                // Top and Bot lanes are wider now
                const dTop = Math.max(0, this.distToPolyline(nx, nz, topLane) - (laneHalfWidthWide - laneHalfWidth));
                const dMid = this.distToPolyline(nx, nz, midLane);
                const dBot = Math.max(0, this.distToPolyline(nx, nz, botLane) - (laneHalfWidthWide - laneHalfWidth));

                const minDist = Math.min(dTop, dMid, dBot);

                // Perlin-like noise for organic edges
                const noiseVal = this.fbmNoise(nx * 18.0, nz * 18.0) * 0.018;
                const adjustedDist = minDist + noiseVal;

                // Smoothstep: 0 at lane center, 1 at edge
                const t = this.smoothstep(laneHalfWidth - edgeSoftness, laneHalfWidth + edgeSoftness, adjustedDist);

                // mask: 1 = dirt (inside lane), 0 = grass (outside)
                const mask = 1.0 - t;
                const byte = Math.floor(Math.max(0, Math.min(1, mask)) * 255);

                const idx = (py * S + px) * 4;
                data[idx + 0] = byte;  // R
                data[idx + 1] = byte;  // G
                data[idx + 2] = byte;  // B
                data[idx + 3] = 255;   // A
            }
        }

        // Create Texture2D from pixel data
        const tex = new Texture2D();
        // Use Texture2D.PixelFormat if available, otherwise use raw value for RGBA8888
        const pixFmt = (Texture2D as unknown as { PixelFormat?: { RGBA8888?: number } }).PixelFormat?.RGBA8888 ?? 35;
        const img = new ImageAsset({
            _data: data,
            _compressed: false,
            width: S,
            height: S,
            format: pixFmt,
        });
        tex.image = img;
        // Set filters: LINEAR = 2
        const filterLinear = (Texture2D as unknown as { Filter?: { LINEAR?: number } }).Filter?.LINEAR ?? 2;
        const texAny = tex as Texture2D & {
            setFilters?: (min: number, mag: number) => void;
            setWrapMode?: (u: number, v: number) => void;
        };
        if (texAny.setFilters) {
            texAny.setFilters(filterLinear, filterLinear);
        }
        // CLAMP_TO_EDGE = 0
        const clamp = (Texture2D as unknown as { WrapMode?: { CLAMP_TO_EDGE?: number } }).WrapMode?.CLAMP_TO_EDGE ?? 0;
        if (texAny.setWrapMode) {
            texAny.setWrapMode(clamp, clamp);
        }
        return tex;
    }

    /** Distance from point (px,pz) to a polyline defined by an array of points */
    private distToPolyline(px: number, pz: number, points: {x: number, z: number}[]): number {
        let minDist = Number.MAX_VALUE;
        for (let i = 0; i < points.length - 1; i++) {
            const d = this.pointToSegmentDistance(
                { x: px, z: pz },
                points[i],
                points[i + 1]
            );
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
}
