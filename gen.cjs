/* Devil's Trap — deterministic level generator (build-time only).
   Produces levels.js: an open "room" of identical-looking floor tiles where ONLY a
   hidden serpentine path is safe. Every other interior tile is a trap. The path is
   found by a goal-biased randomized DFS, so it is ALWAYS solvable; the rest is salted
   with invisible (spike/pit/launch/crush) and visible (lava/pillar/fakedoor) hazards.
   Output is static data — the runtime never randomizes. */
const fs = require("fs");

// tiny deterministic LCG so regenerating gives identical, hand-tunable levels
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

const NAMES = [
  ["The Threshold",      "Just walk to the light. Easy."],
  ["Decorative Doors",   "The doors are a lie. Ignore them."],
  ["The Floor Lies",     "It looked solid. It wasn't."],
  ["Pillars of Salt",    "Don't look back. Don't step wrong."],
  ["Hot Floor",          "Mind the puddles. They bite."],
  ["Launch Window",      "That jump was illegal."],
  ["Overhead",           "Heads up. Too late."],
  ["The Long Con",       "Halfway is nowhere."],
  ["No Tells",           "You know the drill by now. You don't."],
  ["The Floor Is Lava",  "Literally. Run."],
];

// per-level interior footprint (cols W x rows H, including the 1-cell border)
const DIMS = [
  [9, 9], [9, 11], [11, 11], [11, 13], [11, 13],
  [13, 13], [13, 15], [13, 15], [15, 15], [15, 17],
];

