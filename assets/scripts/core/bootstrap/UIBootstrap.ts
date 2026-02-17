import { Node, sys } from 'cc';
import { UIFactory } from '../../ui/UIFactory';
import { Joystick } from '../../ui/Joystick';
import { HUDManager } from '../../ui/HUDManager';
import { BuffCardUI } from '../../ui/BuffCardUI';
import { WeaponSelectUI } from '../../ui/WeaponSelectUI';
import { WeaponBarUI } from '../../ui/WeaponBarUI';
import { TowerSelectUI } from '../../ui/TowerSelectUI';
import { UIResponsive } from '../../ui/UIResponsive';
import { ServiceRegistry } from '../managers/ServiceRegistry';

export type UIRefs = {
    canvas: Node;
    joystick: Joystick;
};

/**
 * UIBootstrap
 * 负责创建 UI Canvas、摇杆与 HUD 初始化
 */
export class UIBootstrap {
    public static build(root: Node): UIRefs {
        const canvas = UIFactory.createUICanvas();
        root.addChild(canvas);

        const joystick = UIFactory.createJoystick(canvas);
        if (sys.isBrowser && !UIResponsive.shouldUseTouchControls()) {
            UIFactory.createDesktopMoveHint(canvas);
        }

        UIBootstrap.hudManager.initialize(canvas);
        UIBootstrap.buffCardUI.initialize(canvas);
        UIBootstrap.weaponSelectUI.initialize(canvas);
        UIBootstrap.weaponBarUI.initialize(canvas);
        UIBootstrap.towerSelectUI.initialize(canvas);

        return { canvas, joystick };
    }

    private static get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    private static get buffCardUI(): BuffCardUI {
        return ServiceRegistry.get<BuffCardUI>('BuffCardUI') ?? BuffCardUI.instance;
    }

    private static get weaponSelectUI(): WeaponSelectUI {
        return ServiceRegistry.get<WeaponSelectUI>('WeaponSelectUI') ?? WeaponSelectUI.instance;
    }

    private static get towerSelectUI(): TowerSelectUI {
        return ServiceRegistry.get<TowerSelectUI>('TowerSelectUI') ?? TowerSelectUI.instance;
    }

    private static get weaponBarUI(): WeaponBarUI {
        return ServiceRegistry.get<WeaponBarUI>('WeaponBarUI') ?? WeaponBarUI.instance;
    }
}
