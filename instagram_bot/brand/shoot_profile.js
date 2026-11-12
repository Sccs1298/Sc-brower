// node shoot_profile.js OUT_DIR – מצלם p1..p3 ל-1080x1080
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1080 } });
  await p.goto('file://' + path.join(__dirname, 'profile.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  for (const id of ['p1', 'p2', 'p3']) await (await p.$('#' + id)).screenshot({ path: `${process.argv[2]}/${id}.png` });
  await b.close();
})();
