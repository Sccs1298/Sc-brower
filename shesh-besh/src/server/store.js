// Minimal JSON-file persistence for the beta (single process).
// Replace with PostgreSQL before any production / real-money phase.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, ledger: [], matches: [], tournaments: {}, flags: [], audit: [] };
    if (file && fs.existsSync(file)) {
      try { this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) {
        console.error('store: could not read db, starting fresh', e.message);
      }
    }
    this._timer = null;
  }

  save() {
    if (!this.file) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  audit(event, details) {
    this.data.audit.push({ at: new Date().toISOString(), event, ...details });
    if (this.data.audit.length > 20000) this.data.audit.splice(0, 5000);
    this.save();
  }
}

/**
 * PostgreSQL-backed store (e.g. Neon free tier). Keeps the same in-memory model and
 * persists the whole document as one JSONB row, debounced. Good for the beta's scale;
 * move to proper tables before real money.
 */
export class PgStore extends Store {
  static async open(url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }, max: 2 });
    await pool.query('CREATE TABLE IF NOT EXISTS app_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    const s = new PgStore(null);
    s.pool = pool;
    const r = await pool.query("SELECT data FROM app_state WHERE id = 'main'");
    if (r.rows[0]) s.data = { ...s.data, ...r.rows[0].data };
    return s;
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush().catch((e) => console.error('pg save failed', e.message)), 1000);
  }

  async flush() {
    if (!this.pool) return;
    await this.pool.query(
      "INSERT INTO app_state (id, data, updated_at) VALUES ('main', $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [JSON.stringify(this.data)],
    );
  }
}
