import { singleTarget, applyMove, stateKey, ownCount, oppCount, BAR, OFF } from '/engine/board.js';

const TERMS_VERSION = '2026-11-beta-1';
const LENGTHS = { classic: [[1, 'משחק בודד'], [3, 'עד 3'], [5, 'עד 5'], [7, 'עד 7']], duplicate: [[1, 'סבב אחד (2 לוחות)'], [2, '2 סבבים'], [3, '3 סבבים']] };
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const randSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

let ws; let me = null; let match = null; const partial = new Map(); // board -> {moves, state, dice}
let selected = null; // {board, from}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500);
}

function show(screen) {
  for (const s of ['register', 'lobby', 'match']) $(`#screen-${s}`).hidden = s !== screen;
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    const token = store.get('token');
    if (token) send({ t: 'auth', token }); else show('register');
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => { toast('החיבור נותק – מתחבר מחדש…'); setTimeout(connect, 2000); };
}
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

function handle(m) {
  switch (m.t) {
    case 'welcome':
      if (m.token) store.set('token', m.token);
      me = m.user; renderUser();
      if (!match || match.over) show('lobby');
      send({ t: 'me' }); send({ t: 'tournaments' }); send({ t: 'leaderboard' });
      break;
    case 'me': me = m.user; renderUser(); renderAccount(m.history); break;
    case 'error':
      if (m.msg === 'התחברות נכשלה') { store.del('token'); show('register'); }
      toast(m.msg); break;
    case 'queued': $('#queue-status').textContent = m.matched ? '' : m.cancelled ? '' : 'מחפש יריב…'; $('#queue-btn').textContent = m.matched || m.cancelled ? 'חפש יריב' : 'בטל חיפוש'; break;
    case 'match': onMatch(m.view); break;
    case 'tournaments': renderTournaments(m.list); break;
    case 'tournament': toast(`הטורניר הסתיים: ${m.tournament?.results?.ranking?.join(' ← ') || ''}`); send({ t: 'tournaments' }); send({ t: 'me' }); break;
    case 'leaderboard': renderLeaderboard(m.list); break;
    case 'reminder': toast(`⏰ אתה משחק כבר ${m.minutes} דקות. זה זמן טוב להפסקה.`); break;
    default: break;
  }
}

// ---------- lobby ----------
function fillLengths(form) {
  const sel = form.elements.len;
  const fill = () => { sel.replaceChildren(...LENGTHS[form.elements.mode.value].map(([v, l]) => el('option', { value: v }, l))); };
  form.elements.mode.addEventListener('change', fill); fill();
}

function renderUser() {
  const b = $('#userbar');
  if (!me) { b.replaceChildren(); return; }
  b.replaceChildren(el('span', {}, `👤 ${me.name}`), el('span', {}, `⭐ ${me.rating}`), el('span', {}, `🪙 ${me.balance} נק' בטא`));
}

function renderAccount(history = []) {
  if (!me) return;
  const lim = me.limits || {};
  $('#account-info').replaceChildren(...[
    el('h3', {}, 'החשבון שלי'),
    el('p', {}, `דירוג: ${me.rating} · משחקים: ${me.games} · ניצחונות: ${me.wins} · גביעים: ${me.trophies}`),
    el('p', {}, `יתרת נקודות בטא: ${me.balance} (ללא ערך כספי)`),
    el('p', {}, `מדד איכות מהלכים (ממוצע שגיאה, נמוך = טוב): ${me.avgError == null ? '—' : me.avgError.toFixed(2)}`),
    lim.selfExcludedUntil ? el('p', { class: 'score' }, `בהחרגה עצמית עד ${lim.selfExcludedUntil.slice(0, 10)}`) : null,
  ].filter(Boolean));
  const f = $('#limits-form');
  f.elements.dailyEntry.value = lim.dailyEntry ?? '';
  f.elements.sessionReminderMin.value = lim.sessionReminderMin ?? 60;
  $('#history tbody').replaceChildren(...history.slice().reverse().map((h) => el('tr', {}, el('td', {}, h.at.slice(0, 16).replace('T', ' ')), el('td', {}, kindName(h.kind)), el('td', {}, h.amount > 0 ? `+${h.amount}` : h.amount))));
}
const kindName = (k) => ({ grant: 'מענק בטא', entry: 'דמי כניסה', payout: 'פרס', refund: 'החזר' }[k] || k);

