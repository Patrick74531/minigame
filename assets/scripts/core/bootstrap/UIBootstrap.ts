import { Node } from 'cc';
import { UIFactory } from '../../ui/UIFactory';
import { Joystick } from '../../ui/Joystick';
import { HUDManager } from '../../ui/HUDManager';
import { BuffCardUI } from '../../ui/BuffCardUI';
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
        UIBootstrap.hudManager.initialize(canvas);
        UIBootstrap.buffCardUI.initialize(canvas);

        return { canvas, joystick };
    }

    private static get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    private static get buffCardUI(): BuffCardUI {
        return ServiceRegistry.get<BuffCardUI>('BuffCardUI') ?? BuffCardUI.instance;
    }
}
