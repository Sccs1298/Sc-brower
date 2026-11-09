// Render HTML motion-graphics scenes to JPEG frame sequences (30fps) with Playwright.
// node capture_scenes.js <scene.html> <out_dir> '<[[scene,dur],...]>' '<{"KEY":"value"}>'
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [html, out, planJ, subsJ] = process.argv.slice(2);
(async () => {
  let src = fs.readFileSync(html, 'utf8');
  for (const [k, v] of Object.entries(JSON.parse(subsJ))) src = src.split(k).join(v);
  fs.mkdirSync(out, { recursive: true });
  const tmp = path.join(out, '_scene.html'); fs.writeFileSync(tmp, src);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.goto('file://' + tmp); await pg.waitForTimeout(800);
  for (const [name, dur] of JSON.parse(planJ)) {
    const d = path.join(out, name); fs.mkdirSync(d, { recursive: true });
    const n = Math.round(dur * 30) + 1;
    for (let i = 0; i < n; i++) {
      await pg.evaluate(([s, t, du]) => setT(s, t, du), [name, i / 30, dur]);
      await pg.screenshot({ path: path.join(d, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    }
    console.log(name, n, 'frames');
  }
  await b.close();
})();
