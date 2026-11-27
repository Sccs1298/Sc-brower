// Application core: users, lobby, matchmaking, tournaments, responsible play.
// Transport-agnostic: index.js wires it to HTTP + WebSocket.
import crypto from 'node:crypto';
import { MatchSession } from './session.js';
import { Ledger, SIGNUP_GRANT, WEEKLY_GRANT } from './ledger.js';
import { FairPlay } from './anticheat.js';
import { updateElo, START_RATING } from './rating.js';
import { LEVELS } from '../engine/bot.js';
import { CashService, realMoneyConfig, isSkillFormat, ILS } from './realmoney.js';

export const TERMS_VERSION = '2026-11-beta-1';
// Real money is OFF unless REAL_MONEY=1 and LEGAL_APPROVAL_REF are set (see realmoney.js).

const MODES = {
  classic: { lengths: [1, 3, 5, 7] },
  duplicate: { lengths: [1, 2, 3] },
};

export const TOURNAMENT_TYPES = {
  // Free practice: no entry, bots may fill empty seats, prize = trophy + rating only.
  'free-dup': { name: 'טורניר אימון – שש בש כפול (חינם)', currency: 'POINTS', mode: 'duplicate', length: 1, size: 4, entryFee: 0, botFill: true, payout: [] },
  // Beta-points tournament: humans only, entry in BETA POINTS (no monetary value),
  // fixed published prize split, 10% "rake" simulated to test the accounting flow.
  'points-dup': { name: 'טורניר נקודות בטא – שש בש כפול', currency: 'POINTS', mode: 'duplicate', length: 2, size: 4, entryFee: 100, botFill: false, rakePct: 10, payout: [0.7, 0.3] },
  'points-classic7': { name: 'טורניר נקודות בטא – מאץ\' עד 7', currency: 'POINTS', mode: 'classic', length: 7, size: 4, entryFee: 100, botFill: false, rakePct: 10, payout: [0.7, 0.3] },
  // Real-money (ILS, agorot). Created only when the real-money gate is open. Humans only, skill formats only.
  'cash-dup': { name: 'טורניר ₪20 – שש בש כפול (2 סבבים)', currency: 'ILS', mode: 'duplicate', length: 2, size: 4, entryFee: 2000, botFill: false, rakePct: 10, payout: [0.7, 0.3] },
  'cash-classic7': { name: 'טורניר ₪50 – מאץ\' עד 7', currency: 'ILS', mode: 'classic', length: 7, size: 4, entryFee: 5000, botFill: false, rakePct: 10, payout: [0.7, 0.3] },
};
for (const [k, t] of Object.entries(TOURNAMENT_TYPES)) {
  if (t.currency === 'ILS' && (!isSkillFormat(t.mode, t.length) || t.botFill)) throw new Error(`cash tournament ${k} must be a humans-only skill format`);
}

// Arenas: 1v1 tables with an entry fee; winner takes the pot minus a 10% fee.
// Coin arenas use beta points (no monetary value) and unlock by LEVEL (earned by playing).
// Cash arenas (ILS) unlock by RATING and games played — never by spending — and use skill formats only.
export const ARENAS = [
  { id: 'cafe', name: 'קפה השכונה', currency: 'POINTS', entry: 50, mode: 'classic', length: 3, minLevel: 1, rakePct: 10 },
  { id: 'shuk', name: 'שוק הכרמל', currency: 'POINTS', entry: 200, mode: 'duplicate', length: 1, minLevel: 3, rakePct: 10 },
  { id: 'yafo', name: 'נמל יפו', currency: 'POINTS', entry: 1000, mode: 'classic', length: 5, minLevel: 6, rakePct: 10 },
  { id: 'roof', name: 'גג רוטשילד', currency: 'POINTS', entry: 5000, mode: 'duplicate', length: 2, minLevel: 10, rakePct: 10 },
  { id: 'ils10', name: 'שולחן ₪10', currency: 'ILS', entry: 1000, mode: 'duplicate', length: 2, minRating: 0, rakePct: 10 },
  { id: 'ils25', name: 'שולחן ₪25', currency: 'ILS', entry: 2500, mode: 'classic', length: 7, minRating: 1550, rakePct: 10 },
  { id: 'ils50', name: 'שולחן ₪50', currency: 'ILS', entry: 5000, mode: 'duplicate', length: 2, minRating: 1600, rakePct: 10 },
  { id: 'ils100', name: 'שולחן ₪100', currency: 'ILS', entry: 10000, mode: 'classic', length: 7, minRating: 1700, rakePct: 10 },
];
for (const a of ARENAS) if (a.currency === 'ILS' && !isSkillFormat(a.mode, a.length)) throw new Error(`cash arena ${a.id} must use a skill format`);

