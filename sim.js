// Shared tile rules — imported by BOTH the renderer (engine.js) and the verifier (verify.mjs)
// so "what kills you" is defined in exactly one place.

export const TS = 4;        // world units per tile
export const WALL_H = 6;    // wall height

// tiles that physically block movement (you collide with them)
export const SOLID = new Set(["#", "D", "P"]);
// tiles that render as plain, identical-looking floor (the lie)
export const FLOORLIKE = new Set([".", "S", "G", "^", "o", "J", "C"]);
// deadly-on-enter tiles -> [reason]
export const DEADLY = { "^": "spike", "J": "launch", "C": "crush", "~": "lava" };

// What happens when the player's CENTER enters this tile.
//  safe | win | die(reason) | fall  | solid (can't enter)
export function classify(ch) {
  if (ch === "G") return { kind: "win" };
  if (ch === "o") return { kind: "fall", reason: "pit" };
  if (ch in DEADLY) return { kind: "die", reason: DEADLY[ch] };
  if (SOLID.has(ch)) return { kind: "solid" };
  return { kind: "safe" }; // '.', 'S', and anything off-grid handled by caller
}

export function tileAt(grid, r, c) {
  if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return "#";
  return grid[r][c];
}

// 4-connected BFS over '.'/'S'/'G' — proves a memorizable safe route exists.
// Returns the path (array of [r,c]) from S to G, or null.
export function safePath(level) {
  const grid = level.grid;
  const S = level.start, G = level.goal;
  const standable = (ch) => ch === "." || ch === "S" || ch === "G";
  const key = (r, c) => r + "," + c;
  const q = [[S.r, S.c]];
  const prev = new Map([[key(S.r, S.c), null]]);
  while (q.length) {
    const [r, c] = q.shift();
    if (r === G.r && c === G.c) {
      const path = [];
      let k = key(r, c);
      while (k) { const [pr, pc] = k.split(",").map(Number); path.unshift([pr, pc]); k = prev.get(k); }
      return path;
    }
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nr = r + dr, nc = c + dc, nk = key(nr, nc);
      if (!prev.has(nk) && standable(tileAt(grid, nr, nc))) { prev.set(nk, key(r, c)); q.push([nr, nc]); }
    }
  }
  return null;
}
