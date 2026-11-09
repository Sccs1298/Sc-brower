'use strict';
/* גלריה – חיזוי בתוך סרטון. הכל רץ מקומית בדפדפן, בלי שרת. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const easeOut = p => 1 - Math.pow(1 - clamp(p), 3);
const backOut = p => { p = clamp(p); const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const isRTL = s => /[֐-׿؀-ۿ]/.test(s);

const FONTS = {
  hand:    { name: 'כתב יד',       css: '"Amatic SC", "Caveat", cursive' },
  script:  { name: 'כתב יד (לטיני)', css: '"Caveat", "Amatic SC", cursive' },
  bold:    { name: 'כותרת',         css: '"Secular One", sans-serif' },
  clean:   { name: 'נקי',           css: '"Rubik", sans-serif' },
  serif:   { name: 'עיתון',         css: '"Frank Ruhl Libre", serif' },
  digital: { name: 'דיגיטלי',       css: '"Courier New", ui-monospace, monospace' },
};
const DEFAULT_WORDS = ['ישראל', 'צרפת', 'יפן', 'ברזיל', 'מצרים', 'קנדה', 'איטליה', 'הודו', 'מקסיקו', 'יוון', 'תאילנד', 'ספרד'];

const METHODS = {
  grid:     { name: 'מקלדת נסתרת (מסך = 12 מקשים)', for: ['number', 'word'],
              help: 'המסך מחולק לרשת בלתי נראית 3×4 כמו מקלדת טלפון: \u20661 2 3 / 4 5 6 / 7 8 9\u2069, ובשורה התחתונה: נקה (שמאל) · 0 · מחק (ימין). במילים – מקישים את מספר המילה ברשימה.' },
  list:     { name: 'הקשה אחת (12 אזורים = 12 מילים)', for: ['word'],
              help: 'הקשה אחת באחד מ-12 אזורי המסך בוחרת את המילה המתאימה מהרשימה (שמאל-למעלה = 1, ימין-למטה = 12).' },
  keyboard: { name: 'מקלדת Bluetooth / שלט', for: ['number', 'word'],
              help: 'הקלדה במקלדת חיצונית מוסתרת. נגיעות במסך לא עושות כלום, אז הצופה יכול להחזיק את הטלפון. רווח או חץ מתחיל.' },
  pre:      { name: 'לפני ההופעה (מוסווה כחיפוש)', for: ['number', 'word'],
              help: 'לפני שהסרטון עולה מופיע מסך "חיפוש בגלריה". מקלידים שם את הבחירה ולוחצים חפש.' },
  draw:     { name: 'ציור נסתר', for: ['drawing'],
              help: 'מציירים באצבע על המסך בזמן שהסרטון רץ. הקווים לא נראים, והציור מופיע באזור החשיפה. שתי אצבעות = ביטול קו אחרון.' },
};

/* ---------- הגדרות ---------- */
const SKEY = 'gallery.settings';
const S = Object.assign(
  { vibrate: true, indicator: false, record: false, contactName: '', contactLink: '', sample: '47' },
  (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })()
);
const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