function renderTournaments(list) {
  $('#tournament-list').replaceChildren(...list.map((t) => {
    const joined = me && t.players.includes(me.name);
    return el('div', { class: 'card' },
      el('h3', {}, t.name),
      el('p', {}, `${t.mode === 'duplicate' ? 'שש בש כפול' : 'קלאסי'} · ${t.mode === 'duplicate' ? `${t.length} סבבים` : `עד ${t.length}`} · ${t.size} שחקנים · הדחה`),
      el('p', {}, `דמי כניסה: ${t.rules.entryFee ? `${t.rules.entryFee} נקודות בטא` : 'חינם'}${t.rules.rakePct ? ` · עמלת מערכת ${t.rules.rakePct}%` : ''}`),
      el('p', {}, `חלוקת פרסים (נקבעה מראש): ${t.rules.payoutSplit.length ? t.rules.payoutSplit.map((x, i) => `מקום ${i + 1}: ${Math.round(x * 100)}%`).join(' · ') : t.rules.prizeFundedBy}`),
      el('p', { class: 'muted' }, `שובר שוויון: ${t.rules.tiebreak}`),
      el('p', {}, `סטטוס: ${({ registering: 'בהרשמה', running: 'בתהליך', done: 'הסתיים' })[t.status]} · נרשמו: ${t.players.join(', ') || '—'}`),
      t.botFill && t.status === 'registering' ? el('p', { class: 'muted' }, 'אם לא יתמלא תוך 20 שניות – יושלם עם בוטים (טורניר חינמי בלבד).') : null,
      t.results ? el('p', { class: 'score' }, `תוצאות: ${t.results.ranking.join(' ← ')}${t.results.prizes.length ? ' · ' + t.results.prizes.map((p) => `${p.name}: ${p.amount}`).join(', ') : ''}`) : null,
      t.status === 'registering'
        ? (joined
          ? el('button', { class: 'secondary', onclick: () => send({ t: 'leaveTournament', id: t.id }) }, 'בטל הרשמה')
          : el('button', { onclick: () => send({ t: 'joinTournament', id: t.id, clientSeed: randSeed() }) }, 'הירשם'))
        : null);
  }));
}

function renderLeaderboard(list) {
  $('#leaderboard tbody').replaceChildren(...list.map((u, i) => el('tr', {}, el('td', {}, i + 1), el('td', {}, u.name), el('td', {}, u.rating), el('td', {}, u.games), el('td', {}, u.wins), el('td', {}, u.trophies))));
}

// ---------- match ----------
function onMatch(view) {
  const prev = match;
  match = view;
  show('match');
  for (const b of view.boards) {
    const p = partial.get(b.index);
    const fresh = !p || !b.legal || !prev || prev.id !== view.id || JSON.stringify(p.dice) !== JSON.stringify(b.dice) || p.rollIndex !== b.rollIndex;
    if (fresh) partial.set(b.index, { moves: [], state: b.state, dice: b.dice, rollIndex: b.rollIndex, remaining: b.dice ? (b.dice[0] === b.dice[1] ? [b.dice[0], b.dice[0], b.dice[0], b.dice[0]] : [...b.dice]) : [] });
  }
  if (selected && !view.boards[selected.board]?.legal) selected = null;
  renderMatch();
}

function finals(b) {
  return new Set(b.legal.map((seq) => {
    let s = b.state; for (const m of seq) s = applyMove(s, b.yourColor, m); return stateKey(s);
  }));
}

