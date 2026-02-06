import { Node, Color, Vec3 } from 'cc';
import { WeaponBehavior } from '../WeaponBehavior';
import { WeaponType, WeaponLevelStats } from '../WeaponTypes';
import { WeaponVFX } from '../WeaponVFX';
import { Bullet } from '../../combat/Bullet';
import { GameConfig } from '../../../data/GameConfig';
import { ProjectilePool } from '../vfx/ProjectilePool';
import { ScreenShake } from '../vfx/ScreenShake';

/**
 * 寡妇制造者 — 炽热曳光机枪 (元气骑士风格)
 *
 * 核心设计：每次 fire() 射出 1 颗子弹，靠极高射速实现弹幕密度
 * - 射速由 GameConfig.attackInterval 控制（0.12s → 0.04s）
 * - Hero.update() 每帧检查 _customWeaponTimer，到时间就调 fire()
 * - 像真正的机枪一样逐发射出，不是散弹同时喷射
 *
 * Lv.1: 单发曳光 + 枪口闪光                (~8 发/秒)
 * Lv.2: 单发 + 双层闪光 + 弹壳(每3发)      (~10 发/秒)
 * Lv.3: 单发 + 弹壳(每2发) + 轻微屏震      (~12 发/秒)
 * Lv.4: 单发 + 弹壳(每2发) + 中等屏震      (~17 发/秒)
 * Lv.5: 单发 + 弹壳(每发) + 强力屏震       (~25 发/秒)
 */
export class MachineGunBehavior extends WeaponBehavior {
    public readonly type = WeaponType.MACHINE_GUN;

    // 弹体色调 (橙暖 → 黄亮 → 白热)
    private static readonly TINT_COLORS: Color[] = [
        new Color(255, 200, 150, 255), // Lv1: 暖橙
        new Color(255, 215, 170, 255), // Lv2: 亮橙
        new Color(255, 235, 200, 255), // Lv3: 明黄
        new Color(255, 245, 220, 255), // Lv4: 亮黄
        new Color(255, 255, 245, 255), // Lv5: 白热
    ];

    // 枪口闪光颜色
    private static readonly FLASH_COLORS: Color[] = [
        new Color(255, 160, 50, 255),
        new Color(255, 180, 60, 255),
        new Color(255, 210, 90, 255),
        new Color(255, 235, 130, 255),
        new Color(255, 250, 200, 255),
    ];

    // 弹体尺寸 [宽, 长] — 需要足够大才能在画面上清晰可见
    private static readonly BULLET_SIZES: [number, number][] = [
        [0.25, 0.7], // Lv1
        [0.3, 0.85], // Lv2
        [0.35, 1.0], // Lv3
        [0.4, 1.2], // Lv4
        [0.5, 1.5], // Lv5
    ];

    // 枪口闪光尺寸
    private static readonly FLASH_SIZES = [0.15, 0.2, 0.26, 0.34, 0.44];

    // 屏幕震动参数 [intensity, duration]
    private static readonly SHAKE_PARAMS: [number, number][] = [
        [0, 0], // Lv1: 无
        [0, 0], // Lv2: 无
        [0.02, 0.02], // Lv3: 微弱
        [0.04, 0.03], // Lv4: 轻微
        [0.06, 0.04], // Lv5: 中等（持续高频 → 体感强烈）
    ];

    // 每几发弹壳抛一次（0 = 不抛）
    private static readonly CASING_INTERVAL = [0, 3, 2, 2, 1];

    // 连射计数器（用于弹壳节奏、交替偏移等）
    private _shotCount: number = 0;

    // 复用的临时向量
    private static readonly _tmpPos = new Vec3();

    public fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void {
        const idx = Math.min(level - 1, 4);
        const spread = (stats['spread'] ?? 4) as number;
        const color = MachineGunBehavior.TINT_COLORS[idx];
        const [bulletW, bulletL] = MachineGunBehavior.BULLET_SIZES[idx];
        const flashColor = MachineGunBehavior.FLASH_COLORS[idx];
        const flashSize = MachineGunBehavior.FLASH_SIZES[idx];

        this._shotCount++;

        // 生成位置（机枪出膛高度略低，避免射过敌人头顶）
        const spawnPos = MachineGunBehavior._tmpPos;
        spawnPos.set(owner.position);
        spawnPos.y += 0.5;

        // 射击方向（含 Y 分量，瞄准敌人身体中心而非头顶）
        const targetCenterY = target.position.y + 0.5;
        const dx = target.position.x - spawnPos.x;
        const dy = targetCenterY - spawnPos.y;
        const dz = target.position.z - spawnPos.z;
        const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const dirX = dist3d > 0.001 ? dx / dist3d : 0;
        const dirY = dist3d > 0.001 ? dy / dist3d : 0;
        const dirZ = dist3d > 0.001 ? dz / dist3d : 1;

        // 枪口位置（前移 0.3）
        const muzzlePos = new Vec3(spawnPos.x + dirX * 0.3, spawnPos.y, spawnPos.z + dirZ * 0.3);

        // ==================== 枪口闪光 ====================
        WeaponVFX.createMuzzleFlash(parent, muzzlePos, flashColor, flashSize);
        // Lv2+: 内核高亮闪光
        if (level >= 2) {
            WeaponVFX.createMuzzleFlash(
                parent,
                muzzlePos,
                new Color(255, 255, 230, 200),
                flashSize * 0.4
            );
        }

        // ==================== 弹壳抛射（按节奏） ====================
        const casingInterval = MachineGunBehavior.CASING_INTERVAL[idx];
        if (casingInterval > 0 && this._shotCount % casingInterval === 0) {
            WeaponVFX.ejectCasing(parent, spawnPos, dirX, dirZ);
        }

        // ==================== 单发子弹（直线飞行） ====================
        const node = ProjectilePool.get('mg_bullet');
        if (!node) return;

        const sizeJitter = 0.9 + Math.random() * 0.2;
        WeaponVFX.configureMGBullet(node, bulletW * sizeJitter, bulletL * sizeJitter, color);

        parent.addChild(node);
        node.setPosition(muzzlePos);

        let bullet = node.getComponent(Bullet);
        if (!bullet) {
            bullet = node.addComponent(Bullet);
        }
        bullet.resetState();
        bullet.poolKey = 'mg_bullet';
        bullet.orientXAxis = true; // 贴图水平朝右，用 +X 轴对齐飞行方向
        bullet.damage = stats.damage;
        const speed = stats.projectileSpeed + (Math.random() - 0.5) * 3;
        bullet.speed = speed;

        // 随机散射抖动（仅 XZ 平面，模拟后坐力）
        const jitter = ((Math.random() - 0.5) * spread * Math.PI) / 180;
        const cos = Math.cos(jitter);
        const sin = Math.sin(jitter);
        const vx = (dirX * cos - dirZ * sin) * speed;
        const vy = dirY * speed;
        const vz = (dirX * sin + dirZ * cos) * speed;
        bullet.velocity.set(vx, vy, vz);

        // ==================== 屏幕震动 ====================
        const [shakeIntensity, shakeDuration] = MachineGunBehavior.SHAKE_PARAMS[idx];
        if (shakeIntensity > 0) {
            ScreenShake.shake(shakeIntensity, shakeDuration);
        }
    }
}
