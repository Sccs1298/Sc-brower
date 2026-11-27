const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function rollAt(serverSeed, clientSeed, gameKey, r) {
  const out = [];
  for (let k = 0; out.length < 2; k++) {
    const msg = k === 0 ? `${clientSeed}:${gameKey}:${r}` : `${clientSeed}:${gameKey}:${r}:${k}`;
    for (const b of await hmac(serverSeed, msg)) { if (b < 252) out.push((b % 6) + 1); if (out.length === 2) break; }
  }
  return out;
}
const out = document.getElementById('out');
const line = (t, ok) => { const p = document.createElement('p'); p.textContent = (ok === undefined ? '' : ok ? '✅ ' : '❌ ') + t; out.append(p); };
async function verify(id) {
  out.replaceChildren();
  const res = await fetch(`/api/verify?id=${encodeURIComponent(id)}`);
  if (!res.ok) { line('משחק לא נמצא (או שעדיין לא הסתיים)', false); return; }
  const v = await res.json();
  const { serverSeed, commitment, clientSeed } = v.fairness;
  line(`התחייבות: ${commitment}`);
  line(`זרע שרת: ${serverSeed}`);
  line('SHA256(זרע השרת) תואם להתחייבות', (await sha256(serverSeed)) === commitment);
  const keys = [...new Set(v.games.map((g) => g.round))];
  let allOk = true;
  for (const g of v.games) {
    // Recompute the full stream; the opening skips doubles, so match game dice as a subsequence.
    const stream = [];
    for (let r = 0; r < g.rolls; r++) stream.push(await rollAt(serverSeed, clientSeed, g.round, r));
    let j = 0;
    for (const d of g.dice) {
      while (j < stream.length && (stream[j][0] !== d[0] || stream[j][1] !== d[1])) j++;
      if (j >= stream.length) { allOk = false; break; }
      j++;
    }
    line(`${v.kind === 'duplicate' ? `סבב ${g.round + 1} לוח ${g.board + 1}` : `משחק ${g.round + 1}`}: ${g.dice.length} הטלות אומתו`, j <= stream.length && allOk);
  }
  if (v.kind === 'duplicate') line(`בשש בש כפול שני הלוחות של כל סבב משתמשים באותו רצף (${keys.length} סבבים).`);
  line(allOk ? 'כל ההטלות אומתו בהצלחה' : 'נמצאה אי-התאמה!', allOk);
}
document.getElementById('go').addEventListener('click', () => verify(document.getElementById('mid').value.trim()));
const q = new URLSearchParams(location.search).get('id');
if (q) { document.getElementById('mid').value = q; verify(q); }
