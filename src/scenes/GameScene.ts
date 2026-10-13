import Phaser from 'phaser';
import { TILE, MAP_W, MAP_H, generateDungeon, findPath, Dungeon } from '../dungeon';
import { PlayerState } from '../state';
import { Item, generateItem, RARITY_COLOR, RARITY_CSS } from '../items';
import { InventoryPanel } from '../ui/InventoryPanel';

interface Enemy {
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  nextAttack: number;
  home: { x: number; y: number };
}

interface GroundItem { item: Item; box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }

interface Skill { key: string; name: string; mana: number; cooldown: number }

const PLAYER = { speed: 170, range: 40, cooldown: 550, radius: 10 };
const ENEMY = { speed: 90, aggro: 220, range: 28, cooldown: 900, dmg: [3, 7], hp: 30, radius: 10, xp: 25, dropChance: 0.4 };
const PICKUP_RADIUS = 30;
const SKILLS: Skill[] = [
  { key: '1', name: 'Wuchtschlag', mana: 8, cooldown: 1500 },
  { key: '2', name: 'Wirbelwind', mana: 20, cooldown: 4000 },
  { key: '3', name: 'Schlachtruf', mana: 15, cooldown: 12000 },
];
const BUFF_MS = 6000;

export class GameScene extends Phaser.Scene {
  private dungeon!: Dungeon;
  private state = new PlayerState();
  private player!: Phaser.GameObjects.Image;
  private enemies: Enemy[] = [];
  private ground: GroundItem[] = [];
  private path: { x: number; y: number }[] = [];
  private target: Enemy | null = null;
  private pickup: GroundItem | null = null;
  private nextAttack = 0;
  private nextRepath = 0;
  private skillReadyAt = [0, 0, 0];
  private buffUntil = 0;
  private dead = false;
  private hud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private skillLabels: Phaser.GameObjects.Text[] = [];
  private deathText!: Phaser.GameObjects.Text;
  private marker!: Phaser.GameObjects.Arc;
  private panel!: InventoryPanel;

  constructor() { super('Game'); }

