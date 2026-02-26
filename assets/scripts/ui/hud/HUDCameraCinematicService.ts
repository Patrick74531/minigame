import { Node, Tween, tween, Vec3 } from 'cc';
import { CameraFollow } from '../../core/camera/CameraFollow';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import type { HUDModule } from './HUDModule';

const BOSS_CINEMATIC_MOVE_SECONDS = 0.58;
const BOSS_CINEMATIC_HOLD_SECONDS = 2;
const FOCUS_CINEMATIC_DISTANCE_MULTIPLIER = 1.18;
const FOCUS_CINEMATIC_MIN_HEIGHT = 3.6;

export class HUDCameraCinematicService implements HUDModule {
    private _uiCanvas: Node | null = null;
    private _activeTweenTarget: Record<string, number> | null = null;
    private _cameraFollowRef: CameraFollow | null = null;
    private _cameraOriginalTarget: Node | null = null;
    private _cameraOriginalEnabled = true;
    private _cameraOriginalSmoothSpeed = 0.16;
    private _token = 0;

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
    }

    public cleanup(): void {
        this.stop(true);
        this._uiCanvas = null;
        this._cameraFollowRef = null;
        this._cameraOriginalTarget = null;
    }

    public playBossCinematic(bossNode: Node): void {
        const follow = this.resolveMainCameraFollow();
        if (!follow || !follow.node || !follow.node.isValid || !bossNode.isValid) return;

        const token = this.beginCameraSequence(follow);
        const camNode = follow.node;
        const from = camNode.getWorldPosition(new Vec3());
        const bossWorld = bossNode.getWorldPosition(new Vec3());
        const focusOffset = follow.offset.clone().multiplyScalar(0.78);
        const to = new Vec3(
            bossWorld.x + focusOffset.x,
            bossWorld.y + Math.max(2.4, focusOffset.y),
            bossWorld.z + focusOffset.z
        );

        const clock = { value: 0 };
        this._activeTweenTarget = clock;
        const tempPos = new Vec3();
        const tempLook = new Vec3();

        tween(clock)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { value: 1 },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid || !bossNode.isValid) return;
                        Vec3.lerp(tempPos, from, to, clock.value);
                        camNode.setWorldPosition(tempPos);
                        bossNode.getWorldPosition(tempLook);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .delay(BOSS_CINEMATIC_HOLD_SECONDS)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { value: 0 },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid) return;
                        Vec3.lerp(tempPos, from, to, clock.value);
                        camNode.setWorldPosition(tempPos);
                        const target = this._cameraOriginalTarget;
                        if (target && target.isValid) {
                            target.getWorldPosition(tempLook);
                            camNode.lookAt(tempLook);
                        }
                    },
                }
            )
            .call(() => {
                if (token !== this._token) return;
                this.restoreCamera();
                this._activeTweenTarget = null;
            })
            .start();
    }

    public playLaneUnlockCinematic(
        focus: Vec3,
        padFocus: Vec3 | undefined,
        holdSeconds: number
    ): void {
        const follow = this.resolveMainCameraFollow();
        if (!follow || !follow.node || !follow.node.isValid) return;

        const token = this.beginCameraSequence(follow);
        const camNode = follow.node;
        const from = camNode.getWorldPosition(new Vec3());
        const focusOffset = follow.offset.clone().multiplyScalar(0.76);
        const toRoadEnd = new Vec3(
            focus.x + focusOffset.x,
            Math.max(focus.y + 2.4, focusOffset.y),
            focus.z + focusOffset.z
        );
        const padTarget = padFocus
            ? new Vec3(
                  padFocus.x + focusOffset.x,
                  Math.max(padFocus.y + 2.4, focusOffset.y),
                  padFocus.z + focusOffset.z
              )
            : toRoadEnd.clone();
        const endPauseSeconds = Math.max(0.28, Math.min(0.62, holdSeconds * 0.35));
        const padHoldSeconds = Math.max(0.6, holdSeconds - endPauseSeconds);

        const cameraState = { x: from.x, y: from.y, z: from.z };
        this._activeTweenTarget = cameraState;
        const tempLook = new Vec3();

        tween(cameraState)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { x: toRoadEnd.x, y: toRoadEnd.y, z: toRoadEnd.z },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        tempLook.set(focus.x, focus.y, focus.z);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .delay(endPauseSeconds)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS * 0.9,
                { x: padTarget.x, y: padTarget.y, z: padTarget.z },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        const lookPad = padFocus ?? focus;
                        tempLook.set(lookPad.x, lookPad.y, lookPad.z);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .delay(padHoldSeconds)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { x: from.x, y: from.y, z: from.z },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        const target = this._cameraOriginalTarget;
                        if (target && target.isValid) {
                            target.getWorldPosition(tempLook);
                            camNode.lookAt(tempLook);
                        }
                    },
                }
            )
            .call(() => {
                if (token !== this._token) return;
                this.restoreCamera();
                this._activeTweenTarget = null;
            })
            .start();
    }

    public playFocusCinematic(
        focus: Vec3,
        holdSeconds: number,
        onComplete?: () => void,
        onFocusReached?: () => void
    ): void {
        const follow = this.resolveMainCameraFollow();
        if (!follow || !follow.node || !follow.node.isValid) {
            if (onComplete) onComplete();
            return;
        }

        const token = this.beginCameraSequence(follow);
        const camNode = follow.node;
        const from = camNode.getWorldPosition(new Vec3());
        const focusOffset = follow.offset
            .clone()
            .multiplyScalar(FOCUS_CINEMATIC_DISTANCE_MULTIPLIER);
        const to = new Vec3(
            focus.x + focusOffset.x,
            Math.max(focus.y + FOCUS_CINEMATIC_MIN_HEIGHT, focusOffset.y),
            focus.z + focusOffset.z
        );

        const cameraState = { x: from.x, y: from.y, z: from.z };
        this._activeTweenTarget = cameraState;
        const tempLook = new Vec3();

        tween(cameraState)
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { x: to.x, y: to.y, z: to.z },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        tempLook.set(focus.x, focus.y, focus.z);
                        camNode.lookAt(tempLook);
                    },
                }
            )
            .call(() => {
                if (token !== this._token) return;
                if (onFocusReached) onFocusReached();
            })
            .delay(Math.max(0, holdSeconds))
            .to(
                BOSS_CINEMATIC_MOVE_SECONDS,
                { x: from.x, y: from.y, z: from.z },
                {
                    onUpdate: () => {
                        if (token !== this._token || !camNode.isValid) return;
                        camNode.setWorldPosition(cameraState.x, cameraState.y, cameraState.z);
                        const target = this._cameraOriginalTarget;
                        if (target && target.isValid) {
                            target.getWorldPosition(tempLook);
                            camNode.lookAt(tempLook);
                        }
                    },
                }
            )
            .call(() => {
                if (token !== this._token) return;
                this.restoreCamera();
                this._activeTweenTarget = null;
                if (onComplete) onComplete();
            })
            .start();
    }

    public stop(restoreCamera: boolean): void {
        if (this._activeTweenTarget) {
            Tween.stopAllByTarget(this._activeTweenTarget);
            this._activeTweenTarget = null;
        }
        this._token += 1;
        if (restoreCamera) {
            this.restoreCamera();
        }
    }

    private beginCameraSequence(follow: CameraFollow): number {
        this.stop(true);

        this._cameraFollowRef = follow;
        this._cameraOriginalTarget = follow.target;
        this._cameraOriginalEnabled = follow.enabled;
        this._cameraOriginalSmoothSpeed = follow.smoothSpeed;
        follow.enabled = false;
        this._token += 1;

        // 镜头移动期间暂停游戏
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.pauseGame();

        return this._token;
    }

    private restoreCamera(): void {
        const follow = this._cameraFollowRef;
        if (!follow || !follow.node || !follow.node.isValid) {
            this._cameraFollowRef = null;
            this._cameraOriginalTarget = null;
            // 即使恢复失败也要取消暂停
            const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
            gm.resumeGame();
            return;
        }

        follow.smoothSpeed = this._cameraOriginalSmoothSpeed;
        if (this._cameraOriginalTarget && this._cameraOriginalTarget.isValid) {
            follow.target = this._cameraOriginalTarget;
        }
        follow.enabled = this._cameraOriginalEnabled;
        if (follow.enabled && follow.target && follow.target.isValid) {
            follow.snap();
        }

        this._cameraFollowRef = null;
        this._cameraOriginalTarget = null;

        // 镜头恢复后继续游戏
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.resumeGame();
    }

    private resolveMainCameraFollow(): CameraFollow | null {
        if (this._cameraFollowRef && this._cameraFollowRef.node.isValid) {
            return this._cameraFollowRef;
        }
        const scene = this._uiCanvas?.scene;
        if (!scene) return null;

        this._cameraFollowRef = scene.getComponentInChildren(CameraFollow);
        return this._cameraFollowRef;
    }
}
