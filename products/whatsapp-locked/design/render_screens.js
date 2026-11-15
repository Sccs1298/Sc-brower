// node render_screens.js [id ...]  — draw the illustrated phone screens from screens.json into shots/<id>.png
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname;
  const specs = JSON.parse(fs.readFileSync(path.join(dir, 'screens.json'), 'utf8'));
  const only = process.argv.slice(2);
  const tpl = fs.readFileSync(path.join(dir, 'screens.html'), 'utf8');
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 3 });
  for (const [id, spec] of Object.entries(specs)) {
    if (only.length && !only.includes(id)) continue;
    const tmp = path.join(dir, '_screen.html');
    fs.writeFileSync(tmp, tpl.replace('__SPEC__', JSON.stringify(spec)));
    await p.goto('file://' + tmp);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(dir, 'shots', id + '.png'), omitBackground: true });
    console.log(id);
  }
  fs.rmSync(path.join(dir, '_screen.html'), { force: true });
  await b.close();
})();
