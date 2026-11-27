// Heuristic backgammon AI with adjustable strength (pure JS).
// Strength is controlled by evaluation noise: the same evaluator is used at
// every level, weaker levels add random error to each candidate's score.
// The noiseless evaluator also powers the anti-cheat / move-quality metric.
import { ownCount, oppCount, pipCount, other, toOwn, legalSequences } from './board.js';

export const LEVELS = {
  expert: { noise: 0, label: 'מומחה' },
  strong: { noise: 3, label: 'חזק' },
  intermediate: { noise: 8, label: 'בינוני' },
  beginner: { noise: 20, label: 'מתחיל' },
  random: { noise: Infinity, label: 'אקראי' },
};

const ROLLS = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

/** Is own point i blocked for `c` (opponent has 2+)? */
const blocked = (s, c, i) => i >= 0 && i <= 23 && oppCount(s, c, i) >= 2;

/**
 * Probability (0..1) that opponent hits c's blot at own index i next roll.
 * Approximation: considers direct and combination shots, intermediate landing
 * points, ignores bar-entry restrictions for the hitter.
 */
function shotProbability(s, c, i) {
  const o = other(c);
  // Opponent checkers positions in opponent's own perspective; blot position in o's perspective:
  const target = 23 - i;
  const hitters = [];
  if (s.bar[o] > 0) hitters.push(24);
  for (let j = target + 1; j < 24; j++) if (ownCount(s, o, j) > 0) hitters.push(j);
  if (!hitters.length) return 0;
  // Blocked check for the hitter (o) at its own index k means c has 2+ there.
  const blk = (k) => k >= 0 && k <= 23 && ownCount(s, c, 23 - k) >= 2;
  let hits = 0;
  for (const [a, b, w] of ROLLS) {
    let hit = false;
    for (const h of hitters) {
      const d = h - target;
      if (a !== b) {
        if (d === a || d === b) { hit = true; break; }
        if (d === a + b && (!blk(h - a) || !blk(h - b))) { hit = true; break; }
      } else {
        for (let k = 1; k <= 4; k++) {
          if (blk(h - a * k) && k * a < d) break;
          if (d === a * k) { hit = true; break; }
        }
        if (hit) break;
      }
    }
    if (hit) hits += w;
  }
  return hits / 36;
}

function hasContact(s, c) {
  // c's rearmost checker (own idx) vs opponent's rearmost checker expressed in c's own coords.
  let myBack = -1;
  if (s.bar[c] > 0) myBack = 24;
  else for (let i = 23; i >= 0; i--) if (ownCount(s, c, i) > 0) { myBack = i; break; }
  const o = other(c);
  if (s.bar[o] > 0) return true;
  let oppBackInMine = 24;
  for (let i = 0; i < 24; i++) if (oppCount(s, c, i) > 0) { oppBackInMine = i; break; }
  return myBack > oppBackInMine;
}

/** Static evaluation of position `s` from the perspective of `c` who just moved. Higher = better. */
export function evaluate(s, c) {
  const o = other(c);
  if (s.off[c] === 15) return 1000;
  const myPip = pipCount(s, c);
  const opPip = pipCount(s, o);

  if (!hasContact(s, c)) {
    // Pure race: pips dominate; small penalty for checkers far from home & gaps.
    let waste = 0;
    for (let i = 6; i < 24; i++) waste += ownCount(s, c, i) * 0.5;
    return (opPip - myPip) * 1.2 + s.off[c] * 1.5 - waste;
  }

  let score = (opPip - myPip) * 0.6;
  // Made points & primes.
  let run = 0; let best = 0; let homeMade = 0;
  for (let i = 0; i < 24; i++) {
    const n = ownCount(s, c, i);
    if (n >= 2) {
      run++; best = Math.max(best, run);
      if (i <= 5) { homeMade++; score += 3; }
      if (i === 6) score += 3;
      if (i === 3 || i === 4) score += 2.5;
      if (i >= 18) score += 2.5; // anchor in opponent's home board
      if (i > 6 && i < 18) score += 1.2;
      if (n > 3) score -= (n - 3) * 0.5; // stacking
    } else {
      run = 0;
    }
  }
  score += best * best * 1.3;

  // Blot exposure.
  for (let i = 0; i < 24; i++) {
    if (ownCount(s, c, i) === 1) {
      const p = shotProbability(s, c, i);
      score -= p * ((24 - i) * 0.55 + 5 + homeMadeOpp(s, o) * 1.5);
    }
  }

  // Opponent checkers on the bar are worth more against a strong home board.
  score += s.bar[o] * (6 + homeMade * 2.5);
  score -= s.bar[c] * 6;
  score += s.off[c] * 1.5;
  return score;
}

function homeMadeOpp(s, o) {
  let n = 0;
  for (let i = 0; i <= 5; i++) if (ownCount(s, o, i) >= 2) n++;
  return n;
}

function gauss(rng) {
  const u = 1 - rng(); const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Scores every legal sequence with the noiseless evaluator. */
export function scoreSequences(legal, c) {
  return legal.map((l) => evaluate(l.state, c));
}

/** Choose a sequence index for `level`. rng: () => [0,1). */
export function chooseSequence(legal, c, level = 'expert', rng = Math.random) {
  if (legal.length === 1) return 0;
  const noise = (LEVELS[level] ?? LEVELS.expert).noise;
  if (noise === Infinity) return Math.floor(rng() * legal.length);
  let bestI = 0; let bestV = -Infinity;
  for (let i = 0; i < legal.length; i++) {
    const v = evaluate(legal[i].state, c) + (noise ? gauss(rng) * noise : 0);
    if (v > bestV) { bestV = v; bestI = i; }
  }
  return bestI;
}

/** Rough "position strength" for cube decisions, from c's perspective (c on roll). */
export function cubeView(s, c) {
  const myPip = pipCount(s, c);
  const opPip = pipCount(s, other(c));
  if (!hasContact(s, c) && !hasContact(s, other(c))) {
    return { race: true, lead: (opPip - myPip) / Math.max(myPip, 1) };
  }
  return { race: false, score: evaluate(s, c) - evaluate(s, other(c)) };
}

export function shouldDouble(s, c, level = 'expert') {
  if (level === 'random') return false;
  const v = cubeView(s, c);
  return v.race ? v.lead > 0.09 && v.lead < 0.25 : v.score > 30 && v.score < 70;
}

export function shouldTake(s, c, level = 'expert') {
  if (level === 'random') return Math.random() < 0.5;
  // c is the one being doubled, opponent is on roll.
  const v = cubeView(s, other(c));
  return v.race ? v.lead < 0.2 : v.score < 60;
}

/** Equity-like loss of a chosen sequence vs the best (noiseless). Used for move-quality stats. */
export function moveError(legal, c, chosenIndex) {
  if (legal.length <= 1) return { error: 0, rank: 0, forced: true };
  const scores = scoreSequences(legal, c);
  const best = Math.max(...scores);
  const chosen = scores[chosenIndex];
  const rank = scores.filter((x) => x > chosen).length;
  return { error: best - chosen, rank, forced: false };
}

export { legalSequences, toOwn };