/* ---------- אחסון (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('gallery', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('videos', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  run(mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('videos', mode);
      const req = fn(tx.objectStore('videos'));
      tx.oncomplete = () => res(req.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  },
  all() { return this.run('readonly', s => s.getAll()); },
  put(v) { return this.run('readwrite', s => s.put(v)); },
  del(id) { return this.run('readwrite', s => s.delete(id)); },
};

function newRegion(t, extra) {
  const base = { x: .2, y: .4, w: .6, h: .15 };
  return Object.assign({
    id: uid(), ...base, t, fade: 1.5, effect: 'fade', font: 'hand', color: '#ffffff', opacity: .95,
    rot: 0, skew: 0, blend: 'source-over', shadow: true, bold: true,
    track: { on: false, t2: t + 2, ...base },
  }, extra || {});
}

function demoItem() {
  const rect = { x: 205 / 720, y: 430 / 1280, w: 310 / 720, h: 400 / 1280 };
  return {
    id: 'demo', builtin: 'demo', name: 'הדגמה · התמונה בגלריה', w: 720, h: 1280, duration: 20, created: 0,
    content: 'number', method: 'grid', words: DEFAULT_WORDS.slice(),
    regions: [newRegion(15.5, { ...rect, fade: 2.6, color: '#2a1d12', opacity: .9, rot: -4, blend: 'multiply',
      shadow: false, track: { on: false, t2: 18, ...rect } })],
  };
}

/* ---------- מקורות וידאו ---------- */
class VideoSource {
  constructor(blob) {
    const v = this.el = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    this.url = URL.createObjectURL(blob);
    v.src = this.url;
    $('#vhost').appendChild(v);
  }
  ready() {
    return new Promise((res, rej) => {
      if (this.el.readyState >= 2) return res();
      this.el.addEventListener('loadeddata', () => res(), { once: true });
      this.el.addEventListener('error', () => rej(new Error('לא ניתן לטעון את הסרטון')), { once: true });
      this.el.load();
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
    URL.revokeObjectURL(this.url);
  }
}

/* סרטון הדגמה מובנה – מצויר בזמן אמת, לא קובץ */
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

const makeSource = item => item.builtin === 'demo' ? new DemoSource() : new VideoSource(item.blob);

/* ---------- רינדור החשיפה ---------- */
function regionRect(r, t) {
  const tr = r.track;
  if (tr && tr.on && tr.t2 > r.t && t > r.t) {
    const k = clamp((t - r.t) / (tr.t2 - r.t));
    return { x: lerp(r.x, tr.x, k), y: lerp(r.y, tr.y, k), w: lerp(r.w, tr.w, k), h: lerp(r.h, tr.h, k) };
  }
  return r;
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
function drawReveal(ctx, r, payload, p, t, W, H) {
  if (!payload || p < 0) return;
  const R = regionRect(r, t), w = R.w * W, h = R.h * H;
  ctx.save();
  ctx.translate(R.x * W + w / 2, R.y * H + h / 2);
  ctx.rotate(r.rot * Math.PI / 180);
  if (r.skew) ctx.transform(1, 0, Math.tan(r.skew * Math.PI / 180), 1, 0, 0);
  ctx.globalCompositeOperation = r.blend || 'source-over';
  let a = r.opacity; const e = easeOut(p);
  if (r.effect === 'fade') a *= e;
  else if (r.effect === 'develop') { a *= clamp(p * 1.2); const s = 1.06 - .06 * e; ctx.scale(s, s); }
  else if (r.effect === 'pop') { const s = Math.max(.001, backOut(p)); ctx.scale(s, s); a *= clamp(p * 3); }
  else if (r.effect === 'wipe') {
    const rtl = payload.type === 'text' && isRTL(payload.text), ww = w * 1.1 * clamp(p);
    ctx.beginPath(); ctx.rect(rtl ? w * .55 - ww : -w * .55, -h, ww, h * 2); ctx.clip();
  }
  ctx.globalAlpha = a;
  if (payload.type === 'text') drawTextFit(ctx, payload.text, w, h, r);
  else drawStrokes(ctx, payload.strokes, w, h, r);
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

/* ---------- עזרים ---------- */
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
const buzz = () => { if (S.vibrate && navigator.vibrate) navigator.vibrate(12); };
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const getPath = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

function probe(blob) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); const u = URL.createObjectURL(blob);
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => { res({ w: v.videoWidth, h: v.videoHeight, duration: isFinite(v.duration) ? v.duration : 0 }); URL.revokeObjectURL(u); };
    v.onerror = () => { URL.revokeObjectURL(u); rej(new Error('פורמט הווידאו לא נתמך בדפדפן הזה')); };
    v.src = u;
  });
}

