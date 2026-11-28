// Builds the standalone game (engine inlined) from play/template.html.
//   public/play.html      full HTML document, served by the server at /play.html
//   dist/play-artifact.html  body fragment for hosting as a single-file page
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let engine = '';
for (const f of ['board.js', 'game.js', 'bot.js']) {
  let s = fs.readFileSync(path.join(root, 'src/engine', f), 'utf8');
  s = s.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export \{[^}]*\};\n/gm, '').replace(/^export /gm, '');
  engine += `// ---- engine/${f} ----\n${s}\n`;
}
const tpl = fs.readFileSync(path.join(root, 'play/template.html'), 'utf8');
const icons = fs.readFileSync(path.join(root, 'play/icons.json'), 'utf8');
const body = tpl.replace('/*ENGINE*/', () => engine).replace('/*ICONSDATA*/', () => `const ICONS = ${icons};`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/play-artifact.html'), body);
fs.writeFileSync(path.join(root, 'public/play.html'), `<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
console.log('built public/play.html and dist/play-artifact.html', (body.length / 1024).toFixed(0) + 'KB');
