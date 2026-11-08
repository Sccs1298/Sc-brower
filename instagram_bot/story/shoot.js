// node shoot.js OUT.jpg  – מצלם את story.html ל-1080x1920
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => { console.log('ERR', e.message); process.exitCode = 1; });
  await p.goto('file://' + path.join(__dirname, 'story.html'));
  await p.waitForFunction(() => window.READY === true); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: process.argv[2], type: 'jpeg', quality: 93 }); await b.close();
})();