/** Can we still reach a legal final position from st using dice rem? */
function reachable(st, color, rem, targetSet, fullLen, used) {
  if (used === fullLen) return targetSet.has(stateKey(st));
  const tried = new Set();
  for (let i = 0; i < rem.length; i++) {
    if (tried.has(rem[i])) continue; tried.add(rem[i]);
    for (const from of sourcesOf(st, color)) {
      const to = singleTarget(st, color, from, rem[i]);
      if (to === null) continue;
      const r2 = rem.slice(); r2.splice(i, 1);
      if (reachable(applyMove(st, color, { from, to }), color, r2, targetSet, fullLen, used + 1)) return true;
    }
  }
  return false;
}

function sourcesOf(st, c) {
  if (st.bar[c] > 0) return [BAR];
  const out = []; for (let i = 23; i >= 0; i--) if (ownCount(st, c, i) > 0) out.push(i); return out;
}

/** Valid next single moves for board b given current partial state. */
function nextMoves(b) {
  const p = partial.get(b.index);
  if (!b.legal) return [];
  const fullLen = b.legal[0].length;
  if (p.moves.length >= fullLen) return [];
  const target = finals(b);
  const out = [];
  const tried = new Set();
  for (let i = 0; i < p.remaining.length; i++) {
    const die = p.remaining[i];
    if (tried.has(die)) continue; tried.add(die);
    for (const from of sourcesOf(p.state, b.yourColor)) {
      const to = singleTarget(p.state, b.yourColor, from, die);
      if (to === null) continue;
      const r2 = p.remaining.slice(); r2.splice(i, 1);
      if (reachable(applyMove(p.state, b.yourColor, { from, to }), b.yourColor, r2, target, fullLen, p.moves.length + 1)) out.push({ from, to, die, dieIndex: i });
    }
  }
  return out;
}

function playMove(b, mv) {
  const p = partial.get(b.index);
  p.state = applyMove(p.state, b.yourColor, mv);
  p.moves.push({ from: mv.from, to: mv.to });
  p.remaining.splice(mv.dieIndex, 1);
  selected = null;
  const fullLen = b.legal[0].length;
  if (p.moves.length === fullLen) send({ t: 'act', matchId: match.id, board: b.index, action: 'move', moves: p.moves });
  renderMatch();
}

function undo(b) {
  partial.set(b.index, { moves: [], state: b.state, dice: b.dice, rollIndex: b.rollIndex, remaining: b.dice[0] === b.dice[1] ? Array(4).fill(b.dice[0]) : [...b.dice] });
  selected = null; renderMatch();
}

function onPointClick(b, idx) {
  if (!b.legal) return;
  const moves = nextMoves(b);
  if (selected && selected.board === b.index) {
    const choice = moves.filter((m) => m.from === selected.from && m.to === idx);
    if (choice.length) { playMove(b, choice.sort((x, y) => x.die - y.die)[0]); return; }
  }
  if (moves.some((m) => m.from === idx)) {
    const fromMoves = moves.filter((m) => m.from === idx);
    const dests = new Set(fromMoves.map((m) => m.to));
    if (dests.size === 1 && selected?.from === idx) { playMove(b, fromMoves[0]); return; }
    selected = { board: b.index, from: idx };
  } else selected = null;
  renderMatch();
}

const seatName = (s) => (match.players[s].name + (match.players[s].rating ? ` (${match.players[s].rating})` : ''));

