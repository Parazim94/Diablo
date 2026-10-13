import Phaser from 'phaser';
import { PlayerState, INV_SIZE } from '../state';
import { Item, SLOTS, Slot, SLOT_LABEL, SLOT_ABBR, STAT_LABEL, RARITY_COLOR, RARITY_CSS, StatKey, iconOf } from '../items';
import { sfx } from '../audio';

const CELL = 44, COLS = 5, W = 600, H = 350;
const FONT = { fontFamily: 'serif', fontSize: '15px', color: '#d8cdb4' };

type Selection = { kind: 'inv'; index: number } | { kind: 'eq'; slot: Slot } | null;
type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

export class InventoryPanel {
  private box: Phaser.GameObjects.Container;
  private tip: Phaser.GameObjects.Container;
  private tipName: Phaser.GameObjects.Text;
  private tipBody: Phaser.GameObjects.Text;
  private tipBg: Phaser.GameObjects.Rectangle;
  private sel: Selection = null;
  visible = false;

  constructor(private scene: Phaser.Scene, private s: PlayerState, private onDrop: (item: Item) => void, private onClose: () => void) {
    this.box = scene.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    this.tipBg = scene.add.rectangle(0, 0, 10, 10, 0x0b0807, 0.95).setOrigin(0).setStrokeStyle(1, 0x6b5a3a);
    this.tipName = scene.add.text(8, 6, '', { ...FONT, fontSize: '16px' });
    this.tipBody = scene.add.text(8, 28, '', FONT);
    this.tip = scene.add.container(0, 0, [this.tipBg, this.tipName, this.tipBody]).setScrollFactor(0).setDepth(300).setVisible(false);
    scene.scale.on('resize', this.place, this);
    scene.events.once('shutdown', () => scene.scale.off('resize', this.place, this));
    this.place();
  }

  toggle() {
    this.visible = !this.visible;
    this.box.setVisible(this.visible);
    this.sel = null;
    if (!this.visible) this.tip.setVisible(false);
    else this.refresh();
  }

  /** Scales the panel down so it fits small (phone) screens. */
  private place() {
    const { width, height } = this.scene.scale;
    const k = Math.min(1, (width - 8) / W, (height - 8) / H);
    this.box.setScale(k).setPosition((width - W * k) / 2, Math.max(4, (height - H * k) / 2 - 10 * k));
  }

  private selItem(): Item | null {
    if (!this.sel) return null;
    return this.sel.kind === 'inv' ? this.s.inventory[this.sel.index] : this.s.equipment[this.sel.slot];
  }

