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
    Vec4,
} from 'cc';
import { GameConfig } from '../../data/GameConfig';

const { ccclass, property } = _decorator;

export enum TileType {
    EMPTY = 0,
    FLOOR = 1,
    WALL = 2,
    ENEMY_SPAWN = 3,
    PLAYER_SPAWN = 4,
}

@ccclass('MapGenerator')
export class MapGenerator extends Component {
    private static readonly GENERATED_ROOT_NAME = '__GeneratedMap';
    private static readonly GROUND_TEXTURE_PATHS = [
        'floor/tileable_grass_00/texture',
        'floor/tileable_grass_00',
        'floor/tileable_grass_00.webp',
    ];
    private static readonly DIRT_TEXTURE_PATHS = [
        'floor/Dirt_01/texture',
        'floor/Dirt_01',
        'floor/Dirt_01.webp',
    ];

    @property
    public mapWidth: number = 20;

    @property
    public mapHeight: number = 20;

    @property
    public tileSize: number = 2;

    private _colorMaterials: Map<string, Material> = new Map();
    private _sharedTileMesh: Mesh | null = null;
    private _sharedGroundMesh: Mesh | null = null;
    private _buildRoot: Node | null = null;
    private _groundMaterial: Material | null = null;
    private _groundTexLoading: boolean = false;
    private _dirtFieldMaterial: Material | null = null;
    private _dirtTexLoading: boolean = false;

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
        this.clearArea(mapGrid, spawnGrid.x, spawnGrid.z, 1);
        mapGrid[spawnGrid.z][spawnGrid.x] = TileType.PLAYER_SPAWN;
        this.buildMapFromData(mapGrid);
    }

    public generateFromImage(_mapName: string): void {
        this.generateProceduralMap();
    }

    public buildMapFromData(data: number[][]): void {
        this._buildRoot = this.getOrCreateGeneratedRoot();
        this._buildRoot.removeAllChildren();

        const rows = data.length;
        const cols = data[0].length;
        const floorColor = new Color(98, 133, 75, 255);
        const enemyColor = new Color(168, 73, 73, 255);

        this.createGroundPlane(cols, rows, floorColor);
        this.createDirtFieldPatch(cols, rows);

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

    private createGroundPlane(cols: number, rows: number, color: Color): void {
        const node = new Node('GroundPlane');
        (this._buildRoot ?? this.node).addChild(node);
        node.setPosition(0, 0, 0);
        node.setScale(cols * this.tileSize, 1, rows * this.tileSize);
        node.layer = (this._buildRoot ?? this.node).layer;

        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.getSharedGroundMesh();
        renderer.material = this.getGroundMaterial(cols, rows, color);
    }

    private createDirtFieldPatch(cols: number, rows: number): void {
        const node = new Node('DirtFieldPatch');
        (this._buildRoot ?? this.node).addChild(node);

        const mapWorldW = cols * this.tileSize;
        const mapWorldH = rows * this.tileSize;
        const patchW = Math.max(this.tileSize * 4, mapWorldW * 0.24);
        const patchH = Math.max(this.tileSize * 3, mapWorldH * 0.16);
        const baseX = GameConfig.MAP.BASE_SPAWN.x;
        const baseZ = GameConfig.MAP.BASE_SPAWN.z;
        const safeGap = this.tileSize * 2.5;
        const patchX = baseX;
        const patchZ = baseZ + patchH * 0.5 + safeGap;

        node.setPosition(patchX, 0.01, patchZ);
        node.setScale(patchW, 1, patchH);
        node.layer = (this._buildRoot ?? this.node).layer;

        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.getSharedGroundMesh();
        renderer.material = this.getDirtFieldMaterial(patchW, patchH);
    }

    private getGroundMaterial(cols: number, rows: number, fallbackColor: Color): Material {
        if (!this._groundMaterial) {
            const mat = new Material();
            mat.initialize({
                effectName: 'builtin-unlit',
                defines: { USE_TEXTURE: true },
            });
            mat.setProperty('mainColor', fallbackColor);
            this._groundMaterial = mat;
        }

        const tileRepeatX = Math.max(1, cols);
        const tileRepeatY = Math.max(1, rows);
        this._groundMaterial.setProperty('tilingOffset', new Vec4(tileRepeatX, tileRepeatY, 0, 0));

        if (!this._groundTexLoading) {
            this._groundTexLoading = true;
            void this.loadGroundTextureWithFallbacks(MapGenerator.GROUND_TEXTURE_PATHS).then(
                texture => {
                    this._groundTexLoading = false;
                    if (!texture || !this._groundMaterial) return;

                    // 尝试开启 repeat；若当前引擎实现不支持，仍可正常显示（但可能不平铺）。
                    const texAny = texture as Texture2D & {
                        setWrapMode?: (u: number, v: number) => void;
                    };
                    const wrapMode = (Texture2D as unknown as { WrapMode?: { REPEAT?: number } })
                        .WrapMode?.REPEAT;
                    if (texAny.setWrapMode && wrapMode !== undefined) {
                        texAny.setWrapMode(wrapMode, wrapMode);
                    }

                    this._groundMaterial.setProperty('mainTexture', texture);
                    this._groundMaterial.setProperty('mainColor', new Color(235, 245, 235, 255));
                }
            );
        }

        return this._groundMaterial;
    }

    private getDirtFieldMaterial(worldW: number, worldH: number): Material {
        if (!this._dirtFieldMaterial) {
            const mat = new Material();
            mat.initialize({
                effectName: 'builtin-unlit',
                defines: { USE_TEXTURE: true },
            });
            mat.setProperty('mainColor', new Color(145, 120, 88, 255));
            this._dirtFieldMaterial = mat;
        }

        const repeatX = Math.max(2, worldW / (this.tileSize * 1.5));
        const repeatY = Math.max(2, worldH / (this.tileSize * 1.5));
        this._dirtFieldMaterial.setProperty('tilingOffset', new Vec4(repeatX, repeatY, 0, 0));

        if (!this._dirtTexLoading) {
            this._dirtTexLoading = true;
            void this.loadGroundTextureWithFallbacks(MapGenerator.DIRT_TEXTURE_PATHS).then(
                texture => {
                    this._dirtTexLoading = false;
                    if (!texture || !this._dirtFieldMaterial) return;

                    const texAny = texture as Texture2D & {
                        setWrapMode?: (u: number, v: number) => void;
                    };
                    const wrapMode = (Texture2D as unknown as { WrapMode?: { REPEAT?: number } })
                        .WrapMode?.REPEAT;
                    if (texAny.setWrapMode && wrapMode !== undefined) {
                        texAny.setWrapMode(wrapMode, wrapMode);
                    }

                    this._dirtFieldMaterial.setProperty('mainTexture', texture);
                    this._dirtFieldMaterial.setProperty('mainColor', new Color(255, 255, 255, 255));
                }
            );
        }

        return this._dirtFieldMaterial;
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
