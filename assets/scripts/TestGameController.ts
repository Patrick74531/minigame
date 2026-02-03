import { _decorator } from 'cc';
import { GameController } from './GameController';

const { ccclass } = _decorator;

/**
 * 兼容性封装
 * 用于修复场景中丢失的脚本引用
 * 请在编辑器中尽快将 GameRoot 的脚本替换为 GameController
 */
@ccclass('TestGameController')
export class TestGameController extends GameController {}
