// Provably-fair dice (commit–reveal).
//
// 1. Before the match the server draws a secret serverSeed and publishes
//    commitment = SHA256(serverSeed). It cannot change the seed afterwards.
// 2. Each player contributes a clientSeed; the combined clientSeed is
//    SHA256(seedA + ':' + seedB) — the server cannot predict it in advance
//    of the players, and the players cannot predict the server seed.
// 3. Roll r of game/round g = first two unbiased values from
//    HMAC_SHA256(serverSeed, `${clientSeed}:${g}:${r}`), bytes < 252 mapped to 1..6
//    (rejection sampling → exactly uniform).
// 4. At match end serverSeed is revealed; anyone can recompute every roll.
import crypto from 'node:crypto';

export function newServerSeed() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  return { serverSeed, commitment: sha256(serverSeed) };
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function combineClientSeeds(seeds) {
  return sha256(seeds.map((x) => String(x ?? '')).join(':'));
}

export function rollAt(serverSeed, clientSeed, gameKey, rollIndex) {
  const out = [];
  for (let k = 0; out.length < 2; k++) {
    const msg = k === 0 ? `${clientSeed}:${gameKey}:${rollIndex}` : `${clientSeed}:${gameKey}:${rollIndex}:${k}`;
    const bytes = crypto.createHmac('sha256', serverSeed).update(msg).digest();
    for (const b of bytes) {
      if (b < 252) out.push((b % 6) + 1);
      if (out.length === 2) break;
    }
  }
  return out;
}

export function gameDiceFactory(serverSeed, clientSeed) {
  return (gameKey) => (rollIndex) => rollAt(serverSeed, clientSeed, gameKey, rollIndex);
}

export function verifyCommitment(serverSeed, commitment) {
  return sha256(serverSeed) === commitment;
}
