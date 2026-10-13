import Phaser from 'phaser';
import { TILE, MAP_W, MAP_H, generateDungeon, findPath, Dungeon } from '../dungeon';
import { PlayerState } from '../state';
import { Item, iconOf, generateItem, rollRarity, RARITY_COLOR, RARITY_CSS } from '../items';
import { EnemyType, TYPES, MAX_DEPTH, pickType } from '../enemies';
import { InventoryPanel } from '../ui/InventoryPanel';
import { sfx } from '../audio';
import { saveGame, loadGame } from '../save';

interface Enemy {
  type: EnemyType;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  size: number;
  bar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  dmgMult: number;
  radius: number;
  elite: boolean;
  nextAttack: number;
  nextNova: number;
  home: { x: number; y: number };
}

interface Projectile { s: Phaser.GameObjects.Arc; vx: number; vy: number; dmg: number; life: number }

interface GroundItem { item?: Item; potion?: 'life' | 'mana'; box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }

interface Skill { key: string; name: string; mana: number; cooldown: number }

const PLAYER = { speed: 170, range: 40, cooldown: 550, radius: 10 };
const DROP_CHANCE = 0.35;
const MINI = 3; // minimap pixels per tile
const PICKUP_RADIUS = 30;
const SKILLS: Skill[] = [
  { key: '1', name: 'Wuchtschlag', mana: 8, cooldown: 1500 },
  { key: '2', name: 'Wirbelwind', mana: 20, cooldown: 4000 },
  { key: '3', name: 'Schlachtruf', mana: 15, cooldown: 12000 },
];
const BUFF_MS = 6000;
const PLAYER_FRAME = 96;
const POTION_FRAME = { life: 115, mana: 116 };
const POTION_NAME = { life: 'Lebenstrank', mana: 'Manatrank' };
const POTION_COOLDOWN = 1200;
const STAIRS_FRAME = 9;
// Frames of the packed Kenney tilesheet (12 columns, row-major).
const THEMES = [
  { floor: [...Array(90).fill(0), 12, 24], wall: 40, tint: 0xffffff },
  { floor: [...Array(12).fill(48), 49, 51], wall: 57, tint: 0xffffff },
  { floor: [...Array(90).fill(0), 12, 24], wall: 40, tint: 0xa8a8ff },
];

