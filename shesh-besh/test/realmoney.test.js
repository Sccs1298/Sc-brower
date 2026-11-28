import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store.js';
import { App } from '../src/server/app.js';
import { realMoneyConfig, validIsraeliId, isSkillFormat, SandboxProvider, NoTerminalProvider, CashService } from '../src/server/realmoney.js';

const ON = { REAL_MONEY: '1', LEGAL_APPROVAL_REF: 'opinion-2027-001', PAYMENT_PROVIDER: 'sandbox', KYC_AUTO_VERIFY: '1', MIN_GAMES_FOR_CASH: '0' };
const mkApp = (env = ON) => new App(new Store(null), { cashCfg: realMoneyConfig(env) });
const user = (app, name, birth = '1990-03-04') => app.register({ name, birthDate: birth, acceptTerms: '2026-11-beta-1' }).user;
// Valid test IDs (check digit correct).
const IDS = ['000000018', '000000026', '000000034', '000000042'];

test('gate: REAL_MONEY=1 without legal reference refuses to start', () => {
  assert.throws(() => realMoneyConfig({ REAL_MONEY: '1' }), /LEGAL_APPROVAL_REF/);
  assert.equal(realMoneyConfig({}).enabled, false);
});

test('gate: when off, no cash tournaments exist and wallet actions fail', async () => {
  const app = mkApp({});
  assert.ok(!app.listTournaments().some((t) => t.currency === 'ILS'));
  const u = user(app, 'off1');
  assert.throws(() => app.submitKyc(u, { fullName: 'א ב', idNumber: IDS[0], birthDate: '1990-03-04' }), /כבוי/);
  await assert.rejects(app.deposit(u, { amount: 5000 }), /כבוי/);
});

test('Israeli ID checksum and skill-format rule', () => {
  for (const id of IDS) assert.ok(validIsraeliId(id), id);
  assert.ok(!validIsraeliId('123456789'));
  assert.ok(isSkillFormat('duplicate', 2) && isSkillFormat('classic', 7));
  assert.ok(!isSkillFormat('duplicate', 1) && !isSkillFormat('classic', 5));
});

test('no terminal: deposits fail clearly', async () => {
  const store = new Store(null);
  const cash = new CashService(store, realMoneyConfig({ ...ON, PAYMENT_PROVIDER: 'none' }), { provider: new NoTerminalProvider() });
  const u = { id: 'u1', birthYear: 1990, kyc: { status: 'verified', fullName: 'א ב' } };
  await assert.rejects(cash.deposit(u, 5000), /מסוף הסליקה/);
});

test('KYC: one identity per account, age and DOB checks', () => {
  const app = mkApp();
  const a = user(app, 'kycA'); const b = user(app, 'kycB');
  assert.throws(() => app.submitKyc(a, { fullName: 'ישראל', idNumber: IDS[0], birthDate: '1990-03-04' }), /שם פרטי/);
  assert.throws(() => app.submitKyc(a, { fullName: 'ישראל ישראלי', idNumber: '123456789', birthDate: '1990-03-04' }), /תעודת זהות/);
  assert.throws(() => app.submitKyc(a, { fullName: 'ישראל ישראלי', idNumber: IDS[0], birthDate: '1985-03-04' }), /תואם/);
  assert.equal(app.submitKyc(a, { fullName: 'ישראל ישראלי', idNumber: IDS[0], birthDate: '1990-03-04' }).kyc.status, 'verified');
  assert.throws(() => app.submitKyc(b, { fullName: 'משה כהן', idNumber: IDS[0], birthDate: '1990-03-04' }), /חשבון אחר/);
});

