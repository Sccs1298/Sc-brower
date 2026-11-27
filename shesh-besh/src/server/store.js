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
