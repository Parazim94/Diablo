import { PlayerState } from './state';

const KEY = 'abgrund-save-v1';

export interface SaveData { player: ReturnType<PlayerState['toJSON']>; depth: number; loop: number }

export function saveGame(state: PlayerState, depth: number, loop: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ player: state.toJSON(), depth, loop } satisfies SaveData)); } catch { /* storage unavailable */ }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d?.player && typeof d.depth === 'number' ? d : null;
  } catch { return null; }
}

export function hasSave() { return loadGame() !== null; }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
