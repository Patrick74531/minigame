import { Node } from 'cc';

export interface HUDModule {
    initialize(uiCanvas: Node): void;
    cleanup(): void;
    onCanvasResize?(): void;
    onLanguageChanged?(): void;
}
