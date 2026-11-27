// A live match between two seats (humans and/or bots), server-authoritative.
import crypto from 'node:crypto';
import { ClassicMatch, DuplicateMatch } from '../engine/game.js';
import { chooseSequence, shouldDouble, shouldTake } from '../engine/bot.js';
import { matchSequence } from '../engine/board.js';
import { newServerSeed, combineClientSeeds, gameDiceFactory } from './dice.js';

export const TURN_LIMIT_MS = 90_000; // per decision; exceeding it forfeits the current game
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 700);

export class MatchSession {
  /**
   * seats: { A: {userId?, bot?, name, rating, clientSeed}, B: {...} }
   * config: { mode: 'classic'|'duplicate', length, cube }
   */
  constructor({ seats, config, hooks, tournamentId = null }) {
    this.id = 'm_' + crypto.randomBytes(6).toString('hex');
    this.seats = seats;
    this.config = config;
    this.hooks = hooks; // { send(userId,msg), onMove(userId,legal,color,idx,ms), onEnd(session) }
    this.tournamentId = tournamentId;
    const { serverSeed, commitment } = newServerSeed();
    this.serverSeed = serverSeed;
    this.commitment = commitment;
    this.clientSeed = combineClientSeeds([seats.A.clientSeed, seats.B.clientSeed]);
    const gameDiceFn = gameDiceFactory(serverSeed, this.clientSeed);
    this.match = config.mode === 'duplicate'
      ? new DuplicateMatch({ pairs: config.length, cube: !!config.cube, gameDiceFn })
      : new ClassicMatch({ target: config.length, cube: config.cube !== false, gameDiceFn });
    this.startedAt = Date.now();
    this.turnStart = new Map(); // boardIndex -> ms
    this.timers = new Map();
    this.ended = false;
    this.events = [];
  }

  colorOf(seat, board) {
    return this.match.kind === 'duplicate' ? this.match.colorOf(seat, board) : this.match.colorOf(seat);
  }

  seatOfColor(color, board) {
    return this.match.kind === 'duplicate' ? this.match.seatOf(color, board) : this.match.seatOf(color);
  }

  seatOfUser(userId) {
    if (this.seats.A.userId === userId) return 'A';
    if (this.seats.B.userId === userId) return 'B';
    return null;
  }

  /** Seat that must act on board b, or null. */
  actor(b) {
    const g = this.match.boards()[b];
    if (!g || g.phase === 'over') return null;
    if (g.phase === 'doubled') return this.seatOfColor(g.turn === 'w' ? 'b' : 'w', b);
    return this.seatOfColor(g.turn, b);
  }

  start() {
    this.broadcast();
    this.pump();
  }

  act(userId, { board = 0, action, moves }) {
    if (this.ended) throw new Error('match over');
    const seat = this.seatOfUser(userId);
    if (!seat) throw new Error('not a player');
    const g = this.match.boards()[board];
    if (!g) throw new Error('no such board');
    const color = this.colorOf(seat, board);
    const t0 = this.turnStart.get(board) ?? Date.now();
    switch (action) {
      case 'roll': g.roll(color); break;
      case 'double': g.double(color); break;
      case 'take': g.take(color); break;
      case 'drop': g.drop(color); break;
      case 'resign': g.resign(color); break;
      case 'move': {
        const legal = g.legal;
        const seq = matchSequence(legal, g.state, color, moves || []);
        if (!seq) throw new Error('illegal move');
        const idx = legal.indexOf(seq);
        this.hooks.onMove?.(userId, legal, color, idx, Date.now() - t0);
        g.move(color, seq.moves);
        break;
      }
      default: throw new Error('unknown action');
    }
    this._after();
  }

  _after() {
    const before = this.match.kind === 'duplicate' ? this.match.rounds.length : this.match.games.length;
    this.match.settle();
    const after = this.match.kind === 'duplicate' ? this.match.rounds.length : this.match.games.length;
    if (after !== before) this.events.push({ t: 'newGame', at: Date.now() });
    if (this.match.over && !this.ended) {
      this.ended = true;
      for (const t of this.timers.values()) clearTimeout(t);
      this.hooks.onEnd?.(this);
    }
    this.broadcast();
    if (!this.ended) this.pump();
  }

