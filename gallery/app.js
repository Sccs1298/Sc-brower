'use strict';
/* גלריה – אפליקציית מנטליזם שנראית כמו גלריית התמונות.
   מבנה הקובץ: עזרים · אחסון · מקורות וידאו · רינדור חשיפה · ניווט · גלריה · ניהול · עורך · הגדרות · צפייה/הופעה */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const easeOut = p => 1 - Math.pow(1 - clamp(p), 3);
const backOut = p => { p = clamp(p); const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const isRTL = s => /[֐-׿؀-ۿ]/.test(s);
const fmtDur = s => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
const getPath = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

const FONTS = {
  hand:    { name: 'כתב יד',          css: '"Amatic SC", "Caveat", cursive' },
  script:  { name: 'כתב יד (אנגלית)', css: '"Caveat", "Amatic SC", cursive' },
  bold:    { name: 'כותרת',            css: '"Secular One", sans-serif' },
  clean:   { name: 'נקי',              css: '"Rubik", sans-serif' },
  serif:   { name: 'עיתון',            css: '"Frank Ruhl Libre", serif' },
  digital: { name: 'דיגיטלי',          css: '"Courier New", ui-monospace, monospace' },
};
const DEFAULT_WORDS = ['ישראל', 'צרפת', 'יפן', 'ברזיל', 'מצרים', 'קנדה', 'איטליה', 'הודו', 'מקסיקו', 'יוון', 'תאילנד', 'ספרד'];

const METHODS = {
  grid:     { name: 'מקשים נסתרים 3×3', for: ['number', 'word', 'card'],
              help: 'בזמן שהסרטון מתנגן, המסך מחולק ל-9 מקשים בלתי נראים: 1 בפינה השמאלית העליונה ו-9 בימנית התחתונה. אחרי מספר הספרות שהגדרת, שאר הנגיעות לא נחשבות. שתי אצבעות מוחקות ספרה.' },
  keyboard: { name: 'מקלדת Bluetooth / שלט', for: ['number', 'word', 'card'],
              help: 'מקלידים במקלדת או בשלט Bluetooth מחוברים. נגיעות במסך לא עושות כלום, אז הצופה יכול להחזיק את הטלפון. רווח או חץ מתחיל את הסרטון.' },
  peek:     { name: 'הצופה מחפש בעצמו (חדש)', for: ['number', 'word', 'card'],
              help: 'הצופה לוחץ על חיפוש בגלריה ומקליד בעצמו את המילה או המספר. הוא מוצא את הסרטון, פותח אותו, והבחירה שלו מופיעה בתוכו. אתה לא נוגע בטלפון. (בהגדרות: אפשר "אין תוצאות" לשימוש כהצצה בלבד.)' },
  pre:      { name: 'לפני ההופעה (מסך חיפוש)', for: ['number', 'word', 'card'],
              help: 'כשנוגעים בסרטון בגלריה, נפתח קודם מסך חיפוש של הגלריה. מקלידים שם את הבחירה ולוחצים "חפש" במקלדת, והסרטון נפתח.' },
  scrub:    { name: 'גרירה ברצועת הפריימים (חדש)', for: ['number', 'word', 'card'], video: true,
              help: 'לפני הניגון גוררים את הסמן ברצועת הפריימים, כאילו מחפשים קטע. כל עזיבה של הרצועה = ספרה לפי המקום: קצה שמאל 0, קצה ימין 9 (10 אזורים). מאפשר גם 0. אחר כך לוחצים ▶.' },
  draw:     { name: 'ציור נסתר', for: ['drawing'],
              help: 'בזמן שהסרטון מתנגן מציירים באצבע על המסך. הקווים לא נראים, והציור מופיע באזור החשיפה. שתי אצבעות מבטלות את הקו האחרון.' },
};

/* ---------- הגדרות ---------- */
const S = { vibrate: true, indicator: false, record: false, contactName: '', contactLink: '', sample: '47', phTheme: 'auto', seenHelp: false, searchMode: 'result', forceId: '',
  startIn: 'hub', calcMode: 'time', calcNumber: '1089', deckMode: 'force', deckForce: '7 לב',
  notifyFrom: 'אמא', notifyBody: 'חלמתי הלילה על {x} 😮', notifyDelay: '6' };
const PEEK = { text: '', at: 0 };
const LAST = { text: '' }; // הבחירה האחרונה (מחיפוש או מחשיפה) – לפסיפס ולמצגת
let LASTVIEW = null;       // הפריט האחרון שנפתח מהגלריה – לגלריה המתנפצת // החיפוש האחרון של הצופה (בזיכרון בלבד)

/* ===================== אחסון =====================
   local  – IndexedDB באפליקציה המותקנת (קבוע במכשיר)
   cloud  – בתוך הקישור של Claude: מסמכים פרטיים + קבצי וידאו בחשבון
   memory – גיבוי זמני כשאין אף אחד מהם */
const Store = {
  mode: 'memory', idb: null, cdb: null, assets: null, uid: null, mem: new Map(),
  async init() {
    try {
      await new Promise((res, rej) => {
        const r = indexedDB.open('gallery', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('videos', { keyPath: 'id' });
        r.onsuccess = () => { this.idb = r.result; res(); };
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
        setTimeout(() => rej(new Error('timeout')), 4000);
      });
      this.mode = 'local';
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }
      return;
    } catch (e) { this.idb = null; }
    if (window.claude && window.claude.use) {
      try {
        const [db, assets, user] = await Promise.all([claude.use('db'), claude.use('assets'), claude.use('user')]);
        const id = user ? await user.id() : null;
        if (db && id) { this.cdb = db; this.assets = assets; this.uid = id; this.mode = 'cloud'; return; }
      } catch (e) { /* ignore */ }
    }
    this.mode = 'memory';
  },
  _idb(mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.idb.transaction('videos', mode), req = fn(tx.objectStore('videos'));
      tx.oncomplete = () => res(req.result); tx.onerror = tx.onabort = () => rej(tx.error);
    });
  },
  _col() { return this.cdb.collection('data/users/' + this.uid); },
  async all() {
    if (this.mode === 'local') return (await this._idb('readonly', s => s.getAll())).filter(x => x.id !== '__settings');
    if (this.mode === 'cloud') {
      const snap = await this._col().get();
      return snap.docs.map(d => d.data()).filter(d => d && d.kind === 'video').map(d => ({ ...d }));
    }
    return [...this.mem.values()];
  },
  async put(item) {
    if (this.mode === 'local') return this._idb('readwrite', s => s.put(item));
    if (this.mode === 'cloud') {
      const { blob, ...rest } = item; void blob;
      return this._col().doc('v_' + item.id).set(JSON.parse(JSON.stringify({ ...rest, kind: 'video' })));
    }
    this.mem.set(item.id, item);
  },
  async del(item) {
    if (this.mode === 'local') return this._idb('readwrite', s => s.delete(item.id));
    if (this.mode === 'cloud') {
      await this._col().doc('v_' + item.id).delete();
      if (item.assetId && this.assets) { try { await this.assets.delete(item.assetId); } catch (e) { /* ignore */ } }
      return;
    }
    this.mem.delete(item.id);
  },
  async loadSettings() {
    let saved = null;
    try {
      if (this.mode === 'cloud') { const d = await this._col().doc('settings').get(); saved = d.exists ? d.data() : null; }
      else saved = JSON.parse(localStorage.getItem('gallery.settings'));
    } catch (e) { /* ignore */ }
    if (saved) Object.assign(S, saved);
  },
  async saveSettings() {
    try {
      if (this.mode === 'cloud') await this._col().doc('settings').set({ ...S });
      else localStorage.setItem('gallery.settings', JSON.stringify(S));
    } catch (e) { /* ignore */ }
  },
};
let settingsT = 0;
const saveSettings = () => { clearTimeout(settingsT); settingsT = setTimeout(() => Store.saveSettings(), 400); };

/* שמירה בתור – כתיבה אחת בכל פעם לכל סרטון */
const saveChains = {};
function persist(item) {
  const snap = { ...item, regions: JSON.parse(JSON.stringify(item.regions || [])) };
  saveChains[item.id] = (saveChains[item.id] || Promise.resolve())
    .then(() => Store.put(snap))
    .catch(() => toast('השמירה נכשלה. נסה שוב'));
  return saveChains[item.id];
}

/* ---------- מודל ---------- */
const defQuad = () => [[0, 0], [1, 0], [1, 1], [0, 1]];
function newRegion(t, extra) {
  const base = { x: .2, y: .4, w: .6, h: .15 };
  return Object.assign({
    id: uid(), ...base, t, fade: 1.5, effect: 'fade', font: 'hand', color: '#ffffff', opacity: .95,
    rot: 0, skew: 0, blend: 'source-over', shadow: true, bold: true,
    trackOn: false, keys: [], persp: { on: false, q: defQuad() }, grain: .12, soft: .15, light: true,
  }, extra || {});
}
function demoItem() {
  const rect = { x: 205 / 720, y: 430 / 1280, w: 310 / 720, h: 400 / 1280 };
  return {
    id: 'demo', builtin: 'demo', name: 'הדגמה: התמונה בגלריה', fileName: 'IMG_4817.MOV', w: 720, h: 1280, duration: 20, created: 0,
    content: 'number', method: 'grid', digits: 2, trick: true, words: DEFAULT_WORDS.slice(),
    regions: [newRegion(15.5, { ...rect, fade: 2.6, color: '#2a1d12', opacity: .9, rot: -4, blend: 'multiply', shadow: false,
      track: { on: false, t2: 18, ...rect } })],
  };
}
/* התאמת סרטונים שנשמרו בגרסאות קודמות */
function normalize(it) {
  if (it.method === 'list') { it.method = 'grid'; it.digits = 1; }
  if (!METHODS[it.method]) it.method = it.content === 'drawing' ? 'draw' : 'grid';
  if (!it.digits) it.digits = 2;
  if (it.trick === undefined) it.trick = true;
  if (!it.words) it.words = DEFAULT_WORDS.slice();
  if (!it.regions) it.regions = [];
  if (!it.meta) it.meta = 'none';
  for (const r of it.regions) { // שדרוג אזורים ישנים
    if (!r.keys) { r.keys = []; if (r.track && r.track.on) { r.keys = [{ t: r.track.t2, x: r.track.x, y: r.track.y, w: r.track.w, h: r.track.h }]; r.trackOn = true; } }
    if (r.trackOn === undefined) r.trackOn = false;
    if (!r.persp) r.persp = { on: false, q: defQuad() };
    if (r.grain === undefined) r.grain = .1;
    if (r.soft === undefined) r.soft = .1;
    if (r.light === undefined) r.light = true;
  }
  if (!it.kind) it.kind = 'video';
  if (it.kind === 'photo' && it.method === 'scrub') it.method = 'grid';
  return it;
}
const shotTime = it => it.shotAt || (it.builtin ? Date.now() - 2 * 3600e3 : it.created || Date.now());
const activeRegions = it => (it.trick === false ? [] : it.regions);

class DemoSource {
  constructor() { this.w = 720; this.h = 1280; this.duration = 20; this._t = 0; this._start = 0; this.paused = true; this.ended = false; }
  async ready() {
    try { await Promise.all(['400 40px "Secular One"', '700 40px "Amatic SC"', '400 40px "Rubik"'].map(f => document.fonts.load(f))); }
    catch (e) { /* offline fonts */ }
  }
  get time() {
    if (!this.paused) {
      const t = (performance.now() - this._start) / 1000;
      if (t >= this.duration) { this._t = this.duration; this.paused = true; this.ended = true; } else this._t = t;
    }
    return this._t;
  }
  set time(v) { this._t = clamp(v, 0, this.duration); this.ended = false; this._start = performance.now() - this._t * 1000; }
  play() { if (this.ended) this._t = 0; this.ended = false; this._start = performance.now() - this._t * 1000; this.paused = false; return Promise.resolve(); }
  pause() { void this.time; this.paused = true; }
  draw(ctx, W, H) { ctx.save(); ctx.scale(W / 720, H / 1280); drawDemo(ctx, this.time); ctx.restore(); }
  destroy() { this.pause(); }
}

function drawDemo(ctx, t) {
  // קיר גלריה
  const g = ctx.createLinearGradient(0, 0, 0, 1280);
  g.addColorStop(0, '#3a332c'); g.addColorStop(.65, '#2a2520'); g.addColorStop(.66, '#4a3b2c'); g.addColorStop(1, '#2c2219');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 720, 1280);
  // זרקור
  const flick = 0.92 + 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 13.1);
  const sp = ctx.createRadialGradient(360, 620, 40, 360, 640, 520);
  sp.addColorStop(0, `rgba(255,236,200,${0.32 * flick})`); sp.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, 720, 1280);
  // מסגרת
  const fx = 175, fy = 400, fw = 370, fh = 460;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(fx + 14, fy + 18, fw, fh);
  const fg = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
  fg.addColorStop(0, '#b8893a'); fg.addColorStop(.5, '#e8c77a'); fg.addColorStop(1, '#8a6224');
  ctx.fillStyle = fg; ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = '#5c3f15'; ctx.fillRect(fx + 22, fy + 22, fw - 44, fh - 44);
  // בד
  ctx.fillStyle = '#efe4cc'; ctx.fillRect(fx + 28, fy + 28, fw - 56, fh - 56);
  ctx.fillStyle = 'rgba(120,90,50,.07)';
  for (let i = 0; i < 160; i++) { const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12345.678;
    ctx.fillRect(fx + 30 + (a - Math.floor(a)) * (fw - 60), fy + 30 + (b - Math.floor(b)) * (fh - 60), 3, 2); }
  // שלט
  ctx.fillStyle = '#d9d2c3'; ctx.fillRect(310, 900, 100, 36);
  ctx.fillStyle = '#3a332c'; ctx.font = '400 15px "Rubik", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = 'rtl'; ctx.fillText('ללא כותרת', 360, 918);

  const phases = [
    [0, 4, 'ברוכים הבאים לגלריה', 'יש כאן תמונה אחת. היא עדיין ריקה.'],
    [4, 9.5, 'חשבו על מספר', 'בין 10 ל-99 · אל תגידו אותו בקול'],
    [9.5, 14.5, 'דמיינו אותו', 'כתוב בדיו על הבד הזה'],
    [14.5, 20.5, 'עכשיו הביטו בתמונה', ''],
  ];
  for (const [a, b, title, sub] of phases) {
    if (t < a || t > b) continue;
    const al = Math.min(clamp((t - a) / .6), clamp((b - t) / .6));
    ctx.globalAlpha = al;
    ctx.fillStyle = '#f4ead6'; ctx.font = '400 54px "Secular One", sans-serif'; ctx.fillText(title, 360, 190);
    ctx.fillStyle = '#cbbfa8'; ctx.font = '400 28px "Rubik", sans-serif'; ctx.fillText(sub, 360, 262);
    ctx.globalAlpha = 1;
  }
  if (t > 9.5 && t < 14.5) { // ספירה לאחור
    const n = 5 - Math.floor(t - 9.5), f = (t - 9.5) % 1;
    ctx.globalAlpha = 1 - f; ctx.fillStyle = '#e8c77a';
    ctx.font = `400 ${90 + f * 40}px "Secular One", sans-serif`; ctx.fillText(String(n), 360, 1070);
    ctx.globalAlpha = 1;
  }
  ctx.direction = 'ltr';
}


