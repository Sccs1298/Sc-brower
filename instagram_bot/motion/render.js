// מרנדר עמוד HTML מונפש לווידאו, פריים-פריים (דטרמיניסטי).
//   node instagram_bot/motion/render.js page.html out_silent.mp4 TOTAL_SECONDS [fps]
// העמוד חייב לחשוף window.renderAt(t) (שניות). כל פריים: renderAt → צילום → ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const [page_, out, totalS, fpsS] = process.argv.slice(2);
  const fps = parseInt(fpsS || '30', 10), total = parseFloat(totalS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(page_));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(total * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.renderAt(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) process.stderr.write(`frame ${i}/${n}\n`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
})();
