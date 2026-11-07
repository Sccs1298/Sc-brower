// Usage: node record.js <outDir>  — renders 9:16 + 4:5 MP4 ads and a GIF from ad.html
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || 'out');
fs.mkdirSync(OUT, { recursive: true });

async function render(b, w, h, name) {
  const dir = path.join(OUT, name + '_frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const p = await b.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'ad.html') + `?w=${w}&h=${h}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  await p.evaluate(() => setup());
  const n = await p.evaluate(() => FRAMES);
  for (let i = 0; i < n; i++) {
    const d = await p.evaluate(i => renderFrame(i), i);
    fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(d.split(',')[1], 'base64'));
  }
  await p.close();
  const mp4 = path.join(OUT, `klaro_${name}.mp4`);
  execSync(`ffmpeg -loglevel error -y -framerate 30 -i ${dir}/%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart ${mp4}`);
  return { dir, mp4 };
}

(async () => {
  const b = await chromium.launch();
  const v = await render(b, 1080, 1920, '9x16');
  await render(b, 1080, 1350, '4x5');
  await b.close();
  execSync(`ffmpeg -loglevel error -y -i ${v.mp4} -vf "fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" ${OUT}/klaro_demo.gif`);
  for (const d of fs.readdirSync(OUT)) if (d.endsWith('_frames')) fs.rmSync(path.join(OUT, d), { recursive: true });
  console.log('done', fs.readdirSync(OUT));
})();