function renderMatch() {
  const v = match;
  const opp = v.you === 'A' ? 'B' : 'A';
  const kind = v.kind === 'duplicate' ? `שש בש כפול · ${v.target === 1 ? 'סבב אחד' : `${v.target} סבבים`}` : v.target === 1 ? 'קלאסי · משחק בודד' : `קלאסי · עד ${v.target}`;
  $('#match-info').replaceChildren(...[
    el('div', { class: 'score' }, `${seatName(v.you)} ${v.score[v.you]} : ${v.score[opp]} ${seatName(opp)}`),
    el('div', { class: 'muted' }, `${kind}${v.tournamentId ? ' · טורניר' : ''}`),
    v.over ? el('div', { class: 'score' }, v.winner === 'draw' ? 'תיקו – שיחקתם ברמה זהה!' : v.winner === v.you ? '🏆 ניצחת!' : 'הפסדת הפעם') : null,
  ].filter(Boolean));
  $('#leave-match').hidden = !v.over;
  $('#boards').replaceChildren(...v.boards.map(renderBoard));
  $('#fairness').replaceChildren(
    el('div', {}, `מזהה משחק: ${v.id}`),
    el('div', {}, `התחייבות השרת (SHA-256): ${v.fairness.commitment}`),
    el('div', {}, `זרע משותף של השחקנים: ${v.fairness.clientSeed}`),
    v.fairness.serverSeed ? el('div', {}, 'זרע השרת נחשף: ', v.fairness.serverSeed, ' · ', el('a', { href: `/verify.html?id=${v.id}` }, 'אמת את כל ההטלות')) : el('div', {}, 'זרע השרת ייחשף בסוף המשחק.'),
  );
}

const W = 760; const H = 520; const COLW = 52; const BARW = 40; const M = 16; const OFFW = 48;
const colX = (c) => M + c * COLW + (c >= 6 ? BARW : 0);
function idxPos(i) {
  // own perspective: 0..11 bottom row right->left, 12..23 top row left->right
  if (i <= 11) return { col: 11 - i, top: false };
  return { col: i - 12, top: true };
}

