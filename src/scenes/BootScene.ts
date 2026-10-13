import Phaser from 'phaser';

/** Loads the Kenney "Tiny Dungeon" tilesheet (CC0) before the menu opens. */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Lade…', { fontFamily: 'serif', fontSize: '24px', color: '#8a806a' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`Lade… ${Math.round(v * 100)}%`));
    this.load.spritesheet('tiles', 'assets/tiles.png', { frameWidth: 16, frameHeight: 16 });
  }

  create() {
    this.textures.get('tiles').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start('Menu');
  }
}