export class GameScene extends Phaser.Scene {
  private dungeon!: Dungeon;
  private state = new PlayerState();
  private player!: Phaser.GameObjects.Image;
  private enemies: Enemy[] = [];
  private ground: GroundItem[] = [];
  private projectiles: Projectile[] = [];
  private levelObjs: Phaser.GameObjects.GameObject[] = [];
  private stairs: { x: number; y: number } | null = null;
  private path: { x: number; y: number }[] = [];
  private target: Enemy | null = null;
  private pickup: GroundItem | null = null;
  private toStairs = false;
  private nextAttack = 0;
  private nextRepath = 0;
  private skillReadyAt = [0, 0, 0];
  private buffUntil = 0;
  private depth_ = 1;
  private loop = 0;
  private dead = false;
  private victory = false;
  private paused = false;
  private playerShadow!: Phaser.GameObjects.Image;
  private potionReadyAt = 0;
  private lastPos = new WeakMap<object, { x: number; y: number }>();
  private potionHud!: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }[];
  private pauseText!: Phaser.GameObjects.Text;
  private onUnload = () => this.persist();
  private explored: boolean[][] = [];
  private lastTile = '';
  private mini!: Phaser.Textures.CanvasTexture;
  private miniOverlay!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private depthText!: Phaser.GameObjects.Text;
  private skillLabels: Phaser.GameObjects.Text[] = [];
  private skillZones: Phaser.GameObjects.Rectangle[] = [];
  private banner!: Phaser.GameObjects.Text;
  private marker!: Phaser.GameObjects.Arc;
  private panel!: InventoryPanel;

  constructor() { super('Game'); }

  /** Scene instances are reused by Phaser, so every field must be reset here. */
  init(data: { load?: boolean }) {
    const save = data?.load ? loadGame() : null;
    this.state = save ? PlayerState.fromJSON(save.player) : new PlayerState();
    this.depth_ = save?.depth ?? 1;
    this.loop = save?.loop ?? 0;
    this.enemies = []; this.ground = []; this.projectiles = []; this.levelObjs = [];
    this.stairs = null; this.path = []; this.target = null; this.pickup = null; this.toStairs = false;
    this.nextAttack = 0; this.nextRepath = 0; this.skillReadyAt = [0, 0, 0]; this.buffUntil = 0;
    this.dead = false; this.victory = false; this.paused = false;
    this.explored = []; this.lastTile = ''; this.skillLabels = [];
  }

  private persist() { if (!this.dead) saveGame(this.state, this.depth_, this.loop); }

  private togglePause() {
    if (this.dead || this.victory) return;
    this.paused = !this.paused;
    this.pauseText.setVisible(this.paused);
  }

  private leaveToMenu() { this.persist(); this.scene.start('Menu'); }

  create() {
    this.makeTextures();
    this.playerShadow = this.add.image(0, 0, 'shadow').setScale(1.1).setDepth(8);
    this.player = this.sprite(PLAYER_FRAME).setDepth(10);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    const txt = { fontFamily: 'serif', fontSize: '15px', color: '#d8cdb4', stroke: '#000', strokeThickness: 3 };
    this.hudText = this.add.text(0, 0, '', txt).setOrigin(0.5, 1).setScrollFactor(0).setDepth(102);
    this.depthText = this.add.text(16, 12, '', { ...txt, fontSize: '18px' }).setScrollFactor(0).setDepth(102);
    this.skillLabels = SKILLS.map(sk => this.add.text(0, 0, sk.key, { ...txt, color: '#fff', fontSize: '14px' }).setScrollFactor(0).setDepth(102));
    this.skillZones = SKILLS.map((_, i) => this.add.rectangle(0, 0, 48, 48, 0xffffff, 0.001).setOrigin(0).setScrollFactor(0).setDepth(103)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => { sfx.init(); this.useSkill(i); }));
    this.potionHud = (['life', 'mana'] as const).map(kind => {
      const icon = this.sprite(POTION_FRAME[kind]).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { sfx.init(); this.usePotion(kind); });
      const text = this.add.text(0, 0, '', { fontFamily: 'serif', fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3 })
        .setScrollFactor(0).setDepth(102).setOrigin(0.5, 0);
      return { icon, text };
    });
    this.banner = this.add.text(0, 0, '', { fontFamily: 'serif', fontSize: '40px', color: '#b01010', align: 'center', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(250).setVisible(false);
    this.marker = this.add.circle(0, 0, 6, 0xffd060, 0.8).setVisible(false).setDepth(1);

    if (this.textures.exists('minimap')) this.textures.remove('minimap');
    this.mini = this.textures.createCanvas('minimap', MAP_W, MAP_H)!;
    this.mini.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(0, 0, 'minimap').setOrigin(1, 0).setScale(MINI).setScrollFactor(0).setDepth(100).setName('miniImg');
    this.miniOverlay = this.add.graphics().setScrollFactor(0).setDepth(101);

    this.panel = new InventoryPanel(this, this.state, item => this.dropItem(this.player.x, this.player.y, item));
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => { if (!over.length) this.onClick(p); });
    const togglePanel = () => { sfx.init(); if (this.panel.visible) this.closePanel(); else this.panel.toggle(); };
    this.input.keyboard!.on('keydown-I', togglePanel);
    this.input.keyboard!.on('keydown-C', togglePanel);
    this.input.keyboard!.on('keydown-ESC', () => { if (this.panel.visible) this.closePanel(); else this.togglePause(); });
    this.input.keyboard!.on('keydown-P', () => this.togglePause());
    this.input.keyboard!.on('keydown-M', () => { sfx.init(); sfx.toggleMute(); });
    this.input.keyboard!.on('keydown-Q', () => { if (this.paused) this.leaveToMenu(); else this.usePotion('life'); });
    this.input.keyboard!.on('keydown-E', () => this.usePotion('mana'));

    this.pauseText = this.add.text(0, 0, 'PAUSE\n\nESC / P: weiter\nQ: Hauptmenü (speichert)', {
      fontFamily: 'serif', fontSize: '34px', color: '#e8d9a8', align: 'center', stroke: '#000', strokeThickness: 6, lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(260).setVisible(false);

    // Clickable shortcuts (also makes the game usable on touch devices).
    const btnStyle = { fontFamily: 'serif', fontSize: '16px', color: '#b8ad90', stroke: '#000', strokeThickness: 3 };
    [['[Inventar]', () => this.panel.visible ? this.closePanel() : this.panel.toggle()], ['[Pause]', () => this.togglePause()],
     ['[Ton]', () => { sfx.init(); sfx.toggleMute(); }]].forEach(([label, fn], i) => {
      this.add.text(16 + i * 92, 42, label as string, btnStyle).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true })
        .on('pointerdown', fn as () => void);
    });

    this.time.addEvent({ delay: 15000, loop: true, callback: () => this.persist() });
    window.addEventListener('beforeunload', this.onUnload);
    this.events.once('shutdown', () => {
      window.removeEventListener('beforeunload', this.onUnload);
      this.scale.off('resize', this.layout, this);
    });
    sfx.startMusic();
    SKILLS.forEach((_, i) => this.input.keyboard!.on(`keydown-${i + 1}`, () => this.useSkill(i)));
    this.scale.on('resize', this.layout, this);
    this.layout();
    this.startLevel();
  }

  private layout() {
    const { width, height } = this.scale;
    this.banner.setPosition(width / 2, height / 2);
    this.pauseText.setPosition(width / 2, height / 2);
    (this.children.getByName('miniImg') as Phaser.GameObjects.Image).setPosition(width - 12, 12);
  }

  // ---------- Textures ----------
  private closePanel() { this.panel.toggle(); this.persist(); }

  private makeTextures() {
    if (this.textures.exists('wall')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0x14121c).fillRect(0, 0, TILE, TILE);
    g.generateTexture('wall', TILE, TILE);
    g.clear().fillStyle(0x000000, 0.4).fillEllipse(14, 6, 24, 10);
    g.generateTexture('shadow', 28, 12);
    g.destroy();
  }

  /** Sprite from the Kenney tileset (16px frames drawn at 2x). */
  private sprite(frame: number, x = 0, y = 0, scale = 2) {
    return this.add.image(x, y, 'tiles', frame).setScale(scale);
  }

  // ---------- Level ----------
  private get paletteIndex() { return (this.depth_ - 1) % 3; }

  private startLevel() {
    for (const o of this.levelObjs) o.destroy();
    this.levelObjs = [];
    for (const e of this.enemies) { e.sprite.destroy(); e.shadow.destroy(); e.bar.destroy(); }
    for (const g of this.ground) { g.box.destroy(); g.icon.destroy(); g.label.destroy(); }
    for (const p of this.projectiles) p.s.destroy();
    this.enemies = []; this.ground = []; this.projectiles = [];
    this.path = []; this.target = null; this.pickup = null; this.toStairs = false; this.stairs = null;
    this.marker.setVisible(false);

    this.dungeon = generateDungeon();
    const { grid, rooms } = this.dungeon;
    const pal = this.paletteIndex;
    const add = (o: Phaser.GameObjects.Image) => { this.levelObjs.push(o); return o; };
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (grid[y][x]) {
          const f = Phaser.Utils.Array.GetRandom(THEMES[pal].floor);
          add(this.sprite(f, x * TILE, y * TILE).setOrigin(0).setTint(THEMES[pal].tint));
          continue;
        }
        const nearFloor = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
          .some(([dx, dy]) => grid[y + dy]?.[x + dx]);
        if (!nearFloor) continue;
        if (grid[y + 1]?.[x]) add(this.sprite(THEMES[pal].wall, x * TILE, y * TILE).setOrigin(0).setTint(THEMES[pal].tint));
        else add(this.add.image(x * TILE, y * TILE, 'wall').setOrigin(0));
      }
    }

    const start = rooms[0], last = rooms[rooms.length - 1];
    this.player.setPosition((start.x + start.w / 2) * TILE, (start.y + start.h / 2) * TILE);
    const isBossLevel = this.depth_ >= MAX_DEPTH;
    const cx = (last.x + last.w / 2) * TILE, cy = (last.y + last.h / 2) * TILE;

    if (isBossLevel) {
      this.spawnEnemy(TYPES.boss, cx, cy, false);
    } else {
      this.stairs = { x: Math.floor(cx / TILE) * TILE + TILE / 2, y: Math.floor(cy / TILE) * TILE + TILE / 2 };
      const glow = this.add.rectangle(this.stairs.x, this.stairs.y, TILE, TILE, 0xffd060, 0.25).setStrokeStyle(2, 0xffd060).setDepth(2);
      this.tweens.add({ targets: glow, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 });
      this.levelObjs.push(glow);
      add(this.sprite(STAIRS_FRAME, this.stairs.x, this.stairs.y).setDepth(2));
    }

    for (const room of rooms.slice(1)) {
      const n = Phaser.Math.Between(2, 4) + Math.floor(this.depth_ / 3);
      for (let i = 0; i < n; i++) {
        const x = (room.x + 1 + Math.random() * (room.w - 2)) * TILE, y = (room.y + 1 + Math.random() * (room.h - 2)) * TILE;
        if (isBossLevel && room === last && Phaser.Math.Distance.Between(x, y, cx, cy) < 90) continue;
        this.spawnEnemy(pickType(this.depth_), x, y, Math.random() < 0.1);
      }
    }

    this.explored = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
    this.mini.context.clearRect(0, 0, MAP_W, MAP_H);
    this.mini.refresh();
    this.lastTile = '';
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.floatText(this.player.x, this.player.y - 50, isBossLevel ? 'Ebene ' + this.depth_ + ' – Der Fürst erwartet dich' : 'Ebene ' + this.depth_, '#e8d9a8', 22);
  }

  private get scaling() { return 1 + 0.25 * (this.depth_ - 1) + 0.6 * this.loop; }

  private spawnEnemy(type: EnemyType, x: number, y: number, elite: boolean) {
    const boss = type.key === 'boss';
    const scale = boss ? 2.2 : elite ? 1.3 : 1;
    const hpMult = this.scaling * (elite ? 2.5 : 1);
    const sprite = this.sprite(type.frame, x, y, 2 * scale).setDepth(9);
    const shadow = this.add.image(x, y + 12 * scale, 'shadow').setScale(scale * 1.1).setDepth(8);
    if (elite) sprite.setTint(0xffe080);
    const hp = Math.round(type.hp * hpMult);
    this.enemies.push({
      type, sprite, shadow, size: scale, bar: this.add.graphics().setDepth(9), hp, maxHp: hp, elite,
      dmgMult: this.scaling * (elite ? 1.5 : 1), radius: 10 * scale, nextAttack: 0, nextNova: 3000, home: { x, y },
    });
  }

  // ---------- Input ----------
  private onClick(p: Phaser.Input.Pointer) {
    sfx.init();
    if (this.paused) return;
    if (this.victory) { this.loop++; this.depth_ = 1; this.persist(); this.victory = false; this.banner.setVisible(false); this.startLevel(); return; }
    if (this.dead) { this.respawn(); return; }
    const wx = p.worldX, wy = p.worldY;
    const dist = (ax: number, ay: number) => Phaser.Math.Distance.Between(ax, ay, wx, wy);
    this.target = null; this.pickup = null; this.toStairs = false;

    const enemy = this.enemies.find(e => dist(e.sprite.x, e.sprite.y) < 18 * e.size);
    if (enemy) { this.target = enemy; this.marker.setVisible(false); this.pathTo(enemy.sprite.x, enemy.sprite.y); return; }
    const loot = this.ground.find(g => dist(g.box.x, g.box.y) < 22);
    if (loot) { this.pickup = loot; this.marker.setVisible(false); this.pathTo(loot.box.x, loot.box.y); return; }
    if (this.stairs && dist(this.stairs.x, this.stairs.y) < 24) {
      this.toStairs = true; this.marker.setVisible(false); this.pathTo(this.stairs.x, this.stairs.y); return;
    }
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
    sfx.play(crit ? 'crit' : 'hit');
    this.burst(e.sprite.x, e.sprite.y, crit ? 0xffd040 : 0xb02020, crit ? 9 : 5);
    this.floatText(e.sprite.x, e.sprite.y - 20 * e.size, crit ? `${dmg}!` : String(dmg), crit ? '#ffd040' : '#ffffff', crit ? 22 : 16);
    this.tweens.add({ targets: e.sprite, alpha: 0.4, duration: 60, yoyo: true });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    const { x, y } = e.sprite, boss = e.type.key === 'boss';
    this.burst(x, y, e.type.body, 14, 70);
    e.sprite.destroy(); e.shadow.destroy(); e.bar.destroy();
    this.enemies = this.enemies.filter(o => o !== e);
    if (this.target === e) this.target = null;

    const xp = Math.round(e.type.xp * (e.elite ? 4 : 1) * (1 + 0.15 * (this.depth_ - 1)));
    if (this.state.addXp(xp)) { sfx.play('levelup'); this.floatText(this.player.x, this.player.y - 40, 'STUFENAUFSTIEG!', '#ffe14a', 22); this.persist(); }

    const ilvl = this.state.level + this.depth_;
    if (boss) {
      for (let i = 0; i < 3; i++) this.dropItem(x, y, generateItem(ilvl + 2, i === 0 ? 'legendary' : 'rare'));
      this.time.delayedCall(1500, () => this.win());
    } else if (e.elite) {
      this.dropItem(x, y, generateItem(ilvl, rollRarity(25)));
      if (Math.random() < 0.5) this.dropItem(x, y, generateItem(ilvl, rollRarity(10)));
    } else if (Math.random() < DROP_CHANCE) {
      this.dropItem(x, y, generateItem(ilvl));
    }
    const potionChance = boss ? 1 : e.elite ? 0.6 : 0.12;
    if (Math.random() < potionChance) this.dropPotion(x, y, Math.random() < 0.65 ? 'life' : 'mana');
  }

  private win() {
    sfx.play('win');
    this.victory = true;
    this.banner.setText('SIEG!\nDer Fürst der Tiefe ist gefallen.\nKlicken: nächster Durchgang (schwerer)').setColor('#ffe14a').setFontSize(30).setVisible(true);
  }

  private useSkill(i: number) {
    const s = this.state, sk = SKILLS[i], now = this.time.now;
    if (this.dead || this.victory || this.paused || now < this.skillReadyAt[i]) return;
    if (s.mana < sk.mana) { this.floatText(this.player.x, this.player.y - 30, 'Zu wenig Mana', '#6f8fff'); return; }

    const near = (r: number) => this.enemies.filter(e => Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.player.x, this.player.y) <= r + e.radius);
    if (i === 0) {
      const reach = near(PLAYER.range * 1.5);
      const t = this.target && reach.includes(this.target) ? this.target : reach[0];
      if (!t) return;
      sfx.play('bash');
      this.hitEnemy(t, 2.2);
    } else if (i === 1) {
      const hits = near(75);
      if (!hits.length) return;
      sfx.play('whirl');
      hits.forEach(e => this.hitEnemy(e, 1.4));
      this.spin();
    } else {
      sfx.play('buff');
      this.buffUntil = now + BUFF_MS;
      this.floatText(this.player.x, this.player.y - 30, 'Schlachtruf!', '#ff9040', 18);
    }
    s.mana -= sk.mana;
    this.skillReadyAt[i] = now + sk.cooldown;
  }

  private burst(x: number, y: number, color: number, n = 6, speed = 50) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = speed * (0.5 + Math.random());
      const c = this.add.circle(x, y, Phaser.Math.Between(2, 3), color).setDepth(40);
      this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 350, onComplete: () => c.destroy() });
    }
  }

  private spin() {
    const ring = this.add.circle(this.player.x, this.player.y, 20, 0xffffff, 0).setStrokeStyle(3, 0xffd060).setDepth(11);
    this.tweens.add({ targets: ring, radius: 75, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
  }

  private damagePlayer(raw: number) {
    const s = this.state;
    const dmg = Math.max(1, Math.round(raw * (1 - s.reduction)));
    s.hp -= dmg;
    sfx.play('hurt');
    this.floatText(this.player.x, this.player.y - 24, String(dmg), '#ff4040');
    this.cameras.main.shake(80, 0.003);
    if (s.hp <= 0) {
      sfx.play('death');
      s.hp = 0; this.dead = true; this.path = []; this.target = null; this.pickup = null; this.toStairs = false;
      this.banner.setText('Du bist gestorben\nKlicken zum Wiederbeleben').setColor('#b01010').setFontSize(40).setVisible(true);
    }
  }

  private respawn() {
    const s = this.state;
    this.dead = false;
    this.banner.setVisible(false);
    s.hp = s.maxHp; s.mana = s.maxMana;
    const r = this.dungeon.rooms[0];
    this.player.setPosition((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE);
    for (const p of this.projectiles) p.s.destroy();
    this.projectiles = [];
    for (const e of this.enemies) { e.hp = e.maxHp; e.sprite.setPosition(e.home.x, e.home.y); }
  }

  private shoot(fromX: number, fromY: number, angle: number, dmg: number, color: number, speed = 240) {
    const s = this.add.circle(fromX, fromY, color === 0xc060ff ? 7 : 5, color).setStrokeStyle(1, 0x000000).setDepth(12);
    sfx.play('shoot');
    this.projectiles.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg, life: 2.5 });
  }

  // ---------- Loot ----------
  private dropItem(x: number, y: number, item: Item) {
    const ox = Phaser.Math.Between(-14, 14), oy = Phaser.Math.Between(-14, 14);
    const box = this.add.rectangle(x + ox, y + oy, 26, 26, RARITY_COLOR[item.rarity], 0.35).setStrokeStyle(2, RARITY_COLOR[item.rarity]).setDepth(5);
    const icon = this.sprite(iconOf(item), x + ox, y + oy).setDepth(5);
    const label = this.add.text(x + ox, y + oy - 16, item.name, {
      fontFamily: 'serif', fontSize: '13px', color: RARITY_CSS[item.rarity], stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);
    this.ground.push({ item, box, icon, label });
    if (item.rarity === 'legendary') this.cameras.main.flash(200, 255, 140, 40);
  }

  private dropPotion(x: number, y: number, kind: 'life' | 'mana') {
    const ox = Phaser.Math.Between(-14, 14), oy = Phaser.Math.Between(-14, 14);
    const color = kind === 'life' ? 0xd03030 : 0x3060d0;
    const box = this.add.rectangle(x + ox, y + oy, 26, 26, color, 0.25).setStrokeStyle(2, color).setDepth(5);
    const icon = this.sprite(POTION_FRAME[kind], x + ox, y + oy).setDepth(5);
    const label = this.add.text(x + ox, y + oy - 16, POTION_NAME[kind], {
      fontFamily: 'serif', fontSize: '13px', color: kind === 'life' ? '#ff7070' : '#7fa0ff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);
    this.ground.push({ potion: kind, box, icon, label });
  }

  private usePotion(kind: 'life' | 'mana') {
    const s = this.state, now = this.time.now;
    if (this.dead || this.victory || this.paused || now < this.potionReadyAt || s.potions[kind] <= 0) return;
    const full = kind === 'life' ? s.hp >= s.maxHp : s.mana >= s.maxMana;
    if (full) return;
    s.potions[kind]--;
    this.potionReadyAt = now + POTION_COOLDOWN;
    sfx.play('potion');
    if (kind === 'life') {
      const heal = Math.round(s.maxHp * 0.4);
      s.hp = Math.min(s.maxHp, s.hp + heal);
      this.floatText(this.player.x, this.player.y - 30, `+${heal}`, '#6fe06f', 18);
      this.burst(this.player.x, this.player.y, 0xd03030, 8, 40);
    } else {
      const gain = Math.round(s.maxMana * 0.5);
      s.mana = Math.min(s.maxMana, s.mana + gain);
      this.floatText(this.player.x, this.player.y - 30, `+${gain}`, '#7fa0ff', 18);
      this.burst(this.player.x, this.player.y, 0x3060d0, 8, 40);
    }
  }

  private tryPickup(g: GroundItem) {
    if (g.potion) {
      this.state.potions[g.potion]++;
      sfx.play('pickup');
      g.box.destroy(); g.icon.destroy(); g.label.destroy();
      this.ground = this.ground.filter(o => o !== g);
      this.persist();
      this.pickup = null; this.path = [];
      return;
    }
    if (!this.state.addItem(g.item!)) {
      this.floatText(this.player.x, this.player.y - 30, 'Inventar voll', '#ff4040');
    } else {
      sfx.play('pickup');
      g.box.destroy(); g.icon.destroy(); g.label.destroy();
      this.ground = this.ground.filter(o => o !== g);
      this.panel.refresh();
      this.persist();
    }
    this.pickup = null; this.path = [];
  }

  // ---------- Game loop ----------
  update(time: number, delta: number) {
    if (this.dead || this.victory || this.paused) return;
    const dt = Math.min(delta, 50) / 1000, s = this.state;
    this.updatePlayer(time, dt);
    this.updateEnemies(time, dt);
    this.updateProjectiles(dt);
    s.mana = Math.min(s.maxMana, s.mana + 3 * dt);
    s.hp = Math.min(s.maxHp, s.hp + 0.5 * dt);
    this.player.setTint(time < this.buffUntil ? 0xffa060 : 0xffffff);
    this.animate(time);
    this.updateExplored();
    this.drawHud(time);
    if (this.panel.visible && Math.floor(time / 500) !== Math.floor((time - delta) / 500)) this.panel.refresh();
  }

  /** Walk wobble and shadow follow – purely visual. */
  private animate(time: number) {
    const moved = (o: Phaser.GameObjects.Image) => {
      const prev = this.lastPos.get(o);
      this.lastPos.set(o, { x: o.x, y: o.y });
      return !!prev && Math.abs(o.x - prev.x) + Math.abs(o.y - prev.y) > 0.05;
    };
    const wobble = (sp: Phaser.GameObjects.Image, walking: boolean, phase: number) => {
      sp.setAngle(walking ? Math.sin(time / 55 + phase) * 7 : 0);
    };
    wobble(this.player, moved(this.player), 0);
    this.playerShadow.setPosition(this.player.x, this.player.y + 13);
    for (const e of this.enemies) {
      wobble(e.sprite, moved(e.sprite), e.home.x);
      e.shadow.setPosition(e.sprite.x, e.sprite.y + 12 * e.size);
    }
  }

  private lunge(sp: Phaser.GameObjects.Image, base: number) {
    this.tweens.add({ targets: sp, scale: base * 1.25, duration: 70, yoyo: true, onComplete: () => sp.setScale(base) });
  }

  private updatePlayer(time: number, dt: number) {
    if (this.target && this.target.hp <= 0) this.target = null;

    if (this.target) {
      const t = this.target;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.sprite.x, t.sprite.y);
      if (d <= PLAYER.range + t.radius * 0.8) {
        this.path = [];
        if (time >= this.nextAttack) {
          this.nextAttack = time + PLAYER.cooldown;
          this.lunge(this.player, 2);
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

    if (this.toStairs && this.stairs && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.stairs.x, this.stairs.y) <= 28) {
      sfx.play('stairs');
      this.depth_++;
      this.startLevel();
      this.persist();
      return;
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
      const t = e.type, sp = e.sprite;
      const d = Phaser.Math.Distance.Between(sp.x, sp.y, this.player.x, this.player.y);
      const angle = Math.atan2(this.player.y - sp.y, this.player.x - sp.x);
      const move = (dir: number) => {
        const nx = sp.x + Math.cos(angle) * t.speed * dt * dir, ny = sp.y + Math.sin(angle) * t.speed * dt * dir;
        if (this.canStand(nx, sp.y, e.radius)) sp.x = nx;
        if (this.canStand(sp.x, ny, e.radius)) sp.y = ny;
      };
      const dmg = () => Math.round(Phaser.Math.Between(t.dmg[0], t.dmg[1]) * e.dmgMult);

      if (t.ranged) {
        if (d < t.aggro) {
          if (d > t.range) move(1); else if (d < t.range * 0.6) move(-1);
          if (d < t.range * 1.3 && time >= e.nextAttack) {
            e.nextAttack = time + t.cooldown;
            this.shoot(sp.x, sp.y, angle, dmg(), 0xe0a040);
          }
        }
      } else if (d < t.aggro && d > t.range + e.radius * 0.6) {
        move(1);
      } else if (d <= t.range + e.radius * 0.6 && time >= e.nextAttack) {
        e.nextAttack = time + t.cooldown;
        this.lunge(sp, 2 * e.size);
        this.damagePlayer(dmg());
        if (this.dead) return;
      }

      // Boss: periodic ring of projectiles
      if (t.key === 'boss' && d < t.aggro && time >= e.nextNova) {
        e.nextNova = time + 4500;
        for (let i = 0; i < 12; i++) this.shoot(sp.x, sp.y, (i / 12) * Math.PI * 2, Math.round(10 * e.dmgMult), 0xc060ff, 170);
      }

      e.bar.clear();
      if (e.hp < e.maxHp || e.elite) {
        const w = 28 * e.size, y = sp.y - 22 * e.size;
        e.bar.fillStyle(0x000000).fillRect(sp.x - w / 2, y, w, 4);
        e.bar.fillStyle(e.elite ? 0xffc040 : 0xc02020).fillRect(sp.x - w / 2, y, w * (e.hp / e.maxHp), 4);
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.life -= dt;
      const wall = !this.dungeon.grid[Math.floor(p.s.y / TILE)]?.[Math.floor(p.s.x / TILE)];
      if (!wall && Phaser.Math.Distance.Between(p.s.x, p.s.y, this.player.x, this.player.y) < 14) {
        p.life = 0;
        this.damagePlayer(p.dmg);
        if (this.dead) return;
      }
      if (wall) p.life = 0;
    }
    this.projectiles = this.projectiles.filter(p => { if (p.life <= 0) p.s.destroy(); return p.life > 0; });
  }

  private canStand(x: number, y: number, r: number) {
    const g = this.dungeon.grid;
    return [[-r, -r], [r, -r], [-r, r], [r, r]].every(([ox, oy]) => g[Math.floor((y + oy) / TILE)]?.[Math.floor((x + ox) / TILE)]);
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16) {
    const t = this.add.text(x, y, text, { fontFamily: 'serif', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------- Minimap ----------
  private updateExplored() {
    const px = Math.floor(this.player.x / TILE), py = Math.floor(this.player.y / TILE);
    const key = `${px},${py}`;
    if (key === this.lastTile) return;
    this.lastTile = key;
    const ctx = this.mini.context, R = 8;
    ctx.fillStyle = 'rgb(140,115,75)';
    for (let y = py - R; y <= py + R; y++) {
      for (let x = px - R; x <= px + R; x++) {
        if ((x - px) ** 2 + (y - py) ** 2 > R * R || this.explored[y]?.[x] !== false) continue;
        this.explored[y][x] = true;
        if (this.dungeon.grid[y][x]) ctx.fillRect(x, y, 1, 1);
      }
    }
    this.mini.refresh();
  }

  private drawMiniOverlay() {
    const { width } = this.scale, g = this.miniOverlay;
    const ox = width - 12 - MAP_W * MINI, oy = 12;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillRect(ox, oy, MAP_W * MINI, MAP_H * MINI);
    g.lineStyle(2, 0x6b5a3a).strokeRect(ox, oy, MAP_W * MINI, MAP_H * MINI);
    const dot = (wx: number, wy: number, color: number, size: number) =>
      g.fillStyle(color).fillRect(ox + (wx / TILE) * MINI - size / 2, oy + (wy / TILE) * MINI - size / 2, size, size);
    if (this.stairs && this.explored[Math.floor(this.stairs.y / TILE)]?.[Math.floor(this.stairs.x / TILE)]) dot(this.stairs.x, this.stairs.y, 0xffd060, 5);
    for (const e of this.enemies) {
      if (this.explored[Math.floor(e.sprite.y / TILE)]?.[Math.floor(e.sprite.x / TILE)]) dot(e.sprite.x, e.sprite.y, e.type.key === 'boss' ? 0xc060ff : 0xd02020, 3);
    }
    dot(this.player.x, this.player.y, 0xffffff, 4);
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

    this.potionHud.forEach((p, i) => {
      const kind = i === 0 ? 'life' : 'mana';
      const x = i === 0 ? m + r + 4 : width - m - r - 4, y = height - m - 2 * r - 34;
      const n = s.potions[kind];
      p.icon.setPosition(x, y).setAlpha(n > 0 ? 1 : 0.35);
      p.text.setPosition(x, y + 16).setText(`${i === 0 ? 'Q' : 'E'} · ${n}`);
    });

    const size = 48, gap = 8, total = SKILLS.length * size + (SKILLS.length - 1) * gap;
    const x0 = width / 2 - total / 2, y0 = height - m - size;
    SKILLS.forEach((sk, i) => {
      const x = x0 + i * (size + gap);
      this.skillZones[i].setPosition(x, y0).setSize(size, size);
      const ready = time >= this.skillReadyAt[i];
      g.fillStyle(0x181210).fillRect(x, y0, size, size);
      g.fillStyle(ready && s.mana >= sk.mana ? 0x7a5a2a : 0x3a302a).fillRect(x + 4, y0 + 4, size - 8, size - 8);
      if (!ready) g.fillStyle(0x000000, 0.7).fillRect(x + 4, y0 + 4, size - 8, (size - 8) * ((this.skillReadyAt[i] - time) / sk.cooldown));
      g.lineStyle(2, i === 2 && time < this.buffUntil ? 0xffa060 : 0x6b5a3a).strokeRect(x, y0, size, size);
      this.skillLabels[i].setPosition(x + 4, y0 + 2);
    });

    const bw = total + 100, bx = width / 2 - bw / 2, by = y0 - 14;
    g.fillStyle(0x000000, 0.8).fillRect(bx, by, bw, 6);
    g.fillStyle(0x8a6ad0).fillRect(bx, by, bw * (s.xp / s.xpToNext), 6);
    g.lineStyle(1, 0x6b5a3a).strokeRect(bx, by, bw, 6);
    const pts = s.points > 0 ? `  ·  ${s.points} Punkte [I]` : '';
    this.hudText.setText(`Stufe ${s.level}${pts}`).setPosition(width / 2, by - 4);
    this.depthText.setText(`Ebene ${this.depth_}/${MAX_DEPTH}` + (this.loop ? `  ·  Durchgang ${this.loop + 1}` : ''));

    // Boss bar
    const boss = this.enemies.find(e => e.type.key === 'boss');
    if (boss && Phaser.Math.Distance.Between(boss.sprite.x, boss.sprite.y, this.player.x, this.player.y) < boss.type.aggro) {
      const w = Math.min(500, width - 260), x = width / 2 - w / 2;
      g.fillStyle(0x000000, 0.8).fillRect(x, 16, w, 14);
      g.fillStyle(0x8a1c3c).fillRect(x, 16, w * Math.max(0, boss.hp / boss.maxHp), 14);
      g.lineStyle(2, 0x6b5a3a).strokeRect(x, 16, w, 14);
    }
    this.drawMiniOverlay();
  }
}
