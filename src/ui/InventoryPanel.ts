import Phaser from 'phaser';
import { PlayerState, INV_SIZE } from '../state';
import { Item, SLOTS, Slot, SLOT_LABEL, SLOT_ABBR, STAT_LABEL, RARITY_COLOR, RARITY_CSS, StatKey } from '../items';

const CELL = 44, COLS = 5, W = 600, H = 350;
const FONT = { fontFamily: 'serif', fontSize: '15px', color: '#d8cdb4' };

export class InventoryPanel {
  private box: Phaser.GameObjects.Container;
  private tip: Phaser.GameObjects.Container;
  private tipName: Phaser.GameObjects.Text;
  private tipBody: Phaser.GameObjects.Text;
  private tipBg: Phaser.GameObjects.Rectangle;
  visible = false;

  constructor(private scene: Phaser.Scene, private s: PlayerState, private onDrop: (item: Item) => void) {
    this.box = scene.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    this.tipBg = scene.add.rectangle(0, 0, 10, 10, 0x0b0807, 0.95).setOrigin(0).setStrokeStyle(1, 0x6b5a3a);
    this.tipName = scene.add.text(8, 6, '', { ...FONT, fontSize: '16px' });
    this.tipBody = scene.add.text(8, 28, '', FONT);
    this.tip = scene.add.container(0, 0, [this.tipBg, this.tipName, this.tipBody]).setScrollFactor(0).setDepth(300).setVisible(false);
    scene.scale.on('resize', () => this.place());
    this.place();
  }

  toggle() {
    this.visible = !this.visible;
    this.box.setVisible(this.visible);
    if (!this.visible) this.tip.setVisible(false);
    else this.refresh();
  }

  private place() {
    const { width, height } = this.scene.scale;
    this.box.setPosition((width - W) / 2, (height - H) / 2 - 20);
  }

  refresh() {
    if (!this.visible) return;
    this.box.removeAll(true);
    const s = this.s, sc = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.box.add(o); return o; };

    // Background also swallows clicks so the game world doesn't react.
    add(sc.add.rectangle(0, 0, W, H, 0x120d0b, 0.96).setOrigin(0).setStrokeStyle(2, 0x6b5a3a).setInteractive());
    add(sc.add.text(W / 2, 12, 'Charakter & Inventar', { ...FONT, fontSize: '20px', color: '#e8d9a8' }).setOrigin(0.5, 0));

    // Stats
    const lines = [
      `Stufe ${s.level}`,
      `Leben ${Math.ceil(s.hp)} / ${s.maxHp}`,
      `Schaden ${s.dmgMin}–${s.dmgMax}`,
      `Rüstung ${s.armor} (−${Math.round(s.reduction * 100)}%)`,
      `Krit. Treffer ${s.crit}%`,
    ];
    add(sc.add.text(16, 48, lines.join('\n'), { ...FONT, lineSpacing: 4 }));
    add(sc.add.text(16, 150, `Stärke ${s.str}`, FONT));
    add(sc.add.text(16, 176, `Vitalität ${s.vit}`, FONT));
    add(sc.add.text(16, 210, `Punkte: ${s.points}`, { ...FONT, color: s.points ? '#ffe14a' : '#8a806a' }));
    (['str', 'vit'] as const).forEach((k, i) => {
      if (s.points <= 0) return;
      const b = add(sc.add.text(130, 148 + i * 26, '[+]', { ...FONT, color: '#8fe08f' }).setInteractive({ useHandCursor: true }));
      b.on('pointerdown', () => { s.spend(k); this.refresh(); });
    });

    // Equipment column
    SLOTS.forEach((slot, i) => this.drawEquipSlot(slot, 190, 48 + i * 52, add));

    // Inventory grid
    const gx = 330, gy = 64;
    add(sc.add.text(gx, gy - 22, 'Inventar  (Klick: anlegen · Rechtsklick: wegwerfen)', { ...FONT, fontSize: '12px', color: '#8a806a' }));
    for (let i = 0; i < INV_SIZE; i++) {
      const x = gx + (i % COLS) * (CELL + 4), y = gy + 4 + Math.floor(i / COLS) * (CELL + 4);
      this.drawCell(s.inventory[i], x, y, add, (p) => {
        const item = s.inventory[i]; if (!item) return;
        if (p.rightButtonDown()) { s.inventory[i] = null; this.onDrop(item); }
        else s.equip(i);
        this.tip.setVisible(false); this.refresh();
      });
    }
  }

  private drawEquipSlot(slot: Slot, x: number, y: number, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    add(this.scene.add.text(x + CELL + 8, y + 14, SLOT_LABEL[slot], { ...FONT, color: '#8a806a' }));
    this.drawCell(this.s.equipment[slot], x, y, add, () => { this.s.unequip(slot); this.tip.setVisible(false); this.refresh(); }, SLOT_ABBR[slot]);
  }

  private drawCell(item: Item | null, x: number, y: number, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    onClick: (p: Phaser.Input.Pointer) => void, hint = '') {
    const sc = this.scene;
    const color = item ? RARITY_COLOR[item.rarity] : 0x3a302a;
    const r = add(sc.add.rectangle(x, y, CELL, CELL, item ? 0x241b16 : 0x181210).setOrigin(0).setStrokeStyle(2, color).setInteractive({ useHandCursor: !!item }));
    if (item) add(sc.add.text(x + CELL / 2, y + CELL / 2, SLOT_ABBR[item.slot], { ...FONT, fontSize: '16px', color: RARITY_CSS[item.rarity] }).setOrigin(0.5));
    else if (hint) add(sc.add.text(x + CELL / 2, y + CELL / 2, hint, { ...FONT, color: '#3a302a' }).setOrigin(0.5));
    r.on('pointerdown', onClick);
    r.on('pointerover', (p: Phaser.Input.Pointer) => item && this.showTip(item, p));
    r.on('pointermove', (p: Phaser.Input.Pointer) => item && this.showTip(item, p));
    r.on('pointerout', () => this.tip.setVisible(false));
  }

  private showTip(item: Item, p: Phaser.Input.Pointer) {
    const body = [`${SLOT_LABEL[item.slot]} · Stufe ${item.ilvl}`,
      ...(Object.entries(item.stats) as [StatKey, number][]).map(([k, v]) => STAT_LABEL[k](v))].join('\n');
    this.tipName.setText(item.name).setColor(RARITY_CSS[item.rarity]);
    this.tipBody.setText(body);
    const w = Math.max(this.tipName.width, this.tipBody.width) + 16, h = 36 + this.tipBody.height;
    this.tipBg.setSize(w, h);
    const { width, height } = this.scene.scale;
    this.tip.setPosition(Math.min(p.x + 16, width - w - 4), Math.min(p.y + 16, height - h - 4)).setVisible(true);
  }
}
