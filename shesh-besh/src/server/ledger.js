// Double-entry ledger for BETA POINTS.
//
// Beta points have NO monetary value: they cannot be bought, sold,
// transferred between users, or redeemed for money, goods or services.
// The ledger exists so that the accounting flow (entry fees, prize pools,
// payouts) is built and audited now; in the beta it never touches money.
//
// Every transaction has entries that sum to zero (debits = credits).

export const CURRENCY = 'BETA_POINTS';
export const SIGNUP_GRANT = 1000;
export const WEEKLY_GRANT = 500;

export class Ledger {
  constructor(store, { field = 'ledger', currency = CURRENCY } = {}) {
    this.store = store;
    this.field = field;
    this.currency = currency;
    store.data[field] ??= [];
  }

  get txs() { return this.store.data[this.field]; }

  balance(account) {
    let b = 0;
    for (const tx of this.txs) for (const e of tx.entries) if (e.account === account) b += e.amount;
    return b;
  }

  /** entries: [{account, amount}] must sum to 0. Accounts starting with 'user:' may not go negative. */
  post(kind, entries, meta = {}) {
    const sum = entries.reduce((a, e) => a + e.amount, 0);
    if (sum !== 0) throw new Error('unbalanced transaction');
    if (!entries.every((e) => Number.isInteger(e.amount))) throw new Error('amounts must be integers');
    for (const e of entries) {
      if (/^(user|pool|hold):/.test(e.account) && e.amount < 0 && this.balance(e.account) + e.amount < 0) {
        throw new Error('insufficient balance');
      }
    }
    const tx = { id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), kind, currency: this.currency, entries, meta };
    this.txs.push(tx);
    this.store.save();
    return tx;
  }

  grant(userId, amount, reason) {
    return this.post('grant', [
      { account: 'house:grants', amount: -amount },
      { account: `user:${userId}`, amount },
    ], { reason });
  }

  history(userId, limit = 50) {
    const acc = `user:${userId}`;
    return this.txs
      .filter((tx) => tx.entries.some((e) => e.account === acc))
      .slice(-limit)
      .map((tx) => ({ id: tx.id, at: tx.at, kind: tx.kind, amount: tx.entries.filter((e) => e.account === acc).reduce((a, e) => a + e.amount, 0), meta: tx.meta }));
  }

  /** Sum of all accounts — must always be 0. */
  integrity() {
    let total = 0;
    for (const tx of this.txs) for (const e of tx.entries) total += e.amount;
    return total === 0;
  }
}