/* ---------- ספרייה ---------- */
let ITEMS = [];
async function loadItems() {
  ITEMS = await DB.all();
  if (!ITEMS.some(i => i.builtin === 'demo')) { const d = demoItem(); await DB.put(d); ITEMS.push(d); }
  ITEMS.sort((a, b) => (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0) || b.created - a.created);
  renderLib();
}
function renderLib() {
  const box = $('#items'); box.innerHTML = '';
  if (!ITEMS.length) { box.innerHTML = '<p class="empty">אין סרטונים עדיין</p>'; return; }
  for (const it of ITEMS) {
    const el = document.createElement('div'); el.className = 'item';
    const kind = { number: 'מספר', word: 'מילה', drawing: 'ציור' }[it.content];
    el.innerHTML = `<h3></h3><div class="meta"></div>
      <div class="acts"><button class="btn primary" data-a="go">הופעה</button>
      <button class="btn" data-a="stage">במה</button><button class="btn" data-a="edit">עריכה</button></div>`;
    $('h3', el).textContent = it.name;
    $('.meta', el).textContent = `${fmt(it.duration || 0)} · ${kind} · ${(METHODS[it.method] || {}).name || ''} · ${it.regions.length} אזורים`;
    el.addEventListener('click', e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'edit') openEditor(it); else startPerform(it, a === 'stage');
    });
    box.appendChild(el);
  }
}
$('#fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const m = await probe(f);
    const t = m.duration ? +(m.duration * .75).toFixed(2) : 3;
    const it = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), blob: f, ...m, created: Date.now(),
      content: 'number', method: 'grid', words: DEFAULT_WORDS.slice(), regions: [newRegion(t)] };
    await DB.put(it); ITEMS.unshift(it); renderLib(); openEditor(it);
    toast('גרור על התמונה כדי לסמן איפה תופיע החשיפה');
  } catch (err) { toast(err.message || 'שגיאה בטעינת הסרטון'); }
});

/* ---------- עורך ---------- */
const E = { item: null, src: null, sel: 0, target: 'start', raf: 0, drag: null, saveT: 0, scrubbing: false };
const SAMPLE_DRAW = { type: 'draw', strokes: [
  Array.from({ length: 33 }, (_, i) => [100 + 80 * Math.cos(i / 32 * Math.PI * 2), 100 + 80 * Math.sin(i / 32 * Math.PI * 2)]),
  [[70, 80]], [[130, 80]],
  Array.from({ length: 12 }, (_, i) => [60 + i * 7.3, 120 + 25 * Math.sin(i / 11 * Math.PI)]),
] };

function fillSelect(sel, entries, value) {
  sel.innerHTML = entries.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  sel.value = value;
}
function syncMethodOptions() {
  const it = E.item, ok = Object.entries(METHODS).filter(([, m]) => m.for.includes(it.content));
  if (!ok.some(([k]) => k === it.method)) it.method = ok[0][0];
  fillSelect($('#edMethod'), ok.map(([k, m]) => [k, m.name]), it.method);
  $('#edMethodHelp').textContent = METHODS[it.method].help;
  $('#edWordsWrap').hidden = it.content !== 'word';
}
const curRegion = () => E.item.regions[E.sel];

