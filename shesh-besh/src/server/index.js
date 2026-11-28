// HTTP + WebSocket entry point.
//   PORT (default 3000), DB_FILE (default data/db.json), ADMIN_TOKEN (enables /admin/*)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Store, PgStore } from './store.js';
import { App, TERMS_VERSION, TOURNAMENT_TYPES } from './app.js';
import { realMoneyConfig } from './realmoney.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || path.join(root, 'data', 'db.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 40);

const store = process.env.DATABASE_URL ? await PgStore.open(process.env.DATABASE_URL) : new Store(DB_FILE);
console.log(`storage: ${process.env.DATABASE_URL ? 'postgres' : DB_FILE}`);
store.data.config ??= { salt: crypto.randomBytes(16).toString('hex') };
const cashCfg = realMoneyConfig(process.env); // throws if REAL_MONEY=1 without LEGAL_APPROVAL_REF
const app = new App(store, { salt: store.data.config.salt, cashCfg });
if (cashCfg.enabled) console.log(`REAL MONEY ON · legal ref: ${cashCfg.legalRef} · provider: ${app.cash.provider.name}`);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml' };
const STATIC = [
  ['/engine/', path.join(root, 'src', 'engine')],
  ['/docs/', path.join(root, 'docs')],
  ['/', path.join(root, 'public')],
];

