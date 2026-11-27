// Elo rating. Duplicate matches are weighted higher (they carry less luck,
// so each result says more about skill).
export const START_RATING = 1500;

export function expected(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/** scoreA: 1 win, 0.5 draw, 0 loss. Returns [newA, newB]. */
export function updateElo(ra, rb, scoreA, { kind = 'classic', length = 1 } = {}) {
  const base = kind === 'duplicate' ? 32 : 20;
  const k = base * Math.min(2, Math.sqrt(Math.max(1, length)) / 1.5 + 0.5);
  const ea = expected(ra, rb);
  const d = Math.round(k * (scoreA - ea));
  return [ra + d, rb - d];
}