  create() {
    this.makeTextures();
    this.buildLevel();
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudText = this.add.text(0, 0, '', { fontFamily: 'serif', fontSize: '15px', color: '#d8cdb4', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(102);
    this.skillLabels = SKILLS.map(s => this.add.text(0, 0, s.key, { fontFamily: 'serif', fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(102));
    this.deathText = this.add.text(0, 0, 'Du bist gestorben\nKlicken zum Wiederbeleben', {
      fontFamily: 'serif', fontSize: '40px', color: '#b01010', align: 'center', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setVisible(false);
    this.marker = this.add.circle(0, 0, 6, 0xffd060, 0.8).setVisible(false).setDepth(1);
    this.panel = new InventoryPanel(this, this.state, item => this.dropItem(this.player.x, this.player.y, item));

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => { if (!over.length) this.onClick(p); });
    this.input.keyboard!.on('keydown-I', () => this.panel.toggle());
    this.input.keyboard!.on('keydown-C', () => this.panel.toggle());
    this.input.keyboard!.on('keydown-ESC', () => { if (this.panel.visible) this.panel.toggle(); });
    SKILLS.forEach((_, i) => this.input.keyboard!.on(`keydown-${i + 1}`, () => this.useSkill(i)));
    this.scale.on('resize', () => this.deathText.setPosition(this.scale.width / 2, this.scale.height / 2));
    this.deathText.setPosition(this.scale.width / 2, this.scale.height / 2);
  }

  // ---------- Setup ----------
  private makeTextures() {
    const g = this.make.graphics({}, false);
    const tex = (key: string, size: number, draw: () => void) => { g.clear(); draw(); g.generateTexture(key, size, size); };
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
    this.player = this.add.image((start.x + start.w / 2) * TILE, (start.y + start.h / 2) * TILE, 'player').setDepth(10);
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
    const sprite = this.add.image(x, y, 'enemy').setDepth(9);
    this.enemies.push({ sprite, bar: this.add.graphics().setDepth(9), hp: ENEMY.hp, maxHp: ENEMY.hp, nextAttack: 0, home: { x, y } });
  }

  // ---------- Input ----------
  private onClick(p: Phaser.Input.Pointer) {
    if (this.dead) { this.respawn(); return; }
    const wx = p.worldX, wy = p.worldY;
    const dist = (ax: number, ay: number) => Phaser.Math.Distance.Between(ax, ay, wx, wy);

    const enemy = this.enemies.find(e => dist(e.sprite.x, e.sprite.y) < 18);
    if (enemy) {
      this.target = enemy; this.pickup = null; this.marker.setVisible(false);
      this.pathTo(enemy.sprite.x, enemy.sprite.y);
      return;
    }
    const loot = this.ground.find(g => dist(g.box.x, g.box.y) < 22);
    if (loot) {
      this.pickup = loot; this.target = null; this.marker.setVisible(false);
      this.pathTo(loot.box.x, loot.box.y);
      return;
    }
    this.target = null; this.pickup = null;
    this.pathTo(wx, wy);
    this.marker.setPosition(wx, wy).setVisible(true);
  }

  private pathTo(wx: number, wy: number) {
    this.path = findPath(this.dungeon.grid, Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE),
      Math.floor(wx / TILE), Math.floor(wy / TILE)) ?? [];
  }

  // ---------- Combat ----------
  private rollDamage(mult = 1) {
    const s = this.state;
    const buff = this.time.now < this.buffUntil ? 1.4 : 1;
    let dmg = Phaser.Math.Between(s.dmgMin, s.dmgMax) * mult * buff;
    const crit = Math.random() * 100 < s.crit;
    if (crit) dmg *= 2;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  private hitEnemy(e: Enemy, mult = 1) {
    const { dmg, crit } = this.rollDamage(mult);
    e.hp -= dmg;
    this.floatText(e.sprite.x, e.sprite.y - 20, crit ? `${dmg}!` : String(dmg), crit ? '#ffd040' : '#ffffff', crit ? 22 : 16);
    this.tweens.add({ targets: e.sprite, alpha: 0.4, duration: 60, yoyo: true });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    const { x, y } = e.sprite;
    e.sprite.destroy(); e.bar.destroy();
    this.enemies = this.enemies.filter(o => o !== e);
    if (this.target === e) this.target = null;
    if (this.state.addXp(ENEMY.xp)) {
      this.floatText(this.player.x, this.player.y - 40, 'STUFENAUFSTIEG!', '#ffe14a', 22);
    }
    if (Math.random() < ENEMY.dropChance) this.dropItem(x, y, generateItem(this.state.level));
  }

  private useSkill(i: number) {
    const s = this.state, sk = SKILLS[i], now = this.time.now;
    if (this.dead || now < this.skillReadyAt[i]) return;
    if (s.mana < sk.mana) { this.floatText(this.player.x, this.player.y - 30, 'Zu wenig Mana', '#6f8fff'); return; }

    const near = (r: number) => this.enemies.filter(e => Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.player.x, this.player.y) <= r);
    if (i === 0) { // Wuchtschlag: single target, heavy hit
      const t = this.target && near(PLAYER.range * 1.5).includes(this.target) ? this.target : near(PLAYER.range * 1.5)[0];
      if (!t) return;
      this.hitEnemy(t, 2.2);
    } else if (i === 1) { // Wirbelwind: everything around
      const hits = near(75);
      if (!hits.length) return;
      hits.forEach(e => this.hitEnemy(e, 1.4));
      this.spin();
    } else { // Schlachtruf: damage buff
      this.buffUntil = now + BUFF_MS;
      this.floatText(this.player.x, this.player.y - 30, 'Schlachtruf!', '#ff9040', 18);
    }
    s.mana -= sk.mana;
    this.skillReadyAt[i] = now + sk.cooldown;
  }

  private spin() {
    const ring = this.add.circle(this.player.x, this.player.y, 20, 0xffffff, 0).setStrokeStyle(3, 0xffd060).setDepth(11);
    this.tweens.add({ targets: ring, radius: 75, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
  }

  private damagePlayer(raw: number) {
    const s = this.state;
    const dmg = Math.max(1, Math.round(raw * (1 - s.reduction)));
    s.hp -= dmg;
    this.floatText(this.player.x, this.player.y - 24, String(dmg), '#ff4040');
    this.cameras.main.shake(80, 0.003);
    if (s.hp <= 0) {
      s.hp = 0; this.dead = true; this.path = []; this.target = null; this.pickup = null;
      this.deathText.setVisible(true);
    }
  }

  private respawn() {
    const s = this.state;
    this.dead = false;
    this.deathText.setVisible(false);
    s.hp = s.maxHp; s.mana = s.maxMana;
    const r = this.dungeon.rooms[0];
    this.player.setPosition((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE);
    for (const e of this.enemies) { e.hp = e.maxHp; e.sprite.setPosition(e.home.x, e.home.y); }
  }

  // ---------- Loot ----------
  private dropItem(x: number, y: number, item: Item) {
    const ox = Phaser.Math.Between(-14, 14), oy = Phaser.Math.Between(-14, 14);
    const color = RARITY_COLOR[item.rarity];
    const box = this.add.rectangle(x + ox, y + oy, 14, 14, color).setStrokeStyle(2, 0x000000).setDepth(5);
    const label = this.add.text(x + ox, y + oy - 16, item.name, {
      fontFamily: 'serif', fontSize: '13px', color: RARITY_CSS[item.rarity], stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);
    this.ground.push({ item, box, label });
    if (item.rarity === 'legendary') this.cameras.main.flash(200, 255, 140, 40);
  }

  private tryPickup(g: GroundItem) {
    if (!this.state.addItem(g.item)) {
      this.floatText(this.player.x, this.player.y - 30, 'Inventar voll', '#ff4040');
    } else {
      g.box.destroy(); g.label.destroy();
      this.ground = this.ground.filter(o => o !== g);
      this.panel.refresh();
    }
    this.pickup = null; this.path = [];
  }

  // ---------- Game loop ----------
  update(time: number, delta: number) {
    if (this.dead) return;
    const dt = delta / 1000, s = this.state;
    this.updatePlayer(time, dt);
    this.updateEnemies(time, dt);
    s.mana = Math.min(s.maxMana, s.mana + 3 * dt);
    s.hp = Math.min(s.maxHp, s.hp + 0.5 * dt);
    this.player.setTint(time < this.buffUntil ? 0xffa060 : 0xffffff);
    this.drawHud(time);
    if (this.panel.visible && Math.floor(time / 500) !== Math.floor((time - delta) / 500)) this.panel.refresh();
  }

  private updatePlayer(time: number, dt: number) {
    if (this.target && this.target.hp <= 0) this.target = null;

    if (this.target) {
      const t = this.target;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.sprite.x, t.sprite.y);
      if (d <= PLAYER.range) {
        this.path = [];
        if (time >= this.nextAttack) {
          this.nextAttack = time + PLAYER.cooldown;
          this.hitEnemy(t);
          this.state.mana = Math.min(this.state.maxMana, this.state.mana + 2);
        }
        return;
      }
      if (this.path.length === 0 || time >= this.nextRepath) { this.nextRepath = time + 400; this.pathTo(t.sprite.x, t.sprite.y); }
    }

    if (this.pickup) {
      const g = this.pickup;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, g.box.x, g.box.y) <= PICKUP_RADIUS) { this.tryPickup(g); return; }
    }

    if (this.path.length === 0) { this.marker.setVisible(false); return; }
    const wp = this.path[0];
    const tx = wp.x * TILE + TILE / 2, ty = wp.y * TILE + TILE / 2;
    const dx = tx - this.player.x, dy = ty - this.player.y;
    const dist = Math.hypot(dx, dy), step = PLAYER.speed * dt;
    if (dist <= step) { this.player.setPosition(tx, ty); this.path.shift(); }
    else { this.player.x += (dx / dist) * step; this.player.y += (dy / dist) * step; }
    if (Math.abs(dx) > 0.5) this.player.setFlipX(dx < 0);
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
        this.damagePlayer(Phaser.Math.Between(ENEMY.dmg[0], ENEMY.dmg[1]) + Math.floor(this.state.level / 2));
        if (this.dead) return;
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

  private floatText(x: number, y: number, text: string, color: string, size = 16) {
    const t = this.add.text(x, y, text, { fontFamily: 'serif', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  // ---------- HUD ----------
  private orb(cx: number, cy: number, r: number, frac: number, color: number) {
    const g = this.hud;
    g.fillStyle(0x120808).fillCircle(cx, cy, r + 4);
    g.fillStyle(0x000000).fillCircle(cx, cy, r);
    const top = cy + r - 2 * r * Phaser.Math.Clamp(frac, 0, 1);
    g.fillStyle(color);
    for (let y = Math.max(top, cy - r); y <= cy + r; y += 1) {
      const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
      g.fillRect(cx - half, y, half * 2, 1);
    }
    g.lineStyle(3, 0x6b5a3a).strokeCircle(cx, cy, r + 4);
  }

  private drawHud(time: number) {
    const { width, height } = this.scale, s = this.state, r = 52, m = 20, g = this.hud;
    g.clear();
    this.orb(m + r + 4, height - m - r - 4, r, s.hp / s.maxHp, 0xb01818);
    this.orb(width - m - r - 4, height - m - r - 4, r, s.mana / s.maxMana, 0x1c4fc0);

    // Skill bar
    const size = 48, gap = 8, total = SKILLS.length * size + (SKILLS.length - 1) * gap;
    const x0 = width / 2 - total / 2, y0 = height - m - size;
    SKILLS.forEach((sk, i) => {
      const x = x0 + i * (size + gap);
      const ready = time >= this.skillReadyAt[i];
      const usable = ready && s.mana >= sk.mana;
      g.fillStyle(0x181210).fillRect(x, y0, size, size);
      g.fillStyle(usable ? 0x7a5a2a : 0x3a302a).fillRect(x + 4, y0 + 4, size - 8, size - 8);
      if (!ready) {
        const frac = (this.skillReadyAt[i] - time) / sk.cooldown;
        g.fillStyle(0x000000, 0.7).fillRect(x + 4, y0 + 4, size - 8, (size - 8) * frac);
      }
      g.lineStyle(2, i === 2 && time < this.buffUntil ? 0xffa060 : 0x6b5a3a).strokeRect(x, y0, size, size);
      this.skillLabels[i].setPosition(x + 4, y0 + 2);
    });

    // XP bar + level text
    const bw = total + 100, bx = width / 2 - bw / 2, by = y0 - 14;
    g.fillStyle(0x000000, 0.8).fillRect(bx, by, bw, 6);
    g.fillStyle(0x8a6ad0).fillRect(bx, by, bw * (s.xp / s.xpToNext), 6);
    g.lineStyle(1, 0x6b5a3a).strokeRect(bx, by, bw, 6);
    const pts = s.points > 0 ? `  ·  ${s.points} Punkte [I]` : '';
    this.hudText.setText(`Stufe ${s.level}${pts}`).setPosition(width / 2, by - 4);
  }
}