function gen(idx) {
  const [W, H] = DIMS[idx];
  const rand = rng(20260619 + idx * 7919);
  const g = Array.from({ length: H }, () => Array(W).fill("o")); // interior defaults to hidden pit
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
    if (r === 0 || c === 0 || r === H - 1 || c === W - 1) g[r][c] = "#";

  const S = [1, 1], Gz = [H - 2, W - 2];
  const inb = (r, c) => r > 0 && c > 0 && r < H - 1 && c < W - 1;
  const key = (r, c) => r + "," + c;
  const visited = new Set();
  let path = null;

  // goal-biased randomized DFS — guaranteed to find a simple S->G path
  function dfs(r, c, acc) {
    if (path) return;
    visited.add(key(r, c)); acc.push([r, c]);
    if (r === Gz[0] && c === Gz[1]) { path = acc.slice(); return; }
    let dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    dirs.sort((a, b) => {
      const da = Math.abs(r + a[0] - Gz[0]) + Math.abs(c + a[1] - Gz[1]) + rand() * 1.7;
      const db = Math.abs(r + b[0] - Gz[0]) + Math.abs(c + b[1] - Gz[1]) + rand() * 1.7;
      return da - db;
    });
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && !visited.has(key(nr, nc))) dfs(nr, nc, acc);
      if (path) return;
    }
    acc.pop();
  }
  dfs(S[0], S[1], []);

  const onPath = new Set(path.map(([r, c]) => key(r, c)));
  for (const [r, c] of path) g[r][c] = ".";

  // collect non-path interior cells; some are adjacent to the path (prime bait spots)
  const offCells = [], baitCells = [];
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) {
    if (onPath.has(key(r, c))) continue;
    offCells.push([r, c]);
    const adj = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dr, dc]) => onPath.has(key(r + dr, c + dc)));
    if (adj) baitCells.push([r, c]);
  }
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  shuffle(baitCells); shuffle(offCells);

  const set = (r, c, ch) => { if (inb(r, c) && !onPath.has(key(r, c))) g[r][c] = ch; };

  // invisible bait traps right next to the safe path — the rage engine
  const wantBait = Math.min(baitCells.length, 3 + idx);
  for (let i = 0; i < wantBait; i++) {
    const [r, c] = baitCells[i];
    set(r, c, i % 3 === 0 ? "^" : "o"); // spike / pit
  }
  // one launch + one crusher next to the path (later levels), themed surprises
  if (idx >= 5 && baitCells[wantBait]) { const [r, c] = baitCells[wantBait]; set(r, c, "J"); }
  if (idx >= 6 && baitCells[wantBait + 1]) { const [r, c] = baitCells[wantBait + 1]; set(r, c, "C"); }

  // alternate the rest of the field between spike / pit so it isn't all one trap
  for (const [r, c] of offCells) if (g[r][c] === "o" && ((r + c) % 2 === 0)) set(r, c, "^");

  // visible obstacles — pillars (idx>=3) and a lava puddle (idx>=4) on off-path cells
  if (idx >= 3) { const n = 2 + Math.floor(idx / 2); for (let i = 0; i < n && i < offCells.length; i++) { const [r, c] = offCells[offCells.length - 1 - i]; set(r, c, "P"); } }
  if (idx >= 4) {
    // a small contiguous lava blob seeded off-path
    let seed = offCells.find(([r, c]) => g[r][c] === "^" || g[r][c] === "o");
    if (seed) {
      const blob = [seed], want = 2 + Math.floor(idx / 3);
      for (let i = 0; i < blob.length && blob.length < want; i++) {
        const [r, c] = blob[i];
        for (const [dr, dc] of shuffle([[0, 1], [1, 0], [0, -1], [-1, 0]])) {
          const nr = r + dr, nc = c + dc;
          if (inb(nr, nc) && !onPath.has(key(nr, nc)) && g[nr][nc] !== "~" && g[nr][nc] !== "P" && blob.length < want) blob.push([nr, nc]);
        }
      }
      for (const [r, c] of blob) set(r, c, "~");
    }
  }

  // fake "decorative" doors carved into the border walls (never at the S/G corners)
  const doors = 1 + Math.floor(idx / 2);
  const borderSpots = [];
  for (let c = 2; c < W - 2; c++) { borderSpots.push([0, c]); borderSpots.push([H - 1, c]); }
  for (let r = 2; r < H - 2; r++) { borderSpots.push([r, 0]); borderSpots.push([r, W - 1]); }
  shuffle(borderSpots);
  for (let i = 0; i < doors && i < borderSpots.length; i++) { const [r, c] = borderSpots[i]; g[r][c] = "D"; }

  g[S[0]][S[1]] = "S"; g[Gz[0]][Gz[1]] = "G";

  // rough seconds needed to walk the path, for the rising-lava finale timer
  const pathLen = path.length;
  return {
    name: NAMES[idx][0],
    taunt: NAMES[idx][1],
    grid: g.map((row) => row.join("")),
    pathLen,
    start: { r: S[0], c: S[1] },
    goal: { r: Gz[0], c: Gz[1] },
    risingLava: idx === 9,
    riseTime: idx === 9 ? Math.round(pathLen * 0.9 + 8) : 0,
  };
}

const LEVELS = DIMS.map((_, i) => gen(i));
const out =
  "// AUTO-GENERATED by gen.cjs — do not edit by hand. `node gen.cjs` to regenerate.\n" +
  "export const LEVELS = " + JSON.stringify(LEVELS, null, 1) + ";\n" +
  "export default LEVELS;\n";
fs.writeFileSync(require("path").join(__dirname, "levels.js"), out);

// console summary
LEVELS.forEach((L, i) => {
  const counts = {};
  L.grid.join("").split("").forEach((ch) => (counts[ch] = (counts[ch] || 0) + 1));
  console.log(
    `L${i + 1} ${L.name.padEnd(18)} ${L.grid[0].length}x${L.grid.length}  path=${L.pathLen}` +
    `  traps(^${counts["^"] || 0} o${counts["o"] || 0} ~${counts["~"] || 0} J${counts["J"] || 0} C${counts["C"] || 0} P${counts["P"] || 0} D${counts["D"] || 0})`
  );
});
