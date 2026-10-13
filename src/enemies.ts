export interface EnemyType {
  key: string;
  name: string;
  hp: number;
  speed: number;
  dmg: [number, number];
  range: number;   // melee reach, or preferred shooting distance when ranged
  aggro: number;
  cooldown: number;
  xp: number;
  ranged: boolean;
  body: number;
  eye: number;
}

export const MAX_DEPTH = 5;

export const TYPES: Record<string, EnemyType> = {
  zombie:   { key: 'zombie',   name: 'Zombie',        hp: 55, speed: 55,  dmg: [5, 9],  range: 28,  aggro: 200, cooldown: 1200, xp: 30, ranged: false, body: 0x6b7a4a, eye: 0xd04040 },
  skeleton: { key: 'skeleton', name: 'Skelett',       hp: 30, speed: 90,  dmg: [3, 7],  range: 28,  aggro: 220, cooldown: 900,  xp: 25, ranged: false, body: 0xd8d4c0, eye: 0x202020 },
  imp:      { key: 'imp',      name: 'Imp',           hp: 18, speed: 140, dmg: [2, 5],  range: 26,  aggro: 260, cooldown: 700,  xp: 20, ranged: false, body: 0xc04828, eye: 0xffe060 },
  archer:   { key: 'archer',   name: 'Bogenschütze',  hp: 22, speed: 75,  dmg: [4, 8],  range: 190, aggro: 300, cooldown: 1600, xp: 35, ranged: true,  body: 0x5a4a80, eye: 0xe0e0ff },
  boss:     { key: 'boss',     name: 'Fürst der Tiefe', hp: 700, speed: 80, dmg: [14, 22], range: 40, aggro: 450, cooldown: 1100, xp: 500, ranged: false, body: 0x8a1c3c, eye: 0xffd040 },
};

export function pickType(depth: number): EnemyType {
  const pool = ['zombie', 'skeleton', 'skeleton', 'imp'];
  if (depth >= 2) pool.push('archer', 'archer');
  return TYPES[pool[Math.floor(Math.random() * pool.length)]];
}