test('deposit limits with 24h cool-off on raising; cash entry requires KYC', async () => {
  const app = mkApp();
  const u = user(app, 'lim1');
  const t = app.listTournaments().find((x) => x.type === 'cash-dup');
  assert.throws(() => app.joinTournament(u, { id: t.id }), /אימות זהות/);
  app.submitKyc(u, { fullName: 'דנה לוי', idNumber: IDS[1], birthDate: '1990-03-04' });
  app.setCashLimits(u, { depositDaily: 10000 });
  await app.deposit(u, { amount: 8000 });
  await assert.rejects(app.deposit(u, { amount: 5000 }), /היומית/);
  app.setCashLimits(u, { depositDaily: 50000 }); // raise → pending, not immediate
  await assert.rejects(app.deposit(u, { amount: 5000 }), /היומית/);
  assert.equal(app.wallet(u).balance, 8000);
});

test('cash tournament: entries, rake, tax on net gain, ledger balanced, withdraw flow', async () => {
  const app = mkApp();
  const players = ['p1', 'p2', 'p3', 'p4'].map((n, i) => {
    const u = user(app, n);
    app.submitKyc(u, { fullName: `שחקן ${n}`, idNumber: IDS[i], birthDate: '1990-03-04' });
    return u;
  });
  for (const u of players) await app.deposit(u, { amount: 10000 });
  const t = app.tournaments[app.listTournaments().find((x) => x.type === 'cash-dup').id];
  // Simulate registration and the final directly (match play is covered by server tests).
  for (const u of players.slice(0, 3)) app.joinTournament(u, { id: t.id, clientSeed: 'x' });
  assert.equal(app.cash.ledger.balance(`pool:${t.id}`), 6000);
  app.leaveTournament(players[2], { id: t.id });
  assert.equal(app.wallet(players[2]).balance, 10000);
  // Pay out as if p1 won, p2 second (pool of 2 entries = ₪40).
  t.status = 'running';
  app._payout(t, [{ userId: players[0].id, name: 'p1' }, { userId: players[1].id, name: 'p2' }]);
  const pool = 4000; const rake = 400; const net = 3600;
  const first = Math.floor(net * 0.7); const second = net - first; // 2520 / 1080
  const tax1 = Math.floor((first - 2000) * 0.25); // 25% of net gain 520 → 130
  assert.equal(app.wallet(players[0]).balance, 10000 - 2000 + first - tax1);
  assert.equal(app.wallet(players[1]).balance, 10000 - 2000 + second); // no gain → no tax
  assert.equal(app.cash.ledger.balance('house:rake'), rake);
  assert.equal(app.cash.ledger.balance('house:tax'), tax1);
  assert.equal(t.results.pool, pool);
  assert.ok(app.cash.ledger.integrity());
  // Withdraw → hold → admin approve → paid out.
  const w = app.withdraw(players[0], { amount: 5000 });
  assert.equal(w.balance, 10000 - 2000 + first - tax1 - 5000);
  const wid = w.pendingWithdrawals[0].id;
  const done = await app.cash.reviewWithdrawal(wid, true);
  assert.equal(done.status, 'paid');
  assert.ok(app.cash.ledger.integrity());
  assert.equal(app.adminStats().cash.taxWithheld, tax1);
});

test('loss limit blocks further cash entries', async () => {
  const app = mkApp();
  const u = user(app, 'loss1');
  app.submitKyc(u, { fullName: 'רון לוי', idNumber: IDS[2], birthDate: '1990-03-04' });
  await app.deposit(u, { amount: 20000 });
  app.setCashLimits(u, { lossMonthly: 3000 });
  const t = app.listTournaments().find((x) => x.type === 'cash-dup');
  app.joinTournament(u, { id: t.id });
  const t2 = app.listTournaments().find((x) => x.type === 'cash-classic7');
  assert.throws(() => app.joinTournament(u, { id: t2.id }), /ההפסד החודשית/);
});

test('sandbox provider is explicit', () => {
  assert.equal(new SandboxProvider().name, 'sandbox');
});

