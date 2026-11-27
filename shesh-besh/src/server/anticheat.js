// Fair-play monitoring (beta level).
//
// For every non-forced human move we compute, with the noiseless engine:
//   - error: how much worse the chosen move is than the engine's best
//   - top: whether the chosen move equals the engine's best
// Signals:
//   - ENGINE_MATCH: top-choice agreement unusually high over many moves
//   - FAST_PERFECT: consistently fast AND near-perfect moves (bot-like)
//   - SAME_NETWORK: two accounts from one network keep meeting (collusion / multi-account)
// Flags are reviewed by a human; they never auto-punish in the beta.
import { moveError } from '../engine/bot.js';

const MIN_MOVES = 150;

export class FairPlay {
  constructor(store) {
    this.store = store;
  }

  _stats(user) {
    user.fair ??= { moves: 0, top: 0, errorSum: 0, fastPerfect: 0 };
    return user.fair;
  }

  recordMove(user, legal, color, chosenIndex, thinkMs) {
    const { error, rank, forced } = moveError(legal, color, chosenIndex);
    if (forced) return null;
    const st = this._stats(user);
    st.moves++;
    st.errorSum += error;
    if (rank === 0) st.top++;
    if (rank === 0 && thinkMs < 1500 && legal.length > 8) st.fastPerfect++;
    this._check(user);
    return { error, rank };
  }

  avgError(user) {
    const st = this._stats(user);
    return st.moves ? st.errorSum / st.moves : null;
  }

  _check(user) {
    const st = user.fair;
    if (st.moves < MIN_MOVES || st.moves % 50 !== 0) return;
    const topRate = st.top / st.moves;
    if (topRate > 0.9) this.flag(user.id, 'ENGINE_MATCH', { topRate, moves: st.moves });
    if (st.fastPerfect / st.moves > 0.6) this.flag(user.id, 'FAST_PERFECT', { rate: st.fastPerfect / st.moves });
  }

  noteOpponents(a, b) {
    if (a.ipHash && a.ipHash === b.ipHash) this.flag(a.id, 'SAME_NETWORK', { other: b.id });
  }

  flag(userId, type, details) {
    this.store.data.flags.push({ at: new Date().toISOString(), userId, type, details, reviewed: false });
    this.store.save();
  }
}
