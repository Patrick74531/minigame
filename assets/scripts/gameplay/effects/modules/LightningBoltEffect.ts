import { Color, MeshRenderer, Node, Tween, Vec3, tween } from 'cc';
import { VisualEffect } from '../VisualEffect';
import { WeaponVFX } from '../../weapons/WeaponVFX';

/**
 * 闪电链弹射特效
 * 采用与加农炮光束相同的扁平丝带方案（XZ 平面）
 */
export class LightningBoltEffect {
    // 颜色配置
    private static readonly CORE_COLOR = new Color(150, 220, 255, 255); // 亮白蓝核心
    private static readonly GLOW_COLOR = new Color(40, 120, 255, 120); // 半透蓝光晕

    public static play(payload: {
        parent: Node;
        startPos: Vec3;
        endPos: Vec3;
        width: number;
    }): void {
        const node = new Node('LightningBolt');
        payload.parent.addChild(node);
        node.setWorldPosition(payload.startPos);

        const localEnd = new Vec3();
        Vec3.subtract(localEnd, payload.endPos, payload.startPos);

        // 生成锯齿路径点
        const points: Vec3[] = [];
        const segments = 6;
        points.push(new Vec3(0, 0, 0));

        const direction = localEnd.clone().normalize();
        const distance = localEnd.length();
        const segmentLen = distance / segments;

        for (let i = 1; i < segments; i++) {
            const point = direction.clone().multiplyScalar(i * segmentLen);
            const jitter = 0.25;
            point.add3f(
                (Math.random() - 0.5) * jitter,
                0, // 不偏移 Y，保持在 XZ 平面
                (Math.random() - 0.5) * jitter
            );
            points.push(point);
        }
        points.push(localEnd);

        // 创建每个线段（光晕 + 核心）
        for (let i = 0; i < points.length - 1; i++) {
            this._createRibbonSegment(node, points[i], points[i + 1], payload.width);
        }

        const effect = node.addComponent(VisualEffect);
        effect.duration = 0.3;
    }

    /**
     * 创建一段"扁平丝带"光束（仿加农炮 beam）
     * - 光晕层: 宽+矮，半透明蓝
     * - 核心层: 窄+矮，亮白蓝
     */
    private static _createRibbonSegment(
        parent: Node,
        start: Vec3,
        end: Vec3,
        widthScale: number = 1
    ): void {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;

        const midX = (start.x + end.x) * 0.5;
        const midZ = (start.z + end.z) * 0.5;
        const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
        const y = start.y;

        const boxMesh = WeaponVFX.getBoxMesh(1, 1, 1);

        // === 光晕层 ===
        const glow = new Node('Glow');
        parent.addChild(glow);
        glow.addComponent(MeshRenderer);
        WeaponVFX.configureVfxNode(glow, boxMesh, WeaponVFX.getGlowMat(this.GLOW_COLOR));
        glow.setPosition(midX, y, midZ);
        glow.setRotationFromEuler(0, yawDeg, 0);
        const glowW = 0.18 * widthScale;
        const glowH = 0.01;
        glow.setScale(glowW, glowH, len * 1.05);

        // 光晕淡出动画
        Tween.stopAllByTarget(glow);
        tween(glow)
            .to(0.15, { scale: new Vec3(glowW * 1.4, glowH, len * 1.05) })
            .to(0.15, { scale: new Vec3(0, 0, len) })
            .start();

        // === 核心层 ===
        const core = new Node('Core');
        parent.addChild(core);
        core.addComponent(MeshRenderer);
        WeaponVFX.configureVfxNode(core, boxMesh, WeaponVFX.getUnlitMat(this.CORE_COLOR));
        core.setPosition(midX, y, midZ);
        core.setRotationFromEuler(0, yawDeg, 0);
        const coreW = 0.04 * widthScale;
        const coreH = 0.015;
        core.setScale(coreW, coreH, len);

        // 核心淡出动画
        Tween.stopAllByTarget(core);
        tween(core)
            .delay(0.08)
            .to(0.2, { scale: new Vec3(0, 0, len) })
            .start();
    }
}