async function openEditor(item) {
  closeEditorSrc();
  E.item = structuredClone(item); E.sel = 0; E.target = 'start';
  show('edit');
  $('#edName').value = E.item.name;
  $('#edContent').value = E.item.content;
  $('#edWords').value = (E.item.words || []).join('\n');
  $('#edSample').value = S.sample;
  $('#edDelete').hidden = E.item.id === 'demo';
  fillSelect($('#rgFont'), Object.entries(FONTS).map(([k, f]) => [k, f.name]), 'hand');
  syncMethodOptions(); renderRegions();
  E.src = makeSource(E.item);
  try { await E.src.ready(); } catch (err) { toast(err.message); return; }
  if (!E.item.duration && E.src.duration) E.item.duration = E.src.duration;
  E.item.w = E.src.w; E.item.h = E.src.h;
  $('#edScrub').max = E.src.duration || E.item.duration || 10;
  sizeEdCanvas();
  const r = curRegion(); if (r) E.src.time = Math.min(r.t + (r.fade || 0), (E.src.duration || 10) - .05);
  cancelAnimationFrame(E.raf); edLoop();
}
function closeEditorSrc() { cancelAnimationFrame(E.raf); if (E.src) { E.src.destroy(); E.src = null; } }
function sizeEdCanvas() {
  if (!E.src) return;
  const c = $('#edCanvas'), maxW = Math.min($('.preview-wrap').clientWidth || 360, 720), maxH = innerHeight * .52;
  const s = Math.min(maxW / E.src.w, maxH / E.src.h), dpr = Math.min(devicePixelRatio || 1, 2);
  c.style.width = `${Math.round(E.src.w * s)}px`; c.style.height = `${Math.round(E.src.h * s)}px`;
  c.width = Math.round(E.src.w * s * dpr); c.height = Math.round(E.src.h * s * dpr);
}
function edPayload() {
  const it = E.item;
  if (it.content === 'drawing') return SAMPLE_DRAW;
  return { type: 'text', text: S.sample || (it.content === 'word' ? it.words[0] : '47') || '47' };
}
function edLoop() {
  E.raf = requestAnimationFrame(edLoop);
  const c = $('#edCanvas'), ctx = c.getContext('2d'), W = c.width, H = c.height, t = E.src.time;
  ctx.clearRect(0, 0, W, H);
  composeFrame(ctx, E.src, E.item, edPayload(), 0, W, H, $('#edShowAll').checked);
  E.item.regions.forEach((r, i) => {
    const R = regionRect(r, t), on = i === E.sel;
    ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = on ? 2.5 : 1.2;
    ctx.strokeStyle = on ? '#d8b46a' : 'rgba(255,255,255,.55)';
    ctx.strokeRect(R.x * W, R.y * H, R.w * W, R.h * H);
    if (on) { ctx.setLineDash([]); ctx.fillStyle = '#d8b46a'; ctx.fillRect((R.x + R.w) * W - 9, (R.y + R.h) * H - 9, 14, 14); }
    if (on && r.track.on) { ctx.strokeStyle = '#6ac0d8'; ctx.setLineDash([3, 4]); ctx.strokeRect(r.track.x * W, r.track.y * H, r.track.w * W, r.track.h * H); }
    ctx.restore();
  });
  if (!E.scrubbing) $('#edScrub').value = t;
  $('#edTime').textContent = t.toFixed(2);
  $('#edPlay').textContent = E.src.paused ? '▶' : '❚❚';
}
function renderRegions() {
  const box = $('#edRegions'); box.innerHTML = '';
  E.item.regions.forEach((r, i) => {
    const b = document.createElement('button'); b.className = 'chip' + (i === E.sel ? ' on' : '');
    b.textContent = `אזור ${i + 1} · ${(+r.t).toFixed(1)} שנ׳`;
    b.onclick = () => { E.sel = i; renderRegions(); };
    box.appendChild(b);
  });
  const r = curRegion(); $('#rgForm').hidden = !r;
  if (!r) return;
  $$('[data-r]').forEach(el => {
    const v = getPath(r, el.dataset.r);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  $$('input[name=edTarget]').forEach(el => el.checked = el.value === E.target);
}
function scheduleSave() {
  clearTimeout(E.saveT);
  E.saveT = setTimeout(async () => {
    const it = E.item; await DB.put(it);
    const i = ITEMS.findIndex(x => x.id === it.id); if (i >= 0) ITEMS[i] = structuredClone(it); else ITEMS.unshift(structuredClone(it));
    renderLib();
  }, 350);
}
async function flushSave() { clearTimeout(E.saveT); if (!E.item) return; await DB.put(E.item);
  const i = ITEMS.findIndex(x => x.id === E.item.id); if (i >= 0) ITEMS[i] = structuredClone(E.item); renderLib(); }

$('#edit').addEventListener('input', e => {
  const el = e.target, it = E.item; if (!it) return;
  if (el.dataset.i) { it[el.dataset.i] = el.value; if (el.dataset.i === 'content') syncMethodOptions(); if (el.dataset.i === 'method') $('#edMethodHelp').textContent = METHODS[it.method].help; }
  else if (el.dataset.r && curRegion()) {
    const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) || 0 : el.value;
    setPath(curRegion(), el.dataset.r, v);
    if (el.dataset.r === 'track.on' && v) { const r = curRegion(); Object.assign(r.track, { x: r.x, y: r.y, w: r.w, h: r.h }); if (r.track.t2 <= r.t) r.track.t2 = r.t + 2; renderRegions(); }
    if (el.dataset.r === 't') renderRegions();
  } else if (el.id === 'edWords') it.words = el.value.split('\n').map(s => s.trim()).filter(Boolean);
  else if (el.id === 'edSample') { S.sample = el.value; saveSettings(); return; }
  else if (el.name === 'edTarget') { E.target = el.value; return; }
  else return;
  scheduleSave();
});
$('#edScrub').addEventListener('input', e => { E.scrubbing = true; if (E.src) { E.src.pause(); E.src.time = parseFloat(e.target.value); } });
$('#edScrub').addEventListener('change', () => { E.scrubbing = false; });
$('#edPlay').onclick = () => { if (!E.src) return; if (E.src.paused) { if (E.src.ended || E.src.time >= E.src.duration - .05) E.src.time = 0; E.src.play(); } else E.src.pause(); };
$('#rgAdd').onclick = () => { E.item.regions.push(newRegion(+(E.src ? E.src.time : 0).toFixed(2))); E.sel = E.item.regions.length - 1; E.target = 'start'; renderRegions(); scheduleSave(); toast('גרור על התמונה כדי לסמן את האזור'); };
$('#rgDel').onclick = () => { if (!curRegion()) return; E.item.regions.splice(E.sel, 1); E.sel = Math.max(0, E.sel - 1); renderRegions(); scheduleSave(); };
$('#rgNow').onclick = () => { const r = curRegion(); if (!r || !E.src) return; r.t = +E.src.time.toFixed(2); if (r.track.t2 <= r.t) r.track.t2 = r.t + 2; renderRegions(); scheduleSave(); };
$('#rgNow2').onclick = () => { const r = curRegion(); if (!r || !E.src) return; r.track.on = true; r.track.t2 = +E.src.time.toFixed(2); E.target = 'end'; renderRegions(); scheduleSave(); toast('עכשיו גרור את המיקום בזמן הזה'); };
$('#edBack').onclick = async () => { await flushSave(); closeEditorSrc(); E.item = null; show('lib'); };
$('#edPerform').onclick = async () => { await flushSave(); const it = E.item; closeEditorSrc(); startPerform(it, false); };
$('#edStage').onclick = async () => { await flushSave(); const it = E.item; closeEditorSrc(); startPerform(it, true); };
$('#edDup').onclick = async () => {
  await flushSave(); const c = structuredClone(E.item);
  c.id = uid(); c.name += ' (עותק)'; c.created = Date.now();
  await DB.put(c); ITEMS.unshift(c); renderLib(); openEditor(c); toast('נוצר עותק');
};
$('#edDelete').onclick = async () => {
  if (!confirm('למחוק את הסרטון וההגדרות שלו?')) return;
  await DB.del(E.item.id); ITEMS = ITEMS.filter(x => x.id !== E.item.id); closeEditorSrc(); E.item = null; renderLib(); show('lib');
};

/* גרירה על התצוגה: סימון / הזזה / שינוי גודל של אזור */
const edCanvas = $('#edCanvas');
const normPt = e => { const b = edCanvas.getBoundingClientRect(); return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) }; };
edCanvas.addEventListener('pointerdown', e => {
  const r = curRegion(); if (!r) return;
  const tgt = E.target === 'end' && r.track.on ? r.track : r, p = normPt(e), b = edCanvas.getBoundingClientRect();
  const nearCorner = Math.abs(p.x - (tgt.x + tgt.w)) * b.width < 22 && Math.abs(p.y - (tgt.y + tgt.h)) * b.height < 22;
  const inside = p.x > tgt.x && p.x < tgt.x + tgt.w && p.y > tgt.y && p.y < tgt.y + tgt.h;
  E.drag = { tgt, mode: nearCorner ? 'size' : inside ? 'move' : 'new', sx: p.x, sy: p.y, o: { ...tgt } };
  if (E.drag.mode === 'new') Object.assign(tgt, { x: p.x, y: p.y, w: 0.001, h: 0.001 });
  edCanvas.setPointerCapture(e.pointerId);
});
edCanvas.addEventListener('pointermove', e => {
  const d = E.drag; if (!d) return; const p = normPt(e), t = d.tgt;
  if (d.mode === 'move') { t.x = clamp(d.o.x + p.x - d.sx, 0, 1 - t.w); t.y = clamp(d.o.y + p.y - d.sy, 0, 1 - t.h); }
  else if (d.mode === 'size') { t.w = clamp(d.o.w + p.x - d.sx, .02, 1 - t.x); t.h = clamp(d.o.h + p.y - d.sy, .02, 1 - t.y); }
  else { t.x = Math.min(p.x, d.sx); t.y = Math.min(p.y, d.sy); t.w = Math.max(.02, Math.abs(p.x - d.sx)); t.h = Math.max(.02, Math.abs(p.y - d.sy)); }
});
const endDrag = () => { if (E.drag) { E.drag = null; scheduleSave(); } };
edCanvas.addEventListener('pointerup', endDrag); edCanvas.addEventListener('pointercancel', endDrag);
addEventListener('resize', () => { sizeEdCanvas(); if (P.active) sizeStage(); });

