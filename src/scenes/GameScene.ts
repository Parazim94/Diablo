import Phaser from 'phaser';
import { TILE, MAP_W, MAP_H, generateDungeon, findPath, Dungeon } from '../dungeon';

interface Enemy {
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  nextAttack: number;
  home: { x: number; y: number };
}

const PLAYER = { speed: 170, range: 40, cooldown: 550, dmg: [8, 14], maxHp: 100, maxMana: 60, radius: 10 };
const ENEMY = { speed: 90, aggro: 220, range: 28, cooldown: 900, dmg: [3, 7], hp: 30, radius: 10 };

export class GameScene extends Phaser.Scene {
  private dungeon!: Dungeon;
  private player!: Phaser.GameObjects.Image;
  private enemies: Enemy[] = [];
  private path: { x: number; y: number }[] = [];
  private target: Enemy | null = null;
  private hp = PLAYER.maxHp;
  private mana = PLAYER.maxMana;
  private nextAttack = 0;
  private nextRepath = 0;
  private dead = false;
  private hud!: Phaser.GameObjects.Graphics;
  private deathText!: Phaser.GameObjects.Text;
  private marker!: Phaser.GameObjects.Arc;

  constructor() { super('Game'); }

  create() {
    this.makeTextures();
    this.buildLevel();
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.deathText = this.add.text(0, 0, 'Du bist gestorben\nKlicken zum Wiederbeleben', {
      fontFamily: 'serif', fontSize: '40px', color: '#b01010', align: 'center', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(false);
    this.marker = this.add.circle(0, 0, 6, 0xffd060, 0.8).setVisible(false).setDepth(1);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onClick(p));
    this.scale.on('resize', () => this.layoutHud());
    this.layoutHud();
  }

  // ---------- Setup ----------
  private makeTextures() {
    const g = this.make.graphics({}, false);
    const tex = (key: string, size: number, draw: () => void) => {
      g.clear(); draw(); g.generateTexture(key, size, size);
    };
    tex('floor', TILE, () => {
      g.fillStyle(0x2b2522).fillRect(0, 0, TILE, TILE);
      g.lineStyle(1, 0x1d1815).strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      g.fillStyle(0x332c28).fillRect(4, 4, 6, 4).fillRect(18, 20, 8, 4);
    });
    tex('wall', TILE, () => {
      g.fillStyle(0x0f0c0b).fillRect(0, 0, TILE, TILE);
      g.lineStyle(1, 0x070505).strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
    });
    tex('wallEdge', TILE, () => {
      g.fillStyle(0x4a3f38).fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x3a312b).fillRect(0, TILE - 8, TILE, 8);
      g.lineStyle(1, 0x1a1411).strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
    });
    tex('player', 32, () => {
      g.fillStyle(0x000000, 0.35).fillEllipse(16, 26, 22, 8);
      g.fillStyle(0x8a929c).fillCircle(16, 16, 11);
      g.fillStyle(0xb02020).fillCircle(16, 16, 6);
      g.fillStyle(0xdddddd).fillRect(24, 13, 8, 3);
    });
    tex('enemy', 32, () => {
      g.fillStyle(0x000000, 0.35).fillEllipse(16, 26, 22, 8);
      g.fillStyle(0x5c7a3a).fillCircle(16, 16, 11);
      g.fillStyle(0xe8e060).fillCircle(12, 13, 2).fillCircle(20, 13, 2);
    });
    g.destroy();
  }

