// Game & match flow (pure, deterministic given a dice function).
import {
  initialState, legalSequences, matchSequence, winMultiplier, other, pipCount,
} from './board.js';

export const MAX_CUBE = 64;

/**
 * One game of backgammon.
 * diceFn(rollIndex) -> [d1, d2]  (deterministic stream; see server/dice.js)
 * Phases: 'roll' -> 'move' -> ... ; 'doubled' while a cube offer is pending; 'over'.
 */
export class Game {
  constructor({ diceFn, cubeEnabled = true, crawford = false }) {
    this.diceFn = diceFn;
    this.cubeEnabled = cubeEnabled && !crawford;
    this.crawford = crawford;
    this.state = initialState();
    this.cube = { value: 1, owner: null };
    this.rollIndex = 0;
    this.turn = null;
    this.dice = null;
    this.phase = 'init';
    this.legal = null;
    this.result = null; // { winner, multiplier, points, reason }
    this.log = [];
    this.plies = 0;
    this._opening();
  }

  _nextRoll() {
    const r = this.diceFn(this.rollIndex);
    this.rollIndex++;
    return r;
  }

  _opening() {
    let d;
    do { d = this._nextRoll(); } while (d[0] === d[1]);
    this.turn = d[0] > d[1] ? 'w' : 'b';
    this._startMove(d);
    this.log.push({ t: 'opening', dice: d, turn: this.turn });
  }

  _startMove(dice) {
    this.dice = dice;
    this.legal = legalSequences(this.state, this.turn, dice);
    this.phase = 'move';
    if (this.legal.length === 1 && this.legal[0].moves.length === 0) {
      this.log.push({ t: 'pass', color: this.turn, dice });
      this._endTurn();
    }
  }

  _endTurn() {
    this.plies++;
    this.turn = other(this.turn);
    this.dice = null;
    this.legal = null;
    this.phase = 'roll';
  }

  canDouble(color) {
    return this.phase === 'roll' && this.turn === color && this.cubeEnabled
      && this.cube.value < MAX_CUBE && (this.cube.owner === null || this.cube.owner === color);
  }

  /** True when the player on roll has no cube decision (so the server may auto-roll). */
  rollIsForced() {
    return this.phase === 'roll' && !this.canDouble(this.turn);
  }

  roll(color) {
    if (this.phase !== 'roll' || this.turn !== color) throw new Error('not your roll');
    const d = this._nextRoll();
    this.log.push({ t: 'roll', color, dice: d });
    this._startMove(d);
    return d;
  }

  move(color, moves) {
    if (this.phase !== 'move' || this.turn !== color) throw new Error('not your move');
    const seq = matchSequence(this.legal, this.state, color, moves);
    if (!seq) throw new Error('illegal move');
    this.state = seq.state;
    this.log.push({ t: 'move', color, dice: this.dice, moves: seq.moves });
    if (this.state.off[color] === 15) {
      const mult = winMultiplier(this.state, color);
      this._finish(color, mult, mult === 1 ? 'single' : mult === 2 ? 'gammon' : 'backgammon');
    } else {
      this._endTurn();
    }
    return seq;
  }

  double(color) {
    if (!this.canDouble(color)) throw new Error('cannot double');
    this.phase = 'doubled';
    this.log.push({ t: 'double', color, value: this.cube.value * 2 });
  }

  take(color) {
    if (this.phase !== 'doubled' || this.turn === color) throw new Error('no double to take');
    this.cube = { value: this.cube.value * 2, owner: color };
    this.phase = 'roll';
    this.log.push({ t: 'take', color });
  }

  drop(color) {
    if (this.phase !== 'doubled' || this.turn === color) throw new Error('no double to drop');
    this.log.push({ t: 'drop', color });
    this._finish(other(color), 1, 'drop');
  }

  resign(color) {
    if (this.phase === 'over') throw new Error('game over');
    // Resigning concedes what the opponent would win if the game ended now
    // (gammon if the resigner has borne off nothing) — prevents gammon-dodging.
    const winner = other(color);
    const mult = this.state.off[color] > 0 ? 1 : 2;
    this.log.push({ t: 'resign', color });
    this._finish(winner, mult, 'resign');
  }

  _finish(winner, multiplier, reason) {
    this.phase = 'over';
    this.dice = null;
    this.legal = null;
    this.result = { winner, multiplier, points: multiplier * this.cube.value, reason };
  }

  pips() {
    return { w: pipCount(this.state, 'w'), b: pipCount(this.state, 'b') };
  }