/* ---------- הגדרות ---------- */
$('#btnSettings').onclick = () => {
  $$('[data-s]').forEach(el => { if (el.type === 'checkbox') el.checked = !!S[el.dataset.s]; else el.value = S[el.dataset.s] || ''; });
  show('settings');
};
$('#settings').addEventListener('input', e => { const el = e.target; if (!el.dataset.s) return; S[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.value; saveSettings(); });
$('#stBack').onclick = () => show('lib');

/* ---------- קלט סודי ---------- */
class SecretInput {
  constructor(item) { this.item = item; this.buf = ''; this.strokes = []; }
  key(k) { if (k === 'C') this.buf = ''; else if (k === 'B') this.buf = this.buf.slice(0, -1); else this.buf += k; }
  undo() { if (this.item.content === 'drawing') this.strokes.pop(); else this.buf = this.buf.slice(0, -1); }
  get count() { return this.item.content === 'drawing' ? this.strokes.length : this.buf.length; }
  payload() {
    const it = this.item;
    if (it.content === 'drawing') return this.strokes.length ? { type: 'draw', strokes: this.strokes.map(s => s.slice()) } : null;
    const b = this.buf.trim(); if (!b) return null;
    if (it.content === 'word' && /^\d+$/.test(b)) { const w = (it.words || [])[parseInt(b, 10) - 1]; return w ? { type: 'text', text: w } : null; }
    return { type: 'text', text: b };
  }
}
const GRID = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['C', '0', 'B']];

