import { Item, Slot, SLOTS, StatKey } from './items';

export const INV_SIZE = 20;

export class PlayerState {
  level = 1;
  xp = 0;
  points = 0;
  str = 0;
  vit = 0;
  inventory: (Item | null)[] = Array(INV_SIZE).fill(null);
  equipment: Record<Slot, Item | null> = { helmet: null, armor: null, weapon: null, boots: null, ring: null };
  hp: number;
  mana: number;

  constructor() { this.hp = this.maxHp; this.mana = this.maxMana; }

  gear(stat: StatKey) {
    return SLOTS.reduce((sum, s) => sum + (this.equipment[s]?.stats[stat] ?? 0), 0);
  }
  get maxHp() { return 100 + this.vit * 5 + (this.level - 1) * 10 + this.gear('life'); }
  get maxMana() { return 60 + (this.level - 1) * 3; }
  get dmgMin() { return 8 + this.str + this.gear('damage'); }
  get dmgMax() { return 14 + this.str + this.gear('damage'); }
  get armor() { return this.gear('armor'); }
  get reduction() { return this.armor / (this.armor + 60); }
  get crit() { return 5 + this.gear('crit'); }
  get xpToNext() { return Math.round(60 + 40 * Math.pow(this.level - 1, 1.5)); }

  /** Returns the number of levels gained. */
  addXp(n: number) {
    this.xp += n;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++; this.points += 2; gained++;
      this.hp = this.maxHp; this.mana = this.maxMana;
    }
    return gained;
  }

  addItem(item: Item) {
    const i = this.inventory.indexOf(null);
    if (i < 0) return false;
    this.inventory[i] = item;
    return true;
  }

  equip(index: number) {
    const item = this.inventory[index];
    if (!item) return;
    this.inventory[index] = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    this.clamp();
  }

  unequip(slot: Slot) {
    const item = this.equipment[slot];
    if (!item || !this.addItem(item)) return;
    this.equipment[slot] = null;
    this.clamp();
  }

  spend(stat: 'str' | 'vit') {
    if (this.points <= 0) return;
    this.points--; this[stat]++;
  }

  private clamp() { this.hp = Math.min(this.hp, this.maxHp); }
}