function json(res, code, body) {
  res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res, pathname) {
  for (const [prefix, dir] of STATIC) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(pathname.slice(prefix.length)) || 'play.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'content-security-policy': path.basename(file) === 'play.html'
          ? "default-src 'self'; connect-src 'self' ws: wss:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:"
          : "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      });
      fs.createReadStream(file).pipe(res);
      return true;
    }
  }
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/health') return json(res, 200, { ok: true, terms: TERMS_VERSION });
    if (p === '/api/config') return json(res, 200, { termsVersion: TERMS_VERSION, tournamentTypes: TOURNAMENT_TYPES, realMoney: cashCfg.enabled, paymentProvider: app.cash.provider.name });
    if (p === '/api/leaderboard') return json(res, 200, app.leaderboard());
    if (p === '/api/evidence') return json(res, 200, app.evidence());
    if (p === '/api/tournaments') return json(res, 200, app.listTournaments());
    if (p === '/api/verify') {
      const v = app.verify(url.searchParams.get('id'));
      return v ? json(res, 200, v) : json(res, 404, { error: 'not found' });
    }
    if (p.startsWith('/admin/')) {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
      if (p === '/admin/stats') return json(res, 200, app.adminStats());
      if (p === '/admin/audit') return json(res, 200, store.data.audit.slice(-500));
      if (req.method === 'POST' && p === '/admin/kyc') {
        const u = store.data.users[url.searchParams.get('user')];
        if (!u) return json(res, 404, { error: 'no user' });
        app.cash.approveKyc(u, url.searchParams.get('approve') !== '0');
        return json(res, 200, { ok: true, kyc: u.kyc.status });
      }
      if (req.method === 'POST' && p === '/admin/voucher') {
        const v = app.cash.createVoucher({ amount: Number(url.searchParams.get('amount')), days: Number(url.searchParams.get('days') || 14), userId: url.searchParams.get('user') || null, note: url.searchParams.get('note') || '' });
        return json(res, 200, v);
      }
      if (p === '/admin/vouchers') return json(res, 200, app.cash.listVouchers());
      if (req.method === 'POST' && p === '/admin/withdrawal') {
        app.cash.reviewWithdrawal(url.searchParams.get('id'), url.searchParams.get('approve') !== '0')
          .then((w) => json(res, 200, w)).catch((e) => json(res, 400, { error: e.message }));
        return;
      }
      return json(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET' && serveStatic(req, res, p)) return;
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
  const country = String(req.headers['cf-ipcountry'] || req.headers['x-country'] || '').toUpperCase() || null;
  let user = null;
  let lastMsgs = [];
  const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const meMsg = () => ({ t: 'me', user: app.publicUser(user), history: app.ledger.history(user.id, 30) });

  ws.on('message', (raw) => {
    // Simple rate limit: RATE_LIMIT messages / 5 seconds (default 40).
    const now = Date.now();
    lastMsgs = lastMsgs.filter((x) => now - x < 5000);
    lastMsgs.push(now);
    if (lastMsgs.length > RATE_LIMIT) return send({ t: 'error', msg: 'יותר מדי בקשות' });
    let msg;
    try { msg = JSON.parse(raw); } catch { return send({ t: 'error', msg: 'bad json' }); }
    try {
      if (msg.t === 'register') {
        const { user: u, token } = app.register({ ...msg, ip });
        user = u;
        app.attach(user.id, send);
        send({ t: 'welcome', token, user: app.publicUser(user) });
        return;
      }
      if (msg.t === 'auth') {
        user = app.auth(msg.token);
        if (ip) user.ipHash = app.hashIp(ip);
        app.attach(user.id, send);
        send({ t: 'welcome', user: app.publicUser(user), gift: user._gift || null });
        user._gift = null;
        return;
      }
      if (!user) return send({ t: 'error', msg: 'יש להתחבר' });
      switch (msg.t) {
        case 'me': return send(meMsg());
        case 'bot': app.playBot(user, msg); return;
        case 'queue': return send({ t: 'queued', ...app.queue(user, msg) });
        case 'cancelQueue': app.cancelQueue(user.id); return send({ t: 'queued', matched: false, cancelled: true });
        case 'act': app.act(user, msg); return;
        case 'tournaments': return send({ t: 'tournaments', list: app.listTournaments(user) });
        case 'clubs': return send({ t: 'clubs', list: app.myClubs(user) });
        case 'createClub': return send({ t: 'club', club: app.createClub(user, msg) });
        case 'joinClub': return send({ t: 'club', club: app.joinClub(user, msg) });
        case 'club': return send({ t: 'club', club: app.clubView(user, msg.id) });
        case 'createClubTournament': app.createClubTournament(user, msg); return send({ t: 'club', club: app.clubView(user, msg.clubId) });
        case 'joinTournament': app.joinTournament(user, { ...msg, country }); send(meMsg()); return send({ t: 'tournaments', list: app.listTournaments(user) });
        case 'leaveTournament': app.leaveTournament(user, msg); send(meMsg()); return send({ t: 'tournaments', list: app.listTournaments(user) });
        case 'limits': app.setLimits(user, msg); return send(meMsg());
        case 'leaderboard': return send({ t: 'leaderboard', list: app.leaderboard() });
        case 'wallet': return send({ t: 'wallet', wallet: app.wallet(user) });
        case 'redeem': return send({ t: 'wallet', wallet: app.redeem(user, { ...msg, country }) });
        case 'arenas': return send({ t: 'arenas', list: app.listArenas(user) });
        case 'joinArena': return send({ t: 'queued', ...app.joinArena(user, { ...msg, country }) });
        case 'kyc': return send({ t: 'wallet', wallet: app.submitKyc(user, msg) });
        case 'withdraw': return send({ t: 'wallet', wallet: app.withdraw(user, { ...msg, country }) });
        case 'cashLimits': return send({ t: 'wallet', wallet: app.setCashLimits(user, msg) });
        case 'deposit':
          app.deposit(user, { ...msg, country })
            .then((w) => send({ t: 'wallet', wallet: w }))
            .catch((e) => send({ t: 'error', msg: e.message }));
          return;
        default: return send({ t: 'error', msg: 'unknown message' });
      }
    } catch (e) {
      send({ t: 'error', msg: e.message });
    }
  });

  ws.on('close', () => { if (user) app.detach(user.id, send); });
});

setInterval(() => app.tick(), 30_000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { try { await store.flush(); } finally { process.exit(0); } });

server.listen(PORT, () => console.log(`shesh-besh beta on http://localhost:${PORT}`));
export { server, app };