  private buildLevel() {
    this.dungeon = generateDungeon();
    const { grid, rooms } = this.dungeon;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (grid[y][x]) { this.add.image(x * TILE, y * TILE, 'floor').setOrigin(0); continue; }
        const nearFloor = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
          .some(([dx, dy]) => grid[y + dy]?.[x + dx]);
        if (nearFloor) this.add.image(x * TILE, y * TILE, grid[y + 1]?.[x] ? 'wallEdge' : 'wall').setOrigin(0);
      }
    }
    const start = rooms[0];
    const sx = (start.x + start.w / 2) * TILE, sy = (start.y + start.h / 2) * TILE;
    this.player = this.add.image(sx, sy, 'player').setDepth(10);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);

    for (const room of rooms.slice(1)) {
      const n = Phaser.Math.Between(2, 4);
      for (let i = 0; i < n; i++) {
        this.spawnEnemy((room.x + 1 + Math.random() * (room.w - 2)) * TILE, (room.y + 1 + Math.random() * (room.h - 2)) * TILE);
      }
    }
  }

  private spawnEnemy(x: number, y: number) {
    const sprite = this.add.image(x, y, 'enemy').setDepth(9).setInteractive();
    const e: Enemy = { sprite, bar: this.add.graphics().setDepth(9), hp: ENEMY.hp, maxHp: ENEMY.hp, nextAttack: 0, home: { x, y } };
    sprite.setData('enemy', e);
    this.enemies.push(e);
  }

  private layoutHud() {
    const { width, height } = this.scale;
    this.deathText.setPosition(width / 2, height / 2);
  }

  // ---------- Input ----------
  private onClick(p: Phaser.Input.Pointer) {
    if (this.dead) { this.respawn(); return; }
    const wx = p.worldX, wy = p.worldY;
    const hit = this.enemies.find(e => Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, wx, wy) < 18);
    if (hit) {
      this.target = hit;
      this.marker.setVisible(false);
      this.pathTo(hit.sprite.x, hit.sprite.y);
    } else {
      this.target = null;
      this.pathTo(wx, wy);
      this.marker.setPosition(wx, wy).setVisible(true);
    }
  }

  private pathTo(wx: number, wy: number) {
    const p = findPath(this.dungeon.grid, Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE),
      Math.floor(wx / TILE), Math.floor(wy / TILE));
    this.path = p ?? [];
  }

  // ---------- Game loop ----------
  update(time: number, delta: number) {
    if (this.dead) return;
    const dt = delta / 1000;
    this.updatePlayer(time, dt);
    this.updateEnemies(time, dt);
    this.mana = Math.min(PLAYER.maxMana, this.mana + 3 * dt);
    this.hp = Math.min(PLAYER.maxHp, this.hp + 0.5 * dt);
    this.drawHud();
  }

  private updatePlayer(time: number, dt: number) {
    const t = this.target;
    if (t && t.hp <= 0) this.target = null;

    if (this.target) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t!.sprite.x, t!.sprite.y);
      if (d <= PLAYER.range) {
        this.path = [];
        if (time >= this.nextAttack) { this.nextAttack = time + PLAYER.cooldown; this.hitEnemy(t!, time); }
        return;
      }
      if (this.path.length === 0 || time >= this.nextRepath) { this.nextRepath = time + 400; this.pathTo(t!.sprite.x, t!.sprite.y); }
    }

    if (this.path.length === 0) { this.marker.setVisible(false); return; }
    const wp = this.path[0];
    const tx = wp.x * TILE + TILE / 2, ty = wp.y * TILE + TILE / 2;
    const dx = tx - this.player.x, dy = ty - this.player.y;
    const dist = Math.hypot(dx, dy), step = PLAYER.speed * dt;
    if (dist <= step) { this.player.setPosition(tx, ty); this.path.shift(); }
    else { this.player.x += (dx / dist) * step; this.player.y += (dy / dist) * step; }
    this.player.setFlipX(dx < 0);
  }

  private hitEnemy(e: Enemy, _time: number) {
    const dmg = Phaser.Math.Between(PLAYER.dmg[0], PLAYER.dmg[1]);
    e.hp -= dmg;
    this.floatText(e.sprite.x, e.sprite.y - 20, String(dmg), '#ffffff');
    this.tweens.add({ targets: e.sprite, alpha: 0.4, duration: 60, yoyo: true });
    if (e.hp <= 0) {
      e.sprite.destroy(); e.bar.destroy();
      this.enemies = this.enemies.filter(x => x !== e);
    }
  }

  private updateEnemies(time: number, dt: number) {
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.player.x, this.player.y);
      if (d < ENEMY.aggro && d > ENEMY.range) {
        const a = Math.atan2(this.player.y - e.sprite.y, this.player.x - e.sprite.x);
        const nx = e.sprite.x + Math.cos(a) * ENEMY.speed * dt;
        const ny = e.sprite.y + Math.sin(a) * ENEMY.speed * dt;
        if (this.canStand(nx, e.sprite.y)) e.sprite.x = nx;
        if (this.canStand(e.sprite.x, ny)) e.sprite.y = ny;
      } else if (d <= ENEMY.range && time >= e.nextAttack) {
        e.nextAttack = time + ENEMY.cooldown;
        this.damagePlayer(Phaser.Math.Between(ENEMY.dmg[0], ENEMY.dmg[1]));
      }
      e.bar.clear();
      if (e.hp < e.maxHp) {
        e.bar.fillStyle(0x000000).fillRect(e.sprite.x - 14, e.sprite.y - 22, 28, 4);
        e.bar.fillStyle(0xc02020).fillRect(e.sprite.x - 14, e.sprite.y - 22, 28 * (e.hp / e.maxHp), 4);
      }
    }
  }

  private canStand(x: number, y: number) {
    const r = ENEMY.radius, g = this.dungeon.grid;
    return [[-r, -r], [r, -r], [-r, r], [r, r]].every(([ox, oy]) => g[Math.floor((y + oy) / TILE)]?.[Math.floor((x + ox) / TILE)]);
  }

  private damagePlayer(dmg: number) {
    this.hp -= dmg;
    this.floatText(this.player.x, this.player.y - 24, String(dmg), '#ff4040');
    this.cameras.main.shake(80, 0.003);
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.path = []; this.target = null;
      this.drawHud();
      this.deathText.setVisible(true);
    }
  }

  private respawn() {
    this.dead = false;
    this.deathText.setVisible(false);
    this.hp = PLAYER.maxHp; this.mana = PLAYER.maxMana;
    const s = this.dungeon.rooms[0];
    this.player.setPosition((s.x + s.w / 2) * TILE, (s.y + s.h / 2) * TILE);
    // enemies that were damaged heal and return home
    for (const e of this.enemies) { e.hp = e.maxHp; e.sprite.setPosition(e.home.x, e.home.y); }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: 'serif', fontSize: '16px', color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // ---------- HUD ----------
  private orb(cx: number, cy: number, r: number, frac: number, color: number) {
    const g = this.hud;
    g.fillStyle(0x120808).fillCircle(cx, cy, r + 4);
    g.fillStyle(0x000000).fillCircle(cx, cy, r);
    // fill from the bottom up by clipping a circle with a mask-free approach: draw horizontal slices
    const top = cy + r - 2 * r * frac;
    g.fillStyle(color);
    for (let y = Math.max(top, cy - r); y <= cy + r; y += 1) {
      const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
      g.fillRect(cx - half, y, half * 2, 1);
    }
    g.lineStyle(3, 0x6b5a3a).strokeCircle(cx, cy, r + 4);
  }

  private drawHud() {
    const { width, height } = this.scale, r = 52, m = 20;
    this.hud.clear();
    this.orb(m + r + 4, height - m - r - 4, r, this.hp / PLAYER.maxHp, 0xb01818);
    this.orb(width - m - r - 4, height - m - r - 4, r, this.mana / PLAYER.maxMana, 0x1c4fc0);
  }
}
