export type Slot = 'helmet' | 'armor' | 'weapon' | 'boots' | 'ring';
export type StatKey = 'damage' | 'armor' | 'life' | 'crit';
export type Rarity = 'normal' | 'magic' | 'rare' | 'legendary';

export interface Item {
  name: string;
  slot: Slot;
  rarity: Rarity;
  ilvl: number;
  stats: Partial<Record<StatKey, number>>;
}

export const SLOTS: Slot[] = ['helmet', 'armor', 'weapon', 'boots', 'ring'];
export const SLOT_LABEL: Record<Slot, string> = { helmet: 'Helm', armor: 'Rüstung', weapon: 'Waffe', boots: 'Stiefel', ring: 'Ring' };
export const SLOT_ABBR: Record<Slot, string> = { helmet: 'HE', armor: 'BR', weapon: 'WA', boots: 'ST', ring: 'RI' };
export const STAT_LABEL: Record<StatKey, (v: number) => string> = {
  damage: v => `+${v} Schaden`,
  armor: v => `+${v} Rüstung`,
  life: v => `+${v} Leben`,
  crit: v => `+${v}% kritischer Treffer`,
};
export const RARITY_COLOR: Record<Rarity, number> = { normal: 0xcfcfcf, magic: 0x6f8fff, rare: 0xffe14a, legendary: 0xff8a2a };
export const RARITY_CSS: Record<Rarity, string> = { normal: '#cfcfcf', magic: '#6f8fff', rare: '#ffe14a', legendary: '#ff8a2a' };

const BASE: Record<Slot, { names: string[]; stat: StatKey; base: number; perLevel: number }> = {
  weapon: { names: ['Schwert', 'Streitaxt', 'Keule', 'Breitschwert'], stat: 'damage', base: 3, perLevel: 1.2 },
  helmet: { names: ['Kappe', 'Eisenhelm', 'Kronenhelm'], stat: 'armor', base: 3, perLevel: 1.0 },
  armor: { names: ['Lederharnisch', 'Kettenhemd', 'Plattenpanzer'], stat: 'armor', base: 5, perLevel: 1.6 },
  boots: { names: ['Stiefel', 'Eisenschuhe', 'Wanderstiefel'], stat: 'armor', base: 2, perLevel: 0.8 },
  ring: { names: ['Ring', 'Siegelring', 'Reif'], stat: 'life', base: 8, perLevel: 3 },
};
const AFFIX: Record<StatKey, { base: number; perLevel: number; suffix: string }> = {
  damage: { base: 1, perLevel: 0.6, suffix: 'der Stärke' },
  armor: { base: 2, perLevel: 1.0, suffix: 'des Bären' },
  life: { base: 6, perLevel: 3, suffix: 'der Lebenskraft' },
  crit: { base: 1, perLevel: 0.25, suffix: 'des Falken' },
};
const RARE_NAMES = ['Grimmzahn', 'Blutschwur', 'Nachtbrand', 'Eisenwille', 'Schädelbrecher', 'Aschenherz'];
const LEGENDARY: Record<Slot, string[]> = {
  weapon: ['Zorn des Urkönigs', 'Seelenspalter'],
  helmet: ['Krone der Verdammten'],
  armor: ['Bollwerk des Ewigen Wächters'],
  boots: ['Schritt des Todes'],
  ring: ['Siegel der Unendlichkeit'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function rollRarity(bonus = 0): Rarity {
  const r = Math.random() * 100 - bonus;
  if (r < 2) return 'legendary';
  if (r < 10) return 'rare';
  if (r < 35) return 'magic';
  return 'normal';
}

export function generateItem(ilvl: number, rarity: Rarity = rollRarity()): Item {
  const slot = pick(SLOTS);
  const b = BASE[slot];
  const mult = rarity === 'legendary' ? 1.4 : 1;
  const stats: Item['stats'] = {};
  stats[b.stat] = Math.round((b.base + ilvl * b.perLevel) * mult);

  const affixCount = { normal: 0, magic: 1, rare: 3, legendary: 4 }[rarity];
  const keys = Object.keys(AFFIX) as StatKey[];
  let firstAffix: StatKey | null = null;
  for (let i = 0; i < affixCount; i++) {
    const k = pick(keys);
    const a = AFFIX[k];
    const v = Math.max(1, Math.round((a.base + ilvl * a.perLevel * Math.random() + Math.random() * a.base) * mult));
    stats[k] = (stats[k] ?? 0) + v;
    firstAffix ??= k;
  }

  const base = pick(b.names);
  const name =
    rarity === 'legendary' ? pick(LEGENDARY[slot]) :
    rarity === 'rare' ? `${pick(RARE_NAMES)}-${base}` :
    rarity === 'magic' ? `${base} ${AFFIX[firstAffix!].suffix}` : base;
  return { name, slot, rarity, ilvl, stats };
}