  refresh() {
    if (!this.visible) return;
    this.place();
    this.box.removeAll(true);
    const s = this.s, sc = this.scene;
    // Children need scroll factor 0 too, otherwise their hit areas drift with the camera.
    const add: Add = o => { (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0); this.box.add(o); return o; };

    // Background also swallows clicks so the game world doesn't react.
    add(sc.add.rectangle(0, 0, W, H, 0x120d0b, 0.96).setOrigin(0).setStrokeStyle(2, 0x6b5a3a).setInteractive());
    add(sc.add.text(W / 2, 12, 'Charakter & Inventar', { ...FONT, fontSize: '20px', color: '#e8d9a8' }).setOrigin(0.5, 0));
    const close = add(sc.add.text(W - 12, 8, '[X]', { ...FONT, fontSize: '22px', color: '#b8ad90', padding: { x: 8, y: 4 } })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true }));
    close.on('pointerdown', () => this.onClose());

    const card = this.selItem();
    if (card) this.drawCard(card, add);
    else this.drawStats(add);

    SLOTS.forEach((slot, i) => this.drawEquipSlot(slot, 190, 48 + i * 52, add));

    const gx = 330, gy = 64;
    add(sc.add.text(gx, gy - 22, 'Inventar · Rechtsklick: wegwerfen', { ...FONT, fontSize: '12px', color: '#8a806a' }));
    for (let i = 0; i < INV_SIZE; i++) {
      const x = gx + (i % COLS) * (CELL + 4), y = gy + 4 + Math.floor(i / COLS) * (CELL + 4);
      const isSel = this.sel?.kind === 'inv' && this.sel.index === i;
      this.drawCell(s.inventory[i], x, y, add, p => {
        const item = s.inventory[i];
        if (!item) { this.sel = null; this.refresh(); return; }
        if (p.wasTouch) { this.sel = { kind: 'inv', index: i }; this.refresh(); return; }
        if (p.rightButtonDown()) { s.inventory[i] = null; this.onDrop(item); }
        else { s.equip(i); sfx.play('equip'); }
        this.tip.setVisible(false); this.refresh();
      }, '', isSel);
    }
  }

  private drawStats(add: Add) {
    const s = this.s, sc = this.scene;
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
      const b = add(sc.add.text(128, 144 + i * 26, '[+]', { ...FONT, fontSize: '20px', color: '#8fe08f', padding: { x: 6, y: 4 } }).setInteractive({ useHandCursor: true }));
      b.on('pointerdown', () => { s.spend(k); this.refresh(); });
    });
  }

  /** Detail card with action buttons – replaces hover tooltips on touch screens. */
  private drawCard(item: Item, add: Add) {
    const sc = this.scene, sel = this.sel!;
    add(sc.add.text(16, 46, item.name, { ...FONT, fontSize: '17px', color: RARITY_CSS[item.rarity], wordWrap: { width: 164 } }));
    const stats = (Object.entries(item.stats) as [StatKey, number][]).map(([k, v]) => STAT_LABEL[k](v));
    add(sc.add.text(16, 96, [`${SLOT_LABEL[item.slot]} · Stufe ${item.ilvl}`, ...stats].join('\n'), { ...FONT, lineSpacing: 4, wordWrap: { width: 164 } }));

    const button = (label: string, y: number, color: string, fn: () => void) => {
      const t = add(sc.add.text(16, y, label, { ...FONT, fontSize: '18px', color, backgroundColor: '#2a211b', padding: { x: 12, y: 8 } })
        .setInteractive({ useHandCursor: true }));
      t.on('pointerdown', () => { fn(); this.sel = null; this.refresh(); });
    };
    if (sel.kind === 'inv') {
      button('Anlegen', 232, '#8fe08f', () => { this.s.equip(sel.index); sfx.play('equip'); });
      button('Wegwerfen', 282, '#e08080', () => { const it = this.s.inventory[sel.index]; this.s.inventory[sel.index] = null; if (it) this.onDrop(it); });
    } else {
      button('Ablegen', 232, '#8fe08f', () => { this.s.unequip(sel.slot); sfx.play('equip'); });
    }
  }

  private drawEquipSlot(slot: Slot, x: number, y: number, add: Add) {
    add(this.scene.add.text(x + CELL + 8, y + 14, SLOT_LABEL[slot], { ...FONT, color: '#8a806a' }));
    const isSel = this.sel?.kind === 'eq' && this.sel.slot === slot;
    this.drawCell(this.s.equipment[slot], x, y, add, p => {
      if (!this.s.equipment[slot]) return;
      if (p.wasTouch) { this.sel = { kind: 'eq', slot }; this.refresh(); return; }
      this.s.unequip(slot); sfx.play('equip'); this.tip.setVisible(false); this.refresh();
    }, SLOT_ABBR[slot], isSel);
  }

  private drawCell(item: Item | null, x: number, y: number, add: Add, onClick: (p: Phaser.Input.Pointer) => void, hint = '', selected = false) {
    const sc = this.scene;
    const color = selected ? 0xffffff : item ? RARITY_COLOR[item.rarity] : 0x3a302a;
    const r = add(sc.add.rectangle(x, y, CELL, CELL, item ? 0x241b16 : 0x181210).setOrigin(0).setStrokeStyle(selected ? 4 : 2, color)
      .setInteractive({ useHandCursor: !!item }));
    if (item) add(sc.add.image(x + CELL / 2, y + CELL / 2, 'tiles', iconOf(item)).setScale(2));
    else if (hint) add(sc.add.text(x + CELL / 2, y + CELL / 2, hint, { ...FONT, color: '#3a302a' }).setOrigin(0.5));
    r.on('pointerdown', onClick);
    const show = (p: Phaser.Input.Pointer) => { if (item && !p.wasTouch) this.showTip(item, p); };
    r.on('pointerover', show); r.on('pointermove', show);
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