/* ---------- רינדור החשיפה ---------- */
/* מיקום האזור בזמן t: נקודת ההתחלה + נקודות מעקב, עם מעבר חלק ביניהן */
function regionRect(r, t) {
  if (!r.trackOn || !r.keys || !r.keys.length) return r;
  const pts = [{ t: r.t, x: r.x, y: r.y, w: r.w, h: r.h }, ...r.keys].sort((a, b) => a.t - b.t);
  if (t <= pts[0].t) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1], b = pts[i], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
    }
  }
  return pts[pts.length - 1];
}
function revealProgress(r, t, t0) {
  if (t < t0) return -1;
  return r.effect === 'cut' ? 1 : clamp((t - t0) / Math.max(.05, r.fade));
}
function drawTextFit(ctx, text, w, h, r) {
  const fam = (FONTS[r.font] || FONTS.clean).css, wt = r.bold ? '700' : '400';
  let size = h * .82;
  ctx.font = `${wt} ${size}px ${fam}`;
  const m = ctx.measureText(text).width;
  if (m > w * .92) size *= (w * .92) / m;
  ctx.font = `${wt} ${size}px ${fam}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = isRTL(text) ? 'rtl' : 'ltr';
  ctx.fillStyle = r.color;
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .08; ctx.shadowOffsetY = size * .03; }
  ctx.fillText(text, 0, size * .04);
}
function drawStrokes(ctx, strokes, w, h, r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
  const s = Math.min((w * .82) / bw, (h * .82) / bh);
  ctx.scale(s, s); ctx.translate(-(x0 + bw / 2), -(y0 + bh / 2));
  ctx.strokeStyle = ctx.fillStyle = r.color;
  ctx.lineWidth = Math.max(2, Math.min(w, h) * (r.bold ? .045 : .03)) / s;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; }
  for (const st of strokes) {
    ctx.beginPath();
    if (st.length === 1) { ctx.arc(st[0][0], st[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.moveTo(st[0][0], st[0][1]);
    for (let i = 1; i < st.length - 1; i++) { // החלקה
      const mx = (st[i][0] + st[i + 1][0]) / 2, my = (st[i][1] + st[i + 1][1]) / 2;
      ctx.quadraticCurveTo(st[i][0], st[i][1], mx, my);
    }
    const L = st[st.length - 1]; ctx.lineTo(L[0], L[1]); ctx.stroke();
  }
}
/* ---------- קלפים ---------- */
const SUITS = ['♠', '♥', '♣', '♦'], SUIT_NAMES = ['עלה', 'לב', 'תלתן', 'יהלום'];
const VAL = v => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[v] || String(v));
function parseCard(str) {
  const s = String(str || '').trim(); if (!s) return null;
  if (/^\d+$/.test(s)) { // קוד: צורה (1–4) ואז ערך (1–13)
    const su = +s[0] - 1, v = +s.slice(1);
    return su >= 0 && su < 4 && v >= 1 && v <= 13 ? { s: su, v } : null;
  }
  const t = s.toLowerCase().replace(/\s+/g, ' ');
  let su = -1;
  [['♠', 'עלה', 'ספייד', 'spade', 'פיק'], ['♥', 'לב', 'heart'], ['♣', 'תלתן', 'club'], ['♦', 'יהלום', 'מעוין', 'diamond']]
    .forEach((ws, i) => { if (ws.some(w => t.includes(w))) su = i; });
  let v = 0;
  if (/(^|\s)(a|אס|אסים|ace)(\s|$|♠|♥|♣|♦)/.test(t) || /^a/.test(t)) v = 1;
  else if (/(k|מלך|king)/.test(t)) v = 13; else if (/(q|מלכה|queen)/.test(t)) v = 12; else if (/(j|נסיך|ג'ק|jack)/.test(t)) v = 11;
  else { const m = t.match(/\d+/); if (m) v = +m[0]; }
  return su >= 0 && v >= 1 && v <= 13 ? { s: su, v } : null;
}
const cardText = c => `${VAL(c.v)}${SUITS[c.s]}`;
function drawCard(ctx, c, w, h, r) {
  const ar = 2.5 / 3.5; let cw = w * .9, ch = cw / ar; if (ch > h * .9) { ch = h * .9; cw = ch * ar; }
  const red = c.s === 1 || c.s === 3, ink = red ? '#c8102e' : '#141414', rad = cw * .07;
  ctx.save();
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = cw * .06; ctx.shadowOffsetY = cw * .02; }
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-cw / 2, -ch / 2, cw, ch, rad) : ctx.rect(-cw / 2, -ch / 2, cw, ch);
  ctx.fillStyle = '#fbfaf7'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, cw * .01); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke();
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
  const corner = (sx, sy, rot) => {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot);
    ctx.font = `700 ${cw * .17}px Georgia, "Times New Roman", serif`; ctx.fillText(VAL(c.v), 0, 0);
    ctx.font = `${cw * .14}px Georgia, serif`; ctx.fillText(SUITS[c.s], 0, cw * .16); ctx.restore();
  };
  corner(-cw / 2 + cw * .13, -ch / 2 + ch * .1, 0); corner(cw / 2 - cw * .13, ch / 2 - ch * .1, Math.PI);
  ctx.font = `${c.v >= 11 ? cw * .5 : cw * .45}px Georgia, serif`;
  ctx.fillText(c.v >= 11 ? VAL(c.v) + SUITS[c.s] : SUITS[c.s], 0, ch * .02);
  ctx.restore();
}

/* ---------- ריאליזם: שכבה, גרעיניות, רכות, תאורה ופרספקטיבה ---------- */
const LAYER = document.createElement('canvas'), LCTX = LAYER.getContext('2d');
let NOISE = null;
function noiseCanvas() {
  if (!NOISE) {
    NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 128;
    const x = NOISE.getContext('2d'), d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
  }
  return NOISE;
}
const SAMPLE = document.createElement('canvas'); SAMPLE.width = SAMPLE.height = 6;
const SCTX = SAMPLE.getContext('2d', { willReadFrequently: true });
const LIGHT = new Map();
const resetLight = () => LIGHT.clear();
function sampleLum(ctx, x, y, w, h) {
  try {
    const m = ctx.getTransform();
    SCTX.clearRect(0, 0, 6, 6);
    SCTX.drawImage(ctx.canvas, m.a * x + m.e, m.d * y + m.f, Math.max(1, m.a * w), Math.max(1, m.d * h), 0, 0, 6, 6);
    const d = SCTX.getImageData(0, 0, 6, 6).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    return sum / 36 / 255;
  } catch (e) { return null; } // וידאו ממקור חיצוני – בלי דגימה
}
/* התאמת תאורה: כמה בהיר המשטח עכשיו לעומת רגע החשיפה */
function lightFactor(r, ctx, x, y, w, h) {
  if (!r.light) return 1;
  if (!ctx.canvas.__lid) ctx.canvas.__lid = uid();
  const key = r.id + ctx.canvas.__lid;
  let st = LIGHT.get(key); if (!st) { st = { ref: null, val: 1, n: 0 }; LIGHT.set(key, st); }
  if (st.n++ % 3 === 0) {
    const l = sampleLum(ctx, x, y, w, h);
    if (l != null) { if (st.ref == null) st.ref = Math.max(.04, l); st.val = lerp(st.val, clamp(l / st.ref, .25, 1.6), .5); }
  }
  return st.val;
}
/* מיפוי ריבוע היחידה למרובע (פרספקטיבה אמיתית) */
function homography(q) {
  const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a13 = 0, a23 = 0; const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-9) { a13 = (dx3 * dy2 - dx2 * dy3) / den; a23 = (dx1 * dy3 - dx3 * dy1) / den; }
  const a11 = x1 - x0 + a13 * x1, a21 = x3 - x0 + a23 * x3, a12 = y1 - y0 + a13 * y1, a22 = y3 - y0 + a23 * y3;
  return (u, v) => { const z = a13 * u + a23 * v + 1; return [(a11 * u + a21 * v + x0) / z, (a12 * u + a22 * v + y0) / z]; };
}
function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
  const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (Math.abs(det) < 1e-9) return;
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const ex = p => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * .7, p[1] + dy / l * .7]; };
  ctx.save(); ctx.beginPath();
  const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
  ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
  const ax = s1[0] - s0[0], ay = s1[1] - s0[1], bx = s2[0] - s0[0], by = s2[1] - s0[1];
  const ux = d1[0] - d0[0], uy = d1[1] - d0[1], vx = d2[0] - d0[0], vy = d2[1] - d0[1];
  const a = (ux * by - vx * ay) / det, c = (vx * ax - ux * bx) / det;
  const b = (uy * by - vy * ay) / det, d = (vy * ax - uy * bx) / det;
  ctx.transform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
  ctx.drawImage(img, 0, 0); ctx.restore();
}
function drawWarped(ctx, img, quad, pad) {
  const H = homography(quad), N = 6, LW = img.width, LH = img.height, span = 1 + 2 * pad;
  const P = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = -pad + span * i / N, v = -pad + span * j / N;
    P.push({ s: [LW * i / N, LH * j / N], d: H(u, v) });
  }
  const at = (i, j) => P[j * (N + 1) + i];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p00 = at(i, j), p10 = at(i + 1, j), p11 = at(i + 1, j + 1), p01 = at(i, j + 1);
    drawTri(ctx, img, p00.s, p10.s, p11.s, p00.d, p10.d, p11.d);
    drawTri(ctx, img, p00.s, p11.s, p01.s, p00.d, p11.d, p01.d);
  }
}
function drawReveal(ctx, r, payload, p, t, W, H) {
  if (!payload || p < 0) return;
  const R = regionRect(r, t), w = R.w * W, h = R.h * H, x0 = R.x * W, y0 = R.y * H;
  if (w < 2 || h < 2) return;
  const lf = lightFactor(r, ctx, x0, y0, w, h);
  // 1. מציירים את הכתב על שכבה נפרדת (קטנה יותר = רכה יותר)
  const m = ctx.getTransform(), dens = Math.abs(m.a) || 1, sc = 1 / (1 + clamp(r.soft || 0) * 3), pad = .25;
  const lw = Math.max(2, w * dens * sc), lh = Math.max(2, h * dens * sc);
  LAYER.width = Math.ceil(lw * (1 + 2 * pad)); LAYER.height = Math.ceil(lh * (1 + 2 * pad));
  const LW = LAYER.width, LH = LAYER.height;
  LCTX.save(); LCTX.translate(LW / 2, LH / 2); LCTX.scale(dens * sc, dens * sc);
  if (payload.type === 'text') drawTextFit(LCTX, payload.text, w, h, r);
  else if (payload.type === 'card') drawCard(LCTX, payload.card, w, h, r);
  else drawStrokes(LCTX, payload.strokes, w, h, r);
  LCTX.restore();
  // 2. תאורה: המשטח התכהה או התבהר מאז רגע החשיפה
  if (Math.abs(lf - 1) > .02) {
    LCTX.save(); LCTX.globalCompositeOperation = 'source-atop';
    LCTX.fillStyle = lf < 1 ? `rgba(0,0,0,${clamp(1 - lf, 0, .8)})` : `rgba(255,255,255,${clamp((lf - 1) * .6, 0, .5)})`;
    LCTX.fillRect(0, 0, LW, LH); LCTX.restore();
  }
  // 3. גרעיניות מצלמה, מתחלפת בכל פריים
  if (r.grain > 0) {
    LCTX.save(); LCTX.globalCompositeOperation = 'source-atop'; LCTX.globalAlpha = clamp(r.grain) * .45;
    LCTX.fillStyle = LCTX.createPattern(noiseCanvas(), 'repeat');
    LCTX.translate(-(Math.random() * 128 | 0), -(Math.random() * 128 | 0));
    LCTX.fillRect(0, 0, LW + 128, LH + 128); LCTX.restore();
  }
  // 4. אפקט "נכתב": חושפים חלק מהשכבה
  const e = easeOut(p);
  if (r.effect === 'wipe') {
    const rtl = payload.type === 'text' && isRTL(payload.text), ww = lw * 1.1 * clamp(p);
    LCTX.save(); LCTX.globalCompositeOperation = 'destination-in'; LCTX.fillStyle = '#000';
    LCTX.fillRect(rtl ? LW / 2 + lw * .55 - ww : LW / 2 - lw * .55, 0, ww, LH); LCTX.restore();
  }
  // 5. הדבקה על הסרטון
  ctx.save();
  ctx.globalCompositeOperation = r.blend || 'source-over';
  let a = r.opacity, s = 1;
  if (r.effect === 'fade') a *= e;
  else if (r.effect === 'develop') { a *= clamp(p * 1.2); s = 1.06 - .06 * e; }
  else if (r.effect === 'pop') { s = Math.max(.001, backOut(p)); a *= clamp(p * 3); }
  ctx.globalAlpha = a;
  if (r.persp && r.persp.on) {
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const quad = r.persp.q.map(([u, v]) => [cx + (x0 + u * w - cx) * s, cy + (y0 + v * h - cy) * s]);
    drawWarped(ctx, LAYER, quad, pad);
  } else {
    ctx.translate(x0 + w / 2, y0 + h / 2);
    ctx.rotate(r.rot * Math.PI / 180);
    if (r.skew) ctx.transform(1, 0, Math.tan(r.skew * Math.PI / 180), 1, 0, 0);
    ctx.scale(s, s);
    ctx.drawImage(LAYER, -w / 2 * (1 + 2 * pad), -h / 2 * (1 + 2 * pad), w * (1 + 2 * pad), h * (1 + 2 * pad));
  }
  ctx.restore();
}
/* מצייר פריים מלא: וידאו + כל אזורי החשיפה */
function composeFrame(ctx, src, item, payload, payloadAt, W, H, forceFull) {
  src.draw(ctx, W, H);
  const t = src.time;
  for (const r of item.regions) {
    const p = forceFull ? 1 : (payload ? revealProgress(r, t, Math.max(r.t, payloadAt)) : -1);
    drawReveal(ctx, r, payload, p, t, W, H);
  }
}
const fitRect = (sw, sh, cw, ch) => { const s = Math.min(cw / sw, ch / sh), w = sw * s, h = sh * s; return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }; };

/* ===================== מקורות וידאו ===================== */
const mediaSrc = it => it.blob || it.assetUrl || null;
class VideoSource {
  constructor(src) {
    const v = this.el = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    this.owned = src instanceof Blob;
    this.url = this.owned ? URL.createObjectURL(src) : src;
    v.src = this.url;
    $('#vhost').appendChild(v);
  }
  ready() {
    return new Promise((res, rej) => {
      const v = this.el; let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      if (v.readyState >= 2) return ok();
      v.addEventListener('loadeddata', ok, { once: true });
      v.addEventListener('loadedmetadata', () => setTimeout(ok, 900), { once: true });
      v.addEventListener('error', () => { if (!done) { done = true; rej(new Error('לא ניתן לטעון את הסרטון')); } }, { once: true });
      // אייפון לא טוען פריים לפני ניגון: מנגנים רגע בשקט ועוצרים
      v.muted = true;
      const p = v.play();
      if (p && p.then) p.then(() => { v.pause(); v.currentTime = 0; v.muted = false; ok(); }).catch(() => { v.muted = false; });
      else v.muted = false;
      setTimeout(ok, 4000);
    });
  }
  get w() { return this.el.videoWidth || 720; }
  get h() { return this.el.videoHeight || 1280; }
  get duration() { return isFinite(this.el.duration) ? this.el.duration : 0; }
  get time() { return this.el.currentTime; }
  set time(v) { this.el.currentTime = v; }
  get paused() { return this.el.paused; }
  get ended() { return this.el.ended; }
  play() { return this.el.play(); }
  pause() { this.el.pause(); }
  draw(ctx, w, h) { if (this.el.readyState >= 2) ctx.drawImage(this.el, 0, 0, w, h); }
  destroy() {
    this.el.pause();
    if (this.ac) this.ac.close().catch(() => {});
    this.el.removeAttribute('src'); this.el.load(); this.el.remove();
    if (this.owned) URL.revokeObjectURL(this.url);
  }
}
/* תמונה: "זמן" הוא שעון שמתחיל כשמתחילים להזין */
class ImageSource {
  constructor(src) {
    this.owned = src instanceof Blob; this.url = this.owned ? URL.createObjectURL(src) : src;
    this.img = new Image(); this.img.src = this.url;
    this._t = 0; this._t0 = 0; this.paused = true; this.ended = false; this.duration = 0;
  }
  ready() {
    return new Promise((res, rej) => {
      if (this.img.complete && this.img.naturalWidth) return res();
      this.img.onload = () => res(); this.img.onerror = () => rej(new Error('לא ניתן לטעון את התמונה'));
    });
  }
  get w() { return this.img.naturalWidth || 1080; }
  get h() { return this.img.naturalHeight || 1440; }
  get time() { return this.paused ? this._t : (performance.now() - this._t0) / 1000; }
  set time(v) { this._t = v; this._t0 = performance.now() - v * 1000; }
  play() { this._t0 = performance.now() - this._t * 1000; this.paused = false; return Promise.resolve(); }
  pause() { this._t = this.time; this.paused = true; }
  draw(ctx, w, h) { if (this.img.naturalWidth) ctx.drawImage(this.img, 0, 0, w, h); }
  destroy() { if (this.owned) URL.revokeObjectURL(this.url); }
}
const makeSource = item => {
  if (item.builtin === 'demo') return new DemoSource();
  if (item.kind === 'photo') { const src = mediaSrc(item); if (!src) throw new Error('קובץ התמונה חסר'); return new ImageSource(src); }
  const src = mediaSrc(item);
  if (!src) throw new Error('קובץ הווידאו חסר');
  return new VideoSource(src);
};

/* בדיקת קובץ חדש: מידות, אורך ותמונה ממוזערת */
async function inspect(file) {
  if ((file.type || '').startsWith('image/')) {
    const u = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('לא ניתן לפתוח את התמונה')); img.src = u; });
      const w = img.naturalWidth, h = img.naturalHeight;
      return { kind: 'photo', w, h, duration: 0, thumb: thumbOf(c => c.drawImage(img, 0, 0, w, h), w, h) };
    } finally { URL.revokeObjectURL(u); }
  }
  const v = document.createElement('video'), u = URL.createObjectURL(file);
  v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = u;
  $('#vhost').appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('הדפדפן לא מצליח לפתוח את הסרטון הזה')); setTimeout(res, 6000); });
    try { await v.play(); v.pause(); } catch (e) { /* ignore */ }
    const info = { w: v.videoWidth, h: v.videoHeight, duration: isFinite(v.duration) ? v.duration : 0 };
    await new Promise(res => { v.onseeked = res; v.currentTime = Math.min(.5, (info.duration || 1) / 2); setTimeout(res, 1500); });
    info.thumb = thumbOf(c => c.drawImage(v, 0, 0, info.w || 1, info.h || 1), info.w || 1, info.h || 1);
    return info;
  } finally { v.remove(); URL.revokeObjectURL(u); }
}
function thumbOf(drawFn, w, h) {
  try {
    const c = document.createElement('canvas'), size = 220; c.width = c.height = size;
    const x = c.getContext('2d'), s = Math.max(size / w, size / h);
    x.translate((size - w * s) / 2, (size - h * s) / 2); x.scale(s, s);
    drawFn(x);
    return c.toDataURL('image/jpeg', .72);
  } catch (e) { return ''; }
}
let DEMO_THUMB = '';
function demoThumb() {
  if (!DEMO_THUMB) { const d = new DemoSource(); d.time = 1.2; DEMO_THUMB = thumbOf(x => d.draw(x, 720, 1280), 720, 1280); }
  return DEMO_THUMB;
}
const thumbFor = it => it.builtin === 'demo' ? demoThumb() : (it.thumb || '');

/* ===================== עזרי ממשק ===================== */
let toastT;
function toast(msg, ms = 2800) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); }
const buzz = () => { if (S.vibrate && navigator.vibrate) navigator.vibrate(12); };
function applyTheme() {
  document.body.classList.toggle('pg-light', S.phTheme === 'light');
  document.body.classList.toggle('pg-dark', S.phTheme === 'dark');
}

/* ===================== ניווט =====================
   מחסנית מסכים. כל מסך יכול לקבל פעולת כניסה ויציאה.
   כפתור "אחורה" של הטלפון/הדפדפן מחזיר מסך אחד. */
const NAV = { stack: [], skipPop: 0 };
const ENTER = {}, LEAVE = {};
function paint(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id !== 'photos') window.scrollTo(0, 0);
}
async function go(id, opts = {}) {
  const cur = NAV.stack[NAV.stack.length - 1];
  if (cur && LEAVE[cur]) await LEAVE[cur]();
  if (opts.replace) NAV.stack.pop();
  else { try { history.pushState({ g: NAV.stack.length + 1 }, ''); } catch (e) { /* ignore */ } }
  NAV.stack.push(id); paint(id);
  if (ENTER[id]) await ENTER[id]();
}
async function popScreen() {
  if (NAV.stack.length <= 1) return;
  const cur = NAV.stack.pop();
  if (LEAVE[cur]) await LEAVE[cur]();
  const prev = NAV.stack[NAV.stack.length - 1];
  paint(prev);
  if (ENTER[prev]) await ENTER[prev]();
}
function uiBack() {
  if (NAV.stack.length <= 1) return;
  NAV.skipPop++;
  try { history.back(); } catch (e) { NAV.skipPop--; }
  popScreen();
}
addEventListener('popstate', () => {
  if (NAV.skipPop > 0) { NAV.skipPop--; return; }
  popScreen();
});
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) { e.preventDefault(); uiBack(); } });
const curScreen = () => NAV.stack[NAV.stack.length - 1];

/* ===================== הגלריה (מסך הבית) ===================== */
let ITEMS = [];
const byId = id => ITEMS.find(x => x.id === id);
function renderGrid() {
  const grid = $('#pgGrid'), list = ITEMS.filter(x => !x.hidden).sort((a, b) => shotTime(a) - shotTime(b));
  const nv = list.filter(x => x.kind !== 'photo').length, np = list.length - nv;
  $('#pgCount').textContent = [np ? (np === 1 ? 'תמונה 1' : `${np} תמונות`) : '', nv ? (nv === 1 ? 'סרטון 1' : `${nv} סרטונים`) : ''].filter(Boolean).join(', ');
  grid.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'pg-cell'; b.type = 'button';
    const th = thumbFor(it);
    b.innerHTML = `${th ? '<img alt="">' : ''}<span class="dur"></span>${it.fav ? '<svg class="fav" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z"/></svg>' : ''}`;
    if (th) $('img', b).src = th;
    $('.dur', b).textContent = it.kind === 'photo' ? '' : fmtDur(it.duration);
    b.addEventListener('click', () => openViewer(it.id, { from: 'photos' }));
    grid.appendChild(b);
  }
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); // כמו בגלריה: החדש למטה
}
ENTER.photos = () => { applyTheme(); renderGrid(); };
LEAVE.photos = () => { $('#shatter').hidden = true; $('#shatter').innerHTML = ''; $('#mosaic').hidden = true; $('#pgGrid').style.visibility = ''; };


/* ===================== אפקטים בגלריה ===================== */
const visibleItems = () => ITEMS.filter(x => !x.hidden).sort((a, b) => shotTime(a) - shotTime(b));
/* מחוות על הגלריה: הקשה בשתי אצבעות = התנפצות · צביטה פנימה = פסיפס */
(() => {
  const grid = $('#pgGrid'), pts = new Map(); let d0 = 0, t0 = 0, maxN = 0, moved = false, pinched = false;
  const dist = () => { const [a, b] = [...pts.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  grid.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pts.size === 1) { t0 = performance.now(); maxN = 1; moved = false; pinched = false; }
    if (pts.size === 2) { d0 = dist(); maxN = 2; }
  });
  grid.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 12) moved = true;
    if (pts.size === 2 && !pinched && d0 && dist() < d0 * .6) { pinched = true; showMosaic(); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size === 0 && maxN === 2 && !moved && !pinched && performance.now() - t0 < 450) shatter();
  };
  grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);
  grid.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  addEventListener('wheel', e => { if (curScreen() === 'photos' && e.ctrlKey && e.deltaY > 0) { e.preventDefault(); showMosaic(); } }, { passive: false });
})();

/* התנפצות: כל הפריטים נופלים, נשאר רק מה שהצופה פתח */
function shatter() {
  const target = LASTVIEW && byId(LASTVIEW); if (!target) return;
  const layer = $('#shatter'); layer.innerHTML = ''; layer.hidden = false;
  $('#pgGrid').style.visibility = 'hidden'; // רק השברים נראים
  const cells = [...$('#pgGrid').children], list = visibleItems();
  let keep = null, n = 0;
  cells.forEach((cell, i) => {
    const r = cell.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    const sh = document.createElement('div'); sh.className = 'shard';
    Object.assign(sh.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const img = $('img', cell); if (img) { const im = document.createElement('img'); im.src = img.src; sh.appendChild(im); }
    layer.appendChild(sh);
    if (list[i] && list[i].id === target.id) { keep = { sh, r }; return; }
    const delay = 120 + (n++) * 55 + Math.random() * 60;
    sh.animate([{ transform: 'none', opacity: 1 },
      { transform: `translate(${(Math.random() - .5) * 160}px, ${innerHeight + 200}px) rotate(${(Math.random() - .5) * 120}deg)`, opacity: .9 }],
      { duration: 900 + Math.random() * 400, delay, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
  });
  buzz();
  if (keep) {
    const size = Math.min(innerWidth, innerHeight) * .78, { r } = keep;
    const dx = innerWidth / 2 - (r.left + r.width / 2), dy = innerHeight / 2 - (r.top + r.height / 2), sc = size / r.width;
    keep.sh.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${sc})` }],
      { duration: 700, delay: 200 + n * 55 + 500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    keep.sh.style.zIndex = 2; keep.sh.style.borderRadius = '4px';
  }
  layer.onclick = () => { layer.hidden = true; layer.innerHTML = ''; $('#pgGrid').style.visibility = ''; };
}

