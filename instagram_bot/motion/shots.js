const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + process.argv[2]); await p.waitForFunction(() => window.READY === true);
  const ts = process.argv[4].split(',').map(Number);
  for (const t of ts) { await p.evaluate(t => renderAt(t), t); await p.screenshot({ path: `${process.argv[3]}/s_${t}.jpg`, type: 'jpeg', quality: 80 }); }
  await b.close();
})();
