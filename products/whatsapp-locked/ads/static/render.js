// Render the three static ads (1080x1350) from ads.html into <repo>/out/ads/.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.goto('file://' + path.join(__dirname, 'ads.html')); await p.waitForTimeout(500);
  for (const id of ['chat', 'night', 'quiz'])
    await (await p.$('#' + id)).screenshot({ path: path.join(__dirname, '../../../../out/ads', 'static-' + id + '.png') });
  await b.close();
})();
