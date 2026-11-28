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
const b64 = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'play/assets', f)).toString('base64');
const TEX = { walnut: b64('walnut.jpg'), ash: b64('ash.jpg'), cherry: b64('cherry.jpg') };
const AVATARS = fs.readFileSync(path.join(root, 'play/assets/avatars.json'), 'utf8');
const LUCIDE_NAMES = ['volume-2', 'volume-x', 'ticket', 'users', 'search', 'wallet', 'key-round', 'swords', 'target', 'scale', 'star', 'award', 'palette', 'coins', 'shield', 'badge-check', 'lock', 'hourglass'];
const LUCIDE = {};
for (const n of LUCIDE_NAMES) {
  const svg = fs.readFileSync(path.join(root, 'node_modules/lucide-static/icons', n + '.svg'), 'utf8');
  LUCIDE[n] = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
}
const assets = `const TEX = ${JSON.stringify(TEX)};\nconst AVATARS = ${AVATARS};\nconst LUCIDE = ${JSON.stringify(LUCIDE)};`;
const body = tpl.replace('/*ENGINE*/', () => engine).replace('/*ICONSDATA*/', () => `const ICONS = ${icons};\n${assets}`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/play-artifact.html'), body);
fs.writeFileSync(path.join(root, 'public/play.html'), `<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
console.log('built public/play.html and dist/play-artifact.html', (body.length / 1024).toFixed(0) + 'KB');