  snapshot() {
    return {
      state: this.state,
      cube: this.cube,
      cubeEnabled: this.cubeEnabled,
      crawford: this.crawford,
      turn: this.turn,
      dice: this.dice,
      phase: this.phase,
      result: this.result,
      pips: this.pips(),
      rollIndex: this.rollIndex,
    };
  }
}

/**
 * Classic match to `target` points between seats A and B.
 * Seat A plays white in odd games, black in even games (colors alternate).
 * gameDiceFn(gameIndex) -> diceFn
 */
export class ClassicMatch {
  constructor({ target = 5, cube = true, gameDiceFn }) {
    this.kind = 'classic';
    this.target = target;
    this.cube = cube;
    this.gameDiceFn = gameDiceFn;
    this.score = { A: 0, B: 0 };
    this.crawfordUsed = false;
    this.games = [];
    this.over = false;
    this.winner = null;
    this._newGame();
  }

  colorOf(seat, gi = this.games.length - 1) {
    const aWhite = gi % 2 === 0;
    return (seat === 'A') === aWhite ? 'w' : 'b';
  }

  seatOf(color, gi = this.games.length - 1) {
    return this.colorOf('A', gi) === color ? 'A' : 'B';
  }

  _newGame() {
    const gi = this.games.length;
    let crawford = false;
    if (this.target > 1 && !this.crawfordUsed
      && (this.score.A === this.target - 1 || this.score.B === this.target - 1)) {
      crawford = true;
      this.crawfordUsed = true;
    }
    const g = new Game({ diceFn: this.gameDiceFn(gi), cubeEnabled: this.cube && this.target > 1, crawford });
    this.games.push(g);
    return g;
  }

  /** Boards in play (always one for classic). */
  boards() { return [this.current()]; }
  current() { return this.games[this.games.length - 1]; }

  /** Call after any action; rolls over to next game when one ends. Returns true if a game just ended. */
  settle() {
    const g = this.current();
    if (g.phase !== 'over' || this.over) return false;
    const seat = this.seatOf(g.result.winner);
    this.score[seat] += g.result.points;
    if (this.score[seat] >= this.target) {
      this.over = true;
      this.winner = seat;
    } else {
      this._newGame();
    }
    return true;
  }
}

/**
 * Duplicate match: `pairs` rounds; in each round two boards are played at the
 * same time with the SAME dice stream. Board 1: A = white. Board 2: A = black.
 * Because both boards consume the identical roll sequence by roll index, each
 * player faces exactly the dice their opponent faced on the other board, so
 * luck cancels out. Total points over all boards decide the match.
 * Ties go to sudden-death extra rounds (up to maxExtra), then to the skill
 * tiebreak supplied by the caller (lower average engine-measured error).
 */
export class DuplicateMatch {
  constructor({ pairs = 1, cube = false, gameDiceFn, maxExtra = 2 }) {
    this.kind = 'duplicate';
    this.pairs = pairs;
    this.cube = cube;
    this.gameDiceFn = gameDiceFn;
    this.maxExtra = maxExtra;
    this.score = { A: 0, B: 0 };
    this.rounds = [];
    this.over = false;
    this.winner = null; // 'A' | 'B' | 'draw'
    this.tiebreak = null;
    this._newRound();
  }

  colorOf(seat, board) {
    return (seat === 'A') === (board === 0) ? 'w' : 'b';
  }

  seatOf(color, board) {
    return this.colorOf('A', board) === color ? 'A' : 'B';
  }

  _newRound() {
    const ri = this.rounds.length;
    const diceFn = this.gameDiceFn(ri);
    this.rounds.push([
      new Game({ diceFn, cubeEnabled: this.cube }),
      new Game({ diceFn, cubeEnabled: this.cube }),
    ]);
  }

  boards() { return this.rounds[this.rounds.length - 1]; }

  settle() {
    const round = this.boards();
    if (this.over || round.some((g) => g.phase !== 'over')) return false;
    if (round._settled) return false;
    round._settled = true;
    round.forEach((g, b) => {
      this.score[this.seatOf(g.result.winner, b)] += g.result.points;
    });
    const played = this.rounds.length;
    if (played >= this.pairs) {
      if (this.score.A !== this.score.B) {
        this.over = true;
        this.winner = this.score.A > this.score.B ? 'A' : 'B';
      } else if (played >= this.pairs + this.maxExtra) {
        this.over = true;
        this.winner = 'draw';
      } else {
        this._newRound();
      }
    } else {
      this._newRound();
    }
    return true;
  }
}
