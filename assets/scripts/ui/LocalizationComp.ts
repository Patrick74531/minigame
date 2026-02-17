import { _decorator, Component, Label } from 'cc';
import { Localization } from '../core/i18n/Localization';

const { ccclass, property } = _decorator;

@ccclass('LocalizationComp')
export class LocalizationComp extends Component {
    @property
    public key: string = '';
    
    start() { this.refresh(); }
    
    refresh() {
        const label = this.getComponent(Label);
        if (label && this.key) {
            label.string = Localization.instance.t(this.key);
        }
    }
}
