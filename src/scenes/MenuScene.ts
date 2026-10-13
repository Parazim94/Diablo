import Phaser from 'phaser';
import { sfx } from '../audio';
import { hasSave, clearSave } from '../save';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const style = { fontFamily: 'serif', color: '#d8cdb4', stroke: '#000', strokeThickness: 4 };
    const { width, height } = this.scale;
    const cx = width / 2;
    const k = Math.min(1, height / 600, width / 640); // shrink for phones
    const touch = this.sys.game.device.input.touch;

    this.add.text(cx, height * 0.18, 'ABGRUND', { ...style, fontSize: `${Math.round(84 * k)}px`, color: '#b01818', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(cx, height * 0.18 + 62 * k, 'Ein Action-RPG im Browser', { ...style, fontSize: `${Math.round(22 * k)}px`, color: '#8a806a' }).setOrigin(0.5);

    let y = height * 0.4;
    const button = (label: string, onClick: () => void) => {
      const t = this.add.text(cx, y, label, { ...style, fontSize: `${Math.round(32 * k)}px`, padding: { x: 24, y: 8 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffe14a')).on('pointerout', () => t.setColor('#d8cdb4'));
      t.on('pointerdown', () => { sfx.init(); sfx.startMusic(); onClick(); });
      y += 60 * k;
    };
    if (hasSave()) button('Weiter', () => this.scene.start('Game', { load: true }));
    button('Neues Spiel', () => { clearSave(); this.scene.start('Game', { load: false }); });

    const help = touch ? [
      'Tippen: laufen · angreifen · aufheben · Treppe',
      'Finger halten: in diese Richtung laufen',
      'Felder unten: Fähigkeiten · Kugel-Symbole: Tränke',
      'Quer halten und „Vollbild“ nutzen für die beste Sicht',
    ] : [
      'Linksklick: laufen · Gegner angreifen · Beute aufheben · Treppe benutzen',
      '1 / 2 / 3: Wuchtschlag · Wirbelwind · Schlachtruf · Q / E: Tränke',
      'I: Inventar · ESC / P: Pause · M: Ton an/aus',
    ];
    this.add.text(cx, Math.max(y + 10, height * 0.7), help.join('\n'), {
      ...style, fontSize: `${Math.round(17 * k)}px`, align: 'center', lineSpacing: 8 * k, color: '#9a9078', wordWrap: { width: width - 24 },
    }).setOrigin(0.5, 0);

    const onResize = () => this.scene.restart();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }
}