export const levelFromXp = (xp) => Math.floor(Math.sqrt((xp || 0) / 40)) + 1;
export const xpForLevel = (lv) => 40 * (lv - 1) ** 2;
const DAILY_BASE = 100; const DAILY_STEP = 25;

const ageOn = (birthDate, now = new Date()) => {
  const b = new Date(birthDate + 'T00:00:00Z');
  if (Number.isNaN(b.getTime())) return -1;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
};

export class App {
  constructor(store, { salt = crypto.randomBytes(16).toString('hex'), cashCfg = realMoneyConfig({}), provider } = {}) {
    this.store = store;
    this.salt = salt;
    this.ledger = new Ledger(store);
    this.fair = new FairPlay(store);
    this.cash = new CashService(store, cashCfg, {
      ...(provider ? { provider } : {}),
      flag: (id, type, d) => this.fair.flag(id, type, d),
      audit: (e, d) => store.audit(e, d),
    });
    this.sessions = new Map(); // matchId -> MatchSession
    this.queues = new Map(); // key -> [{userId, clientSeed}]
    this.sockets = new Map(); // userId -> Set(send fn)
    this.sessionStart = new Map(); // userId -> ms
    this.tournaments = store.data.tournaments;
    this.fillTimers = new Map();
    this._recoverTournaments();
    for (const type of this._activeTypes()) this._ensureOpenTournament(type);
  }

  _activeTypes() {
    return Object.keys(TOURNAMENT_TYPES).filter((k) => TOURNAMENT_TYPES[k].currency !== 'ILS' || this.cash.cfg.enabled);
  }

  _isCash(t) { return t.currency === 'ILS'; }

  // ---------- users ----------
  hashIp(ip) { return crypto.createHash('sha256').update(this.salt + ip).digest('hex').slice(0, 16); }