test('deposit codes: one-time, bound user, limits, ledger', () => {
  const app = mkApp({ ...ON, PAYMENT_PROVIDER: 'none' }); // no terminal — codes are the only way in
  const a = user(app, 'codeA'); const b = user(app, 'codeB');
  app.submitKyc(a, { fullName: 'אלה כהן', idNumber: IDS[0], birthDate: '1990-03-04' });
  app.submitKyc(b, { fullName: 'בני כהן', idNumber: IDS[1], birthDate: '1990-03-04' });
  const v100 = app.cash.createVoucher({ amount: 10000, note: 'ביט מאלה' });
  assert.match(v100.code, /^SB-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal(app.redeem(a, { code: v100.code.toLowerCase() }).balance, 10000);
  assert.throws(() => app.redeem(b, { code: v100.code }), /נוצל/);
  const bound = app.cash.createVoucher({ amount: 20000, userId: a.id });
  assert.throws(() => app.redeem(b, { code: bound.code }), /משתמש אחר/);
  app.setCashLimits(a, { depositDaily: 15000 });
  assert.throws(() => app.redeem(a, { code: bound.code }), /היומית/);
  assert.ok(!JSON.stringify(app.store.data).includes(v100.code), 'plain code is never stored');
  assert.ok(app.cash.ledger.integrity());
  for (let i = 0; i < 4; i++) assert.throws(() => app.redeem(b, { code: 'SB-AAAAA-AAAAA' }));
  assert.throws(() => app.redeem(b, { code: 'SB-AAAAA-AAAAA' }), /ניסיונות/);
});

function resignAll(app, u, matchId) {
  for (let k = 0; k < 20; k++) {
    const s = app.sessions.get(matchId);
    if (s.ended) return s;
    s.match.boards().forEach((g, b) => { if (g.phase !== 'over') app.act(u, { matchId, board: b, action: 'resign' }); });
  }
  return app.sessions.get(matchId);
}

test('cash arena: holds, pot to winner minus fee and tax, cancel refunds', async () => {
  const app = mkApp();
  const [a, b, c] = ['arA', 'arB', 'arC'].map((n, i) => {
    const u = user(app, n); app.submitKyc(u, { fullName: `שחקן ${n}`, idNumber: IDS[i], birthDate: '1990-03-04' }); return u;
  });
  for (const u of [a, b, c]) await app.deposit(u, { amount: 5000 });
  // c queues then cancels → refunded
  assert.equal(app.joinArena(c, { arenaId: 'ils10' }).matched, false);
  assert.equal(app.wallet(c).balance, 4000);
  app.cancelQueue(c.id);
  assert.equal(app.wallet(c).balance, 5000);
  // a vs b
  app.joinArena(a, { arenaId: 'ils10' });
  assert.equal(app.joinArena(b, { arenaId: 'ils10' }).matched, true);
  const s = [...app.sessions.values()].find((x) => !x.ended);
  assert.equal(s.config.mode, 'classic'); assert.ok(s.config.length >= 7);
  // A seat = a (first in queue). a resigns everything → b wins.
  resignAll(app, a, s.id);
  const pot = 2000; const fee = 200; const gross = 1800; const tax = Math.floor((gross - 1000) * 0.25);
  assert.equal(app.wallet(b).balance, 5000 - 1000 + gross - tax);
  assert.equal(app.wallet(a).balance, 4000);
  assert.equal(app.cash.ledger.balance('house:rake'), fee);
  assert.ok(app.cash.ledger.integrity());
  assert.ok(app.publicUser(b).xp > app.publicUser(a).xp);
});

test('arenas: coin arenas unlock by level, cash arenas by rating — never by spending', () => {
  const app = mkApp();
  const u = user(app, 'lvl1');
  const list = app.listArenas(u);
  assert.equal(list.find((x) => x.id === 'cafe').locked, null);
  assert.match(list.find((x) => x.id === 'roof').locked, /רמה/);
  assert.match(list.find((x) => x.id === 'ils100').locked, /דירוג|אימות/);
  assert.throws(() => app.joinArena(u, { arenaId: 'roof' }), /רמה/);
});
