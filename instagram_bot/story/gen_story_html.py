import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
c = open('../motion/carousel/carousel.html', encoding='utf-8').read()
style = c[c.index('<style>') + 7:c.index('</style>')].replace('../../fonts', '../fonts')
squar = c[c.index('function squarify'):c.index('function heat')]
html = '''<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<!-- סטורי "מצב השוק" 1080x1920. נתונים: data.js (נוצר ע"י make_story.py). אזור בטוח: 250..1670 -->
<style>''' + style + '''
.slide { width: 1080px; height: 1920px; margin: 0; }
.top { position: absolute; top: 270px; left: 70px; right: 70px; display: flex; justify-content: space-between; align-items: center; }
.top .b { font: 900 34px Heebo; letter-spacing: 6px; direction: ltr; display: flex; align-items: center; gap: 14px; }
.top .b i { width: 20px; height: 20px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 22px var(--acc); }
.top .t { font: 700 30px "DejaVu Sans Mono", monospace; opacity: .6; direction: ltr; }
.hm { top: 1150px; height: 470px; }
.card { padding: 30px 36px; }
.foot { position: absolute; top: 1630px; left: 70px; right: 70px; text-align: center; font: 400 28px Heebo; opacity: .55; }
</style></head><body>
<script src="data.js"></script>
<script>
''' + squar + '''
const D = STORY, el = document.createElement('div'); el.className = 'slide dark';
const pct = v => Math.abs(v) < .05 ? '0.0%' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, cls = v => Math.abs(v) < .05 ? '' : v < 0 ? 'dn' : 'up';
const usd = v => '$' + (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
const coin = s => D.coins.find(c => c[0] === s);
function heat(coins) {
  const its = coins.map(c => [c[0], Math.pow(c[1], .62), c[2]]);
  return squarify(its, 0, 0, 960, 470).map(([c, x, y, w, h]) => {
    const ch = c[2], a = Math.min(1, Math.abs(ch) / 9), col = Math.abs(ch) < .25 ? '#4a4752' : ch < 0 ? `rgba(${170 + 70 * a},${45 - 20 * a},${60 - 20 * a},1)` : `rgba(30,${120 + 80 * a},80,1)`;
    const fs = Math.max(14, Math.min(w, h) / 3.2);
    return `<div style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${col}">${w > 60 && h > 40 ? `<b style="font-size:${fs}px">${c[0]}</b><span style="font-size:${fs * .55}px">${pct(ch)}</span>` : ''}</div>`;
  }).join('');
}
const btc = coin('BTC'), eth = coin('ETH');
const box = (n, c) => `<div class="card"><div class="k">${n}</div><div class="v" style="font-size:72px">${usd(c[3])}</div><div class="s ${cls(c[2])}" style="opacity:1;font-weight:700;direction:ltr;text-align:right">${pct(c[2])}</div></div>`;
el.innerHTML = `<div class="grid"></div>
 <div class="top"><div class="b"><i></i>CRYPTO ILS</div><div class="t">${D.time} · ${D.date}</div></div>
 <div class="c h1" style="top:390px;font-size:96px">מצב השוק עכשיו</div>
 <div class="c giga num ${Math.abs(D.ch) < .5 ? "" : cls(D.ch)}" style="top:520px;font-size:240px">${pct(D.ch)}</div>
 <div class="c h2" style="top:770px;font-size:44px;opacity:.75">שווי השוק <span class="num">$${D.mcap_tn}T</span> · שינוי ב-24 שעות</div>
 <div class="cards" style="top:860px">${box('ביטקוין', btc)}${box('את׳ריום', eth)}</div>
 <div class="hm">${heat(D.coins)}</div>
 <div class="foot" style="top:1650px">אין לראות בתוכן ייעוץ השקעות · נתונים: <span class="num">CoinGecko · CoinPaprika</span></div>
 <div class="vig"></div><div class="grain"></div>`;
document.body.appendChild(el); window.READY = true;
</script></body></html>'''
open('story.html', 'w', encoding='utf-8').write(html)
print('ok')
