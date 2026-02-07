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
 * Lv.1: 单发曳光                          (~8 发/秒)
 * Lv.2: 单发 + 弹壳(每3发)                (~10 发/秒)
 * Lv.3: 单发 + 弹壳(每2发) + 微弱屏震      (~12 发/秒)
 * Lv.4: 单发 + 弹壳(每2发) + 轻微屏震      (~17 发/秒)
 * Lv.5: 单发 + 弹壳(每发) + 中等屏震       (~25 发/秒)
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

    // 弹体尺寸 [宽, 长] — 宽高比约 1.8:1，避免过细过长
    private static readonly BULLET_SIZES: [number, number][] = [
        [0.4, 0.75], // Lv1: 清晰可见
        [0.45, 0.85], // Lv2
        [0.5, 0.95], // Lv3
        [0.58, 1.1], // Lv4
        [0.7, 1.3], // Lv5: 大而粗壮
    ];

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

    // 击退参数 [knockbackSpeed, stunDuration]
    // 目标：Lv1 就能清晰感知击退，Lv5 连续命中可形成明显压制
    private static readonly KNOCKBACK_PARAMS: [number, number][] = [
        [18, 0.2], // Lv1: 明显后退
        [22, 0.22], // Lv2
        [26, 0.24], // Lv3
        [30, 0.26], // Lv4
        [34, 0.3], // Lv5: 持续扫射强压制
    ];

    // 连射计数器（用于弹壳节奏、交替偏移等）
    private _shotCount: number = 0;

    // 复用的临时向量
    private static readonly _tmpPos = new Vec3();
    private static readonly _tmpMuzzle = new Vec3();

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

        // 枪口位置（前移 1.2，避免第一颗子弹距角色过近导致方向偏转）
        const muzzlePos = MachineGunBehavior._tmpMuzzle;
        muzzlePos.set(spawnPos.x + dirX * 1.2, spawnPos.y, spawnPos.z + dirZ * 1.2);

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
        bullet.pierce = true; // 穿透直线上所有敌人
        bullet.useManualHitDetection = true; // 手动碰撞检测（防隧穿 + 降物理开销）
        bullet.maxLifetime = 1.5; // 机枪子弹短寿命，减少同屏数量
        bullet.disablePhysics(); // 禁用 RigidBody/BoxCollider
        const [kbForce, kbStun] = MachineGunBehavior.KNOCKBACK_PARAMS[idx];
        bullet.knockbackForce = kbForce;
        bullet.knockbackStun = kbStun;
        bullet.knockbackDirX = dirX;
        bullet.knockbackDirZ = dirZ;
        bullet.damage = stats.damage;
        const speed = stats.projectileSpeed + (Math.random() - 0.5) * 3;
        bullet.speed = speed;

        // 加特林旋转枪管模拟：正弦波动左右扫射 + 随机抖动
        const barrelAngle = Math.sin(this._shotCount * 0.8) * spread * 0.7;
        const randomJitter = (Math.random() - 0.5) * spread * 0.6;
        const totalAngle = ((barrelAngle + randomJitter) * Math.PI) / 180;
        const cos = Math.cos(totalAngle);
        const sin = Math.sin(totalAngle);
        const vx = (dirX * cos - dirZ * sin) * speed;
        const vy = dirY * speed;
        const vz = (dirX * sin + dirZ * cos) * speed;
        bullet.velocity.set(vx, vy, vz);

        // 立即设置初始朝向，避免第一帧渲染方向错误
        if (bullet.orientXAxis) {
            const yDeg = Math.atan2(-vz, vx) * (180 / Math.PI) + 180;
            node.setRotationFromEuler(0, yDeg, 0);
        }

        // ==================== 屏幕震动 ====================
        const [shakeIntensity, shakeDuration] = MachineGunBehavior.SHAKE_PARAMS[idx];
        if (shakeIntensity > 0) {
            ScreenShake.shake(shakeIntensity, shakeDuration);
        }
    }
}
