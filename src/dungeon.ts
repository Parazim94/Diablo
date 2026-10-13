export const TILE = 32;
export const MAP_W = 64;
export const MAP_H = 64;

export interface Room { x: number; y: number; w: number; h: number }
export interface Dungeon { grid: boolean[][]; rooms: Room[] } // grid[y][x] === true -> floor

export function generateDungeon(): Dungeon {
  const grid: boolean[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  const rooms: Room[] = [];
  const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

  for (let i = 0; i < 80 && rooms.length < 14; i++) {
    const w = rand(6, 12), h = rand(6, 10);
    const x = rand(2, MAP_W - w - 3), y = rand(2, MAP_H - h - 3);
    const overlaps = rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y);
    if (overlaps) continue;
    rooms.push({ x, y, w, h });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = true;
  }

  const center = (r: Room) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
  const carve = (x: number, y: number) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) grid[y + dy][x + dx] = true;
  };
  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]), b = center(rooms[i]);
    let { x, y } = a;
    while (x !== b.x) { carve(x, y); x += Math.sign(b.x - x); }
    while (y !== b.y) { carve(x, y); y += Math.sign(b.y - y); }
  }
  return { grid, rooms };
}

/** Breadth-first search on the 4-neighbour grid. Returns tile coordinates, excluding the start. */
export function findPath(grid: boolean[][], sx: number, sy: number, tx: number, ty: number) {
  if (!grid[ty]?.[tx]) return null;
  const key = (x: number, y: number) => y * MAP_W + x;
  const prev = new Map<number, number>();
  const queue: [number, number][] = [[sx, sy]];
  prev.set(key(sx, sy), -1);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!grid[ny]?.[nx] || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path: { x: number; y: number }[] = [];
  for (let k = key(tx, ty); k !== -1 && k !== key(sx, sy); k = prev.get(k)!) {
    path.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
  }
  return path.reverse();
}
