import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store.js';
import { App } from '../src/server/app.js';

const mk = () => new App(new Store(null));
const user = (app, name) => app.register({ name, birthDate: '1990-01-01', acceptTerms: '2026-11-beta-1' }).user;
function resignAll(app, u, matchId) {
  for (let k = 0; k < 30; k++) {
    const s = app.sessions.get(matchId); if (s.ended) return;
    s.match.boards().forEach((g, b) => { if (g.phase !== 'over') app.act(u, { matchId, board: b, action: 'resign' }); });
  }
}

test('club: create, join by code, members-only tournaments', () => {
  const app = mk(); const host = user(app, 'host1'); const guest = user(app, 'guest1'); const stranger = user(app, 'str1');
  const c = app.createClub(host, { name: 'המועדון', logo: 'die' });
  assert.match(c.code, /^[A-Z2-9]{6}$/);
  assert.throws(() => app.createClubTournament(guest, { clubId: c.id, mode: 'classic', length: 1, size: 2, entryFee: 100, hostFeePct: 10 }), /מארח/);
  app.joinClub(guest, { code: c.code.toLowerCase() });
  assert.equal(app.myClubs(guest).length, 1);
  const t = app.createClubTournament(host, { clubId: c.id, name: 'חמישי', mode: 'classic', length: 1, size: 2, entryFee: 100, hostFeePct: 10 });
  assert.ok(!app.listTournaments(stranger).some((x) => x.id === t.id), 'hidden from non-members');
  assert.throws(() => app.joinTournament(stranger, { id: t.id }), /חברי המועדון/);
  assert.throws(() => app.createClubTournament(host, { clubId: c.id, mode: 'classic', length: 1, size: 2, entryFee: 100, hostFeePct: 20 }), /15%/);
});

test('club tournament: host fee split 70/30, winner takes the rest, ledger balanced', () => {
  const app = mk(); const host = user(app, 'host2'); const a = user(app, 'pa'); const b = user(app, 'pb');
  const c = app.createClub(host, { name: 'שכונה' });
  for (const u of [a, b]) app.joinClub(u, { code: c.code });
  const t = app.createClubTournament(host, { clubId: c.id, mode: 'classic', length: 1, size: 2, entryFee: 100, hostFeePct: 10 });
  const before = { host: app.ledger.balance(`user:${host.id}`), a: app.ledger.balance(`user:${a.id}`), b: app.ledger.balance(`user:${b.id}`) };
  app.joinTournament(a, { id: t.id }); app.joinTournament(b, { id: t.id });
  const s = [...app.sessions.values()].find((x) => !x.ended && x.tournamentId === t.id);
  const loser = s.seats.A.userId === a.id ? a : b; const winner = loser === a ? b : a;
  resignAll(app, loser, s.id);
  const pool = 200; const fee = 20; const hostShare = 14; const prize = pool - fee;
  assert.equal(app.ledger.balance(`user:${host.id}`), before.host + hostShare);
  assert.equal(app.ledger.balance(`user:${winner.id}`), before[winner === a ? 'a' : 'b'] - 100 + prize);
  assert.equal(app.ledger.balance(`user:${loser.id}`), before[loser === a ? 'a' : 'b'] - 100);
  assert.ok(app.ledger.integrity());
  const done = app.tournaments[t.id];
  assert.equal(done.status, 'done'); assert.equal(done.results.hostShare, hostShare);
});

test('ladder: stage 2 requires a ticket; ticket is consumed and refunded on leave', () => {
  const app = mk(); const u = user(app, 'ladder1');
  const s2 = app.listTournaments(u).find((x) => x.type === 's2-dup');
  assert.throws(() => app.joinTournament(u, { id: s2.id }), /כרטיס/);
  u.tickets = { s2: 1, final: 0, live: 0 };
  app.joinTournament(u, { id: s2.id }); assert.equal(u.tickets.s2, 0);
  app.leaveTournament(u, { id: s2.id }); assert.equal(u.tickets.s2, 1);
});

test('8-player bracket advances through 3 rounds', () => {
  const app = mk(); const host = user(app, 'host8');
  const c = app.createClub(host, { name: 'שמונה' });
  const players = Array.from({ length: 8 }, (_, i) => { const u = user(app, 'p8_' + i); app.joinClub(u, { code: c.code }); return u; });
  const t = app.createClubTournament(host, { clubId: c.id, mode: 'classic', length: 1, size: 8, entryFee: 50, hostFeePct: 5 });
  for (const u of players) app.joinTournament(u, { id: t.id });
  for (let guard = 0; guard < 20 && app.tournaments[t.id].status !== 'done'; guard++) {
    for (const s of [...app.sessions.values()].filter((x) => !x.ended && x.tournamentId === t.id)) {
      resignAll(app, app.store.data.users[s.seats.B.userId], s.id);
    }
  }
  const done = app.tournaments[t.id];
  assert.equal(done.status, 'done'); assert.equal(done.rounds.length, 3); assert.equal(done.results.prizes.length, 2);
  assert.ok(app.ledger.integrity());
});