  /** Drive bots, auto-roll forced rolls, and arm turn timers. */
  pump() {
    this.match.boards().forEach((g, b) => {
      const seat = this.actor(b);
      clearTimeout(this.timers.get(b));
      if (!seat) return;
      const p = this.seats[seat];
      this.turnStart.set(b, Date.now());
      const color = this.colorOf(seat, b);
      if (p.bot) {
        this.timers.set(b, setTimeout(() => this._botStep(b, seat), BOT_DELAY_MS));
      } else if (g.phase === 'roll' && g.rollIsForced()) {
        this.timers.set(b, setTimeout(() => this._safe(() => { g.roll(color); this._after(); }), Math.min(350, BOT_DELAY_MS)));
      } else {
        this.timers.set(b, setTimeout(() => this._safe(() => { g.resign(color); this._after(); }), TURN_LIMIT_MS));
      }
    });
  }

  _safe(fn) {
    try { if (!this.ended) fn(); } catch (e) { console.error('session', this.id, e.stack); }
  }

  _botStep(b, seat) {
    this._safe(() => {
      const g = this.match.boards()[b];
      const level = this.seats[seat].bot;
      if (g.phase === 'doubled') {
        const me = this.colorOf(seat, b);
        if (shouldTake(g.state, me, level)) g.take(me); else g.drop(me);
      } else if (g.phase === 'roll') {
        if (g.canDouble(g.turn) && shouldDouble(g.state, g.turn, level)) g.double(g.turn);
        else g.roll(g.turn);
      } else if (g.phase === 'move') {
        const i = chooseSequence(g.legal, g.turn, level);
        g.move(g.turn, g.legal[i].moves);
      }
      this._after();
    });
  }

  view(seat) {
    const m = this.match;
    const boards = m.boards().map((g, b) => {
      const yourColor = seat ? this.colorOf(seat, b) : null;
      const actor = this.actor(b);
      const yours = seat && actor === seat;
      return {
        index: b,
        yourColor,
        ...g.snapshot(),
        yourTurn: !!yours,
        canDouble: !!(yours && g.canDouble(yourColor)),
        mustAnswerDouble: !!(yours && g.phase === 'doubled'),
        legal: yours && g.phase === 'move' ? g.legal.map((l) => l.moves) : null,
        deadline: yours ? (this.turnStart.get(b) ?? Date.now()) + TURN_LIMIT_MS : null,
        lastLog: g.log.slice(-4),
      };
    });
    const done = m.kind === 'duplicate'
      ? m.rounds.flat().filter((g) => g.phase === 'over').length
      : m.games.filter((g) => g.phase === 'over').length;
    return {
      id: this.id,
      kind: m.kind,
      config: this.config,
      tournamentId: this.tournamentId,
      you: seat,
      players: {
        A: { name: this.seats.A.name, rating: this.seats.A.rating, bot: this.seats.A.bot || null },
        B: { name: this.seats.B.name, rating: this.seats.B.rating, bot: this.seats.B.bot || null },
      },
      score: m.score,
      target: m.kind === 'duplicate' ? m.pairs : m.target,
      gamesFinished: done,
      over: m.over,
      winner: m.winner,
      fairness: {
        commitment: this.commitment,
        clientSeed: this.clientSeed,
        serverSeed: m.over ? this.serverSeed : null,
      },
      boards,
    };
  }

  broadcast() {
    for (const seat of ['A', 'B']) {
      const p = this.seats[seat];
      if (p.userId) this.hooks.send(p.userId, { t: 'match', view: this.view(seat) });
    }
  }

  /** Full audit record for verification (rolls are recomputable from the seeds). */
  record() {
    const m = this.match;
    const games = m.kind === 'duplicate' ? m.rounds.flatMap((r, ri) => r.map((g, b) => ({ round: ri, board: b, g })))
      : m.games.map((g, gi) => ({ round: gi, board: 0, g }));
    return {
      id: this.id,
      kind: m.kind,
      config: this.config,
      tournamentId: this.tournamentId,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      seats: { A: { userId: this.seats.A.userId || null, bot: this.seats.A.bot || null, name: this.seats.A.name, rating: this.seats.A.rating }, B: { userId: this.seats.B.userId || null, bot: this.seats.B.bot || null, name: this.seats.B.name, rating: this.seats.B.rating } },
      score: m.score,
      winner: m.winner,
      fairness: { commitment: this.commitment, serverSeed: this.serverSeed, clientSeed: this.clientSeed },
      games: games.map(({ round, board, g }) => ({ round, board, rolls: g.rollIndex, result: g.result, log: g.log })),
    };
  }
}