/* פסיפס: הגלריה "מתרחקת" והתמונות יוצרות את הבחירה */
const THUMB_IMGS = new Map();
function thumbImg(it) {
  const src = thumbFor(it); if (!src) return null;
  if (!THUMB_IMGS.has(src)) { const im = new Image(); im.src = src; THUMB_IMGS.set(src, im); }
  return THUMB_IMGS.get(src);
}
function showMosaic() {
  const text = (LAST.text || '').trim(); if (!text) return;
  const cv = $('#mosaic'), dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.hidden = false;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const cols = Math.max(14, Math.round(W / 18)), cell = W / cols, rows = Math.ceil(H / cell);
  // מסכה של הטקסט ברזולוציית התאים
  const m = document.createElement('canvas'); m.width = cols; m.height = rows;
  const mx = m.getContext('2d'); mx.fillStyle = '#000'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.direction = isRTL(text) ? 'rtl' : 'ltr';
  let fs = rows * .5; mx.font = `900 ${fs}px "Rubik", "Secular One", sans-serif`;
  const tw = mx.measureText(text).width; if (tw > cols * .9) fs *= cols * .9 / tw;
  mx.font = `900 ${fs}px "Rubik", "Secular One", sans-serif`; mx.fillText(text, cols / 2, rows / 2);
  const mask = mx.getImageData(0, 0, cols, rows).data;
  const imgs = visibleItems().map(thumbImg).filter(Boolean);
  const bg = getComputedStyle($('#photos')).getPropertyValue('--pg-bg').trim() || '#000';
  const t0 = performance.now();
  const frame = now => {
    if (cv.hidden) return;
    const k = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - k, 3), zoom = 4 - 3 * e;
    ctx.save(); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = mask[(y * cols + x) * 4 + 3] > 110, im = imgs.length ? imgs[(x * 7 + y * 13) % imgs.length] : null;
      ctx.globalAlpha = on ? 1 : lerp(1, .13, e);
      if (im && im.complete && im.naturalWidth) ctx.drawImage(im, x * cell + .5, y * cell + .5, cell - 1, cell - 1);
      else { ctx.fillStyle = on ? '#ffcc00' : '#888'; ctx.fillRect(x * cell + .5, y * cell + .5, cell - 1, cell - 1); }
    }
    ctx.restore();
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame); buzz();
  cv.onclick = () => { cv.hidden = true; };
}