function renderBoard(b) {
  const p = partial.get(b.index);
  const st = b.legal ? p.state : b.state;
  const me = b.yourColor; const op = me === 'w' ? 'b' : 'w';
  const moves = b.legal ? nextMoves(b) : [];
  const sources = new Set(moves.map((m) => m.from));
  const dests = new Set(selected && selected.board === b.index ? moves.filter((m) => m.from === selected.from).map((m) => m.to) : []);
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); kids.forEach((k) => e.append(k)); return e; };
  const svg = s('svg', { viewBox: `0 0 ${W + OFFW} ${H}`, role: 'img', 'aria-label': `לוח ${b.index + 1}` });
  svg.append(s('rect', { x: 0, y: 0, width: W + OFFW, height: H, rx: 10, fill: 'var(--board-dark)' }));
  svg.append(s('rect', { x: M, y: M, width: COLW * 12 + BARW, height: H - 2 * M, fill: 'var(--board)' }));
  svg.append(s('rect', { x: M + COLW * 6, y: M, width: BARW, height: H - 2 * M, fill: 'var(--board-dark)' }));
  const chColor = (c) => (c === 'w' ? 'var(--white)' : 'var(--black)');
  const chStroke = (c) => (c === 'w' ? '#555' : '#000');

  for (let i = 0; i < 24; i++) {
    const { col, top } = idxPos(i);
    const x = colX(col);
    const tri = top ? `${x},${M} ${x + COLW},${M} ${x + COLW / 2},${M + 200}` : `${x},${H - M} ${x + COLW},${H - M} ${x + COLW / 2},${H - M - 200}`;
    const isDest = dests.has(i); const isSrc = sources.has(i) && !selected; const isSel = selected?.board === b.index && selected.from === i;
    svg.append(s('polygon', { points: tri, fill: (i % 2) ? 'var(--pt-a)' : 'var(--pt-b)', stroke: isDest ? 'var(--hl)' : isSel ? 'var(--hl)' : 'none', 'stroke-width': 4 }));
    const nMe = ownCount(st, me, i); const nOp = oppCount(st, me, i);
    const n = nMe || nOp; const c = nMe ? me : op;
    for (let k = 0; k < Math.min(n, 5); k++) {
      const cy = top ? M + 22 + k * 42 : H - M - 22 - k * 42;
      svg.append(s('circle', { cx: x + COLW / 2, cy, r: 20, fill: chColor(c), stroke: isSrc && k === Math.min(n, 5) - 1 ? 'var(--hl)' : chStroke(c), 'stroke-width': isSrc && k === Math.min(n, 5) - 1 ? 4 : 1.5 }));
    }
    if (n > 5) svg.append(s('text', { x: x + COLW / 2, y: top ? M + 22 + 4 * 42 + 6 : H - M - 22 - 4 * 42 + 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: c === 'w' ? '#000' : '#fff' }, String(n)));
    if (isDest) svg.append(s('circle', { cx: x + COLW / 2, cy: top ? M + 22 + Math.min(n, 4) * 42 : H - M - 22 - Math.min(n, 4) * 42, r: 10, fill: 'var(--hl)', opacity: 0.8 }));
    svg.append(s('text', { x: x + COLW / 2, y: top ? M - 3 : H - 3, 'text-anchor': 'middle', 'font-size': 11, fill: '#ddd' }, String(i + 1)));
    const hit = s('rect', { x, y: top ? M : H / 2, width: COLW, height: H / 2 - M, fill: 'transparent', class: 'pt-hit', tabindex: (isSrc || isDest) ? 0 : -1, 'aria-label': `נקודה ${i + 1}: ${nMe ? `${nMe} שלך` : nOp ? `${nOp} של היריב` : 'ריקה'}` });
    hit.addEventListener('click', () => onPointClick(b, i));
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPointClick(b, i); } });
    svg.append(hit);
  }
  // Bar
  const barX = M + COLW * 6 + BARW / 2;
  for (const [c, top] of [[op, true], [me, false]]) {
    const n = st.bar[c];
    for (let k = 0; k < Math.min(n, 4); k++) svg.append(s('circle', { cx: barX, cy: top ? H / 2 - 40 - k * 36 : H / 2 + 40 + k * 36, r: 17, fill: chColor(c), stroke: c === me && sources.has(BAR) ? 'var(--hl)' : chStroke(c), 'stroke-width': c === me && sources.has(BAR) ? 4 : 1.5 }));
    if (n > 4) svg.append(s('text', { x: barX, y: top ? H / 2 - 30 : H / 2 + 50, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14 }, String(n)));
  }
  const barHit = s('rect', { x: M + COLW * 6, y: H / 2, width: BARW, height: H / 2 - M, fill: 'transparent', class: 'pt-hit', 'aria-label': 'בר' });
  barHit.addEventListener('click', () => onPointClick(b, BAR));
  svg.append(barHit);
  // Off tray
  const offX = W + 4;
  svg.append(s('rect', { x: offX, y: M, width: OFFW - 8, height: H - 2 * M, rx: 6, fill: dests.has(OFF) ? 'var(--hl)' : 'rgba(0,0,0,.25)' }));
  svg.append(s('text', { x: offX + (OFFW - 8) / 2, y: H - M - 10, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14 }, `${st.off[me]}`));
  svg.append(s('text', { x: offX + (OFFW - 8) / 2, y: M + 22, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14 }, `${st.off[op]}`));
  const offHit = s('rect', { x: offX, y: H / 2, width: OFFW - 8, height: H / 2 - M, fill: 'transparent', class: 'pt-hit', 'aria-label': 'הוצאה' });
  offHit.addEventListener('click', () => onPointClick(b, OFF));
  svg.append(offHit);

  // Header + controls
  const title = match.kind === 'duplicate' ? `לוח ${b.index + 1} – אתה ${me === 'w' ? 'לבן' : 'שחור'}` : `אתה ${me === 'w' ? 'לבן' : 'שחור'}`;
  const status = b.phase === 'over' ? `המשחק הסתיים: ${b.result.winner === me ? 'ניצחת' : 'הפסדת'} ${b.result.points} נק' (${({ single: 'רגיל', gammon: 'גמון', backgammon: 'בקגמון', drop: 'ויתור על הכפלה', resign: 'פרישה' })[b.result.reason]})`
    : b.mustAnswerDouble ? `היריב מכפיל ל-${b.cube.value * 2}` : b.yourTurn ? 'תורך' : 'תור היריב';
  const used = p.dice ? p.dice.length === 2 && p.dice[0] === p.dice[1] ? 4 - p.remaining.length : null : null;
  const diceEls = b.dice ? (b.dice[0] === b.dice[1]
    ? [0, 1, 2, 3].map((k) => el('span', { class: 'die' + (b.legal && k < used ? ' used' : '') }, b.dice[0]))
    : b.dice.map((d) => el('span', { class: 'die' + (b.legal && !p.remaining.includes(d) ? ' used' : '') }, d))) : [];
  const ctr = el('div', { class: 'controls' },
    el('span', {}, ...diceEls),
    b.canDouble ? el('button', { onclick: () => send({ t: 'act', matchId: match.id, board: b.index, action: 'roll' }) }, 'הטל קוביות') : null,
    b.canDouble ? el('button', { class: 'secondary', onclick: () => send({ t: 'act', matchId: match.id, board: b.index, action: 'double' }) }, `הכפל ל-${b.cube.value * 2}`) : null,
    b.mustAnswerDouble ? el('button', { onclick: () => send({ t: 'act', matchId: match.id, board: b.index, action: 'take' }) }, 'קבל') : null,
    b.mustAnswerDouble ? el('button', { class: 'danger', onclick: () => send({ t: 'act', matchId: match.id, board: b.index, action: 'drop' }) }, 'ותר') : null,
    b.legal && p.moves.length ? el('button', { class: 'secondary', onclick: () => undo(b) }, 'בטל מהלכים') : null,
    b.phase !== 'over' && !match.over ? el('button', { class: 'secondary', onclick: () => { if (confirm('לפרוש מהמשחק הזה?')) send({ t: 'act', matchId: match.id, board: b.index, action: 'resign' }); } }, 'פרוש') : null,
    el('span', { class: 'muted' }, `קוביית הכפלה: ${b.cubeEnabled ? b.cube.value : '—'}${b.crawford ? ' (קרופורד)' : ''} · פיפס: אתה ${b.pips[me]} / יריב ${b.pips[op]}`),
  );
  return el('div', { class: 'board-wrap' + (b.yourTurn ? ' active' : '') }, el('h4', {}, el('span', {}, title), el('span', {}, status)), svg, ctr);
}

