// Real-money layer (ILS). Everything except the payment terminal.
//
// SAFETY GATE: the layer is OFF unless BOTH are set:
//   REAL_MONEY=1
//   LEGAL_APPROVAL_REF=<reference to a written legal opinion / regulator position>
// With REAL_MONEY=1 and no LEGAL_APPROVAL_REF the server refuses to start.
//
// Amounts are integers in agorot (1 ₪ = 100). All money moves through a separate
// double-entry ledger (store.data.cashLedger). Accounts:
//   user:<id>            player wallet
//   hold:<withdrawalId>  money reserved for a pending withdrawal
//   pool:<tournamentId>  tournament prize pool (entry fees)
//   house:rake           platform fee
//   house:tax            prize tax withheld, owed to the tax authority
//   ext:clearing         the outside world (payment provider)
import crypto from 'node:crypto';
import { Ledger } from './ledger.js';

export const ILS = (agorot) => `₪${(agorot / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Formats where skill demonstrably dominates (see docs/skill-study.md). Cash play is allowed only in these. */
export function isSkillFormat(mode, length) {
  return (mode === 'duplicate' && length >= 2) || (mode === 'classic' && length >= 7);
}

export function realMoneyConfig(env = process.env) {
  const enabled = env.REAL_MONEY === '1';
  if (enabled && !env.LEGAL_APPROVAL_REF) {
    throw new Error('REAL_MONEY=1 requires LEGAL_APPROVAL_REF (written legal opinion reference). Refusing to start.');
  }
  return {
    enabled,
    legalRef: env.LEGAL_APPROVAL_REF || null,
    provider: env.PAYMENT_PROVIDER || 'none',
    minDeposit: Number(env.MIN_DEPOSIT_AGOROT || 1000), // ₪10
    maxDeposit: Number(env.MAX_DEPOSIT_AGOROT || 200000), // ₪2,000 per deposit
    minWithdraw: Number(env.MIN_WITHDRAW_AGOROT || 5000), // ₪50
    amlDailyDeposits: Number(env.AML_DAILY_DEPOSIT_AGOROT || 500000), // flag above ₪5,000 / 24h
    // Prize tax: conservative default (25% on net gain, no threshold). MUST be confirmed by an accountant.
    prizeTaxRate: Number(env.PRIZE_TAX_RATE ?? 0.25),
    prizeTaxThreshold: Number(env.PRIZE_TAX_THRESHOLD_AGOROT ?? 0),
    autoVerifyKyc: env.KYC_AUTO_VERIFY === '1', // sandbox/testing only
    minGamesForCash: Number(env.MIN_GAMES_FOR_CASH ?? 10),
    noRatingGate: env.CASH_NO_RATING_GATE === '1', // internal testing phase only // rated games before any cash arena
    voucherMax: Number(env.VOUCHER_MAX_AGOROT || 100000), // ₪1,000 per code
    allowedCountries: (env.ALLOWED_COUNTRIES || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** Israeli ID (ת.ז.) check digit validation. */
export function validIsraeliId(id) {
  const s = String(id || '').replace(/\D/g, '');
  if (s.length < 5 || s.length > 9) return false;
  const p = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(p[i]) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

// ---------- payment providers ----------
/** Default: no terminal connected. Every money-in/out attempt fails clearly. */
export class NoTerminalProvider {
  name = 'none';
  async charge() { throw new Error('מסוף הסליקה עדיין לא מחובר – לא ניתן להפקיד כרגע'); }
  async payout() { throw new Error('מסוף הסליקה עדיין לא מחובר – לא ניתן למשוך כרגע'); }
}

/** Sandbox for development and tests: succeeds without moving real money. */
export class SandboxProvider {
  name = 'sandbox';
  async charge(userId, amount) { return { ok: true, ref: 'sbx_c_' + crypto.randomBytes(5).toString('hex'), amount }; }
  async payout(userId, amount) { return { ok: true, ref: 'sbx_p_' + crypto.randomBytes(5).toString('hex'), amount }; }
}

/**
 * Interface for the real terminal (Tranzila / CardCom / Meshulam / PayPlus / Stripe…):
 *   charge(userId, amountAgorot, meta) -> { ok, ref }   (after 3-D Secure etc.)
 *   payout(userId, amountAgorot, meta) -> { ok, ref }   (bank transfer to the verified owner)
 */
export function makeProvider(name) {
  if (name === 'sandbox') return new SandboxProvider();
  return new NoTerminalProvider();
}

const DAY = 86400_000;

export class CashService {
  constructor(store, cfg, { provider = makeProvider(cfg.provider), flag = () => {}, audit = () => {} } = {}) {
    this.store = store;
    this.cfg = cfg;
    this.provider = provider;
    this.flag = flag;
    this.audit = audit;
    this.ledger = new Ledger(store, { field: 'cashLedger', currency: 'ILS' });
    store.data.withdrawals ??= {};
    store.data.vouchers ??= {}; // codeHash -> voucher
    store.data.kycIndex ??= {}; // idHash -> userId (one verified identity per account)
  }

  // ----- gates -----
  assertEnabled() {
    if (!this.cfg.enabled) throw new Error('מצב כסף אמיתי כבוי (ממתין לאישור משפטי)');
  }

  assertCashAllowed(u, country) {
    this.assertEnabled();
    if (u.kyc?.status !== 'verified') throw new Error('נדרש אימות זהות לפני משחק בכסף');
    const ex = u.limits?.selfExcludedUntil;
    if (ex && new Date(ex).getTime() > Date.now()) throw new Error('החשבון בהחרגה עצמית');
    if (this.cfg.allowedCountries.length && country && !this.cfg.allowedCountries.includes(country)) {
      throw new Error('השירות בכסף אמיתי אינו זמין במדינה שלך');
    }
  }

  // ----- KYC -----
  submitKyc(u, { fullName, idNumber, birthDate }) {
    this.assertEnabled();
    fullName = String(fullName || '').trim();
    if (fullName.split(/\s+/).length < 2) throw new Error('יש להזין שם פרטי ושם משפחה');
    if (!validIsraeliId(idNumber)) throw new Error('מספר תעודת זהות לא תקין');
    const b = new Date(String(birthDate) + 'T00:00:00Z');
    const age = (Date.now() - b.getTime()) / (365.2425 * DAY);
    if (!(age >= 18)) throw new Error('משחק בכסף מותר מגיל 18 בלבד');
    if (u.birthYear && Math.abs(b.getUTCFullYear() - u.birthYear) > 0) throw new Error('תאריך הלידה אינו תואם לנתוני החשבון');
    const idHash = crypto.createHash('sha256').update('kyc:' + String(idNumber).replace(/\D/g, '').padStart(9, '0')).digest('hex');
    const owner = this.store.data.kycIndex[idHash];
    if (owner && owner !== u.id) throw new Error('תעודת הזהות כבר משויכת לחשבון אחר');
    // Minimal retention: name + ID hash + last 3 digits. Documents (if required) go to the KYC vendor, not here.
    u.kyc = {
      status: this.cfg.autoVerifyKyc ? 'verified' : 'pending',
      fullName, idHash, idLast3: String(idNumber).slice(-3), submittedAt: new Date().toISOString(),
    };
    this.store.data.kycIndex[idHash] = u.id;
    this.audit('kyc-submitted', { userId: u.id, status: u.kyc.status });
    this.store.save();
    return u.kyc.status;
  }

  approveKyc(u, approve = true) {
    if (!u.kyc) throw new Error('no kyc submission');
    u.kyc.status = approve ? 'verified' : 'rejected';
    u.kyc.reviewedAt = new Date().toISOString();
    this.audit('kyc-reviewed', { userId: u.id, status: u.kyc.status });
    this.store.save();
  }

  // ----- limits (responsible gaming, money) -----
  setLimits(u, { depositDaily, depositMonthly, lossMonthly }) {
    u.cashLimits ??= { depositDaily: null, depositMonthly: null, lossMonthly: null, pending: {} };
    const L = u.cashLimits;
    for (const [k, v0] of Object.entries({ depositDaily, depositMonthly, lossMonthly })) {
      if (v0 === undefined) continue;
      const v = v0 === null || v0 === '' ? null : Math.max(0, Math.round(Number(v0)));
      if (L[k] !== null && (v === null || v > L[k])) L.pending[k] = { value: v, at: Date.now() + DAY }; // raise: 24h cool-off
      else { L[k] = v; delete L.pending[k]; }
    }
    this.store.save();
  }

  _applyPending(u) {
    const L = u.cashLimits; if (!L) return;
    for (const [k, p] of Object.entries(L.pending || {})) if (Date.now() >= p.at) { L[k] = p.value; delete L.pending[k]; }
  }

  _sum(u, kinds, since, sign = 1) {
    const acc = `user:${u.id}`;
    let s = 0;
    for (const tx of this.ledger.txs) {
      if (!kinds.includes(tx.kind) || new Date(tx.at).getTime() < since) continue;
      for (const e of tx.entries) if (e.account === acc) s += e.amount * sign;
    }
    return s;
  }

  depositsSince(u, ms) { return this._sum(u, ['deposit'], Date.now() - ms); }
  /** Net loss over a window = entries paid − (prizes + refunds) received. */
  netLossSince(u, ms) { return -this._sum(u, ['entry', 'refund', 'payout'], Date.now() - ms); }

  // ----- money in / out -----
  async deposit(u, amount, country) {
    this.assertCashAllowed(u, country);
    this._applyPending(u);
    amount = Math.round(Number(amount));
    if (!(amount >= this.cfg.minDeposit)) throw new Error(`הפקדה מינימלית ${ILS(this.cfg.minDeposit)}`);
    if (amount > this.cfg.maxDeposit) throw new Error(`הפקדה מקסימלית ${ILS(this.cfg.maxDeposit)}`);
    const L = u.cashLimits || {};
    if (L.depositDaily != null && this.depositsSince(u, DAY) + amount > L.depositDaily) throw new Error('חריגה ממגבלת ההפקדה היומית שהגדרת');
    if (L.depositMonthly != null && this.depositsSince(u, 30 * DAY) + amount > L.depositMonthly) throw new Error('חריגה ממגבלת ההפקדה החודשית שהגדרת');
    const res = await this.provider.charge(u.id, amount, { purpose: 'deposit' });
    if (!res?.ok) throw new Error('ההפקדה נכשלה');
    this.ledger.post('deposit', [
      { account: 'ext:clearing', amount: -amount },
      { account: `user:${u.id}`, amount },
    ], { ref: res.ref, provider: this.provider.name });
    if (this.depositsSince(u, DAY) > this.cfg.amlDailyDeposits) this.flag(u.id, 'AML_DEPOSITS', { last24h: this.depositsSince(u, DAY) });
    this.audit('deposit', { userId: u.id, amount, ref: res.ref });
    return this.wallet(u);
  }

  requestWithdraw(u, amount, country) {
    this.assertCashAllowed(u, country);
    amount = Math.round(Number(amount));
    if (!(amount >= this.cfg.minWithdraw)) throw new Error(`משיכה מינימלית ${ILS(this.cfg.minWithdraw)}`);
    const id = 'w_' + crypto.randomBytes(5).toString('hex');
    this.ledger.post('withdraw-hold', [
      { account: `user:${u.id}`, amount: -amount },
      { account: `hold:${id}`, amount },
    ], { withdrawalId: id });
    // Payout goes only to an account in the verified owner's name (enforced by the provider/back-office).
    this.store.data.withdrawals[id] = { id, userId: u.id, amount, status: 'pending', at: new Date().toISOString(), payeeName: u.kyc.fullName };
    this.audit('withdraw-requested', { userId: u.id, amount, id });
    this.store.save();
    return this.store.data.withdrawals[id];
  }

  /** Back-office: approve (pays out through provider) or reject (returns funds to wallet). */
  async reviewWithdrawal(id, approve) {
    const w = this.store.data.withdrawals[id];
    if (!w || w.status !== 'pending') throw new Error('withdrawal not pending');
    if (approve) {
      const res = await this.provider.payout(w.userId, w.amount, { withdrawalId: id, payeeName: w.payeeName });
      if (!res?.ok) throw new Error('payout failed');
      this.ledger.post('withdraw', [
        { account: `hold:${id}`, amount: -w.amount },
        { account: 'ext:clearing', amount: w.amount },
      ], { withdrawalId: id, ref: res.ref });
      w.status = 'paid'; w.ref = res.ref;
    } else {
      this.ledger.post('withdraw-cancel', [
        { account: `hold:${id}`, amount: -w.amount },
        { account: `user:${w.userId}`, amount: w.amount },
      ], { withdrawalId: id });
      w.status = 'rejected';
    }
    w.reviewedAt = new Date().toISOString();
    this.audit('withdraw-reviewed', { id, status: w.status });
    this.store.save();
    return w;
  }

  // ----- deposit codes (manual top-up while no terminal is connected) -----
  // The operator receives the money outside the app (with a receipt), creates a one-time code,
  // and the player redeems it. Redemption is a deposit in every respect: KYC, limits, AML, ledger.
  static hashCode(code) { return crypto.createHash('sha256').update('voucher:' + String(code).trim().toUpperCase()).digest('hex'); }

  createVoucher({ amount, days = 14, userId = null, note = '' }) {
    this.assertEnabled();
    amount = Math.round(Number(amount));
    if (!(amount >= this.cfg.minDeposit) || amount > this.cfg.voucherMax) throw new Error(`סכום קוד בין ${ILS(this.cfg.minDeposit)} ל-${ILS(this.cfg.voucherMax)}`);
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rnd = crypto.randomBytes(10);
    const raw = Array.from(rnd, (b) => A[b % A.length]).join('');
    const code = `SB-${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    const v = { id: 'v_' + crypto.randomBytes(4).toString('hex'), amount, userId, note: String(note).slice(0, 80), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * DAY).toISOString(), status: 'active', last4: code.slice(-4) };
    this.store.data.vouchers[CashService.hashCode(code)] = v;
    this.audit('voucher-created', { id: v.id, amount, userId, note: v.note });
    this.store.save();
    return { code, ...v }; // the plain code is shown once and never stored
  }

  redeemVoucher(u, code, country) {
    this.assertCashAllowed(u, country);
    this._applyPending(u);
    const key = CashService.hashCode(code);
    const v = this.store.data.vouchers[key];
    u._voucherFails = (u._voucherFails || []).filter((t) => Date.now() - t < 3600_000);
    if (u._voucherFails.length >= 5) throw new Error('יותר מדי ניסיונות. נסה שוב בעוד שעה');
    if (!v || v.status !== 'active') { u._voucherFails.push(Date.now()); throw new Error('קוד לא תקין או שכבר נוצל'); }
    if (new Date(v.expiresAt).getTime() < Date.now()) throw new Error('תוקף הקוד פג');
    if (v.userId && v.userId !== u.id) throw new Error('הקוד הונפק למשתמש אחר');
    const L = u.cashLimits || {};
    if (L.depositDaily != null && this.depositsSince(u, DAY) + v.amount > L.depositDaily) throw new Error('חריגה ממגבלת ההפקדה היומית שהגדרת');
    if (L.depositMonthly != null && this.depositsSince(u, 30 * DAY) + v.amount > L.depositMonthly) throw new Error('חריגה ממגבלת ההפקדה החודשית שהגדרת');
    v.status = 'used'; v.usedBy = u.id; v.usedAt = new Date().toISOString();
    this.ledger.post('deposit', [
      { account: 'ext:voucher', amount: -v.amount },
      { account: `user:${u.id}`, amount: v.amount },
    ], { voucherId: v.id, method: 'code' });
    if (this.depositsSince(u, DAY) > this.cfg.amlDailyDeposits) this.flag(u.id, 'AML_DEPOSITS', { last24h: this.depositsSince(u, DAY) });
    this.audit('voucher-redeemed', { id: v.id, userId: u.id, amount: v.amount });
    this.store.save();
    return this.wallet(u);
  }

  listVouchers() {
    return Object.values(this.store.data.vouchers).map((v) => ({ id: v.id, amount: v.amount, status: v.status, last4: v.last4, userId: v.userId, usedBy: v.usedBy || null, expiresAt: v.expiresAt, note: v.note }));
  }

  // ----- 1v1 cash arenas -----
  arenaHold(u, arena, holdId, country) {
    this.assertCashAllowed(u, country);
    this._applyPending(u);
    if (!isSkillFormat(arena.mode, arena.length)) throw new Error('פורמט זה אינו מורשה למשחק בכסף');
    if ((u.games || 0) < this.cfg.minGamesForCash) throw new Error(`זירות כסף נפתחות אחרי ${this.cfg.minGamesForCash} משחקים מדורגים`);
    if (arena.minRating && !this.cfg.noRatingGate && (u.rating || 0) < arena.minRating) throw new Error(`הזירה נפתחת בדירוג ${arena.minRating}`);
    const L = u.cashLimits || {};
    if (L.lossMonthly != null && this.netLossSince(u, 30 * DAY) + arena.entry > L.lossMonthly) throw new Error('חריגה ממגבלת ההפסד החודשית שהגדרת');
    this.ledger.post('entry', [{ account: `user:${u.id}`, amount: -arena.entry }, { account: `hold:${holdId}`, amount: arena.entry }], { arena: arena.id });
  }

  // ----- tournaments -----
  enterTournament(u, t, country) {
    this.assertCashAllowed(u, country);
    this._applyPending(u);
    if (!isSkillFormat(t.mode, t.length)) throw new Error('פורמט זה אינו מורשה למשחק בכסף');
    const L = u.cashLimits || {};
    if (L.lossMonthly != null && this.netLossSince(u, 30 * DAY) + t.entryFee > L.lossMonthly) throw new Error('חריגה ממגבלת ההפסד החודשית שהגדרת');
    this.ledger.post('entry', [
      { account: `user:${u.id}`, amount: -t.entryFee },
      { account: `pool:${t.id}`, amount: t.entryFee },
    ], { tournamentId: t.id });
  }

  refundEntry(userId, t, reason = 'leave') {
    this.ledger.post('refund', [
      { account: `pool:${t.id}`, amount: -t.entryFee },
      { account: `user:${userId}`, amount: t.entryFee },
    ], { tournamentId: t.id, reason });
  }

  /** Pays the pool: rake to house, prizes to winners with tax withheld on net gain. */
  payoutTournament(t, ranking) {
    const pool = this.ledger.balance(`pool:${t.id}`);
    if (pool <= 0) return { pool: 0, rake: 0, prizes: [] };
    const rake = Math.floor((pool * (t.rakePct || 0)) / 100);
    const net = pool - rake;
    const entries = [{ account: `pool:${t.id}`, amount: -pool }];
    if (rake) entries.push({ account: 'house:rake', amount: rake });
    const prizes = [];
    let paid = 0;
    t.payout.forEach((share, i) => {
      const p = ranking[i];
      const gross = i === t.payout.length - 1 ? net - paid : Math.floor(net * share);
      paid += gross;
      const gain = Math.max(0, gross - t.entryFee);
      const tax = gain > this.cfg.prizeTaxThreshold ? Math.floor(gain * this.cfg.prizeTaxRate) : 0;
      if (!p?.userId) throw new Error('cash tournaments are humans-only');
      entries.push({ account: `user:${p.userId}`, amount: gross - tax });
      if (tax) entries.push({ account: 'house:tax', amount: tax });
      prizes.push({ place: i + 1, name: p.name, gross, tax, net: gross - tax });
    });
    this.ledger.post('payout', entries, { tournamentId: t.id });
    return { pool, rake, prizes };
  }

  wallet(u) {
    const pending = Object.values(this.store.data.withdrawals).filter((w) => w.userId === u.id && w.status === 'pending');
    return {
      enabled: this.cfg.enabled,
      provider: this.provider.name,
      balance: this.ledger.balance(`user:${u.id}`),
      pendingWithdrawals: pending.map((w) => ({ id: w.id, amount: w.amount, at: w.at })),
      kyc: u.kyc ? { status: u.kyc.status, fullName: u.kyc.fullName, idLast3: u.kyc.idLast3 } : { status: 'none' },
      limits: u.cashLimits || null,
      deposits24h: this.depositsSince(u, DAY),
      netLoss30d: this.netLossSince(u, 30 * DAY),
      history: this.ledger.history(u.id, 30),
    };
  }
}
