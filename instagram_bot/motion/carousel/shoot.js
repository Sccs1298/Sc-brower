// מצלם כל שקף בקרוסלה ל-JPG 1080x1350.   node shoot.js carousel.html OUT_DIR
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [page_, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1400 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(page_));
  await p.waitForFunction(() => window.READY === true);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const n = await p.evaluate(() => document.querySelectorAll('.slide').length);
  for (let i = 1; i <= n; i++) {
    await (await p.$('#s' + i)).screenshot({ path: `${out}/${i}.jpg`, type: 'jpeg', quality: 95 });
  }
  console.log('slides', n);
  await b.close();
})();
