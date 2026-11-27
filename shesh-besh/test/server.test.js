// End-to-end: real HTTP + WebSocket server, a scripted human vs bots.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { rollAt, sha256 } from '../src/server/dice.js';

const PORT = 3900 + Math.floor(Math.random() * 90);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
let proc;

test.before(async () => {
  proc = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(dir, 'db.json'), ADMIN_TOKEN: 'adm', BOT_DELAY_MS: '1', TOURNEY_FILL_MS: '300', RATE_LIMIT: '100000' }, stdio: 'pipe' });
  await new Promise((res, rej) => {
    proc.stdout.on('data', (d) => String(d).includes('beta on') && res());
    proc.on('exit', rej);
  });
});
test.after(() => proc.kill());

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    inbox.push(m);
    for (const w of waiters.splice(0)) w();
  });
  const next = async (pred, ms = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for message');
      await new Promise((r) => { waiters.push(r); setTimeout(r, 200); });
    }
  };
  const open = new Promise((r) => ws.on('open', r));
  return { ws, inbox, next, open, send: (m) => ws.send(JSON.stringify(m)) };
}

async function playToEnd(c, matchIdFilter) {
  for (;;) {
    const pred = (x) => x.t === 'match' && (!matchIdFilter || x.view.id === matchIdFilter);
    let m = await c.next(pred, 60000);
    // Act only on the newest view (like a real UI); stale views would trigger duplicate actions.
    await new Promise((r) => setTimeout(r, 15));
    for (let i = c.inbox.findIndex(pred); i >= 0; i = c.inbox.findIndex(pred)) m = c.inbox.splice(i, 1)[0];
    const v = m.view;
    if (v.over) return v;
    for (const b of v.boards) {
      if (!b.yourTurn) continue;
      if (b.mustAnswerDouble) c.send({ t: 'act', matchId: v.id, board: b.index, action: 'take' });
      else if (b.canDouble) c.send({ t: 'act', matchId: v.id, board: b.index, action: 'roll' });
      else if (b.legal) c.send({ t: 'act', matchId: v.id, board: b.index, action: 'move', moves: b.legal[0] });
    }
  }
}

test('register: under-18 rejected, adult accepted with signup grant', async () => {
  const c = client(); await c.open;
  c.send({ t: 'register', name: 'kid', birthDate: '2012-01-01', acceptTerms: '2026-11-beta-1' });
  const e = await c.next((x) => x.t === 'error');
  assert.match(e.msg, /18/);
  c.send({ t: 'register', name: 'adult1', birthDate: '1990-05-05', acceptTerms: 'wrong' });
  assert.match((await c.next((x) => x.t === 'error')).msg, /תקנון/);
  c.send({ t: 'register', name: 'adult1', birthDate: '1990-05-05', acceptTerms: '2026-11-beta-1' });
  const w = await c.next((x) => x.t === 'welcome');
  assert.equal(w.user.balance, 1000);
  assert.ok(w.token);
  c.ws.close();
});

test('full duplicate match vs bot, then dice verify', async () => {
  const c = client(); await c.open;
  c.send({ t: 'register', name: 'dupper', birthDate: '1985-01-01', acceptTerms: '2026-11-beta-1' });
  await c.next((x) => x.t === 'welcome');
  c.send({ t: 'bot', mode: 'duplicate', length: 1, level: 'beginner', clientSeed: 'abc' });
  const v = await playToEnd(c);
  assert.ok(v.over);
  assert.ok(v.fairness.serverSeed);
  assert.equal(sha256(v.fairness.serverSeed), v.fairness.commitment);
  const res = await fetch(`http://localhost:${PORT}/api/verify?id=${v.id}`);
  const rec = await res.json();
  assert.equal(rec.games.length >= 2, true);
  // Both boards of round 0 draw from the same stream; every logged roll must appear in it in order.
  for (const g of rec.games) {
    const stream = Array.from({ length: g.rolls }, (_, r) => rollAt(rec.fairness.serverSeed, rec.fairness.clientSeed, g.round, r));
    let j = 0;
    for (const d of g.dice) {
      while (j < stream.length && (stream[j][0] !== d[0] || stream[j][1] !== d[1])) j++;
      assert.ok(j < stream.length, 'roll found in recomputed stream');
      j++;
    }
  }
  c.ws.close();
});

test('classic match to 3 vs bot completes', async () => {
  const c = client(); await c.open;
  c.send({ t: 'register', name: 'classic1', birthDate: '1980-01-01', acceptTerms: '2026-11-beta-1' });
  await c.next((x) => x.t === 'welcome');
  c.send({ t: 'bot', mode: 'classic', length: 3, level: 'random', clientSeed: 'xyz' });
  const v = await playToEnd(c);
  assert.ok(Math.max(v.score.A, v.score.B) >= 3);
  c.ws.close();
});