// ---------- wiring ----------
$('#register-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  send({ t: 'register', name: f.name.value, birthDate: f.birthDate.value, acceptTerms: f.terms.checked ? TERMS_VERSION : null });
});
for (const id of ['#bot-form', '#queue-form']) fillLengths($(id));
$('#bot-form').addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.target.elements;
  partial.clear();
  send({ t: 'bot', mode: f.mode.value, length: Number(f.len.value), level: f.level.value, clientSeed: randSeed() });
});
$('#queue-form').addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.target.elements;
  if ($('#queue-btn').textContent === 'בטל חיפוש') { send({ t: 'cancelQueue' }); return; }
  partial.clear();
  send({ t: 'queue', mode: f.mode.value, length: Number(f.len.value), clientSeed: randSeed() });
});
$('#limits-form').addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.target.elements;
  send({ t: 'limits', dailyEntry: f.dailyEntry.value === '' ? null : Number(f.dailyEntry.value), sessionReminderMin: Number(f.sessionReminderMin.value) });
  toast('המגבלות נשמרו');
});
$('#self-exclude').addEventListener('click', () => {
  const days = Number($('#limits-form').elements.selfExcludeDays.value);
  if (!days) { toast('הזן מספר ימים'); return; }
  if (confirm(`להחריג את עצמך ל-${days} ימים? לא ניתן לבטל.`)) send({ t: 'limits', selfExcludeDays: days });
});
$('#leave-match').addEventListener('click', () => { match = null; partial.clear(); show('lobby'); send({ t: 'me' }); send({ t: 'tournaments' }); send({ t: 'leaderboard' }); });
document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
  if (btn.dataset.tab === 'tournaments') send({ t: 'tournaments' });
  if (btn.dataset.tab === 'leaderboard') send({ t: 'leaderboard' });
  if (btn.dataset.tab === 'account') send({ t: 'me' });
}));
connect();
