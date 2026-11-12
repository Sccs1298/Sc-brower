// מנוע "קולנועי" לרילס אקספליינר – CRYPTO ILS
// עקרונות: טיפוגרפיה קינטית · שרטוט טכני · תלת-ממד · מצלמה רציפה · גימור קולנועי · Match Cut · סנכרון לביט
// דורש window.TIMING (voice_beat.py) ו-window.SCENES = [{theme, ring:[x,y,r], bp:[...], mid:'html', anim(lt,dur,el,A)}]
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = x => { x = clamp(x); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const P = (lt, s, d = .5, e = easeOut) => e(clamp((lt - s) / d));
const lerp = (a, b, p) => a + (b - a) * p;
const $ = (r, s) => r.querySelector(s), $$ = (r, s) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('en-US');
const NS = 'http://www.w3.org/2000/svg';

// ---------- טיפוגרפיה קינטית ----------
function KT(text, cls = 'h1', style = '') {
  return `<div class="row kt ${cls}" style="${style}">` + text.split(' ').map(w => `<span class="w">${w} </span>`).join('') + '</div>';
}
// מילים נכנסות אחת-אחת: עומק, טשטוש, סיבוב – ואז "נושמות"
function kin(row, lt, start, stagger = .07, out = 99) {
  if (!row) return;
  $$(row, '.w').forEach((w, i) => {
    const p = P(lt, start + i * stagger, .55, back), q = P(lt, out, .35);
    const blur = 14 * (1 - clamp((lt - start - i * stagger) / .4)) + 10 * q;
    w.style.opacity = clamp(p) * (1 - q);
    w.style.filter = `blur(${blur}px)`;
    w.style.transform = `translate3d(0,${70 * (1 - p) - 40 * q}px,${-260 * (1 - p)}px) rotateX(${-65 * (1 - p)}deg) scale(${1 + .25 * (1 - clamp(p))})` +
      ` translateY(${Math.sin(lt * 2 + i) * 3}px)`;
  });
}
function show(el, p, dy = 60, z = -200) {
  if (!el) return;
  el.style.opacity = clamp(p);
  el.style.transform = `translate3d(0,${dy * (1 - p)}px,${z * (1 - p)}px)`;
}
// כרטיס תלת-ממדי: נכנס מ-rotateX גבוה ונשאר עם תנודה עדינה
function card3d(el, lt, start = 0, tilt = 1) {
  if (!el) return;
  const p = P(lt, start, .8, back);
  el.style.opacity = clamp(p * 1.4);
  el.style.transform = `translate3d(0,${120 * (1 - p)}px,${-400 * (1 - p)}px) rotateX(${70 * (1 - p) + 6 * tilt + Math.sin(lt * .9) * 3 * tilt}deg)` +
    ` rotateY(${Math.sin(lt * .7 + 1) * 7 * tilt}deg)`;
}
// אייקון תלת-ממדי: נכנס, מסתובב בעדינות סביב Y, מרחף
function icon3d(el, lt, start = 0) {
  if (!el) return;
  const p = P(lt, start, .7, back);
  el.style.opacity = clamp(p * 1.3);
  el.style.transform = `translate3d(0,${Math.sin(lt * 1.4) * 14 + 80 * (1 - p)}px,${-300 * (1 - p) + 40}px) rotateY(${Math.sin(lt * .8) * 16}deg) rotateZ(${Math.sin(lt * .6) * 2}deg) scale(${.8 + .2 * p})`;
}
const ICON = (n, cx, cy, w) => `<img class="icon" src="../../assets/icons3d/${n}.png" style="left:${cx - w / 2}px;top:${cy - w / 2}px;width:${w}px">`;

// ---------- שרטוט טכני ----------
function bpSVG(items) {
  let s = `<svg class="bp" width="1080" height="1920" viewBox="0 0 1080 1920" style="transform:translateZ(-150px) scale(1.1)">`;
  items.forEach((it, i) => {
    const at = it.at ?? (.15 + i * .18), col = it.red ? '#E5484D' : 'var(--bp)';
    const a = `data-at="${at}" stroke="${col}" fill="none" stroke-width="${it.w || 2}"`;
    if (it.c) { const [x, y, r] = it.c;
      s += `<circle class="draw" ${a} cx="${x}" cy="${y}" r="${r}" ${it.dash ? 'stroke-dasharray="6 10"' : ''} transform="rotate(-90 ${x} ${y})"/>`;
      let ticks = ''; for (let k = 0; k < 72; k++) { const an = k * 5 * Math.PI / 180, l = k % 6 ? 10 : 22;
        ticks += `M${x + (r + 8) * Math.cos(an)} ${y + (r + 8) * Math.sin(an)}L${x + (r + 8 + l) * Math.cos(an)} ${y + (r + 8 + l) * Math.sin(an)}`; }
      if (it.ticks !== false) s += `<path class="draw" ${a} stroke-width="1.5" d="${ticks}"/>`;
    }
    if (it.d) { const [x1, y1, x2, y2] = it.d, ang = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(ang) * 16, ny = Math.cos(ang) * 16;
      s += `<path class="draw" ${a} d="M${x1} ${y1}L${x2} ${y2}M${x1 + nx} ${y1 + ny}L${x1 - nx} ${y1 - ny}M${x2 + nx} ${y2 + ny}L${x2 - nx} ${y2 - ny}"/>`;
      if (it.label) s += `<text class="lbl fade" data-at="${at + .4}" x="${(x1 + x2) / 2 + nx * 1.8}" y="${(y1 + y2) / 2 + ny * 1.8 + 8}" text-anchor="middle" fill="${col}">${it.label}</text>`;
    }
    if (it.x) { const [x, y] = it.x, L = it.size || 36;
      s += `<path class="draw" ${a} d="M${x - L} ${y}L${x + L} ${y}M${x} ${y - L}L${x} ${y + L}"/><circle class="draw" ${a} cx="${x}" cy="${y}" r="${L * .45}"/>`; }
    if (it.t) { const [x, y, txt] = it.t; s += `<text class="lbl fade" data-at="${at}" x="${x}" y="${y}" text-anchor="${it.anchor || 'start'}" fill="${col}">${txt}</text>`; }
    if (it.l) { s += `<path class="draw" ${a} d="${it.l}" ${it.dash ? 'stroke-dasharray="8 10"' : ''}/>`; }
  });
  return s + '</svg>';
}
function gridSVG() {
  let d = '';
  for (let x = -600; x <= 1680; x += 60) d += `M${x} -900L${x} 2800`;
  for (let y = -900; y <= 2800; y += 60) d += `M-600 ${y}L1680 ${y}`;
  let D = '';
  for (let x = -600; x <= 1680; x += 300) D += `M${x} -900L${x} 2800`;
  for (let y = -900; y <= 2800; y += 300) D += `M-600 ${y}L1680 ${y}`;
  return `<svg class="bp" width="1080" height="1920" style="opacity:.9"><path d="${d}" stroke="var(--grid)" stroke-width="1"/><path d="${D}" stroke="var(--grid)" stroke-width="2.5"/></svg>`;
}
function drawBP(el, lt) {
  $$(el, '.draw').forEach(p => {
    if (!p._len) p._len = (p.getTotalLength ? p.getTotalLength() : 1000) || 1000;
    const pr = P(lt, +p.dataset.at, 1.0, easeInOut);
    if (!p.getAttribute('stroke-dasharray') || p._own) { p._own = 1; p.style.strokeDasharray = p._len; p.style.strokeDashoffset = p._len * (1 - pr); }
    else p.style.opacity = pr;
  });
  $$(el, '.fade').forEach(t => t.style.opacity = P(lt, +t.dataset.at, .4));
}

// ---------- במה ----------
let ringSVG, capEl, grainCtx, grainImg;
function buildStage() {
  const stage = document.getElementById('stage');
  stage.innerHTML = `<div id="world"><div id="cam"></div></div><div id="cap"></div><div id="brand">CRYPTO ILS</div>
    <canvas id="grain" width="360" height="640"></canvas><div id="vig"></div><div id="leak"></div><div id="flash"></div>`;
  const cam = $(stage, '#cam');
  SCENES.forEach(sc => {
    const d = document.createElement('div');
    d.className = 'scene ' + (sc.theme || 'dark');
    let parts = '';
    for (let i = 0; i < 26; i++) parts += `<i class="pt" style="position:absolute;border-radius:50%"></i>`;
    d.innerHTML = `<div class="L Lbg"><div class="bgfill"></div>${gridSVG()}</div>
      <div class="L Lmid">${bpSVG(sc.bp || [])}${sc.mid}</div><div class="L Lfg">${parts}</div>`;
    d.style.display = 'none';
    cam.appendChild(d); sc.el = d;
    // אינדקס מילים לסצנה (סנכרון לקול)
    sc.words = TIMING.words.filter(w => w[2] === SCENES.indexOf(sc));
  });
  ringSVG = document.createElementNS(NS, 'svg');
  ringSVG.setAttribute('id', 'ring'); ringSVG.setAttribute('width', 1080); ringSVG.setAttribute('height', 1920);
  ringSVG.innerHTML = `<circle id="r1" fill="none" stroke="var(--accent)" stroke-width="3"/><circle id="r2" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 14" opacity=".8"/>
    <path id="r3" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  ringSVG.style.transform = 'translateZ(150px) scale(.909)';  // מישור נפרד מהכרטיסים (אין חיתוך תלת-ממדי)
  cam.appendChild(ringSVG);
  capEl = $(stage, '#cap');
  const g = $(stage, '#grain'); grainCtx = g.getContext('2d'); grainImg = grainCtx.createImageData(360, 640);
  // קבוצות כתוביות
  window.CAPS = [];
  let cur = null;
  TIMING.words.forEach((w, i) => {
    if (!cur || cur.k !== w[2] || cur.w.length >= 3 || /[,.?!]$/.test(cur.w[cur.w.length - 1][0])) { cur = { k: w[2], w: [] }; CAPS.push(cur); }
    cur.w.push(w);
  });
  CAPS.forEach(c => c.s = c.w[0][1]);
  CAPS.forEach((c, i) => { c.e = i + 1 < CAPS.length ? Math.min(CAPS[i + 1].s, c.w[c.w.length - 1][1] + 1.0) : c.s + 2; });
}

function sceneAt(t) { const st = TIMING.starts; let k = 0; st.forEach((s, i) => { if (s <= t) k = i; }); return k; }

window.renderAt = function (t) {
  const st = TIMING.starts, n = SCENES.length, k = sceneAt(t), sc = SCENES[k];
  const s0 = st[k], end = k + 1 < n ? st[k + 1] : TIMING.total, lt = t - s0, dur = end - s0;
  SCENES.forEach((x, i) => x.el.style.display = i === k ? 'block' : 'none');
  // API לסצנה: זמן (בתוך הסצנה) של מילה
  const A = { w: (str, nth = 0) => { const m = sc.words.filter(w => w[0].includes(str)); return m[nth] ? m[nth][1] - s0 : 99; }, dur };
  sc.anim(lt, dur, sc.el, A);
  drawBP(sc.el, lt);
  // חלקיקים (בוקה) בשכבה הקדמית – תמיד בתנועה
  $$(sc.el, '.pt').forEach((p, i) => {
    const sx = (i * 397) % 1080, sy = (i * 733) % 1920, sz = 4 + (i % 5) * 5;
    const x = (sx + t * (12 + i % 7 * 4)) % 1180 - 50, y = (sy - t * (20 + i % 5 * 9) + 4000) % 2000 - 40;
    p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.width = p.style.height = sz + 'px';
    p.style.background = sc.theme === 'light' ? 'rgba(255,255,255,.9)' : 'rgba(255,190,120,.55)';
    p.style.filter = `blur(${i % 3 * 2 + 1}px)`; p.style.opacity = .25 + .35 * Math.abs(Math.sin(t * .7 + i));
  });
  // ---------- טבעת Match Cut ----------
  const prev = SCENES[k - 1], R = sc.ring || [540, 900, 0], Rp = (prev && prev.ring) || R;
  const mp = k > 0 ? P(lt, 0, .45, easeInOut) : 1;
  const rx = lerp(Rp[0], R[0], mp), ry = lerp(Rp[1], R[1], mp), rr = lerp(Rp[2], R[2], mp);
  const rA = R[2] ? 1 : 0;
  $(ringSVG, '#r1').setAttribute('cx', rx); $(ringSVG, '#r1').setAttribute('cy', ry); $(ringSVG, '#r1').setAttribute('r', Math.max(1, rr));
  $(ringSVG, '#r2').setAttribute('cx', rx); $(ringSVG, '#r2').setAttribute('cy', ry); $(ringSVG, '#r2').setAttribute('r', Math.max(1, rr + 26));
  $(ringSVG, '#r2').setAttribute('transform', `rotate(${t * 25} ${rx} ${ry})`);
  $(ringSVG, '#r3').setAttribute('d', `M${rx - rr - 50} ${ry}L${rx - rr - 12} ${ry}M${rx + rr + 12} ${ry}L${rx + rr + 50} ${ry}M${rx} ${ry - rr - 50}L${rx} ${ry - rr - 12}`);
  ringSVG.style.opacity = rA * (sc.ringOpacity ?? .9);
  // ---------- מצלמה רציפה ----------
  const B = TIMING.beat, ph = ((t % B) + B) % B / B, bump = Math.exp(-ph * 7);
  // מוקד המצלמה: בין מרכז המסך לטבעת (שלא ייחתך הפריים כשהטבעת בקצה)
  const fx = sc.focus ? sc.focus[0] : lerp(540, R[0], .45), fy = sc.focus ? sc.focus[1] : lerp(900, R[1], .45);
  const intro = k > 0 ? 1 - P(lt, 0, .55, easeOut) : 1 - P(lt, 0, 1.2, easeOut);   // נכנסים מזום-אין על הטבעת
  const outro = P(lt, dur - .45, .45, t => t * t * t);                               // יוצאים בזום-אין לטבעת
  const push = .06 * easeInOut(lt / Math.max(dur, .1));
  const scale = 1 + push + .35 * intro + .45 * outro + .012 * bump;
  const dx = 16 * Math.sin(t * .31) + 9 * Math.sin(t * .77), dy = 12 * Math.sin(t * .27 + 1) + 7 * Math.sin(t * .63);
  const rz = .7 * Math.sin(t * .23) + (k % 2 ? 1 : -1) * 2.5 * intro, rxx = 3 * Math.sin(t * .19), ryy = 4 * Math.sin(t * .17 + 2);
  const cam = document.getElementById('cam');
  cam.style.transformOrigin = `${fx}px ${fy}px`;
  cam.style.transform = `translate3d(${dx}px,${dy}px,0) rotateX(${rxx}deg) rotateY(${ryy}deg) rotateZ(${rz}deg) scale(${scale})`;
  // ---------- כתוביות (למטה) ----------
  const c = CAPS.find(c => t >= c.s - .02 && t < c.e);
  capEl.className = sc.theme === 'light' ? 'onlight' : '';
  if (!c || sc.noCap) { capEl.innerHTML = ''; } else {
    if (capEl._c !== c) { capEl.innerHTML = c.w.map(w => `<span class="cw">${w[0]}</span>`).join(' '); capEl._c = c; }
    const gp = P(t, c.s, .22, back);
    capEl.style.transform = `translateY(${24 * (1 - gp)}px) scale(${.92 + .08 * gp})`; capEl.style.opacity = clamp(gp * 1.5);
    $$(capEl, '.cw').forEach((s, i) => {
      const on = t >= c.w[i][1] - .03 && (i + 1 >= c.w.length || t < c.w[i + 1][1] - .03);
      s.classList.toggle('on', on);
      const pp = P(t, c.w[i][1] - .03, .18, back);
      s.style.transform = `scale(${on ? 1 + .14 * (1 - clamp(pp)) + .04 : 1})`;
      s.style.opacity = t >= c.w[i][1] - .06 ? 1 : .45;
    });
    if (sc.theme === 'light') { capEl.style.color = '#111'; capEl.style.textShadow = '0 0 26px rgba(255,255,255,.9)'; }
    else { capEl.style.color = '#fff'; capEl.style.textShadow = '0 4px 0 rgba(0,0,0,.35), 0 0 30px rgba(0,0,0,.55)'; }
  }
  document.getElementById('brand').className = sc.theme === 'light' ? 'onlight' : '';
  // ---------- גימור קולנועי ----------
  let seed = (Math.floor(t * 60) * 2654435761) >>> 0; const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; const v = seed >>> 24; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grainCtx.putImageData(grainImg, 0, 0);
  const leak = document.getElementById('leak'), lp = k > 0 ? clamp(1 - lt / .7) : 0;
  leak.style.opacity = .75 * lp * lp;
  leak.style.transform = `translate(${(k % 2 ? -1 : 1) * (380 - 760 * (1 - lp))}px, ${-150 + 300 * (1 - lp)}px) scale(${1.2 + .6 * (1 - lp)})`;
  document.getElementById('flash').style.opacity = k > 0 ? .35 * clamp(1 - lt / .1) : 0;
};

window.addEventListener('load', () => { buildStage(); window.renderAt(0); window.READY = true; });