/* ---------- הופעה ---------- */
const P = { active: false, item: null, src: null, input: null, started: false, frozen: null, frozenAt: 0,
  raf: 0, stage: false, vr: null, dpr: 1, menu: false, rec: null, rc: null, rctx: null, clip: null, endAt: 0, wake: null, minT: 0 };
const stageCv = $('#stage'), sctx = stageCv.getContext('2d');

function startPerform(item, stage) {
  if (item.method === 'pre' && item.content !== 'drawing') {
    $('#preIn').value = ''; $('#preIn').inputMode = item.content === 'number' ? 'numeric' : 'text';
    $('#preForm').onsubmit = e => { e.preventDefault(); const v = $('#preIn').value; $('#preIn').blur(); enterPerform(item, stage, v); };
    $('#preBack').onclick = () => show('lib');
    show('pre'); setTimeout(() => $('#preIn').focus(), 50);
    return;
  }
  enterPerform(item, stage, '');
}

async function enterPerform(item, stage, preText) {
  // מסך מלא חייב לקרות מיד בתוך הלחיצה
  const de = document.documentElement;
  try { (de.requestFullscreen || de.webkitRequestFullscreen || (() => {})).call(de)?.catch?.(() => {}); } catch (e) { /* iOS */ }
  Object.assign(P, { active: true, item, stage, started: false, frozen: null, frozenAt: 0, menu: false, clip: null, endAt: 0 });
  P.input = new SecretInput(item); P.input.buf = preText || '';
  P.minT = Math.min(...item.regions.map(r => r.t), Infinity);
  $('#pmenu').hidden = true;
  show('perform');
  P.src = makeSource(item);
  try { await P.src.ready(); } catch (err) { toast(err.message); exitPerform(); return; }
  P.src.time = 0;
  if (stage && screen.orientation && screen.orientation.lock) screen.orientation.lock(P.src.w >= P.src.h ? 'landscape' : 'portrait').catch(() => {});
  try { P.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* ignore */ }
  for (const r of item.regions) { try { await document.fonts.load(`700 40px ${(FONTS[r.font] || FONTS.clean).css}`); } catch (e) { /* ignore */ } }
  sizeStage();
  cancelAnimationFrame(P.raf); perfLoop();
}
function sizeStage() {
  P.dpr = Math.min(devicePixelRatio || 1, 2);
  stageCv.width = Math.round(innerWidth * P.dpr); stageCv.height = Math.round(innerHeight * P.dpr);
  if (P.src) P.vr = fitRect(P.src.w, P.src.h, stageCv.width, stageCv.height);
}
function begin() {
  P.started = true; P.frozen = null; P.frozenAt = 0; P.endAt = 0; P.clip = null;
  P.src.time = 0;
  setupRecorder();
  const pr = P.src.play(); if (pr && pr.catch) pr.catch(() => toast('הקש שוב כדי להתחיל'));
}
function perfLoop() {
  P.raf = requestAnimationFrame(perfLoop);
  const src = P.src; if (!src || !P.vr) return;
  const t = src.time;
  // נעילת הקלט ברגע שהחשיפה מתחילה (לא באמצע קו בציור)
  if (P.started && !P.frozen && t >= P.minT && !T.drawing) {
    const pl = P.input.payload(); if (pl) { P.frozen = pl; P.frozenAt = t; }
  }
  sctx.fillStyle = '#000'; sctx.fillRect(0, 0, stageCv.width, stageCv.height);
  sctx.save(); sctx.translate(P.vr.x, P.vr.y);
  composeFrame(sctx, src, P.item, P.frozen, P.frozenAt, P.vr.w, P.vr.h, false);
  sctx.restore();
  if (S.indicator && !P.stage) { // נקודות זעירות: כמה תווים הוזנו / נעול
    const n = P.input.count, d = 2.2 * P.dpr;
    sctx.fillStyle = P.frozen ? 'rgba(120,200,120,.35)' : 'rgba(255,255,255,.22)';
    for (let i = 0; i < n; i++) sctx.fillRect(stageCv.width - (i + 1) * d * 3, stageCv.height - d * 3, d, d);
  }
  if (P.rec && P.rec.state === 'recording') {
    const rc = P.rc, rx = P.rctx;
    if (src.ended || (src.duration && t >= src.duration - .02 && src.paused)) {
      if (!P.endAt) P.endAt = performance.now();
      drawEndCard(rx, rc.width, rc.height, (performance.now() - P.endAt) / 1000);
      if (performance.now() - P.endAt > 3200) P.rec.stop();
    } else composeFrame(rx, src, P.item, P.frozen, P.frozenAt, rc.width, rc.height, false);
  }
}
function drawEndCard(ctx, W, H, t) {
  ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = clamp(t / .6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const u = Math.min(W, H) / 12, name = S.contactName || 'גלריה', link = S.contactLink || '';
  ctx.direction = isRTL(name) ? 'rtl' : 'ltr'; ctx.fillStyle = '#d8b46a';
  ctx.font = `400 ${u * 1.3}px "Secular One", sans-serif`; ctx.fillText(name, W / 2, H / 2 - u * .6);
  ctx.direction = isRTL(link) ? 'rtl' : 'ltr'; ctx.fillStyle = '#ecebe8';
  ctx.font = `400 ${u * .7}px "Rubik", sans-serif`; ctx.fillText(link, W / 2, H / 2 + u * .8);
  ctx.globalAlpha = 1;
}

/* הקלטה לשיתוף */
function pickMime() {
  if (!window.MediaRecorder) return null;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || '';
}
function discardRec() {
  if (P.rec && P.rec.state !== 'inactive') { P.rec.ondataavailable = null; P.rec.onstop = null; P.rec.stop(); }
  P.rec = null; P.clip = null;
}
function setupRecorder() {
  discardRec();
  const mime = pickMime(); if (!S.record || mime === null) return;
  const src = P.src, sc = Math.min(1, 1280 / Math.max(src.w, src.h));
  const rc = P.rc = document.createElement('canvas');
  rc.width = Math.round(src.w * sc / 2) * 2; rc.height = Math.round(src.h * sc / 2) * 2;
  P.rctx = rc.getContext('2d');
  composeFrame(P.rctx, src, P.item, null, 0, rc.width, rc.height, false);
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
  try {
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5e6 } : undefined), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { P.clip = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }); };
    rec.start(500); P.rec = rec;
  } catch (e) { P.rec = null; }
}
async function shareClip() {
  if (!P.clip) { toast(P.rec && P.rec.state === 'recording' ? 'הסרטון עדיין מוקלט…' : 'אין הקלטה. אפשר להפעיל אותה בהגדרות'); return; }
  const ext = P.clip.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([P.clip], `gallery-${Date.now()}.${ext}`, { type: P.clip.type });
  const text = [S.contactName, S.contactLink].filter(Boolean).join(' · ');
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

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
  if (m === 'resume') { if (P.wasPlaying) P.src.play(); }
  else if (m === 'restart') { P.input = new SecretInput(P.item); P.started = false; P.frozen = null; P.src.pause(); P.src.time = 0; discardRec(); }
  else if (m === 'exit') exitPerform();
});
function exitPerform() {
  P.active = false; cancelAnimationFrame(P.raf);
  discardRec();
  if (P.src) { P.src.destroy(); P.src = null; }
  try { P.wake && P.wake.release(); } catch (e) { /* ignore */ }
  try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) { /* ignore */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  show('lib');
}

