import { _decorator, Component, Node, Vec3, Color, Material, MeshRenderer, primitives, utils, resources, ImageAsset, BoxCollider } from 'cc';
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
    @property
    public mapWidth: number = 20; // Mobile Grid Width

    @property
    public mapHeight: number = 20; // Mobile Grid Height

    @property
    public tileSize: number = 2; 

    private _materials: Map<string, Material> = new Map();



    protected start(): void {
        // Automatically generate procedural map on start
        // This is safer than waiting for image load which might fail
        // this.generateProceduralMap();
    }

    // Call this from GameController
    public generateProceduralMap(): void {
        console.log('[MapGenerator] Generating Procedural Cyberpunk Map...');
        
        const mapGrid: number[][] = [];
        const width = this.mapWidth;
        const height = this.mapHeight;

        // 1. Initialize full walls
        for (let z = 0; z < height; z++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                row.push(TileType.WALL);
            }
            mapGrid.push(row);
        }

        // 2. Dig out rooms and corridors (Recursive Backtracker or simple Random Walk)
        // Let's do a simple "Drunken Walker" to make open areas
        // INCREASED floor from 60% to 80% to reduce obstacles
        const totalFloorTiies = Math.floor(width * height * 0.8); 
        let floorCount = 0;
        
        // Start from Top-Left area but not hugging the wall (Index 5,5)
        let cx = 5;
        let cy = 5;
        
        // Ensure starting area is open
        mapGrid[cy][cx] = TileType.PLAYER_SPAWN; 
        floorCount++;

        let safety = 0;
        while (floorCount < totalFloorTiies && safety < 10000) {
            // ... (rest of loop is fine, it will wander from cx,cy)
            const dir = Math.floor(Math.random() * 4);
            if (dir === 0) cx++;
            else if (dir === 1) cx--;
            else if (dir === 2) cy++;
            else if (dir === 3) cy--;

            // Clamp (Leave 1-tile border)
            if (cx < 1) cx = 1; else if (cx >= width - 1) cx = width - 2;
            if (cy < 1) cy = 1; else if (cy >= height - 1) cy = height - 2;

            if (mapGrid[cy][cx] === TileType.WALL) {
                mapGrid[cy][cx] = TileType.FLOOR;
                floorCount++;
            }
            safety++;
        }

        // 3. Add enemies (Logic is fine, checks for floor)

        // Ensure Spawn Area is clean for Base
        const spawnX = 5;
        const spawnY = 5;
        // Clear a 3x3 area
        for(let dy=-1; dy<=1; dy++) {
            for(let dx=-1; dx<=1; dx++) {
                mapGrid[spawnY+dy][spawnX+dx] = TileType.FLOOR;
            }
        }
        mapGrid[spawnY][spawnX] = TileType.PLAYER_SPAWN;

        console.log(`[MapGenerator] Procedural Map Generated.`);
        this.buildMapFromData(mapGrid);
    }
    
    // Kept for reference but unused for now
    public generateFromImage(mapName: string): void {
         // ...
    }

    private processMapImage(imageAsset: ImageAsset): void {
        // ... (Disabled to save space/complexity)
    }

    public buildMapFromData(data: number[][]): void {
        this.node.removeAllChildren();
        
        const rows = data.length;
        const cols = data[0].length;
        const offsetX = (cols * this.tileSize) / 2;
        const offsetZ = (rows * this.tileSize) / 2;

        for (let z = 0; z < rows; z++) {
            for (let x = 0; x < cols; x++) {
                const type = data[z][x];
                const posX = (x * this.tileSize) - offsetX + (this.tileSize / 2);
                const posZ = (z * this.tileSize) - offsetZ + (this.tileSize / 2);
                
                // Colors
                const floorColor = new Color(20, 30, 40); // Dark Blue-Grey
                const wallColor = new Color(10, 5, 15);   // Deep Void
                const wallTopColor = new Color(120, 0, 200); // Neon Purple
                const enemyColor = new Color(100, 20, 20); 

                if (type === TileType.WALL) {
                    // Wall Body - IS OBSTACLE
                    this.createTileCube(posX, this.tileSize / 2, posZ, wallColor, this.tileSize, true);
                    // Neon Trim - Decor only
                    this.createTileCube(posX, this.tileSize, posZ, wallTopColor, 0.2);
                } 
                else {
                    // Floor - No Collider (Units float at Y=1.0, wall colliders handle blocking)
                    this.createTileCube(posX, 0, posZ, floorColor, 0.2, false);
                    
                    if (type === TileType.ENEMY_SPAWN) {
                        // Mark enemy spot
                       this.createTileCube(posX, 0.2, posZ, enemyColor, 0.2, false);
                    }
                }
            }
        }
    }

    public generateTestMap(): void {
        console.log('[MapGenerator] Generating fallback test map...');
        // ... (Keep existing simple logic just in case, or simplify)
        const mapData: number[][] = [];
        for (let z = 0; z < this.mapHeight; z++) {
            const row: number[] = [];
            for (let x = 0; x < this.mapWidth; x++) {
                if (z === 0 || z === this.mapHeight - 1 || x === 0 || x === this.mapWidth - 1) {
                    row.push(TileType.WALL);
                } else {
                    row.push(TileType.FLOOR);
                }
            }
            mapData.push(row);
        }
        this.buildMapFromData(mapData);
    }



    private createTileCube(x: number, y: number, z: number, color: Color, height: number, isObstacle: boolean = false): void {
        const node = new Node('Tile');
        this.node.addChild(node);
        node.setPosition(x, y, z);

        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );
        
        node.setScale(this.tileSize, height, this.tileSize);

        // Physics Collider
        if (isObstacle) {
            const collider = node.addComponent(BoxCollider);
            // Collider automatically matches the node scale/box mesh size usually, 
            // but explicitly setting center/size can be safer. 
            // For primitive box(1,1,1), default collider size(1,1,1) matches perfectly.
            
            // Allow physics interactions
            collider.group = 1; // Default
        }

        // Simple Instancing / Material reuse
        const colorKey = `${color.r}_${color.g}_${color.b}`;
        let material = this._materials.get(colorKey);
        if (!material) {
             material = new Material();
             material.initialize({ effectName: 'builtin-unlit' }); 
             material.setProperty('mainColor', color);
             this._materials.set(colorKey, material);
        }
        renderer.material = material;
    }
}
