import Phaser from 'phaser';
import { sfx } from '../audio';
import { hasSave, clearSave } from '../save';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const items: Phaser.GameObjects.GameObject[] = [];
    const style = { fontFamily: 'serif', color: '#d8cdb4', stroke: '#000', strokeThickness: 4 };
    const { width, height } = this.scale;
    const cx = width / 2;

    items.push(this.add.text(cx, height * 0.2, 'ABGRUND', { ...style, fontSize: '84px', color: '#b01818', strokeThickness: 8 }).setOrigin(0.5));
    items.push(this.add.text(cx, height * 0.2 + 62, 'Ein Action-RPG im Browser', { ...style, fontSize: '22px', color: '#8a806a' }).setOrigin(0.5));

    let y = height * 0.42;
    const button = (label: string, onClick: () => void) => {
      const t = this.add.text(cx, y, label, { ...style, fontSize: '32px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffe14a')).on('pointerout', () => t.setColor('#d8cdb4'));
      t.on('pointerdown', () => { sfx.init(); sfx.startMusic(); onClick(); });
      items.push(t); y += 56;
    };
    if (hasSave()) button('Weiter', () => this.scene.start('Game', { load: true }));
    button('Neues Spiel', () => { clearSave(); this.scene.start('Game', { load: false }); });

    items.push(this.add.text(cx, height * 0.72, [
      'Linksklick: laufen · Gegner angreifen · Beute aufheben · Treppe benutzen',
      '1 / 2 / 3: Wuchtschlag · Wirbelwind · Schlachtruf',
      'I: Inventar · ESC / P: Pause · M: Ton an/aus',
    ].join('\n'), { ...style, fontSize: '17px', align: 'center', lineSpacing: 8, color: '#9a9078' }).setOrigin(0.5, 0));

    const onResize = () => this.scene.restart();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }
}
