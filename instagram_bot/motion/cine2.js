// מנוע "קולנועי" לרילס אקספליינר – CRYPTO ILS
// עקרונות: טיפוגרפיה קינטית · שרטוט טכני · תלת-ממד · מצלמה רציפה · גימור קולנועי · Match Cut · סנכרון לביט
// v2 – קצב: "שוטים" שמתחלפים על מילים (sc.at=[משפט,'מילה',n]) · מילה אחת קטנה למעלה (בלי כתוביות רצות) · מעברי whip/zoom
// דורש window.TIMING (voice_beat.py) ו-window.SCENES = [{at|s, theme, tr, ring:[x,y,r], bp:[...], mid:'html', anim(lt,dur,el,A)}]
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
    w.style.transform = `translate3d(0,${70 * (1 - p) - 40 * q}px,${-260 * (1 - p) + 140}px) rotateX(${-65 * (1 - p)}deg) scale(${1 + .25 * (1 - clamp(p))})` +
      ` translateY(${Math.sin(lt * 2 + i) * 3}px)`;
  });
}
function show(el, p, dy = 60, z = -200) {
  if (!el) return;
  el.style.opacity = clamp(p);
  el.style.transform = `translate3d(0,${dy * (1 - p)}px,${z * (1 - p) + 140}px)`;
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
  el.style.transform = `translate3d(0,${Math.sin(lt * 1.4) * 14 + 80 * (1 - p)}px,${-300 * (1 - p) - 120}px) rotateY(${Math.sin(lt * .8) * 12}deg) rotateZ(${Math.sin(lt * .6) * 2}deg) scale(${.8 + .2 * p})`;
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
  stage.innerHTML = `<div id="world"><div id="cam"></div></div><div id="top"></div><div id="brand">CRYPTO ILS</div>
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
  });
  // זמני התחלה לשוטים: לפי מילה (at) או לפי משפט (s)
  SCENES.forEach((sc, i) => {
    if (sc.at) { const [si, str, nth] = sc.at; const m = TIMING.words.filter(w => w[2] === si && w[0].includes(str));
      if (!m[nth || 0]) throw new Error('word not found: ' + sc.at); sc.t0 = Math.max(0, m[nth || 0][1] - .06); }
    else sc.t0 = TIMING.starts[sc.s ?? i];
  });
  SCENES.forEach((sc, i) => { const t1 = i + 1 < SCENES.length ? SCENES[i + 1].t0 : TIMING.total;
    sc.t1 = t1; sc.words = TIMING.words.filter(w => w[1] >= sc.t0 - .07 && w[1] < t1 - .07); });
  ringSVG = document.createElementNS(NS, 'svg');
  ringSVG.setAttribute('id', 'ring'); ringSVG.setAttribute('width', 1080); ringSVG.setAttribute('height', 1920);
  ringSVG.innerHTML = `<circle id="r1" fill="none" stroke="var(--accent)" stroke-width="3"/><circle id="r2" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 14" opacity=".8"/>
    <path id="r3" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  ringSVG.style.transform = 'translateZ(150px) scale(.909)';  // מישור נפרד מהכרטיסים (אין חיתוך תלת-ממדי)
  cam.appendChild(ringSVG);
  capEl = $(stage, '#top');
  const g = $(stage, '#grain'); grainCtx = g.getContext('2d'); grainImg = grainCtx.createImageData(360, 640);
}

function sceneAt(t) { let k = 0; SCENES.forEach((s, i) => { if (s.t0 <= t) k = i; }); return k; }

window.renderAt = function (t) {
  const n = SCENES.length, k = sceneAt(t), sc = SCENES[k];
  const s0 = sc.t0, end = sc.t1, lt = t - s0, dur = end - s0;
  const TR = x => x.tr || ['zoom', 'whipR', 'whipL'][SCENES.indexOf(x) % 3];
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
  const tr = TR(sc), nxt = SCENES[k + 1];
  const ip = k > 0 ? 1 - P(lt, 0, .38, easeOut) : 1 - P(lt, 0, .9, easeOut);        // כניסה מהירה
  const zoomIn = tr === 'zoom' || k === 0 ? ip : 0, whip = tr.startsWith('whip') ? ip * (tr === 'whipR' ? 1 : -1) : 0;
  const outro = nxt && TR(nxt) === 'zoom' ? P(lt, dur - .3, .3, x => x * x * x) : 0;  // זום-אין לטבעת לפני Match Cut
  const wout = nxt && TR(nxt).startsWith('whip') ? P(lt, dur - .16, .16, x => x * x) * (TR(nxt) === 'whipR' ? -1 : 1) : 0;
  const push = .12 * easeInOut(lt / Math.max(dur, .1));                              // דחיפה רציפה בכל שוט
  const scale = 1 + push + .4 * zoomIn + .5 * outro + .018 * bump;
  const dx = 26 * Math.sin(t * .41) + 14 * Math.sin(t * .97) + 1150 * whip + 1150 * wout, dy = 20 * Math.sin(t * .37 + 1) + 11 * Math.sin(t * .83);
  const rz = 1.1 * Math.sin(t * .33) + (k % 2 ? 1 : -1) * 3 * zoomIn - 4 * whip, rxx = 4 * Math.sin(t * .29), ryy = 6 * Math.sin(t * .23 + 2) - 25 * whip - 25 * wout;
  const cam = document.getElementById('cam');
  cam.style.transformOrigin = `${fx}px ${fy}px`;
  cam.style.transform = `translate3d(${dx}px,${dy}px,0) rotateX(${rxx}deg) rotateY(${ryy}deg) rotateZ(${rz}deg) scale(${scale})`;
  // ---------- מילה אחת למעלה (כמו ברפרנסים) ----------
  let cw = ''; for (const w of TIMING.words) if (w[1] <= t + .03) cw = w[0];
  capEl.textContent = sc.noTop || t > TIMING.total - .6 ? '' : cw.replace(/[,.:]/g, '');
  capEl.className = sc.theme === 'light' ? 'onlight' : '';
  document.getElementById('brand').className = sc.theme === 'light' ? 'onlight' : '';
  // ---------- גימור קולנועי ----------
  let seed = (Math.floor(t * 60) * 2654435761) >>> 0; const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; const v = seed >>> 24; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grainCtx.putImageData(grainImg, 0, 0);
  const leak = document.getElementById('leak'), lp = k > 0 && k % 2 === 0 ? clamp(1 - lt / .45) : 0;
  leak.style.opacity = .75 * lp * lp;
  leak.style.transform = `translate(${(k % 2 ? -1 : 1) * (380 - 760 * (1 - lp))}px, ${-150 + 300 * (1 - lp)}px) scale(${1.2 + .6 * (1 - lp)})`;
  document.getElementById('flash').style.opacity = k > 0 ? .35 * clamp(1 - lt / .1) : 0;
};

window.addEventListener('load', () => { buildStage(); window.renderAt(0); window.READY = true; });
