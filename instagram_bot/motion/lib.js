// ספריית אנימציה קטנה לרילס אקספליינר (CRYPTO ILS).
// דורש window.TIMING = {starts:[...], words:[[w,t],...], total} ו-window.SCENES = [{theme, html, anim(lt, dur, el)}]
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = x => { x = clamp(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
// התקדמות 0..1 של אנימציה שמתחילה ב-s ונמשכת d (בזמן הסצנה)
const P = (lt, s, d = .5, e = easeOut) => e((lt - s) / d);
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];
function show(el, p, dy = 40, scale = null) {
  if (!el) return;
  el.style.opacity = p;
  const sc = scale === null ? '' : ` scale(${scale + (1 - scale) * p})`;
  el.style.transform = `translateY(${dy * (1 - p)}px)${sc}`;
}
const fmt = n => Math.round(n).toLocaleString('en-US');

function buildStage() {
  const stage = document.getElementById('stage');
  SCENES.forEach((sc, i) => {
    const d = document.createElement('div');
    d.className = 'scene ' + (sc.theme || 'dark');
    d.innerHTML = '<div class="bg"></div>' + sc.html;
    d.style.display = 'none';
    stage.appendChild(d);
    sc.el = d;
  });
  const top = document.createElement('div'); top.id = 'topword'; stage.appendChild(top);
  const br = document.createElement('div'); br.id = 'brand'; br.textContent = 'CRYPTO ILS'; stage.appendChild(br);
  const fl = document.createElement('div'); fl.id = 'flash'; stage.appendChild(fl);
}

window.renderAt = function (t) {
  const st = TIMING.starts, n = SCENES.length;
  let k = 0;
  for (let i = 0; i < n; i++) if (st[i] <= t) k = i;
  const end = k + 1 < n ? st[k + 1] : TIMING.total;
  SCENES.forEach((sc, i) => { sc.el.style.display = i === k ? 'block' : 'none'; });
  const sc = SCENES[k], lt = t - st[k];
  sc.anim(lt, end - st[k], sc.el);
  // מילה נוכחית למעלה
  let w = '';
  for (const [ww, ts] of TIMING.words) if (ts <= t + 0.03) w = ww;
  const top = document.getElementById('topword');
  top.textContent = sc.noTop || t > TIMING.total - 0.6 ? '' : w.replace(/[,.]/g, '');
  top.className = sc.theme === 'light' ? 'onlight' : '';
  document.getElementById('brand').className = sc.theme === 'light' ? 'onlight' : '';
  // הבזק מעבר קצר
  const fl = document.getElementById('flash');
  fl.style.background = sc.theme === 'light' ? '#fff' : '#000';
  fl.style.opacity = k > 0 ? clamp(1 - lt / 0.14) * 0.85 : 0;
};

window.addEventListener('load', () => { buildStage(); window.renderAt(0); window.READY = true; });
