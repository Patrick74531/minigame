import { Camera, Node, Vec3 } from 'cc';
import { CameraFollow } from './CameraFollow';

/**
 * CameraRig
 * 集中处理相机跟随初始化
 */
export class CameraRig {
    public static setupFollow(sceneRoot: Node, target: Node | null, offset: Vec3): void {
        const mainCamera = sceneRoot.getComponentInChildren(Camera);
        if (!mainCamera) {
            console.warn('[CameraRig] Main Camera not found!');
            return;
        }

        let follow = mainCamera.node.getComponent(CameraFollow);
        if (!follow) {
            follow = mainCamera.node.addComponent(CameraFollow);
        }

        follow.offset = offset;
        follow.target = target;
        follow.snap();
    }
}