/* מגע בזמן הופעה */
const touch = $('#touch');
const T = { pts: new Map(), max: 0, moved: false, t0: 0, sx: 0, sy: 0, lp: 0, lpFired: false, stroke: null, pushed: false, drawing: false };
const toVideo = e => {
  const vr = P.vr, x = (e.clientX * P.dpr - vr.x) / vr.w, y = (e.clientY * P.dpr - vr.y) / vr.h;
  return [x * P.src.w, y * P.src.h];
};
const drawMode = () => P.item && P.item.content === 'drawing';

touch.addEventListener('pointerdown', e => {
  e.preventDefault(); if (P.menu) return;
  try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  T.pts.set(e.pointerId, true);
  if (T.pts.size === 1) {
    Object.assign(T, { max: 1, moved: false, t0: performance.now(), sx: e.clientX, sy: e.clientY, lpFired: false, pushed: false, drawing: false });
    T.stroke = drawMode() && P.started && !P.frozen ? [toVideo(e)] : null;
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
  if (T.lpFired || P.menu || e.type === 'pointercancel') return;
  if (T.max >= 2) { if (P.started && !P.frozen) { P.input.undo(); buzz(); } return; }
  if (T.moved) { if (T.pushed) buzz(); return; }
  if (dur < 500) secretTap(e, stroke);
}
touch.addEventListener('pointerup', pointerEnd);
touch.addEventListener('pointercancel', pointerEnd);
touch.addEventListener('contextmenu', e => e.preventDefault());

function secretTap(e, stroke) {
  if (!P.started) { begin(); return; }
  if (P.frozen) return;
  const it = P.item;
  if (it.content === 'drawing') { if (stroke) { P.input.strokes.push(stroke); buzz(); } return; }
  if (it.method === 'keyboard' || it.method === 'pre') return;
  const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 4), 0, 3);
  if (it.method === 'list') P.input.buf = String(row * 3 + col + 1);
  else P.input.key(GRID[row][col]);
  buzz();
}

document.addEventListener('keydown', e => {
  if (!P.active) return;
  if (e.key === 'Escape') { e.preventDefault(); if (P.menu) { $('[data-m=resume]').click(); } else openMenu(); return; }
  if (P.menu) return;
  if (!P.started) { if ([' ', 'Enter', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'PageDown', 'PageUp'].includes(e.key)) { e.preventDefault(); begin(); } return; }
  if (P.frozen || drawMode()) return;
  if (e.key === 'Backspace') P.input.undo();
  else if (e.key.length === 1 && e.key !== ' ' && (P.item.content !== 'number' || /\d/.test(e.key))) P.input.buf += e.key;
  else if (e.key === ' ' && P.item.content === 'word' && P.input.buf) P.input.buf += ' ';
  else return;
  e.preventDefault(); buzz();
});
document.addEventListener('visibilitychange', async () => {
  if (P.active && document.visibilityState === 'visible') { try { P.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* ignore */ } }
});

/* ---------- הפעלה ---------- */
(async function init() {
  try { await DB.open(); await loadItems(); }
  catch (e) { toast('אחסון לא זמין: ' + (e.message || e)); ITEMS = [demoItem()]; renderLib(); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
