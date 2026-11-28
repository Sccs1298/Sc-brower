import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import fs from 'node:fs';
const seeds = ['Avi','Noa','Yossi','Maya','Dani','Shira','Moshe','Tamar','Eli','Yael','Omer','Lior','Ronit','Gal','Itay','Hila','Ben','Dana','Amit','Keren'];
const bg = ['ffd5a8','c0e4ff','d1f2c4','ffd1dc','e8d9ff','fff0b3'];
const out = seeds.map((s, i) => createAvatar(avataaars, { seed: s, radius: 50, backgroundColor: [bg[i % bg.length]],
  mouth: ['smile', 'default', 'twinkle'], eyes: ['default', 'happy', 'wink', 'squint'], eyebrows: ['default', 'defaultNatural', 'raisedExcited', 'upDown'],
  facialHairProbability: 15, accessoriesProbability: 15 }).toString());
fs.writeFileSync('play/assets/avatars.json', JSON.stringify(out));
console.log(out.length);
