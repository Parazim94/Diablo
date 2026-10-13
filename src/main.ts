import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { sfx } from './audio';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0707',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BootScene, MenuScene, GameScene],
  input: { mouse: { preventDefaultWheel: true } },
});

sfx.installUnlock();

// Phones report stale sizes while rotating. Re-measure several times so layout *and* touch coordinates
// (which depend on the cached canvas bounds) match the new orientation.
let resizeTimers: number[] = [];
const resync = () => {
  resizeTimers.forEach(clearTimeout);
  resizeTimers = [0, 120, 350, 800, 1600].map(d => window.setTimeout(() => game.scale.refresh(), d));
};
window.addEventListener('orientationchange', resync);
window.addEventListener('resize', resync);
window.visualViewport?.addEventListener('resize', resync);
screen.orientation?.addEventListener?.('change', resync);

if (import.meta.env.DEV) (window as unknown as { __sfx: typeof sfx }).__sfx = sfx; // test hook, stripped from production builds
