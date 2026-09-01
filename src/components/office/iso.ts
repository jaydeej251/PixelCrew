export const TILE_W = 88;
export const TILE_H = 44;

export function toIso(x: number, y: number) {
  return {
    left: (x - y) * (TILE_W / 2),
    top: (x + y) * (TILE_H / 2),
  };
}

export function depth(x: number, y: number) {
  return Math.round((x + y) * 10);
}

export function shade(hex: string, amount: number) {
  const n = hex.replace("#", "");
  const num = Number.parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}