/* ===================== מצגת "זכרונות" עם כותרת והכרחה ===================== */
const M = { raf: 0, items: [], imgs: [], i: 0, t0: 0, stopAt: -1, stopped: false, title: '' };
function memImage(it) {
  const im = new Image();
  if (it.kind === 'photo' && mediaSrc(it)) { const s = mediaSrc(it); im.src = s instanceof Blob ? (it._url || (it._url = URL.createObjectURL(s))) : s; }
  else im.src = thumbFor(it) || '';
  return im;
}
ENTER.memories = () => {
  const list = visibleItems(); if (!list.length) { uiBack(); return; }
  // מערבבים, אבל פריט ההכרחה תמיד נמצא ברשימה
  M.items = list.slice().sort(() => Math.random() - .5);
  M.imgs = M.items.map(memImage);
  M.title = (LAST.text || '').trim() || phDate(Date.now())[0];
  M.i = 0; M.t0 = performance.now(); M.stopAt = -1; M.stopped = false;
  const cv = $('#memCv'), dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cancelAnimationFrame(M.raf); M.raf = requestAnimationFrame(memLoop);
};
LEAVE.memories = () => { cancelAnimationFrame(M.raf); };
const MEM_TITLE = 3.2, MEM_SLIDE = 2.2;
function memLoop(now) {
  M.raf = requestAnimationFrame(memLoop);
  const cv = $('#memCv'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, t = (now - M.t0) / 1000;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const drawImg = (im, alpha, zoom) => {
    if (!im || !im.complete || !im.naturalWidth) return;
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * zoom, w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.globalAlpha = alpha; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); ctx.globalAlpha = 1;
  };
  if (t < MEM_TITLE && !M.stopped) { // כרטיס פתיחה: הכותרת היא הבחירה של הצופה
    drawImg(M.imgs[0], .45, 1.08 + t * .02);
    const a = Math.min(1, t / .8) * Math.min(1, (MEM_TITLE - t) / .5);
    ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = isRTL(M.title) ? 'rtl' : 'ltr';
    let fs = W * .14; ctx.font = `800 ${fs}px -apple-system, "SF Pro Display", "Rubik", sans-serif`;
    const tw = ctx.measureText(M.title).width; if (tw > W * .84) { fs *= W * .84 / tw; ctx.font = `800 ${fs}px -apple-system, "SF Pro Display", "Rubik", sans-serif`; }
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = fs * .3; ctx.fillText(M.title, W / 2, H * .46);
    ctx.font = `600 ${W * .045}px -apple-system, "Rubik", sans-serif`; ctx.direction = 'rtl';
    ctx.fillText(new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }), W / 2, H * .46 + fs * .85);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    return;
  }
  if (M.stopped) { drawImg(M.imgs[M.i], 1, 1.02); return; }
  const st = t - MEM_TITLE, idx = Math.floor(st / MEM_SLIDE), k = (st % MEM_SLIDE) / MEM_SLIDE;
  const cur = idx % M.items.length, nxt = (idx + 1) % M.items.length;
  if (M.stopAt >= 0 && idx >= M.stopAt) { M.i = M.stopAt % M.items.length; M.stopped = true; buzz(); return; }
  drawImg(M.imgs[cur], 1, 1.05 + k * .08);
  if (k > .82) drawImg(M.imgs[nxt], (k - .82) / .18, 1.05);
}
/* נגיעה = "עצור": המצגת ממשיכה עוד קצת ועוצרת על פריט ההכרחה */
$('#memCv').addEventListener('click', () => {
  if (M.stopped) { uiBack(); return; }
  const now = (performance.now() - M.t0) / 1000;
  const idx = Math.max(0, Math.floor((now - MEM_TITLE) / MEM_SLIDE));
  const fi = M.items.findIndex(x => x.id === S.forceId);
  if (fi < 0) { M.stopAt = idx; return; }
  // מציבים את פריט ההכרחה שתי שקופיות קדימה (עוד לא נראה), ועוצרים עליו
  const target = idx + 2, ti = target % M.items.length, ci = idx % M.items.length, ni = (idx + 1) % M.items.length;
  if (fi === ci) { M.stopAt = idx; return; }      // כבר על המסך – עוצרים מיד
  if (fi === ni) { M.stopAt = idx + 1; return; }  // השקופית הבאה
  [M.items[fi], M.items[ti]] = [M.items[ti], M.items[fi]];
  [M.imgs[fi], M.imgs[ti]] = [M.imgs[ti], M.imgs[fi]];
  M.stopAt = target;
});
$('#memClose').onclick = () => uiBack();

/* ===================== חיפוש בגלריה: הצופה מקליד בעצמו ===================== */
$('#pgSearch').onclick = () => go('search');
ENTER.search = () => {
  $('#srIn').value = ''; $('#srSuggest').hidden = false; $('#srResults').hidden = true; $('#srEmpty').hidden = true;
  setTimeout(() => $('#srIn').focus(), 80);
};
function runSearch(q) {
  q = (q || '').trim(); if (!q) return;
  PEEK.text = q; PEEK.at = Date.now(); LAST.text = q;
  $('#srIn').blur(); $('#srSuggest').hidden = true;
  const tricks = ITEMS.filter(x => !x.hidden && x.trick !== false && x.method === 'peek').sort((a, b) => shotTime(b) - shotTime(a));
  if (S.searchMode !== 'none' && tricks.length) {
    const it = tricks[0], grid = $('#srGrid');
    $('#srCount').textContent = it.kind === 'photo' ? 'תמונה 1' : 'סרטון 1';
    grid.innerHTML = '';
    const b = document.createElement('button'); b.className = 'pg-cell'; b.type = 'button';
    const th = thumbFor(it);
    b.innerHTML = `${th ? '<img alt="">' : ''}<span class="dur"></span>`;
    if (th) $('img', b).src = th;
    $('.dur', b).textContent = it.kind === 'photo' ? '' : fmtDur(it.duration);
    b.addEventListener('click', () => openViewer(it.id, { from: 'search' }));
    grid.appendChild(b);
    $('#srResults').hidden = false; $('#srEmpty').hidden = true;
  } else {
    $('#srEmptyQ').textContent = q; $('#srEmpty').hidden = false; $('#srResults').hidden = true;
  }
}
$('#srForm').addEventListener('submit', e => { e.preventDefault(); runSearch($('#srIn').value); });
/* הצעות: מציגות פריטים רגילים מהגלריה, בלי לגעת בהצצה */
$('#srSuggest').addEventListener('click', e => {
  const c = e.target.closest('[data-q]'); if (!c) return;
  $('#srIn').value = c.dataset.q; $('#srSuggest').hidden = true; $('#srEmpty').hidden = true;
  let list = ITEMS.filter(x => !x.hidden);
  if (c.dataset.q === 'סרטונים') list = list.filter(x => x.kind !== 'photo');
  else if (c.dataset.q === 'מועדפים') list = list.filter(x => x.fav);
  else list = [];
  if (!list.length) { $('#srEmptyQ').textContent = c.dataset.q; $('#srEmpty').hidden = false; $('#srResults').hidden = true; return; }
  const grid = $('#srGrid'); grid.innerHTML = '';
  $('#srCount').textContent = `${list.length} פריטים`;
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'pg-cell'; b.type = 'button';
    const th = thumbFor(it); b.innerHTML = `${th ? '<img alt="">' : ''}<span class="dur"></span>`;
    if (th) $('img', b).src = th; $('.dur', b).textContent = it.kind === 'photo' ? '' : fmtDur(it.duration);
    b.addEventListener('click', () => openViewer(it.id, { from: 'search' })); grid.appendChild(b);
  }
  $('#srResults').hidden = false;
});

/* לחיצה ארוכה על "ספרייה" = כניסה נסתרת לניהול */
(() => {
  const t = $('#pgTitle').parentElement; let timer = 0;
  t.addEventListener('pointerdown', () => { clearTimeout(timer); timer = setTimeout(() => { buzz(); go('manage'); }, 900); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => t.addEventListener(ev, () => clearTimeout(timer)));
  t.addEventListener('contextmenu', e => e.preventDefault());
})();

/* ===================== ניהול ===================== */
function renderManage() {
  const st = $('#mgStore');
  const msg = {
    local: ['#34c759', 'הסרטונים נשמרים במכשיר הזה לצמיתות.'],
    cloud: ['#0a84ff', 'הסרטונים נשמרים בחשבון Claude שלך ונשארים גם אחרי סגירה. עד 20MB לכל סרטון.'],
    memory: ['#ff9f0a', 'שמירה זמנית בלבד: הסרטונים יימחקו כשהדף ייסגר. כדי לשמור לתמיד, התקן את האפליקציה (ראה מדריך).'],
  }[Store.mode];
  st.innerHTML = '<span class="dot"></span><span></span>';
  $('.dot', st).style.background = msg[0]; $('span:last-child', st).textContent = msg[1];

  const box = $('#mgList'); box.innerHTML = '';
  const list = ITEMS.slice().sort((a, b) => shotTime(b) - shotTime(a));
  for (const it of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mg-item';
    const kind = { number: `מספר, ${it.digits} ספרות`, word: 'מילה מרשימה', drawing: 'ציור', card: 'קלף' }[it.content];
    const isTrick = it.trick !== false && (it.regions.length || (it.meta && it.meta !== 'none'));
    b.innerHTML = '<img alt=""><div class="txt"><b></b><span></span></div><span class="tag"></span>';
    const th = thumbFor(it); if (th) $('img', b).src = th;
    $('b', b).textContent = it.name;
    $('.txt span', b).textContent = (it.kind === 'photo' ? 'תמונה · ' : `${fmtDur(it.duration)} · `) + (isTrick ? `${kind} · ${METHODS[it.method].name}` : (it.kind === 'photo' ? 'רגילה' : 'סרטון רגיל'));
    const tag = $('.tag', b);
    tag.textContent = it.hidden ? 'מוסתר' : isTrick ? 'טריק' : 'רגיל';
    if (isTrick && !it.hidden) tag.classList.add('trick');
    b.addEventListener('click', () => { E.id = it.id; go('edit'); });
    box.appendChild(b);
  }
}
ENTER.manage = renderManage;
$('#mgHelp').onclick = () => go('help');
$('#mgHelp2').onclick = () => go('help');
$('#mgSettings').onclick = () => go('settings');
/* תוכן המדריך: גלילה לסעיף בלי לשנות את כתובת הדף */
$('#help .toc').addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a) return; e.preventDefault();
  const el = document.getElementById(a.getAttribute('href').slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#helpDone').onclick = () => { if (!S.seenHelp) { S.seenHelp = true; saveSettings(); } uiBack(); };

$('#fileIn').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  let last = null, n = 0;
  for (const f of files) {
    toast(files.length > 1 ? `טוען ${n + 1} מתוך ${files.length}…` : 'טוען…', 60000);
    let info;
    try { info = await inspect(f); } catch (err) { toast(`${f.name}: ${err.message || 'לא ניתן לפתוח'}`, 4000); continue; }
    const photo = info.kind === 'photo';
    const t = photo ? 1.5 : info.duration ? +(info.duration * .75).toFixed(2) : 3;
    const it = normalize({
      id: uid(), kind: photo ? 'photo' : 'video', name: f.name.replace(/\.[^.]+$/, ''), fileName: f.name, size: f.size, blob: f,
      w: info.w, h: info.h, duration: info.duration, thumb: info.thumb, created: Date.now(), shotAt: f.lastModified || Date.now(),
      content: 'number', method: 'grid', digits: 2, trick: !photo, meta: 'none', words: DEFAULT_WORDS.slice(), regions: [newRegion(t, photo ? { fade: 3, effect: 'develop' } : {})],
    });
    if (Store.mode === 'cloud') {
      if (!Store.assets) toast('אין הרשאה לשמור קבצים בקישור הזה. הפריט יישמר רק עד הסגירה', 4000);
      else {
        toast('שומר בחשבון…', 60000);
        try { const r = await Store.assets.upload(f); it.assetId = r.id; it.assetUrl = r.url; it.size = r.sizeBytes; }
        catch (err) { toast(err && err.code === 'too_large' ? `${f.name} גדול מ-20MB. קצר אותו או השתמש באפליקציה המותקנת` : 'השמירה נכשלה. נסה שוב', 6000); continue; }
      }
    }
    ITEMS.push(it); await persist(it); last = it; n++;
  }
  if (!last) return;
  if (n === 1) { toast(last.kind === 'photo' ? 'נוספה תמונה רגילה. אפשר להפוך אותה לטריק כאן' : 'נוסף. עכשיו סמן איפה ומתי הבחירה תופיע'); E.id = last.id; go('edit'); }
  else { toast(`נוספו ${n} פריטים לגלריה`); renderManage(); }
});

/* ===================== עורך ===================== */
const E = { id: null, item: null, src: null, sel: 0, target: 'start', raf: 0, drag: null, saveT: 0, scrubbing: false };
const SAMPLE_DRAW = { type: 'draw', strokes: [
  Array.from({ length: 33 }, (_, i) => [100 + 80 * Math.cos(i / 32 * Math.PI * 2), 100 + 80 * Math.sin(i / 32 * Math.PI * 2)]),
  [[70, 80]], [[130, 80]],
  Array.from({ length: 12 }, (_, i) => [60 + i * 7.3, 120 + 25 * Math.sin(i / 11 * Math.PI)]),
] };
function fillSelect(sel, entries, value) { sel.innerHTML = entries.map(([v, n]) => `<option value="${v}">${n}</option>`).join(''); sel.value = value; }
const curRegion = () => E.item && E.item.regions[E.sel];

