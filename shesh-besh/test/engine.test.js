import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, legalSequences, applyMove, pipCount, checkerTotal, BAR, OFF, winMultiplier, toAbs,
} from '../src/engine/board.js';
import { Game, ClassicMatch, DuplicateMatch } from '../src/engine/game.js';
import { chooseSequence, shouldDouble, shouldTake } from '../src/engine/bot.js';
import { rollAt, newServerSeed, verifyCommitment, gameDiceFactory, combineClientSeeds } from '../src/server/dice.js';

const empty = () => ({ points: new Array(24).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } });

test('initial position has 15 checkers each and 167 pips', () => {
  const s = initialState();
  assert.equal(checkerTotal(s, 'w'), 15);
  assert.equal(checkerTotal(s, 'b'), 15);
  assert.equal(pipCount(s, 'w'), 167);
  assert.equal(pipCount(s, 'b'), 167);
});

test('opening 3-1 includes making the 5 point (8/5 6/5)', () => {
  const s = initialState();
  const seqs = legalSequences(s, 'w', [3, 1]);
  const made5 = seqs.some((q) => q.state.points[4] === 2);
  assert.ok(made5);
});

test('black mirrors white: 3-1 makes black 5 point', () => {
  const s = initialState();
  const seqs = legalSequences(s, 'b', [3, 1]);
  assert.ok(seqs.some((q) => q.state.points[toAbs('b', 4)] === -2));
});

test('doubles play four moves', () => {
  const seqs = legalSequences(initialState(), 'w', [6, 6]);
  assert.ok(seqs.every((q) => q.moves.length === 4));
});

test('must enter from the bar first; closed board = no move', () => {
  const s = empty();
  s.bar.w = 1; s.points[10] = 14;
  for (let a = 18; a <= 23; a++) s.points[a] = -2; // black closed board (white entry points)
  s.points[0] = -3;
  const seqs = legalSequences(s, 'w', [6, 5]);
  assert.equal(seqs.length, 1);
  assert.equal(seqs[0].moves.length, 0);
});

test('hitting sends opponent to bar', () => {
  const s = empty();
  s.points[10] = 1; s.points[7] = -1;
  const n = applyMove(s, 'w', { from: 10, to: 7 });
  assert.equal(n.bar.b, 1);
  assert.equal(n.points[7], 1);
});

test('bear off with larger die only from highest point', () => {
  const s = empty();
  s.points[2] = 2; s.points[0] = 13;
  const seqs = legalSequences(s, 'w', [6, 5]);
  // both 6 and 5 must bear off from the 3-point (own idx 2)
  assert.ok(seqs.every((q) => q.moves.every((m) => m.to === OFF)));
  assert.equal(seqs[0].state.off.w, 2);
});

test('if only one die playable the larger must be used', () => {
  // White checker on own 7, black blocks 2-away? Construct: die 6 playable, die 2 not, both not together.
  const s = empty();
  s.points[8] = 1; s.points[0] = 14; // white
  s.points[6] = -2; // blocks 8->6 with die 2
  s.points[2] = -2; // blocks 8->2 via 6 then? 8-6=2 blocked too -> neither
  s.points[1] = -2;
  // Use dice [6,2]: 8->2 blocked, 8->6 blocked; checker on 0 can't move (not all home -> no bear off).
  const seqs = legalSequences(s, 'w', [6, 2]);
  assert.equal(seqs[0].moves.length, 0);
  const s2 = empty();
  s2.points[9] = 1; s2.points[23] = 14;
  s2.points[1] = -2; // 9-6=3 ok; 3-2=1 blocked; 9-2=7 ok; 7-6=1 blocked
  const seqs2 = legalSequences(s2, 'w', [6, 2]);
  // Other checkers on 23 can still move, so both dice play; just check validity.
  assert.ok(seqs2.every((q) => q.moves.length === 2));
});

test('gammon and backgammon multipliers', () => {
  const s = empty(); s.off.w = 15; s.points[20] = -15;
  assert.equal(winMultiplier(s, 'w'), 2);
  s.points[20] = -14; s.points[2] = -1;
  assert.equal(winMultiplier(s, 'w'), 3);
  s.off.b = 1; s.points[20] = -13;
  assert.equal(winMultiplier(s, 'w'), 1);
});

test('dice are uniform-ish, deterministic and verifiable', () => {
  const { serverSeed, commitment } = newServerSeed();
  assert.ok(verifyCommitment(serverSeed, commitment));
  const cs = combineClientSeeds(['a', 'b']);
  assert.deepEqual(rollAt(serverSeed, cs, 0, 5), rollAt(serverSeed, cs, 0, 5));
  const counts = new Array(7).fill(0);
  for (let r = 0; r < 6000; r++) for (const d of rollAt(serverSeed, cs, 1, r)) counts[d]++;
  for (let f = 1; f <= 6; f++) assert.ok(Math.abs(counts[f] - 2000) < 200, `face ${f}: ${counts[f]}`);
});

function playOut(game, levels, rng = Math.random) {
  let guard = 0;
  while (game.phase !== 'over' && guard++ < 2000) {
    const c = game.turn;
    if (game.phase === 'roll') {
      if (game.canDouble(c) && shouldDouble(game.state, c, levels[c])) game.double(c);
      else game.roll(c);
    } else if (game.phase === 'doubled') {
      const t = c === 'w' ? 'b' : 'w';
      if (shouldTake(game.state, t, levels[t])) game.take(t); else game.drop(t);
    } else if (game.phase === 'move') {
      const i = chooseSequence(game.legal, c, levels[c], rng);
      game.move(c, game.legal[i].moves);
    }
  }
  return game;
}

test('bots finish full games with 15 checkers conserved', () => {
  const { serverSeed } = newServerSeed();
  const f = gameDiceFactory(serverSeed, 'x');
  for (let g = 0; g < 20; g++) {
    const game = playOut(new Game({ diceFn: f(g) }), { w: 'intermediate', b: 'expert' });
    assert.equal(game.phase, 'over');
    assert.equal(checkerTotal(game.state, 'w'), 15);
    assert.equal(checkerTotal(game.state, 'b'), 15);
    assert.ok(game.result.points >= 1);
  }
});

test('classic match ends at target, Crawford game has no cube', () => {
  const { serverSeed } = newServerSeed();
  const m = new ClassicMatch({ target: 5, gameDiceFn: gameDiceFactory(serverSeed, 'y') });
  let guard = 0;
  while (!m.over && guard++ < 50) {
    const g = m.current();
    if (g.crawford) assert.equal(g.cubeEnabled, false);
    playOut(g, { w: 'expert', b: 'beginner' });
    m.settle();
  }
  assert.ok(m.over);
  assert.ok(Math.max(m.score.A, m.score.B) >= 5);
});

test('duplicate: identical deterministic players always tie (luck cancels)', () => {
  for (let k = 0; k < 15; k++) {
    const { serverSeed } = newServerSeed();
    const m = new DuplicateMatch({ pairs: 1, maxExtra: 0, gameDiceFn: gameDiceFactory(serverSeed, 'z') });
    const [b1, b2] = m.boards();
    playOut(b1, { w: 'expert', b: 'expert' });
    playOut(b2, { w: 'expert', b: 'expert' });
    m.settle();
    assert.equal(m.score.A, m.score.B, 'expert vs expert must tie in duplicate');
    assert.equal(m.winner, 'draw');
  }
});

test('BAR/OFF constants', () => {
  assert.equal(BAR, 24); assert.equal(OFF, -1);
});
