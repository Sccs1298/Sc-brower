// Backgammon rules engine. Pure JS (ESM) — runs in Node and in the browser.
//
// Absolute board: points[0..23]. Positive = white checkers, negative = black.
// White moves from 23 -> 0 and bears off below 0; white home = 0..5.
// Black moves from 0 -> 23 and bears off above 23; black home = 18..23.
//
// Moves are expressed in the mover's OWN perspective:
//   own index 0..23 (0 = deepest home point), BAR = 24, OFF = -1.

export const BAR = 24;
export const OFF = -1;
export const COLORS = ['w', 'b'];

export const other = (c) => (c === 'w' ? 'b' : 'w');
const sign = (c) => (c === 'w' ? 1 : -1);
export const toAbs = (c, i) => (c === 'w' ? i : 23 - i);
export const toOwn = (c, a) => (c === 'w' ? a : 23 - a);

export function initialState() {
  const points = new Array(24).fill(0);
  points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5;
  points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5;
  return { points, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
}

export function cloneState(s) {
  return { points: s.points.slice(), bar: { ...s.bar }, off: { ...s.off } };
}

export function stateKey(s) {
  return s.points.join(',') + '|' + s.bar.w + ',' + s.bar.b + '|' + s.off.w + ',' + s.off.b;
}

/** Number of `c`'s checkers on own index i. */
export function ownCount(s, c, i) {
  const v = s.points[toAbs(c, i)] * sign(c);
  return v > 0 ? v : 0;
}

/** Number of opponent checkers on `c`'s own index i. */
export function oppCount(s, c, i) {
  const v = -s.points[toAbs(c, i)] * sign(c);
  return v > 0 ? v : 0;
}

export function allHome(s, c) {
  if (s.bar[c] > 0) return false;
  for (let i = 6; i < 24; i++) if (ownCount(s, c, i) > 0) return false;
  return true;
}

/** Returns destination own-index (or OFF) if checker at `from` can move `die`, else null. */
export function singleTarget(s, c, from, die) {
  if (s.bar[c] > 0 && from !== BAR) return null;
  if (from === BAR) {
    if (s.bar[c] === 0) return null;
    const to = BAR - die;
    return oppCount(s, c, to) < 2 ? to : null;
  }
  if (from < 0 || from > 23 || ownCount(s, c, from) === 0) return null;
  const to = from - die;
  if (to >= 0) return oppCount(s, c, to) < 2 ? to : null;
  if (!allHome(s, c)) return null;
  if (to === -1) return OFF;
  for (let i = from + 1; i < 6; i++) if (ownCount(s, c, i) > 0) return null;
  return OFF;
}

/** Applies a single checker move (own perspective). Returns a new state. */
export function applyMove(s, c, m) {
  const n = cloneState(s);
  const sg = sign(c);
  if (m.from === BAR) n.bar[c]--;
  else n.points[toAbs(c, m.from)] -= sg;
  if (m.to === OFF) {
    n.off[c]++;
  } else {
    const a = toAbs(c, m.to);
    if (n.points[a] === -sg) { // hit a blot
      n.points[a] = 0;
      n.bar[other(c)]++;
    }
    n.points[a] += sg;
  }
  return n;
}

export function applySequence(s, c, seq) {
  let n = s;
  for (const m of seq) n = applyMove(n, c, m);
  return n;
}

function sources(s, c) {
  if (s.bar[c] > 0) return [BAR];
  const out = [];
  for (let i = 23; i >= 0; i--) if (ownCount(s, c, i) > 0) out.push(i);
  return out;
}

/**
 * All legal full-turn move sequences for dice [d1, d2].
 * Enforces: play as many dice as possible; if only one die can be played,
 * the larger must be played when possible. Sequences leading to identical
 * positions are de-duplicated. Returns [{ moves, state }]. If nothing is
 * playable, returns [{ moves: [], state }].
 */
export function legalSequences(s, c, dice) {
  const [d1, d2] = dice;
  const orders = d1 === d2 ? [[d1, d1, d1, d1]] : [[d1, d2], [d2, d1]];
  const results = [];
  let maxLen = 0;

  const rec = (st, rest, moves) => {
    let moved = false;
    if (rest.length > 0) {
      const die = rest[0];
      for (const from of sources(st, c)) {
        const to = singleTarget(st, c, from, die);
        if (to === null) continue;
        moved = true;
        const m = { from, to, die };
        rec(applyMove(st, c, m), rest.slice(1), moves.concat([m]));
      }
    }
    if (!moved) {
      if (moves.length > maxLen) maxLen = moves.length;
      results.push({ moves, state: st });
    }
  };
  for (const order of orders) rec(s, order, []);

  let filtered = results.filter((r) => r.moves.length === maxLen);
  if (maxLen === 1 && d1 !== d2) {
    const hi = Math.max(d1, d2);
    if (filtered.some((r) => r.moves[0].die === hi)) {
      filtered = filtered.filter((r) => r.moves[0].die === hi);
    }
  }
  const seen = new Set();
  const out = [];
  for (const r of filtered) {
    const k = stateKey(r.state);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.length ? out : [{ moves: [], state: s }];
}

export function pipCount(s, c) {
  let p = s.bar[c] * 25;
  for (let i = 0; i < 24; i++) p += ownCount(s, c, i) * (i + 1);
  return p;
}

export function checkerTotal(s, c) {
  let n = s.bar[c] + s.off[c];
  for (let i = 0; i < 24; i++) n += ownCount(s, c, i);
  return n;
}

/** If `winner` has borne off all checkers: 1 single, 2 gammon, 3 backgammon. */
export function winMultiplier(s, winner) {
  const loser = other(winner);
  if (s.off[loser] > 0) return 1;
  if (s.bar[loser] > 0) return 3;
  // Loser checkers inside the winner's home board (loser own idx 18..23).
  for (let i = 18; i < 24; i++) if (ownCount(s, loser, i) > 0) return 3;
  return 2;
}

export function sameMoves(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].from !== b[i].from || a[i].to !== b[i].to) return false;
  }
  return true;
}

/** Finds the legal sequence matching submitted moves (by from/to), or the same resulting position. */
export function matchSequence(legal, s, c, moves) {
  const exact = legal.find((l) => sameMoves(l.moves, moves));
  if (exact) return exact;
  // Accept any ordering of the same checker moves that yields a legal end position.
  try {
    let st = s;
    for (const m of moves) {
      if (typeof m.from !== 'number' || typeof m.to !== 'number') return null;
      st = applyMove(st, c, m);
    }
    const k = stateKey(st);
    if (moves.length !== (legal[0]?.moves.length ?? 0)) return null;
    return legal.find((l) => stateKey(l.state) === k) || null;
  } catch {
    return null;
  }
}