function syncEditorForm() {
  const it = E.item;
  const ok = Object.entries(METHODS).filter(([, m]) => m.for.includes(it.content) && !(m.video && it.kind === 'photo'));
  if (!ok.some(([k]) => k === it.method)) it.method = ok[0][0];
  fillSelect($('#edMethod'), ok.map(([k, m]) => [k, m.name]), it.method);
  $('#edMethodHelp').textContent = METHODS[it.method].help;
  $('#edWordsWrap').hidden = it.content !== 'word';
  $('#edDigitsRow').hidden = it.content === 'drawing' || it.content === 'card';
  $('#edForce').checked = S.forceId === it.id;
  $('#edDigits').value = String(it.digits);
  $('#edDigitsHelp').textContent = it.content === 'number'
    ? `מזינים ${it.digits} ספרות. אחרי ${it.digits} נגיעות, שאר הנגיעות לא נחשבות.`
    : it.content === 'word' ? 'הספרות הן מספר המילה ברשימה. עם ספרה אחת בוחרים מבין 9 המילים הראשונות.'
    : it.content === 'card' ? 'קוד הקלף: צורה (1♠ 2♥ 3♣ 4♦) ואז ערך (1 אס … 11 נסיך, 12 מלכה, 13 מלך). למשל 27 = 7♥. בחיפוש אפשר לכתוב גם "7 לב".' : '';
  $('#edTrickWrap').hidden = it.trick === false;
  $('#edTrick').checked = it.trick !== false;
  $('#edHideLabel').textContent = it.hidden ? 'הצג בגלריה' : 'הסתר מהגלריה';
  $('#edDelete').hidden = it.id === 'demo';
  $('#edMeta').value = it.meta || 'none';
  const photo = it.kind === 'photo';
  $('#edTransport').hidden = photo;
  $('#rgTLabel').textContent = photo ? 'שניות אחרי שההזנה הושלמה' : 'שנייה בסרטון שבה זה מופיע';
  $('#rgNow').hidden = photo;
  $('#edTitle').textContent = it.name || 'עריכה';
}
function renderRegions() {
  const box = $('#edRegions'); box.innerHTML = '';
  E.item.regions.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (i === E.sel ? ' on' : '');
    b.textContent = `${i + 1} · ${(+r.t).toFixed(1)} שנ׳`;
    b.onclick = () => { E.sel = i; renderRegions(); };
    box.appendChild(b);
  });
  const r = curRegion();
  $$('[data-r]').forEach(el => {
    el.disabled = !r; if (!r) return;
    const v = getPath(r, el.dataset.r);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  const kb = $('#rgKeys'); kb.innerHTML = '';
  if (r) {
    if (!r.keys.length) kb.innerHTML = '<span class="help-inline">אין עדיין</span>';
    r.keys.forEach((k, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = `${(+k.t).toFixed(1)} ✕`;
      b.title = 'מחק נקודה'; b.onclick = () => { r.keys.splice(i, 1); renderRegions(); scheduleSave(); };
      kb.appendChild(b);
    });
  }
}
ENTER.edit = async () => {
  const src = byId(E.id); if (!src) { uiBack(); return; }
  E.item = { ...src, regions: JSON.parse(JSON.stringify(src.regions)), words: (src.words || []).slice() };
  E.sel = Math.min(E.sel, Math.max(0, E.item.regions.length - 1)); E.target = 'start';
  $('#edName').value = E.item.name;
  $('#edContent').value = E.item.content;
  $('#edWords').value = E.item.words.join('\n');
  $('#edSample').value = S.sample;
  const ts = shotTime(E.item);
  $('#edShot').value = new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  fillSelect($('#rgFont'), Object.entries(FONTS).map(([k, f]) => [k, f.name]), 'hand');
  syncEditorForm(); renderRegions();
  try { E.src = makeSource(E.item); await E.src.ready(); } catch (err) { toast(err.message); return; }
  if (curScreen() !== 'edit') { E.src.destroy(); E.src = null; return; }
  if (!E.item.duration && E.src.duration) E.item.duration = E.src.duration;
  E.item.w = E.src.w; E.item.h = E.src.h;
  $('#edScrub').max = E.src.duration || E.item.duration || 10;
  sizeEdCanvas();
  const r = curRegion(); if (r) E.src.time = Math.min(r.t + (r.fade || 0), (E.src.duration || 10) - .05);
  cancelAnimationFrame(E.raf); edLoop();
};
LEAVE.edit = async () => {
  cancelAnimationFrame(E.raf);
  if (E.src) { E.src.destroy(); E.src = null; }
  await flushEdit();
};
function commitEdit() {
  const it = E.item; if (!it) return;
  const i = ITEMS.findIndex(x => x.id === it.id);
  const keep = i >= 0 ? ITEMS[i] : {};
  const merged = { ...keep, ...it, blob: keep.blob || it.blob };
  if (i >= 0) ITEMS[i] = merged; else ITEMS.push(merged);
  return merged;
}
function scheduleSave() { clearTimeout(E.saveT); E.saveT = setTimeout(() => { const m = commitEdit(); if (m) persist(m); }, 400); }
async function flushEdit() { clearTimeout(E.saveT); const m = commitEdit(); if (m) await persist(m); }

function sizeEdCanvas() {
  if (!E.src) return;
  const c = $('#edCanvas'), maxW = Math.min($('.preview').clientWidth || 360, 680), maxH = innerHeight * .48;
  const s = Math.min(maxW / E.src.w, maxH / E.src.h), dpr = Math.min(devicePixelRatio || 1, 2);
  c.style.width = `${Math.round(E.src.w * s)}px`; c.style.height = `${Math.round(E.src.h * s)}px`;
  c.width = Math.round(E.src.w * s * dpr); c.height = Math.round(E.src.h * s * dpr);
}
function edPayload() {
  const it = E.item;
  if (it.content === 'drawing') return SAMPLE_DRAW;
  if (it.content === 'card') return { type: 'card', card: parseCard(S.sample) || { s: 1, v: 7 }, text: '' };
  return { type: 'text', text: S.sample || (it.content === 'word' ? it.words[0] : '47') || '47' };
}
function edLoop() {
  E.raf = requestAnimationFrame(edLoop);
  if (!E.src) return;
  const c = $('#edCanvas'), ctx = c.getContext('2d'), W = c.width, H = c.height, t = E.src.time;
  ctx.clearRect(0, 0, W, H);
  composeFrame(ctx, E.src, { regions: activeRegions(E.item) }, edPayload(), 0, W, H, $('#edShowAll').checked);
  if (E.item.trick !== false) E.item.regions.forEach((r, i) => {
    const R = regionRect(r, t), on = i === E.sel;
    ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = on ? 2.5 : 1.2;
    ctx.strokeStyle = on ? '#ffcc00' : 'rgba(255,255,255,.55)';
    ctx.strokeRect(R.x * W, R.y * H, R.w * W, R.h * H);
    if (on) { ctx.setLineDash([]); ctx.fillStyle = '#ffcc00'; ctx.fillRect((R.x + R.w) * W - 10, (R.y + R.h) * H - 10, 16, 16); }
    if (on && r.trackOn && r.keys.length) { // מסלול המעקב
      ctx.setLineDash([]); ctx.strokeStyle = '#5ac8fa'; ctx.fillStyle = '#5ac8fa'; ctx.lineWidth = 1.5; ctx.beginPath();
      [{ t: r.t, x: r.x, y: r.y, w: r.w, h: r.h }, ...r.keys].sort((a, b) => a.t - b.t).forEach((k, n) => {
        const kx = (k.x + k.w / 2) * W, ky = (k.y + k.h / 2) * H; if (n) ctx.lineTo(kx, ky); else ctx.moveTo(kx, ky);
      });
      ctx.stroke();
      r.keys.forEach(k => { ctx.beginPath(); ctx.arc((k.x + k.w / 2) * W, (k.y + k.h / 2) * H, Math.abs(k.t - t) < .15 ? 6 : 3.5, 0, 7); ctx.fill(); });
    }
    if (on && r.persp && r.persp.on) { // פינות הפרספקטיבה
      ctx.setLineDash([]); ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 2; ctx.beginPath();
      const pts = r.persp.q.map(([u, v]) => [(R.x + u * R.w) * W, (R.y + v * R.h) * H]);
      pts.forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#0a84ff'; pts.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); });
    }
    ctx.restore();
  });
  if (!E.scrubbing) $('#edScrub').value = t;
  $('#edTime').textContent = t.toFixed(2);
  $('#edPlay').textContent = E.src.paused ? '▶' : '❚❚';
}

$('#edit').addEventListener('input', e => {
  const el = e.target, it = E.item; if (!it) return;
  if (el.dataset.i) {
    it[el.dataset.i] = el.value;
    if (el.dataset.i === 'content' || el.dataset.i === 'method') syncEditorForm();
    if (el.dataset.i === 'name') $('#edTitle').textContent = el.value || 'עריכה';
  } else if (el.dataset.r && curRegion()) {
    const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) || 0 : el.value;
    setPath(curRegion(), el.dataset.r, v);
    if (el.dataset.r === 'trackOn' && v) toast('הזז את הסרגל לרגע אחר וגרור את המסגרת למקום החדש');
    if (el.dataset.r === 'persp.on' && v) toast('גרור את 4 הנקודות הכחולות לפינות המשטח');
    resetLight();
    if (el.dataset.r === 't') renderRegions();
  } else if (el.id === 'edWords') it.words = el.value.split('\n').map(s => s.trim()).filter(Boolean);
  else if (el.id === 'edDigits') { it.digits = parseInt(el.value, 10) || 2; syncEditorForm(); }
  else if (el.id === 'edTrick') { it.trick = el.checked; syncEditorForm(); }
  else if (el.id === 'edForce') { S.forceId = el.checked ? it.id : (S.forceId === it.id ? '' : S.forceId); saveSettings(); return; }
  else if (el.id === 'edShot') it.shotAt = new Date(el.value).getTime() || undefined;
  else if (el.id === 'edSample') { S.sample = el.value; saveSettings(); return; }
  else if (el.name === 'edTarget') { E.target = el.value; return; }
  else return;
  scheduleSave();
});
$('#edScrub').addEventListener('input', e => { E.scrubbing = true; resetLight(); if (E.src) { E.src.pause(); E.src.time = parseFloat(e.target.value); } });
$('#edScrub').addEventListener('change', () => { E.scrubbing = false; });
$('#edPlay').onclick = () => { if (!E.src) return; if (E.src.paused) { if (E.src.ended || E.src.time >= E.src.duration - .05) E.src.time = 0; E.src.play(); } else E.src.pause(); };
$('#rgAdd').onclick = () => { E.item.regions.push(newRegion(+(E.src ? E.src.time : 0).toFixed(2))); E.sel = E.item.regions.length - 1; E.target = 'start'; renderRegions(); scheduleSave(); toast('גרור על התמונה כדי לסמן את האזור החדש'); };
$('#rgDel').onclick = () => { if (!curRegion()) return; E.item.regions.splice(E.sel, 1); E.sel = Math.max(0, E.sel - 1); renderRegions(); scheduleSave(); };
$('#rgNow').onclick = () => { const r = curRegion(); if (!r || !E.src) return; r.t = +E.src.time.toFixed(2); r.keys = r.keys.filter(k => k.t > r.t); renderRegions(); scheduleSave(); };
$('#rgKeysClear').onclick = () => { const r = curRegion(); if (!r) return; r.keys = []; renderRegions(); scheduleSave(); };
$('#rgQuadReset').onclick = () => { const r = curRegion(); if (!r) return; r.persp.q = defQuad(); scheduleSave(); };
$('#edTry').onclick = async () => { await flushEdit(); openViewer(E.item.id, { from: 'edit' }); };
$('#edStage').onclick = async () => { await flushEdit(); openViewer(E.item.id, { from: 'edit', stage: true }); };
$('#edHide').onclick = () => { E.item.hidden = !E.item.hidden; syncEditorForm(); scheduleSave(); toast(E.item.hidden ? 'הסרטון הוסתר מהגלריה' : 'הסרטון מוצג בגלריה'); };
$('#edDup').onclick = async () => {
  await flushEdit();
  const src = byId(E.item.id);
  const c = { ...src, regions: JSON.parse(JSON.stringify(src.regions)), id: uid(), name: src.name + ' (עותק)', created: Date.now() };
  if (c.builtin) c.id = 'demo_' + uid();
  ITEMS.push(c); await persist(c); toast('נוצר עותק');
  E.id = c.id; go('edit', { replace: true });
};
$('#edDelete').onclick = async () => {
  const b = $('#edDelete');
  if (!b.dataset.armed) {
    b.dataset.armed = '1'; $('span', b).textContent = 'לחץ שוב כדי למחוק לצמיתות';
    setTimeout(() => { delete b.dataset.armed; $('span', b).textContent = 'מחק סרטון'; }, 3000);
    return;
  }
  delete b.dataset.armed; $('span', b).textContent = 'מחק סרטון';
  const it = byId(E.item.id); clearTimeout(E.saveT); E.item = null;
  ITEMS = ITEMS.filter(x => x !== it);
  if (it) await Store.del(it);
  toast('הסרטון נמחק'); uiBack();
};