test('two humans: points tournament entry, ledger stays balanced, limits enforced', async () => {
  const a = client(); const b = client(); await a.open; await b.open;
  a.send({ t: 'register', name: 'alice', birthDate: '1991-01-01', acceptTerms: '2026-11-beta-1' });
  b.send({ t: 'register', name: 'bob', birthDate: '1992-01-01', acceptTerms: '2026-11-beta-1' });
  await a.next((x) => x.t === 'welcome'); await b.next((x) => x.t === 'welcome');
  // Daily entry limit lower than the fee must block registration.
  a.send({ t: 'limits', dailyEntry: 50 });
  await a.next((x) => x.t === 'me');
  a.send({ t: 'tournaments' });
  const list = (await a.next((x) => x.t === 'tournaments')).list;
  const pt = list.find((t) => t.type === 'points-dup' && t.status === 'registering');
  a.send({ t: 'joinTournament', id: pt.id, clientSeed: 'a' });
  assert.match((await a.next((x) => x.t === 'error')).msg, /מגבלת/);
  // Bob joins and leaves: refund.
  b.send({ t: 'joinTournament', id: pt.id, clientSeed: 'b' });
  const me1 = await b.next((x) => x.t === 'me');
  assert.equal(me1.user.balance, 900);
  b.send({ t: 'leaveTournament', id: pt.id });
  const me2 = await b.next((x) => x.t === 'me');
  assert.equal(me2.user.balance, 1000);
  // Human vs human matchmaking.
  a.send({ t: 'queue', mode: 'duplicate', length: 1, clientSeed: 'qa' });
  await a.next((x) => x.t === 'queued');
  b.send({ t: 'queue', mode: 'duplicate', length: 1, clientSeed: 'qb' });
  const [va, vb] = await Promise.all([playToEnd(a), playToEnd(b)]);
  assert.equal(va.id, vb.id);
  const stats = await (await fetch(`http://localhost:${PORT}/admin/stats`, { headers: { authorization: 'Bearer adm' } })).json();
  assert.equal(stats.ledgerBalanced, true);
  assert.equal(stats.realMoney, false);
  a.ws.close(); b.ws.close();
});

test('free tournament fills with bots and finishes', { timeout: 180000 }, async () => {
  const c = client(); await c.open;
  c.send({ t: 'register', name: 'tourney1', birthDate: '1970-01-01', acceptTerms: '2026-11-beta-1' });
  await c.next((x) => x.t === 'welcome');
  c.send({ t: 'tournaments' });
  const list = (await c.next((x) => x.t === 'tournaments')).list;
  const free = list.find((t) => t.type === 'free-dup' && t.status === 'registering');
  c.send({ t: 'joinTournament', id: free.id, clientSeed: 's' });
  // Play every match we are seated in until the tournament announces results.
  const done = (async () => c.next((x) => x.t === 'tournament', 170000))();
  let finished = false;
  done.then(() => { finished = true; });
  while (!finished) {
    const m = await Promise.race([c.next((x) => x.t === 'match', 170000), done]);
    if (finished || m.t !== 'match') break;
    c.inbox.unshift(m);
    await playToEnd(c, m.view.id).catch(() => {});
  }
  const t = await done;
  assert.equal(t.tournament.status, 'done');
  assert.equal(t.tournament.results.ranking.length, 2);
  c.ws.close();
});

test('self-exclusion blocks play', async () => {
  const c = client(); await c.open;
  c.send({ t: 'register', name: 'excl', birthDate: '1975-01-01', acceptTerms: '2026-11-beta-1' });
  await c.next((x) => x.t === 'welcome');
  c.send({ t: 'limits', selfExcludeDays: 7 });
  await c.next((x) => x.t === 'me');
  c.send({ t: 'bot', mode: 'classic', length: 1, level: 'beginner', clientSeed: 'z' });
  assert.match((await c.next((x) => x.t === 'error')).msg, /החרגה/);
  c.ws.close();
});

test('static: docs and engine served; path traversal blocked', async () => {
  assert.equal((await fetch(`http://localhost:${PORT}/`)).status, 200);
  assert.equal((await fetch(`http://localhost:${PORT}/engine/board.js`)).status, 200);
  assert.equal((await fetch(`http://localhost:${PORT}/engine/../server/app.js`)).status, 404);
  assert.equal((await fetch(`http://localhost:${PORT}/admin/stats`)).status, 401);
});