  register({ name, birthDate, acceptTerms, ip }) {
    name = String(name || '').trim().slice(0, 20);
    if (name.length < 2) throw new Error('כינוי חייב להכיל לפחות 2 תווים');
    if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) throw new Error('כינוי מכיל תווים לא חוקיים');
    if (Object.values(this.store.data.users).some((u) => u.name.toLowerCase() === name.toLowerCase())) throw new Error('הכינוי תפוס');
    if (acceptTerms !== TERMS_VERSION) throw new Error('יש לאשר את התקנון');
    const age = ageOn(String(birthDate || ''));
    if (age < 0) throw new Error('תאריך לידה לא תקין');
    if (age < 18) throw new Error('השירות מיועד לבני 18 ומעלה בלבד');
    const id = 'u_' + crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    const user = {
      id, name, tokenHash: this._th(token), birthYear: Number(birthDate.slice(0, 4)),
      createdAt: new Date().toISOString(), termsVersion: TERMS_VERSION, rating: START_RATING,
      games: 0, wins: 0, ipHash: ip ? this.hashIp(ip) : null,
      limits: { dailyEntry: null, sessionReminderMin: 60, selfExcludedUntil: null },
      lastGrant: new Date().toISOString(), trophies: 0,
    };
    this.store.data.users[id] = user;
    this.ledger.grant(id, SIGNUP_GRANT, 'signup');
    this.store.audit('register', { userId: id });
    return { user, token };
  }

  _th(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

  auth(token) {
    const th = this._th(token);
    const u = Object.values(this.store.data.users).find((x) => x.tokenHash === th);
    if (!u) throw new Error('התחברות נכשלה');
    this._weeklyGrant(u);
    u._gift = this._dailyGift(u);
    return u;
  }

  /** Fixed daily gift in beta points (never random, never money). Streak adds a little, missing a day restarts it. */
  _dailyGift(u) {
    const today = new Date().toISOString().slice(0, 10);
    if (u.lastDaily === today) return null;
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    u.streak = u.lastDaily === yesterday ? (u.streak || 0) + 1 : 1;
    u.lastDaily = today;
    const amount = DAILY_BASE + DAILY_STEP * Math.min(u.streak - 1, 6);
    this.ledger.grant(u.id, amount, 'daily');
    this.store.save();
    return { amount, streak: u.streak };
  }

  _weeklyGrant(u) {
    const last = new Date(u.lastGrant || 0).getTime();
    if (Date.now() - last > 7 * 86400_000 && this.ledger.balance(`user:${u.id}`) < SIGNUP_GRANT) {
      this.ledger.grant(u.id, WEEKLY_GRANT, 'weekly');
      u.lastGrant = new Date().toISOString();
      this.store.save();
    }
  }

  publicUser(u) {
    return {
      id: u.id, name: u.name, rating: u.rating, games: u.games, wins: u.wins, trophies: u.trophies,
      balance: this.ledger.balance(`user:${u.id}`), limits: u.limits,
      avgError: this.fair.avgError(u), termsVersion: u.termsVersion,
      xp: u.xp || 0, level: levelFromXp(u.xp), nextLevelXp: xpForLevel(levelFromXp(u.xp) + 1), streak: u.streak || 0,
      cashBalance: this.cash.cfg.enabled ? this.cash.ledger.balance(`user:${u.id}`) : null,
    };
  }

  setLimits(u, { dailyEntry, sessionReminderMin, selfExcludeDays }) {
    if (dailyEntry !== undefined) {
      const v = dailyEntry === null || dailyEntry === '' ? null : Math.max(0, Math.floor(Number(dailyEntry)));
      // Lowering a limit applies immediately; raising it applies after 24h (cool-down).
      if (u.limits.dailyEntry !== null && (v === null || v > u.limits.dailyEntry)) {
        u.limits.pendingDailyEntry = { value: v, at: Date.now() + 86400_000 };
      } else {
        u.limits.dailyEntry = v; delete u.limits.pendingDailyEntry;
      }
    }
    if (sessionReminderMin !== undefined) u.limits.sessionReminderMin = Math.min(240, Math.max(15, Number(sessionReminderMin) || 60));
    if (selfExcludeDays) {
      const d = Math.min(3650, Math.max(1, Number(selfExcludeDays)));
      u.limits.selfExcludedUntil = new Date(Date.now() + d * 86400_000).toISOString();
      this.store.audit('self-exclusion', { userId: u.id, days: d });
    }
    this.store.save();
  }

  _applyPendingLimits(u) {
    const p = u.limits.pendingDailyEntry;
    if (p && Date.now() >= p.at) { u.limits.dailyEntry = p.value; delete u.limits.pendingDailyEntry; }
  }

  _assertMayPlay(u) {
    const ex = u.limits.selfExcludedUntil;
    if (ex && new Date(ex).getTime() > Date.now()) throw new Error(`החשבון בהחרגה עצמית עד ${ex.slice(0, 10)}`);
  }

  _entriesToday(u) {
    const since = Date.now() - 86400_000;
    return this.ledger.history(u.id, 1000)
      .filter((h) => h.kind === 'entry' && new Date(h.at).getTime() > since)
      .reduce((a, h) => a - h.amount, 0);
  }

  // ---------- connections ----------
  attach(userId, send) {
    if (!this.sockets.has(userId)) this.sockets.set(userId, new Set());
    this.sockets.get(userId).add(send);
    if (!this.sessionStart.has(userId)) this.sessionStart.set(userId, Date.now());
    // Re-send any live match.
    for (const s of this.sessions.values()) {
      const seat = s.seatOfUser(userId);
      if (seat && !s.ended) send({ t: 'match', view: s.view(seat) });
    }
  }

  detach(userId, send) {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(send);
    if (!set.size) {
      this.sockets.delete(userId);
      this.sessionStart.delete(userId);
      this.cancelQueue(userId);
    }
  }

  send(userId, msg) {
    for (const fn of this.sockets.get(userId) || []) fn(msg);
  }

  /** Called periodically: session-time reminders (responsible play). */
  tick() {
    for (const [userId, start] of this.sessionStart) {
      const u = this.store.data.users[userId];
      if (!u) continue;
      const mins = Math.floor((Date.now() - start) / 60000);
      const every = u.limits.sessionReminderMin || 60;
      if (mins > 0 && mins % every === 0 && u._lastReminder !== mins) {
        u._lastReminder = mins;
        this.send(userId, { t: 'reminder', minutes: mins });
      }
    }
  }

  // ---------- matches ----------
  _seat(u, clientSeed) {
    return { userId: u.id, name: u.name, rating: u.rating, clientSeed: String(clientSeed || '').slice(0, 64) };
  }

  _validMode(mode, length) {
    const m = MODES[mode];
    if (!m || !m.lengths.includes(Number(length))) throw new Error('מצב משחק לא חוקי');
  }

  _inMatch(userId) {
    for (const s of this.sessions.values()) if (!s.ended && s.seatOfUser(userId)) return true;
    return false;
  }

  playBot(u, { mode, length, level, clientSeed, cube }) {
    this._assertMayPlay(u);
    this._validMode(mode, length);
    if (!LEVELS[level]) throw new Error('רמת בוט לא חוקית');
    if (this._inMatch(u.id)) throw new Error('כבר יש לך משחק פעיל');
    const bot = { bot: level, name: `בוט ${LEVELS[level].label}`, rating: null, clientSeed: crypto.randomBytes(8).toString('hex') };
    const s = this._startSession({ A: this._seat(u, clientSeed), B: bot }, { mode, length: Number(length), cube: mode === 'classic' ? cube !== false : !!cube, rated: false });
    return s.id;
  }

  queue(u, { mode, length, clientSeed }) {
    this._assertMayPlay(u);
    this._validMode(mode, length);
    if (this._inMatch(u.id)) throw new Error('כבר יש לך משחק פעיל');
    this.cancelQueue(u.id);
    const key = `${mode}:${length}`;
    const q = this.queues.get(key) || [];
    const opp = q.shift();
    if (opp) {
      this.queues.set(key, q);
      const ou = this.store.data.users[opp.userId];
      this.fair.noteOpponents(u, ou);
      this._startSession({ A: this._seat(ou, opp.clientSeed), B: this._seat(u, clientSeed) }, { mode, length: Number(length), cube: mode === 'classic', rated: true });
      return { matched: true };
    }
    q.push({ userId: u.id, clientSeed, at: Date.now() });
    this.queues.set(key, q);
    return { matched: false, key };
  }

  cancelQueue(userId) {
    for (const [k, q] of this.queues) {
      for (const x of q) if (x.userId === userId && x.holdId) this._releaseHold(x);
      this.queues.set(k, q.filter((x) => x.userId !== userId));
    }
  }

  // ---------- arenas ----------
  _arenaLedger(a) { return a.currency === 'ILS' ? this.cash.ledger : this.ledger; }

  listArenas(u) {
    return ARENAS.filter((a) => a.currency !== 'ILS' || this.cash.cfg.enabled).map((a) => {
      let locked = null;
      if (a.currency === 'POINTS' && levelFromXp(u?.xp) < a.minLevel) locked = `נפתח ברמה ${a.minLevel}`;
      if (a.currency === 'ILS') {
        if ((u?.games || 0) < this.cash.cfg.minGamesForCash) locked = `נפתח אחרי ${this.cash.cfg.minGamesForCash} משחקים מדורגים`;
        else if (a.minRating && (u?.rating || 0) < a.minRating) locked = `נפתח בדירוג ${a.minRating}`;
        else if (u?.kyc?.status !== 'verified') locked = 'נדרש אימות זהות';
      }
      const pot = a.entry * 2; const fee = Math.floor((pot * a.rakePct) / 100);
      return { ...a, prize: pot - fee, fee, locked, waiting: (this.queues.get('arena:' + a.id) || []).length };
    });
  }

  joinArena(u, { arenaId, clientSeed, country }) {
    this._assertMayPlay(u);
    this._applyPendingLimits(u);
    const a = ARENAS.find((x) => x.id === arenaId);
    if (!a || (a.currency === 'ILS' && !this.cash.cfg.enabled)) throw new Error('הזירה אינה זמינה');
    if (this._inMatch(u.id)) throw new Error('כבר יש לך משחק פעיל');
    this.cancelQueue(u.id);
    const holdId = 'aq_' + crypto.randomBytes(5).toString('hex');
    if (a.currency === 'ILS') {
      this.cash.arenaHold(u, a, holdId, country);
    } else {
      if (levelFromXp(u.xp) < a.minLevel) throw new Error(`הזירה נפתחת ברמה ${a.minLevel}`);
      const lim = u.limits.dailyEntry;
      if (lim !== null && this._entriesToday(u) + a.entry > lim) throw new Error('חרגת ממגבלת דמי הכניסה היומית שהגדרת');
      this.ledger.post('entry', [{ account: `user:${u.id}`, amount: -a.entry }, { account: `hold:${holdId}`, amount: a.entry }], { arena: a.id });
    }
    const key = 'arena:' + a.id;
    const q = this.queues.get(key) || [];
    const i = q.findIndex((x) => x.userId !== u.id);
    const me = { userId: u.id, clientSeed, holdId, arena: a, at: Date.now() };
    if (i < 0) { q.push(me); this.queues.set(key, q); return { matched: false, arena: a.id }; }
    const opp = q.splice(i, 1)[0];
    this.queues.set(key, q);
    const ou = this.store.data.users[opp.userId];
    this.fair.noteOpponents(u, ou);
    const poolId = 'ar_' + crypto.randomBytes(5).toString('hex');
    const L = this._arenaLedger(a);
    L.post('arena-start', [
      { account: `hold:${opp.holdId}`, amount: -a.entry }, { account: `hold:${holdId}`, amount: -a.entry },
      { account: `pool:${poolId}`, amount: 2 * a.entry },
    ], { arena: a.id });
    this._startSession({ A: this._seat(ou, opp.clientSeed), B: this._seat(u, clientSeed) },
      { mode: a.mode, length: a.length, cube: a.mode === 'classic', rated: true, arena: { id: a.id, name: a.name, currency: a.currency, entry: a.entry, rakePct: a.rakePct, poolId } });
    return { matched: true, arena: a.id };
  }

  _releaseHold(x) {
    const L = this._arenaLedger(x.arena);
    if (L.balance(`hold:${x.holdId}`) >= x.arena.entry) {
      L.post('refund', [{ account: `hold:${x.holdId}`, amount: -x.arena.entry }, { account: `user:${x.userId}`, amount: x.arena.entry }], { arena: x.arena.id });
    }
  }

  _arenaPayout(s, winnerSeat) {
    const ar = s.config.arena;
    const p = s.seats[winnerSeat];
    if (ar.currency === 'ILS') {
      const r = this.cash.payoutTournament({ id: ar.poolId, rakePct: ar.rakePct, payout: [1], entryFee: ar.entry }, [p]);
      return { pot: r.pool, fee: r.rake, prize: r.prizes[0] };
    }
    const pot = this.ledger.balance(`pool:${ar.poolId}`);
    const fee = Math.floor((pot * ar.rakePct) / 100);
    this.ledger.post('payout', [{ account: `pool:${ar.poolId}`, amount: -pot }, { account: 'house:rake', amount: fee }, { account: `user:${p.userId}`, amount: pot - fee }], { arena: ar.id });
    return { pot, fee, prize: { name: p.name, gross: pot - fee, tax: 0, net: pot - fee } };
  }

  _startSession(seats, config, tournamentId = null) {
    const s = new MatchSession({
      seats, config, tournamentId,
      hooks: {
        send: (uid, msg) => this.send(uid, msg),
        onMove: (uid, legal, color, idx, ms) => {
          const usr = this.store.data.users[uid];
          if (usr) this.fair.recordMove(usr, legal, color, idx, ms);
        },
        onEnd: (sess) => this._onMatchEnd(sess),
      },
    });
    this.sessions.set(s.id, s);
    s.start();
    return s;
  }

  act(u, msg) {
    const s = this.sessions.get(msg.matchId);
    if (!s) throw new Error('משחק לא נמצא');
    s.act(u.id, msg);
  }

  _onMatchEnd(s) {
    const rec = s.record();
    const A = s.seats.A.userId && this.store.data.users[s.seats.A.userId];
    const B = s.seats.B.userId && this.store.data.users[s.seats.B.userId];
    let winner = s.match.winner;
    if (winner === 'draw' && (s.tournamentId || s.config.arena)) {
      // Skill tiebreak: lower engine-measured average error advances.
      const ea = A ? this.fair.avgError(A) ?? 99 : 99;
      const eb = B ? this.fair.avgError(B) ?? 99 : 99;
      winner = ea <= eb ? 'A' : 'B';
      rec.tiebreak = { method: 'avgError', A: ea, B: eb, winner };
    }
    rec.effectiveWinner = winner;
    for (const [seat, u] of [['A', A], ['B', B]]) {
      if (!u) continue;
      u.games++;
      if (winner === seat) u.wins++;
      const before = levelFromXp(u.xp);
      u.xp = (u.xp || 0) + 10 + (winner === seat ? 15 : 0) + (s.config.arena ? 10 : 0) + (s.match.kind === 'duplicate' ? 5 : 0);
      if (levelFromXp(u.xp) > before) this.send(u.id, { t: 'levelUp', level: levelFromXp(u.xp) });
    }
    if (s.config.arena && (winner === 'A' || winner === 'B')) {
      rec.arenaPayout = this._arenaPayout(s, winner);
      for (const seat of ['A', 'B']) if (s.seats[seat].userId) this.send(s.seats[seat].userId, { t: 'arenaResult', you: seat, winner, payout: rec.arenaPayout, arena: s.config.arena });
    }
    if (A && B && s.config.rated !== false) {
      const scoreA = winner === 'A' ? 1 : winner === 'B' ? 0 : 0.5;
      rec.ratingsBefore = { A: A.rating, B: B.rating };
      [A.rating, B.rating] = updateElo(A.rating, B.rating, scoreA, { kind: s.match.kind, length: s.config.length });
    }
    this.store.data.matches.push(rec);
    if (this.store.data.matches.length > 5000) this.store.data.matches.splice(0, 1000);
    this.store.save();
    if (s.tournamentId) this._tournamentMatchEnded(s.tournamentId, s, winner);
    setTimeout(() => this.sessions.delete(s.id), 10 * 60_000).unref?.();
  }

  // ---------- tournaments ----------
  _ensureOpenTournament(type) {
    const open = Object.values(this.tournaments).find((t) => t.type === type && t.status === 'registering');
    if (open) return open;
    const def = TOURNAMENT_TYPES[type];
    const id = 't_' + crypto.randomBytes(5).toString('hex');
    const t = {
      id, type, ...def, status: 'registering', players: [], createdAt: new Date().toISOString(),
      rounds: [], results: null,
      // Published BEFORE registration, never changed afterwards:
      rules: {
        currency: def.currency === 'ILS' ? 'ILS' : 'BETA_POINTS (ללא ערך כספי)',
        entryFee: def.entryFee,
        entryFeeLabel: def.currency === 'ILS' ? ILS(def.entryFee) : `${def.entryFee} נקודות בטא`,
        rakePct: def.rakePct || 0,
        payoutSplit: def.payout,
        prizeFundedBy: def.currency === 'ILS' ? 'דמי הכניסה של המשתתפים בלבד (הבית אינו משחק)' : def.entryFee ? 'דמי הכניסה בנקודות בטא בלבד' : 'אין פרס נקודות – גביע ודירוג בלבד',
        humansOnly: !def.botFill,
        prizeTax: def.currency === 'ILS' ? `ניכוי מס במקור ${Math.round(this.cash.cfg.prizeTaxRate * 100)}% מהרווח נטו` : null,
        tiebreak: 'סבבים נוספים, ואז ממוצע שגיאה נמוך יותר (מדד מיומנות)',
      },
    };
    this.tournaments[id] = t;
    this.store.save();
    return t;
  }

  /** After a restart, live matches are lost: abort running tournaments and refund entries. */
  _recoverTournaments() {
    for (const t of Object.values(this.tournaments)) {
      if (t.status !== 'running') continue;
      t.status = 'aborted';
      t.finishedAt = new Date().toISOString();
      for (const p of t.players) {
        const L = this._isCash(t) ? this.cash.ledger : this.ledger;
        if (p.userId && t.entryFee > 0 && L.balance(`pool:${t.id}`) >= t.entryFee) {
          L.post('refund', [
            { account: `pool:${t.id}`, amount: -t.entryFee },
            { account: `user:${p.userId}`, amount: t.entryFee },
          ], { tournamentId: t.id, reason: 'server-restart' });
        }
      }
      this.store.audit('tournament-aborted', { tournamentId: t.id });
    }
  }

  listTournaments() {
    return Object.values(this.tournaments)
      .filter((t) => !['done', 'aborted'].includes(t.status) || Date.now() - new Date(t.finishedAt || 0).getTime() < 3600_000)
      .map((t) => ({ id: t.id, type: t.type, name: t.name, currency: t.currency || 'POINTS', mode: t.mode, length: t.length, size: t.size, status: t.status, players: t.players.map((p) => p.name), rules: t.rules, results: t.results, botFill: t.botFill }));
  }

  joinTournament(u, { id, clientSeed, country }) {
    this._assertMayPlay(u);
    this._applyPendingLimits(u);
    const t = this.tournaments[id];
    if (!t || t.status !== 'registering') throw new Error('הטורניר אינו פתוח להרשמה');
    if (t.players.some((p) => p.userId === u.id)) throw new Error('כבר נרשמת');
    if (this._inMatch(u.id)) throw new Error('כבר יש לך משחק פעיל');
    if (this._isCash(t)) {
      this.cash.enterTournament(u, t, country);
    } else if (t.entryFee > 0) {
      const lim = u.limits.dailyEntry;
      if (lim !== null && this._entriesToday(u) + t.entryFee > lim) throw new Error('חרגת ממגבלת דמי הכניסה היומית שהגדרת');
      this.ledger.post('entry', [
        { account: `user:${u.id}`, amount: -t.entryFee },
        { account: `pool:${t.id}`, amount: t.entryFee },
      ], { tournamentId: t.id });
    }
    t.players.push({ userId: u.id, name: u.name, clientSeed: String(clientSeed || '') });
    this.store.save();
    if (t.players.length === t.size) this._startTournament(t);
    else if (t.botFill && !this.fillTimers.has(t.id)) {
      const timer = setTimeout(() => this._fillWithBots(t.id), Number(process.env.TOURNEY_FILL_MS ?? 20_000));
      timer.unref?.();
      this.fillTimers.set(t.id, timer);
    }
    return t.id;
  }

  leaveTournament(u, { id }) {
    const t = this.tournaments[id];
    if (!t || t.status !== 'registering') throw new Error('לא ניתן לעזוב כעת');
    const i = t.players.findIndex((p) => p.userId === u.id);
    if (i < 0) throw new Error('אינך רשום');
    t.players.splice(i, 1);
    if (this._isCash(t)) {
      this.cash.refundEntry(u.id, t);
    } else if (t.entryFee > 0) {
      this.ledger.post('refund', [
        { account: `pool:${t.id}`, amount: -t.entryFee },
        { account: `user:${u.id}`, amount: t.entryFee },
      ], { tournamentId: t.id });
    }
    this.store.save();
  }

  _fillWithBots(id) {
    const t = this.tournaments[id];
    if (!t || t.status !== 'registering' || !t.botFill || t.entryFee > 0) return;
    const levels = ['intermediate', 'strong', 'beginner'];
    let i = 0;
    while (t.players.length < t.size) {
      const lv = levels[i++ % levels.length];
      t.players.push({ bot: lv, name: `בוט ${LEVELS[lv].label} ${i}`, clientSeed: crypto.randomBytes(8).toString('hex') });
    }
    this._startTournament(t);
  }

  _startTournament(t) {
    clearTimeout(this.fillTimers.get(t.id)); this.fillTimers.delete(t.id);
    t.status = 'running';
    t.startedAt = new Date().toISOString();
    // Seed by rating (bots last), 1v4 & 2v3.
    const rated = t.players.map((p) => ({ ...p, rating: p.userId ? this.store.data.users[p.userId].rating : 0 }))
      .sort((a, b) => b.rating - a.rating);
    t.players = rated;
    const pairs = [[rated[0], rated[3]], [rated[1], rated[2]]];
    t.rounds.push(pairs.map(([a, b]) => ({ a, b, matchId: null, winner: null })));
    this._ensureOpenTournament(t.type);
    this._launchRound(t);
  }

  _seatFor(p) {
    if (p.bot) return { bot: p.bot, name: p.name, rating: null, clientSeed: p.clientSeed };
    const u = this.store.data.users[p.userId];
    return { userId: u.id, name: u.name, rating: u.rating, clientSeed: p.clientSeed };
  }

  _launchRound(t) {
    const round = t.rounds[t.rounds.length - 1];
    for (const m of round) {
      if (m.a.bot && m.b.bot) { m.winner = Math.random() < 0.5 ? m.a : m.b; continue; } // bots: no need to simulate
      const s = this._startSession({ A: this._seatFor(m.a), B: this._seatFor(m.b) }, { mode: t.mode, length: t.length, cube: t.mode === 'classic', rated: true }, t.id);
      m.matchId = s.id;
    }
    this.store.save();
    this._maybeAdvance(t);
  }

  _tournamentMatchEnded(tid, s, winnerSeat) {
    const t = this.tournaments[tid];
    if (!t) return;
    const round = t.rounds[t.rounds.length - 1];
    const m = round.find((x) => x.matchId === s.id);
    if (!m) return;
    m.winner = winnerSeat === 'A' ? m.a : m.b;
    m.loser = winnerSeat === 'A' ? m.b : m.a;
    this._maybeAdvance(t);
  }

  _maybeAdvance(t) {
    const round = t.rounds[t.rounds.length - 1];
    if (round.some((m) => !m.winner)) return;
    if (round.length > 1) {
      const [x, y] = round.map((m) => m.winner);
      t.rounds.push([{ a: x, b: y, matchId: null, winner: null }]);
      this._launchRound(t);
      return;
    }
    const final = round[0];
    const first = final.winner;
    const second = first === final.a ? final.b : final.a;
    this._payout(t, [first, second]);
  }

  _payout(t, ranking) {
    t.status = 'done';
    t.finishedAt = new Date().toISOString();
    if (this._isCash(t)) {
      const r = this.cash.payoutTournament(t, ranking);
      const champ = ranking[0];
      if (champ?.userId) this.store.data.users[champ.userId].trophies++;
      t.results = { ranking: ranking.map((p) => p.name), prizes: r.prizes.map((x) => ({ ...x, amount: x.net, label: ILS(x.net) })), rake: r.rake, pool: r.pool, currency: 'ILS' };
      this.store.audit('tournament-done', { tournamentId: t.id, results: t.results });
      this.store.save();
      for (const p of t.players) if (p.userId) this.send(p.userId, { t: 'tournament', tournament: this.listTournaments().find((x) => x.id === t.id) });
      return;
    }
    const pool = this.ledger.balance(`pool:${t.id}`);
    const rake = Math.floor((pool * (t.rakePct || 0)) / 100);
    const prizes = [];
    if (pool > 0) {
      const net = pool - rake;
      const entries = [{ account: `pool:${t.id}`, amount: -pool }];
      if (rake) entries.push({ account: 'house:rake', amount: rake });
      let paid = 0;
      t.payout.forEach((share, i) => {
        const p = ranking[i];
        const amt = i === t.payout.length - 1 ? net - paid : Math.floor(net * share);
        paid += amt;
        const acc = p?.userId ? `user:${p.userId}` : 'house:grants';
        entries.push({ account: acc, amount: amt });
        prizes.push({ place: i + 1, name: p?.name, amount: amt });
      });
      this.ledger.post('payout', entries, { tournamentId: t.id });
    }
    const champ = ranking[0];
    if (champ?.userId) this.store.data.users[champ.userId].trophies++;
    t.results = { ranking: ranking.map((p) => p.name), prizes, rake, pool };
    this.store.audit('tournament-done', { tournamentId: t.id, results: t.results });
    this.store.save();
    for (const p of t.players) if (p.userId) this.send(p.userId, { t: 'tournament', tournament: this.listTournaments().find((x) => x.id === t.id) });
  }

  // ---------- public data ----------
  leaderboard() {
    return Object.values(this.store.data.users)
      .filter((u) => u.games > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 50)
      .map((u) => ({ name: u.name, rating: u.rating, games: u.games, wins: u.wins, trophies: u.trophies }));
  }

  /**
   * Real-world skill evidence from completed rated human matches:
   * how often the higher-rated player wins, by format and rating gap.
   */
  evidence() {
    const buckets = {};
    for (const m of this.store.data.matches) {
      if (!m.ratingsBefore || m.seats.A.bot || m.seats.B.bot) continue;
      const gap = Math.abs(m.ratingsBefore.A - m.ratingsBefore.B);
      if (gap < 50) continue;
      const higher = m.ratingsBefore.A > m.ratingsBefore.B ? 'A' : 'B';
      const band = gap < 100 ? '50-99' : gap < 200 ? '100-199' : '200+';
      const key = `${m.kind}:${m.config.length}:${band}`;
      const b = (buckets[key] ??= { kind: m.kind, length: m.config.length, ratingGap: band, n: 0, higherWins: 0, draws: 0 });
      b.n++;
      if (m.effectiveWinner === higher) b.higherWins++;
      if (m.winner === 'draw') b.draws++;
    }
    return Object.values(buckets).map((b) => ({ ...b, higherWinRate: b.n ? b.higherWins / b.n : null }));
  }

  verify(matchId) {
    const rec = this.store.data.matches.find((m) => m.id === matchId);
    if (!rec) return null;
    return { id: rec.id, kind: rec.kind, config: rec.config, fairness: rec.fairness, games: rec.games.map((g) => ({ round: g.round, board: g.board, rolls: g.rolls, dice: g.log.filter((e) => e.dice && (e.t === 'roll' || e.t === 'opening')).map((e) => e.dice) })) };
  }

  adminStats() {
    const flags = this.store.data.flags.filter((f) => !f.reviewed);
    return {
      users: Object.keys(this.store.data.users).length,
      matches: this.store.data.matches.length,
      liveSessions: [...this.sessions.values()].filter((s) => !s.ended).length,
      ledgerBalanced: this.ledger.integrity(),
      houseRake: this.ledger.balance('house:rake'),
      openFlags: flags,
      realMoney: this.cash.cfg.enabled,
      legalApprovalRef: this.cash.cfg.legalRef,
      paymentProvider: this.cash.provider.name,
      cash: {
        ledgerBalanced: this.cash.ledger.integrity(),
        houseRake: this.cash.ledger.balance('house:rake'),
        taxWithheld: this.cash.ledger.balance('house:tax'),
        pendingWithdrawals: Object.values(this.store.data.withdrawals || {}).filter((w) => w.status === 'pending'),
        pendingKyc: Object.values(this.store.data.users).filter((u) => u.kyc?.status === 'pending').map((u) => ({ id: u.id, name: u.name })),
      },
    };
  }

  // ---------- real money (wallet) ----------
  redeem(u, { code, country }) { return this.cash.redeemVoucher(u, code, country); }
  wallet(u) { return this.cash.wallet(u); }
  submitKyc(u, msg) { this.cash.submitKyc(u, msg); return this.wallet(u); }
  deposit(u, { amount, country }) { return this.cash.deposit(u, amount, country); }
  withdraw(u, { amount, country }) { this.cash.requestWithdraw(u, amount, country); return this.wallet(u); }
  setCashLimits(u, msg) { this.cash.setLimits(u, msg); return this.wallet(u); }
}