/* גרירה על התצוגה: סימון / הזזה / שינוי גודל של אזור */
const edCanvas = $('#edCanvas');
const normPt = e => { const b = edCanvas.getBoundingClientRect(); return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) }; };
edCanvas.addEventListener('pointerdown', e => {
  const r = curRegion(); if (!r || E.item.trick === false) return;
  const t = E.src ? E.src.time : 0, p = normPt(e), b = edCanvas.getBoundingClientRect();
  // פינות פרספקטיבה
  if (r.persp && r.persp.on) {
    const R = regionRect(r, t);
    const i = r.persp.q.findIndex(([u, v]) => Math.hypot((R.x + u * R.w - p.x) * b.width, (R.y + v * R.h - p.y) * b.height) < 24);
    if (i >= 0) { E.drag = { mode: 'corner', i, R }; edCanvas.setPointerCapture(e.pointerId); return; }
  }
  // במעקב: גרירה ברגע אחר יוצרת/עורכת נקודת מעקב
  let tgt = r;
  if (r.trackOn && t > r.t + .05) {
    let k = r.keys.find(k => Math.abs(k.t - t) < .15);
    if (!k) { const cur = regionRect(r, t); k = { t: +t.toFixed(2), x: cur.x, y: cur.y, w: cur.w, h: cur.h }; r.keys.push(k); r.keys.sort((a, c) => a.t - c.t); renderRegions(); }
    tgt = k;
  }
  const nearCorner = Math.abs(p.x - (tgt.x + tgt.w)) * b.width < 24 && Math.abs(p.y - (tgt.y + tgt.h)) * b.height < 24;
  const inside = p.x > tgt.x && p.x < tgt.x + tgt.w && p.y > tgt.y && p.y < tgt.y + tgt.h;
  E.drag = { tgt, mode: nearCorner ? 'size' : inside ? 'move' : 'new', sx: p.x, sy: p.y, o: { ...tgt } };
  if (E.drag.mode === 'new') Object.assign(tgt, { x: p.x, y: p.y, w: .001, h: .001 });
  edCanvas.setPointerCapture(e.pointerId);
});
edCanvas.addEventListener('pointermove', e => {
  const d = E.drag; if (!d) return; const p = normPt(e);
  if (d.mode === 'corner') { const R = d.R; curRegion().persp.q[d.i] = [(p.x - R.x) / R.w, (p.y - R.y) / R.h]; return; }
  const t = d.tgt;
  if (d.mode === 'move') { t.x = clamp(d.o.x + p.x - d.sx, 0, 1 - t.w); t.y = clamp(d.o.y + p.y - d.sy, 0, 1 - t.h); }
  else if (d.mode === 'size') { t.w = clamp(d.o.w + p.x - d.sx, .02, 1 - t.x); t.h = clamp(d.o.h + p.y - d.sy, .02, 1 - t.y); }
  else { t.x = Math.min(p.x, d.sx); t.y = Math.min(p.y, d.sy); t.w = Math.max(.02, Math.abs(p.x - d.sx)); t.h = Math.max(.02, Math.abs(p.y - d.sy)); }
});
const endDrag = () => { if (E.drag) { E.drag = null; scheduleSave(); } };
edCanvas.addEventListener('pointerup', endDrag); edCanvas.addEventListener('pointercancel', endDrag);

/* ===================== הגדרות ===================== */
const fillS = root => $$('[data-s]', root).forEach(el => { if (el.type === 'checkbox') el.checked = !!S[el.dataset.s]; else el.value = S[el.dataset.s] ?? ''; });
ENTER.settings = () => { $('#stPeek').textContent = PEEK.text || '—'; fillS($('#settings')); };
const onSetting = e => {
  const el = e.target; if (!el.dataset.s) return;
  S[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.s === 'phTheme') applyTheme();
  saveSettings();
};
$('#settings').addEventListener('input', onSetting);
$('#hub').addEventListener('input', onSetting);

/* ===================== צפייה / הופעה ===================== */
class SecretInput {
  constructor(item) { this.item = item; this.buf = ''; this.strokes = []; }
  get cap() { return this.item.content === 'drawing' ? Infinity : this.item.content === 'card' ? 3 : (this.item.digits || 2); }
  digit(d) { if (this.buf.length >= this.cap) return false; this.buf += d; this.at = performance.now(); return true; } // שאר הנגיעות לא נחשבות
  typeKey(k) {
    const it = this.item;
    if (it.content === 'number' && (!/\d/.test(k) || this.buf.length >= this.cap)) return false;
    if (it.content === 'card') { this.buf += k; return true; }
    if (it.content === 'word' && /\d/.test(k) && /^\d*$/.test(this.buf) && this.buf.length >= this.cap) return false;
    this.buf += k; return true;
  }
  undo() { if (this.item.content === 'drawing') this.strokes.pop(); else this.buf = this.buf.slice(0, -1); }
  complete(it) { if (it.content === 'drawing') return false;
    if (it.content === 'card' && /^\d+$/.test(this.buf) && it.method !== 'peek' && it.method !== 'pre') return this.buf.length >= 3 || (this.buf.length === 2 && (this.buf[1] !== '1' || performance.now() - (this.at || 0) > 1300)); if (it.method === 'pre' || it.method === 'peek') return !!this.buf.trim(); return /^\d+$/.test(this.buf) && this.buf.length >= this.cap; }
  get count() { return this.item.content === 'drawing' ? this.strokes.length : this.buf.length; }
  payload() {
    const it = this.item;
    if (it.content === 'drawing') return this.strokes.length ? { type: 'draw', strokes: this.strokes.map(s => s.slice()) } : null;
    const b = this.buf.trim(); if (!b) return null;
    if (it.content === 'card') { const c = parseCard(b); return c ? { type: 'card', card: c, text: cardText(c) } : null; }
    if (it.content === 'word' && /^\d+$/.test(b)) { const w = (it.words || [])[parseInt(b, 10) - 1]; return w ? { type: 'text', text: w } : null; }
    return { type: 'text', text: b };
  }
}

const P = { active: false, req: null, item: null, src: null, input: null, started: false, frozen: null, frozenAt: 0, regions: [],
  raf: 0, stage: false, vr: null, dpr: 1, menu: false, rec: null, rc: null, rctx: null, clip: null, endAt: 0, wake: null, minT: Infinity,
  chrome: true, lastPlaying: false, phIcon: null };
const stageCv = $('#stage'), sctx = stageCv.getContext('2d'), pBack = $('#pBack'), phHead = $('#phHead');
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.6v14.8c0 .8.9 1.3 1.6.9l12-7.4c.6-.4.6-1.4 0-1.8l-12-7.4C7.9 3.3 7 3.8 7 4.6z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>';
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 010 6M18 6.5a8 8 0 010 11"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const photosMode = () => !P.stage;

/* פתיחת סרטון מהגלריה או מהעורך */
function openViewer(id, opts = {}) {
  const item = byId(id); if (!item) return;
  P.req = { id, stage: !!opts.stage, from: opts.from || 'photos', preText: '' };
  if (P.req.from === 'photos') LASTVIEW = id;
  if (item.trick !== false && item.method === 'pre' && item.content !== 'drawing') go('pre');
  else go('perform');
}
ENTER.pre = () => {
  const item = byId(P.req.id);
  $('#preIn').value = ''; $('#preIn').inputMode = item && item.content === 'number' ? 'numeric' : 'text';
  setTimeout(() => $('#preIn').focus(), 60);
};
$('#preForm').addEventListener('submit', e => {
  e.preventDefault(); P.req.preText = $('#preIn').value; $('#preIn').blur();
  go('perform', { replace: true });
});

