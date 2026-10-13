import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0707',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [GameScene],
  input: { mouse: { preventDefaultWheel: true } },
});