ENTER.perform = async () => {
  const req = P.req, item = byId(req.id); if (!item) { uiBack(); return; }
  const de = document.documentElement;
  if (req.stage) { try { const r = (de.requestFullscreen || de.webkitRequestFullscreen || (() => {})).call(de); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
  Object.assign(P, { active: true, item, stage: req.stage, started: false, frozen: null, frozenAt: 0, menu: false, clip: null, endAt: 0,
    lastPlaying: false, phIcon: null, regions: activeRegions(item), isPhoto: item.kind === 'photo', forceFreeze: false, lastStrokeAt: 0,
    meta: item.trick === false ? 'none' : (item.meta || 'none') });
  P.hasTrick = item.trick !== false && (P.regions.length > 0 || P.meta !== 'none');
  P.drawRegions = P.regions;
  P.input = new SecretInput(item); P.input.buf = item.method === 'peek' ? PEEK.text : (req.preText || '');
  P.minT = P.regions.length ? Math.min(...P.regions.map(r => r.t)) : Infinity;
  $('#pmenu').hidden = true; closePops();
  initPhotosUI();
  try { P.src = makeSource(item); await P.src.ready(); } catch (err) { toast(err.message); uiBack(); return; }
  if (!P.active) { P.src.destroy(); P.src = null; return; }
  P.src.time = 0;
  if (req.stage && screen.orientation && screen.orientation.lock) screen.orientation.lock(P.src.w >= P.src.h ? 'landscape' : 'portrait').catch(() => {});
  try { P.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* ignore */ }
  for (const r of P.regions) { try { await document.fonts.load(`700 40px ${(FONTS[r.font] || FONTS.clean).css}`); } catch (e) { /* ignore */ } }
  sizeStage(); if (!P.isPhoto) buildStrip();
  cancelAnimationFrame(P.raf); perfLoop();
};
LEAVE.perform = () => {
  P.active = false; cancelAnimationFrame(P.raf); P.stripRun = (P.stripRun || 0) + 1;
  if (P.stripCleanup) { P.stripCleanup(); P.stripCleanup = null; }
  discardRec();
  if (P.src) { P.src.destroy(); P.src = null; }
  try { P.wake && P.wake.release(); } catch (e) { /* ignore */ }
  try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) { /* ignore */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#perform').classList.remove('ph-chrome');
};
function sizeStage() {
  P.dpr = Math.min(devicePixelRatio || 1, 2);
  stageCv.width = Math.round(innerWidth * P.dpr); stageCv.height = Math.round(innerHeight * P.dpr);
  if (P.src) P.vr = fitRect(P.src.w, P.src.h, stageCv.width, stageCv.height);
}
addEventListener('resize', () => { if (curScreen() === 'edit') sizeEdCanvas(); if (P.active) { sizeStage(); if (!P.isPhoto) buildStrip(); } });

function begin() {
  resetLight();
  P.started = true; P.frozen = null; P.frozenAt = 0; P.endAt = 0; P.clip = null; P.drawRegions = P.regions; updateHeader();
  P.src.time = 0;
  setupRecorder();
  const pr = P.src.play(); if (pr && pr.catch) pr.catch(() => toast('הקש שוב כדי לנגן'));
}
function resume() { P.endAt = 0; const pr = P.src.play(); if (pr && pr.catch) pr.catch(() => {}); }

function perfLoop() {
  P.raf = requestAnimationFrame(perfLoop);
  const src = P.src;
  const playing = !P.isPhoto && !!(src && P.started && !src.ended && !src.paused);
  const showBack = P.stage && !playing;
  if (pBack.hidden === showBack) pBack.hidden = !showBack;
  if (photosMode() && src) {
    // כמו בגלריה: הכפתורים נעלמים כשמנגנים וחוזרים כשהסרטון נגמר
    if (playing && !P.lastPlaying) { setChrome(false); closePops(); }
    if (!playing && P.lastPlaying && !P.menu && src.ended) setChrome(true);
    const dur = src.duration || P.item.duration || 1;
    phHead.style.left = (clamp(src.time / dur) * 100) + '%';
    if (P.phIcon !== playing) { P.phIcon = playing; $('#phPlay').innerHTML = playing ? ICON_PAUSE : ICON_PLAY; }
  }
  P.lastPlaying = playing;
  if (!src || !P.vr) return;
  const t = src.time;
  // הקלט ננעל ברגע שהחשיפה מתחילה (לא באמצע קו בציור)
  if (P.started && !P.frozen && !T.drawing && P.hasTrick) {
    let due;
    if (P.isPhoto) due = P.forceFreeze || P.input.complete(P.item) || (P.item.content === 'drawing' && P.input.strokes.length && performance.now() - P.lastStrokeAt > 2500);
    else due = t >= P.minT || src.ended || (P.forceFreeze && P.minT === Infinity);
    if (due) { const pl = P.input.payload(); if (pl) { P.frozen = pl; P.frozenAt = t; onFrozen(); } }
  }
  sctx.clearRect(0, 0, stageCv.width, stageCv.height);
  sctx.save(); sctx.translate(P.vr.x, P.vr.y);
  composeFrame(sctx, src, { regions: P.drawRegions }, P.frozen, P.frozenAt, P.vr.w, P.vr.h, false);
  sctx.restore();
  if (S.indicator && !P.stage && P.hasTrick) {
    const n = P.input.count, d = 2.2 * P.dpr;
    sctx.fillStyle = P.frozen ? 'rgba(120,200,120,.4)' : 'rgba(127,127,127,.35)';
    for (let i = 0; i < n; i++) sctx.fillRect(stageCv.width - (i + 1) * d * 3, stageCv.height * .5, d, d);
  }
  if (P.rec && P.rec.state === 'recording') {
    const rc = P.rc, rx = P.rctx;
    if (src.ended || (src.duration && t >= src.duration - .02 && src.paused)) {
      if (!P.endAt) P.endAt = performance.now();
      drawEndCard(rx, rc.width, rc.height, (performance.now() - P.endAt) / 1000);
      if (performance.now() - P.endAt > 3200) P.rec.stop();
    } else composeFrame(rx, src, { regions: P.drawRegions }, P.frozen, P.frozenAt, rc.width, rc.height, false);
  }
}
function drawEndCard(ctx, W, H, t) {
  ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = clamp(t / .6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const u = Math.min(W, H) / 12, name = S.contactName || '', link = S.contactLink || '';
  ctx.direction = isRTL(name) ? 'rtl' : 'ltr'; ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${u * 1.3}px "Secular One", sans-serif`; ctx.fillText(name, W / 2, H / 2 - u * .6);
  ctx.direction = isRTL(link) ? 'rtl' : 'ltr'; ctx.fillStyle = '#c7c7cc';
  ctx.font = `400 ${u * .7}px "Rubik", sans-serif`; ctx.fillText(link, W / 2, H / 2 + u * .8);
  ctx.globalAlpha = 1;
}

/* ---------- ממשק הגלריה בזמן צפייה ---------- */
function phDate(ts) {
  const d = new Date(ts), now = new Date();
  const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(now) - day0(d)) / 864e5);
  const day = diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : diff > 1 && diff < 7
    ? d.toLocaleDateString('he-IL', { weekday: 'long' })
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return [day, d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })];
}
/* ---------- חשיפה בפרטי הסרטון ---------- */
function shownDate() {
  const d = new Date(shotTime(P.item)), pl = P.frozen;
  if (!pl || pl.type !== 'text' || !/^\d+$/.test(pl.text)) return d;
  const s = pl.text, n = parseInt(s, 10);
  if (P.meta === 'time') {
    if (s.length <= 2) { if (n < 60) d.setMinutes(n); }
    else { const hh = parseInt(s.slice(0, -2), 10), mm = parseInt(s.slice(-2), 10); if (hh < 24 && mm < 60) d.setHours(hh, mm); }
  } else if (P.meta === 'date') {
    if (s.length <= 2) { if (n >= 1 && n <= 31) d.setDate(n); }
    else { const dd = parseInt(s.slice(0, -2), 10), mm = parseInt(s.slice(-2), 10); if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) d.setMonth(mm - 1, dd); }
  }
  return d;
}
function updateHeader() {
  const d = shownDate(), [day, time] = phDate(d.getTime()), pl = P.frozen;
  if (P.meta === 'place' && pl && pl.type === 'text') { $('#phDay').textContent = pl.text; $('#phTime').textContent = `${day} · ${time}`; }
  else { $('#phDay').textContent = day; $('#phTime').textContent = time; }
}
function onFrozen() {
  if (P.frozen.text) LAST.text = P.frozen.text;
  updateHeader();
  if (P.meta === 'caption' && P.frozen.type === 'text') $('.ph-caption').value = P.frozen.text;
  if (P.isPhoto && P.regions.length) {
    const t0 = P.frozenAt;
    P.drawRegions = P.regions.map(r => ({ ...r, t: t0 + r.t, keys: (r.keys || []).map(k => ({ ...k, t: t0 + k.t })) }));
  }
}
function setChrome(v) {
  P.chrome = v;
  $('#ph').classList.toggle('off', !v);
  $('#perform').classList.toggle('ph-chrome', v && photosMode());
}
function closePops() { $('#phMenu').hidden = true; $('#phSheet').hidden = true; $('#phAction').hidden = true; }
const anyPop = () => !$('#phMenu').hidden || !$('#phSheet').hidden || !$('#phAction').hidden;
function fakeName(it) {
  const m = (it.fileName || '').match(/^(IMG_\d+)/i); if (m) return m[1].toUpperCase();
  let h = 0; for (const ch of it.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'IMG_' + String(1000 + h % 8999);
}
function initPhotosUI() {
  const on = photosMode(), it = P.item;
  $('#ph').hidden = !on;
  $('#phHeart').classList.toggle('on', !!it.fav);
  $('#phMute').innerHTML = ICON_SOUND; $('#phPlay').innerHTML = ICON_PLAY;
  updateHeader(); $('.ph-caption').value = '';
  $('#ph').classList.toggle('is-photo', !!P.isPhoto);
  phHead.style.left = '0%';
  const sc = $('#phStrip'); sc.getContext('2d').clearRect(0, 0, sc.width, sc.height);
  setChrome(on);
}
function fillInfo() {
  const it = P.item, d = shownDate();
  const wd = d.toLocaleDateString('he-IL', { weekday: 'long' });
  const date = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#phiDate').textContent = `${wd} • ${date} • ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  $('#phiName').textContent = fakeName(it);
  const w = (P.src && P.src.w) || it.w || 1080, h = (P.src && P.src.h) || it.h || 1920, short = Math.min(w, h);
  const res = short >= 2000 ? '4K' : short >= 1000 ? '1080p' : short >= 700 ? '720p' : `${short}p`;
  const mb = it.size ? (it.size / 1048576).toFixed(1) : ((it.duration || 20) * 1.1).toFixed(1);
  $('#phiSpec').textContent = `${res} • ${w} × ${h} • ${mb} MB` + (it.kind === 'photo' ? '' : ` • ${fmtDur(it.duration)}`);
  const place = $('#phiPlace'), pl = P.frozen;
  place.hidden = !(P.meta === 'place' && pl && pl.type === 'text');
  if (!place.hidden) place.textContent = '📍 ' + pl.text;
  $('#phiDevice').textContent = it.kind === 'photo' ? 'מצלמה ראשית' : 'מצלמה ראשית · וידאו';
}
/* רצועת פריימים */
async function buildStrip() {
  if (!photosMode()) return;
  const item = P.item, cv = $('#phStrip'), dpr = P.dpr || 1;
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  if (!cv.width || !cv.height) return;
  const ctx = cv.getContext('2d'), aspect = (P.src.w || 9) / (P.src.h || 16);
  const tw = Math.max(cv.height * aspect, 8 * dpr), n = Math.ceil(cv.width / tw);
  const dur = P.src.duration || item.duration || 1, myRun = P.stripRun = (P.stripRun || 0) + 1;
  let draw;
  if (item.builtin === 'demo') { const d = new DemoSource(); draw = async (t, x) => { d.time = t; ctx.save(); ctx.translate(x, 0); d.draw(ctx, tw, cv.height); ctx.restore(); }; }
  else {
    const src = mediaSrc(item); if (!src) return;
    const v = document.createElement('video'), owned = src instanceof Blob, u = owned ? URL.createObjectURL(src) : src;
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = u;
    $('#vhost').appendChild(v);
    P.stripCleanup = () => { v.remove(); if (owned) URL.revokeObjectURL(u); };
    try {
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 4000); });
      try { await v.play(); v.pause(); } catch (e) { /* ignore */ }
    } catch (e) { if (P.stripCleanup) { P.stripCleanup(); P.stripCleanup = null; } return; }
    draw = (t, x) => new Promise(res => {
      v.onseeked = () => { try { ctx.drawImage(v, x, 0, tw, cv.height); } catch (e) { /* ignore */ } res(); };
      v.currentTime = Math.min(t, Math.max(0, dur - .05)); setTimeout(res, 1500);
    });
  }
  for (let i = 0; i < n; i++) {
    if (P.stripRun !== myRun || !P.active) break;
    await draw((i + .5) / n * dur, i * tw);
  }
  if (P.stripRun === myRun && P.stripCleanup) { P.stripCleanup(); P.stripCleanup = null; }
}
(() => {
  const box = $('#phStripBox'); let drag = false;
  const seek = e => {
    if (!P.src) return; const b = box.getBoundingClientRect();
    P.src.time = clamp((e.clientX - b.left) / b.width) * (P.src.duration || P.item.duration || 1);
  };
  box.addEventListener('pointerdown', e => { drag = true; box.setPointerCapture(e.pointerId); if (P.src && !P.src.paused) P.src.pause(); seek(e); });
  box.addEventListener('pointermove', e => { if (drag) seek(e); });
  box.addEventListener('pointerup', e => {
    if (!drag) return; drag = false;
    // שיטת "גרירה ברצועה": המקום שבו עוזבים = ספרה 0–9
    if (P.item && P.item.method === 'scrub' && P.hasTrick && !P.frozen) {
      const b = box.getBoundingClientRect();
      if (P.input.digit(String(clamp(Math.floor((e.clientX - b.left) / b.width * 10), 0, 9)))) buzz();
    }
  });
  box.addEventListener('pointercancel', () => { drag = false; });
})();
$('#phPlay').onclick = () => {
  if (!P.src) return; closePops();
  if (!P.started) begin();
  else if (P.src.paused || P.src.ended) resume();
  else P.src.pause();
};
$('#phBack').onclick = () => uiBack();
$('#pBack').onclick = () => uiBack();
$('#phMore').onclick = () => { const m = $('#phMenu'); const open = m.hidden; closePops(); m.hidden = !open; };
$('#phMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-pm]'); if (!b) return;
  $('#phMenu').hidden = true;
  const a = b.dataset.pm;
  if (a === 'hide') hideCurrent();
  else if (a === 'memories') go('memories');
  else if (a === 'replay') restartPerformance();
});
$('#phInfo').onclick = () => { const s = $('#phSheet'); const open = s.hidden; closePops(); if (open) { fillInfo(); s.hidden = false; } };
$('#phEdit').onclick = () => {};
$('#phHeart').onclick = () => {
  const it = byId(P.item.id); if (!it) return;
  it.fav = !it.fav; P.item.fav = it.fav; $('#phHeart').classList.toggle('on', it.fav); persist(it);
};
$('#phMute').onclick = () => {
  const el = P.src && P.src.el; if (!el) return;
  el.muted = !el.muted; $('#phMute').innerHTML = el.muted ? ICON_MUTE : ICON_SOUND;
};
$('#phShare').onclick = async () => {
  closePops();
  if (S.record && P.clip) { shareClip(); return; }
  const it = P.item; let blob = it.blob;
  try {
    if (!blob && it.assetUrl) blob = await (await fetch(it.assetUrl)).blob();
    if (!blob) return;
    const file = new File([blob], (fakeName(it) + '.' + ((blob.type || '').includes('mp4') ? 'MP4' : 'MOV')), { type: blob.type || 'video/quicktime' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
  } catch (e) { /* בוטל */ }
};
$('#phTrash').onclick = () => { closePops(); $('#phAction').hidden = false; };
$('#phDelCancel').onclick = () => { $('#phAction').hidden = true; };
$('#phAction').addEventListener('click', e => { if (e.target.id === 'phAction') $('#phAction').hidden = true; });
$('#phDelOk').onclick = () => { $('#phAction').hidden = true; hideCurrent(); };
$('#phSheet').addEventListener('click', e => { if (e.target.classList.contains('grab')) $('#phSheet').hidden = true; });
/* החלקה בין פריטים כמו בגלריה (בעברית: ימינה = הפריט הבא) */
async function swipeItem(dir) {
  const list = ITEMS.filter(x => !x.hidden).sort((a, b) => shotTime(a) - shotTime(b));
  const i = list.findIndex(x => x.id === P.item.id), next = list[i + dir];
  if (!next) return;
  LEAVE.perform();
  P.req = { ...P.req, id: next.id, preText: '', stage: false };
  if (P.req.from === 'photos') LASTVIEW = next.id;
  $('#perform').classList.remove('swap'); void $('#perform').offsetWidth; $('#perform').classList.add('swap');
  await ENTER.perform();
}
function hideCurrent() { // "מחיקה" בגלריה = הסתרה (אפשר להחזיר בניהול)
  const it = byId(P.item.id); if (it) { it.hidden = true; persist(it); }
  uiBack();
}
function restartPerformance() {
  resetLight();
  P.input = new SecretInput(P.item); P.started = false; P.frozen = null; P.forceFreeze = false; P.drawRegions = P.regions;
  P.src.pause(); P.src.time = 0; discardRec(); setChrome(photosMode()); updateHeader(); $('.ph-caption').value = '';
}

/* ---------- הקלטה לשיתוף ---------- */
function pickMime() {
  if (!window.MediaRecorder) return null;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || '';
}
function discardRec() {
  if (P.rec && P.rec.state !== 'inactive') { P.rec.ondataavailable = null; P.rec.onstop = null; try { P.rec.stop(); } catch (e) { /* ignore */ } }
  P.rec = null; P.clip = null;
}
function setupRecorder() {
  discardRec();
  const mime = pickMime(); if (!S.record || mime === null) return;
  try {
    const src = P.src, sc = Math.min(1, 1280 / Math.max(src.w, src.h));
    const rc = P.rc = document.createElement('canvas');
    rc.width = Math.round(src.w * sc / 2) * 2; rc.height = Math.round(src.h * sc / 2) * 2;
    P.rctx = rc.getContext('2d');
    composeFrame(P.rctx, src, { regions: P.regions }, null, 0, rc.width, rc.height, false);
    const stream = rc.captureStream(30);
    if (src.el) {
      try {
        if (!src.ac) {
          src.ac = new (window.AudioContext || window.webkitAudioContext)();
          const node = src.ac.createMediaElementSource(src.el);
          src.dest = src.ac.createMediaStreamDestination();
          node.connect(src.dest); node.connect(src.ac.destination);
        }
        src.ac.resume();
        src.dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
      } catch (e) { /* בלי שמע */ }
    }
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5e6 } : undefined), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { P.clip = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }); };
    rec.start(500); P.rec = rec;
  } catch (e) { P.rec = null; }
}
async function shareClip() {
  if (!P.clip) { toast(P.rec && P.rec.state === 'recording' ? 'ההקלטה עדיין נשמרת…' : 'אין הקלטה. אפשר להפעיל אותה בהגדרות'); return; }
  const ext = P.clip.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([P.clip], `video-${Date.now()}.${ext}`, { type: P.clip.type });
  const text = [S.contactName, S.contactLink].filter(Boolean).join(' · ');
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  toast('השיתוף לא זמין כאן. באפליקציה המותקנת זה עובד');
}

/* ---------- תפריט סודי (לחיצה ארוכה) ---------- */
function openMenu() {
  if (!P.active || P.menu) return;
  P.menu = true; P.wasPlaying = P.src && !P.src.paused; if (P.wasPlaying) P.src.pause();
  $('[data-m=share]', $('#pmenu')).hidden = !S.record;
  $('#pmenu').hidden = false;
}
$('#pmenu').addEventListener('click', e => {
  const m = e.target.dataset.m; if (!m) return;
  if (m === 'share') { shareClip(); return; }
  $('#pmenu').hidden = true; P.menu = false;
  if (m === 'resume') { if (P.wasPlaying) resume(); }
  else if (m === 'restart') restartPerformance();
  else if (m === 'exit') uiBack();
});

/* ---------- מגע על הסרטון ---------- */
const touch = $('#touch');
const T = { pts: new Map(), max: 0, moved: false, t0: 0, sx: 0, sy: 0, ex: 0, ey: 0, lp: 0, lpFired: false, stroke: null, pushed: false, drawing: false };
const toVideo = e => {
  const vr = P.vr, x = (e.clientX * P.dpr - vr.x) / vr.w, y = (e.clientY * P.dpr - vr.y) / vr.h;
  return [x * P.src.w, y * P.src.h];
};
const isPlaying = () => !P.isPhoto && !!(P.src && P.started && !P.src.ended && !P.src.paused);
/* שלב ההזנה: בסרטון – בזמן ניגון; בתמונה – אחרי שהסתירו את הכפתורים ועד שהחשיפה ננעלה */
const inputPhase = () => P.isPhoto ? (P.hasTrick && P.started && !P.chrome && !P.frozen) : isPlaying();
const drawMode = () => P.item && P.item.content === 'drawing' && P.regions.length;

touch.addEventListener('pointerdown', e => {
  e.preventDefault(); if (P.menu || !P.src) return;
  if (anyPop()) { closePops(); T.swallow = true; return; }
  T.swallow = false;
  try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  T.pts.set(e.pointerId, true);
  if (T.pts.size === 1) {
    Object.assign(T, { max: 1, moved: false, t0: performance.now(), sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY, lpFired: false, pushed: false, drawing: false });
    T.stroke = drawMode() && inputPhase() && !P.frozen ? [toVideo(e)] : null;
    clearTimeout(T.lp);
    T.lp = setTimeout(() => { if (!T.moved && T.pts.size === 1) { T.lpFired = true; openMenu(); } }, 800);
  } else {
    T.max = Math.max(T.max, T.pts.size); clearTimeout(T.lp);
    if (T.pushed) P.input.strokes.pop();
    T.stroke = null; T.pushed = false; T.drawing = false;
  }
});
touch.addEventListener('pointermove', e => {
  if (!T.pts.has(e.pointerId) || T.pts.size !== 1) return;
  T.ex = e.clientX; T.ey = e.clientY;
  if (!T.moved && Math.hypot(e.clientX - T.sx, e.clientY - T.sy) > 10) { T.moved = true; clearTimeout(T.lp); }
  if (T.stroke && T.moved) {
    if (!T.pushed) { P.input.strokes.push(T.stroke); T.pushed = true; T.drawing = true; }
    T.stroke.push(toVideo(e));
  }
});
function pointerEnd(e) {
  if (!T.pts.has(e.pointerId)) return;
  T.pts.delete(e.pointerId);
  if (T.pts.size) return;
  clearTimeout(T.lp); T.drawing = false;
  const dur = performance.now() - T.t0, stroke = T.stroke; T.stroke = null;
  if (T.swallow || T.lpFired || P.menu || e.type === 'pointercancel') return;
  if (T.max >= 2) { if (P.started && !P.frozen && P.hasTrick) { P.input.undo(); buzz(); } return; }
  if (T.moved) {
    // החלקה למטה סוגרת את הסרטון, כמו בגלריה (רק כשהוא לא מתנגן)
    const dx = T.ex - T.sx, dy = T.ey - T.sy;
    if (!inputPhase() && !T.pushed && dy > 110 && Math.abs(dx) < 90) { uiBack(); return; }
    if (!inputPhase() && !T.pushed && photosMode() && Math.abs(dx) > 70 && Math.abs(dy) < 70) { swipeItem(dx > 0 ? 1 : -1); return; }
    if (T.pushed) { buzz(); P.lastStrokeAt = performance.now(); }
    return;
  }
  if (dur < 500) secretTap(e, stroke);
}
touch.addEventListener('pointerup', pointerEnd);
touch.addEventListener('pointercancel', pointerEnd);
touch.addEventListener('contextmenu', e => e.preventDefault());

function secretTap(e, stroke) {
  if (P.isPhoto) {
    if (!P.hasTrick || P.frozen) { setChrome(!P.chrome); return; }
    if (!P.started) { P.started = true; P.src.play(); setChrome(false); return; } // נגיעה ראשונה מסתירה כפתורים ומתחילה
    if (P.chrome) { setChrome(false); return; }
    const it = P.item;
    if (it.content === 'drawing') { if (stroke) { P.input.strokes.push(stroke); P.lastStrokeAt = performance.now(); buzz(); } return; }
    if (it.method !== 'grid') return;
    const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 3), 0, 2);
    if (P.input.digit(String(row * 3 + col + 1))) buzz();
    return;
  }
  if (!isPlaying()) {
    // לפני ניגון / בסוף: נגיעה מסתירה ומציגה את הכפתורים כמו בגלריה. במצב במה נגיעה מתחילה.
    if (photosMode()) setChrome(!P.chrome);
    else if (!P.started) begin();
    return;
  }
  if (P.frozen || !P.hasTrick) return;
  const it = P.item;
  if (it.content === 'drawing') { if (stroke) { P.input.strokes.push(stroke); buzz(); } return; }
  if (it.method !== 'grid') return;
  const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 3), 0, 2);
  if (P.input.digit(String(row * 3 + col + 1))) buzz();
}

document.addEventListener('keydown', e => {
  if (!P.active) { if (e.key === 'Escape' && NAV.stack.length > 1 && curScreen() !== 'photos') uiBack(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (P.menu) $('[data-m=resume]').click(); else openMenu(); return; }
  if (P.menu) return;
  if (!P.started) { if ([' ', 'Enter', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'PageDown', 'PageUp'].includes(e.key)) { e.preventDefault(); if (P.isPhoto) { P.started = true; P.src.play(); setChrome(false); } else begin(); } return; }
  if (P.frozen || drawMode() || !P.hasTrick) return;
  if (e.key === 'Enter') { P.forceFreeze = true; e.preventDefault(); return; }
  if (e.key === 'Backspace') P.input.undo();
  else if (e.key.length === 1 && e.key !== ' ') { if (!P.input.typeKey(e.key)) return; }
  else if (e.key === ' ' && P.item.content === 'word' && P.input.buf) P.input.buf += ' ';
  else return;
  e.preventDefault(); buzz();
});
document.addEventListener('visibilitychange', async () => {
  if (P.active && document.visibilityState === 'visible') { try { P.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* ignore */ } }
});


/* ===================== מרכז הקסמים ===================== */
function longPress(el, ms, fn) {
  let t = 0;
  el.addEventListener('pointerdown', () => { clearTimeout(t); t = setTimeout(() => { buzz(); fn(); }, ms); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
async function goHome() {
  const cur = curScreen(); if (cur === 'hub') return;
  if (LEAVE[cur]) await LEAVE[cur]();
  NAV.stack = ['hub']; try { history.pushState({ g: 1 }, ''); } catch (e) { /* ignore */ }
  paint('hub'); ENTER.hub();
}
ENTER.hub = () => { $('#hubPeek').textContent = LAST.text || '—'; fillS($('#hub')); };
$('#hub').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) go(b.dataset.open); });
$('#mgHub').onclick = () => goHome();
$$('.exit-band').forEach(el => longPress(el, 900, goHome));
const setChoice = t => { PEEK.text = t; PEEK.at = Date.now(); LAST.text = t; };

/* ---------- מחשבון עם הכרחה ---------- */
const C = { acc: null, op: null, cur: '0', fresh: true, armed: false, force: null, fi: 0 };
function calcTarget() {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  if (S.calcMode === 'time') return +(p2(d.getHours()) + p2(d.getMinutes()));
  if (S.calcMode === 'date') return +(p2(d.getDate()) + p2(d.getMonth() + 1) + d.getFullYear());
  if (S.calcMode === 'last') { const n = parseInt(String(LAST.text || '').replace(/\D/g, ''), 10); if (n) return n; }
  return parseFloat(S.calcNumber) || 1089;
}
const calcFmt = v => {
  if (!isFinite(v)) return 'שגיאה';
  if (Math.abs(v) >= 1e12) return v.toExponential(5);
  const [i, f] = String(+v.toPrecision(10)).split('.');
  return Number(i).toLocaleString('en-US') + (f ? '.' + f : '');
};
const curFmt = () => {
  const neg = C.cur.startsWith('-'), [i, f] = C.cur.replace('-', '').split('.');
  return (neg ? '-' : '') + Number(i || '0').toLocaleString('en-US') + (C.cur.includes('.') ? '.' + (f || '') : '');
};
function calcShow(txt) {
  const el = $('#cDisp'); el.textContent = txt;
  const n = txt.replace(/[^\d]/g, '').length; el.style.fontSize = n > 9 ? '52px' : n > 7 ? '66px' : '86px';
}
const calcApply = (a, op, b) => op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b;
function calcKey(k) {
  $$('.ck.op').forEach(b => b.classList.remove('on'));
  if (/^[\d.]$/.test(k)) {
    if (C.armed && C.op === '+') { // הכרחה: כל מקש מקליד את הספרה הבאה של המספר הדרוש
      if (C.force === null) { C.force = String(Math.round((calcTarget() - C.acc) * 1e6) / 1e6); C.fi = 0; C.cur = ''; }
      if (C.fi >= C.force.length) return;
      C.cur += C.force[C.fi++]; if (C.cur === '-') C.cur += C.force[C.fi++] || '';
      C.fresh = false; calcShow(curFmt()); return;
    }
    if (C.fresh) { C.cur = k === '.' ? '0.' : k; C.fresh = false; }
    else { if (k === '.' && C.cur.includes('.')) return; if (C.cur.replace(/[-.]/g, '').length >= 9) return; C.cur = C.cur === '0' && k !== '.' ? k : C.cur + k; }
    calcShow(curFmt()); return;
  }
  if (k === 'ac') { Object.assign(C, { acc: null, op: null, cur: '0', fresh: true, armed: false, force: null }); calcShow('0'); return; }
  if (k === 'neg') { C.cur = C.cur.startsWith('-') ? C.cur.slice(1) : (C.cur === '0' ? '0' : '-' + C.cur); calcShow(curFmt()); return; }
  if (k === 'pct') { C.cur = String(parseFloat(C.cur) / 100); calcShow(calcFmt(+C.cur)); return; }
  if (k === '=') {
    if (C.op) { C.acc = calcApply(C.acc, C.op, parseFloat(C.cur)); C.op = null; }
    else C.acc = parseFloat(C.cur);
    C.cur = String(C.acc); C.fresh = true; if (C.force !== null) { C.armed = false; C.force = null; }
    calcShow(calcFmt(C.acc)); return;
  }
  // + − × ÷
  if (C.op && !C.fresh) C.acc = calcApply(C.acc, C.op, parseFloat(C.cur));
  else if (!C.op) C.acc = parseFloat(C.cur);
  C.op = k; C.fresh = true; if (C.force !== null) { C.force = null; }
  $(`.ck.op[data-k="${k}"]`).classList.add('on');
  calcShow(calcFmt(C.acc));
}
$('#calc .c-keys').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) calcKey(b.dataset.k); });
longPress($('#cDisp'), 800, () => { C.armed = true; const d = $('#cDisp'); d.style.opacity = '.55'; setTimeout(() => d.style.opacity = '', 160); });
ENTER.calc = () => { calcKey('ac'); };

/* ---------- חיפוש באינטרנט (הצצה) ---------- */
ENTER.web = () => { $('#wIn').value = ''; $('#wHome').hidden = false; $('#wOff').hidden = true; $('#wPeek').hidden = true; setTimeout(() => $('#wIn').focus(), 80); };
$('#wForm').addEventListener('submit', e => {
  e.preventDefault(); const q = $('#wIn').value.trim(); if (!q) return;
  setChoice(q); $('#wIn').blur(); $('#wHome').hidden = true; $('#wOff').hidden = false;
});
$('#wRetry').onclick = () => { const b = $('#wRetry'); b.textContent = 'טוען…'; setTimeout(() => { b.textContent = 'נסה שוב'; }, 1400); };
longPress($('#wOffIco'), 600, () => { const p = $('#wPeek'); p.textContent = PEEK.text; p.hidden = false; setTimeout(() => p.hidden = true, 1600); });

/* ---------- חפיסת קלפים ---------- */
function buildDeck() {
  const fan = $('#dFan'); fan.innerHTML = '';
  for (let i = 0; i < 52; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'dcard'; b.setAttribute('aria-label', 'קלף'); fan.appendChild(b); }
  requestAnimationFrame(() => { fan.scrollLeft = (fan.scrollWidth - fan.clientWidth) / 2; });
  $('#dPick').hidden = true;
}
ENTER.deck = buildDeck;
$('#dShuffle').onclick = () => { const fan = $('#dFan'); fan.scrollTo({ left: Math.random() * (fan.scrollWidth - fan.clientWidth), behavior: 'smooth' }); };
$('#dFan').addEventListener('click', e => {
  if (!e.target.closest('.dcard')) return;
  const c = S.deckMode === 'free' ? { s: Math.floor(Math.random() * 4), v: 1 + Math.floor(Math.random() * 13) } : (parseCard(S.deckForce) || { s: 1, v: 7 });
  const red = c.s === 1 || c.s === 3, col = red ? '#c8102e' : '#141414', face = $('#dFace');
  face.innerHTML = `<div class="c1"><span></span><i></i></div><div class="mid"></div><div class="c2"><span></span><i></i></div>`;
  $$('span', face).forEach(x => x.textContent = VAL(c.v)); $$('i', face).forEach(x => x.textContent = SUITS[c.s]);
  $('.mid', face).textContent = c.v >= 11 ? VAL(c.v) + SUITS[c.s] : SUITS[c.s]; face.style.color = col;
  face.style.animation = 'none'; void face.offsetWidth; face.style.animation = '';
  $('#dPick').hidden = false; setChoice(cardText(c)); buzz();
});
$('#dPick').onclick = () => { $('#dPick').hidden = true; };

/* ---------- מסך נעול + התראה ---------- */
const L = { t: 0, tick: 0, buf: '', fired: false };
function lockClock() {
  const d = new Date();
  $('#lTime').textContent = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  $('#lDate').textContent = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fireNote(x) {
  if (L.fired) return; L.fired = true;
  $('#lFrom').textContent = S.notifyFrom || 'הודעה';
  $('#lText').textContent = (S.notifyBody || '{x}').split('{x}').join(x);
  const n = $('#lNote'); n.hidden = true; void n.offsetWidth; n.hidden = false; buzz();
}
ENTER.lock = () => {
  lockClock(); clearInterval(L.tick); L.tick = setInterval(lockClock, 15000);
  clearTimeout(L.t); L.buf = ''; L.fired = false; $('#lNote').hidden = true;
  if (LAST.text) L.t = setTimeout(() => fireNote(LAST.text), (parseFloat(S.notifyDelay) || 6) * 1000);
};
LEAVE.lock = () => { clearTimeout(L.t); clearInterval(L.tick); };
$('#lTouch').addEventListener('click', e => { // מקשים נסתרים 3×3 כשאין בחירה שנקלטה
  if (L.fired || L.buf.length >= 2) return;
  if (!L.buf) clearTimeout(L.t); // הזנה ידנית גוברת על ההודעה האוטומטית
  const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 3), 0, 2);
  L.buf += String(row * 3 + col + 1); buzz();
  if (L.buf.length >= 2) { clearTimeout(L.t); const v = L.buf; L.t = setTimeout(() => { setChoice(v); fireNote(v); }, 2000); }
});

/* ===================== הפעלה ===================== */
(async function init() {
  await Store.init();
  await Store.loadSettings();
  applyTheme();
  try { ITEMS = (await Store.all()).map(normalize); } catch (e) { ITEMS = []; }
  if (!ITEMS.some(i => i.id === 'demo')) { const d = normalize(demoItem()); ITEMS.push(d); persist(d); }
  try { history.replaceState({ g: 1 }, ''); } catch (e) { /* ignore */ }
  const root = S.startIn === 'photos' ? 'photos' : 'hub';
  NAV.stack = [root]; paint(root); ENTER[root]();
  try { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {}); }
  catch (e) { /* מסגרת מוגבלת */ }
})();
