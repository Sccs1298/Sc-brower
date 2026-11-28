const $ = (s) => document.querySelector(s);
const ILS = (a) => '₪' + (a / 100).toLocaleString('he-IL');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let TOK = sessionStorage.getItem('adm') || '';
async function api(path, method = 'GET') {
  const r = await fetch(path, { method, headers: { authorization: 'Bearer ' + TOK } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
async function load() {
  try {
    const s = await api('/admin/stats');
    $('#login').hidden = true; $('#panel').hidden = false;
    $('#mode').textContent = s.realMoney ? `מצב כסף אמיתי: פעיל · אסמכתה: ${s.legalApprovalRef} · מסוף: ${s.paymentProvider}` : 'מצב כסף אמיתי: כבוי';
    $('#stats').innerHTML = `<table><tr><td>משתמשים</td><td>${s.users}</td></tr><tr><td>עמלות (₪)</td><td>${ILS(s.cash.houseRake)}</td></tr><tr><td>מס שנוכה</td><td>${ILS(s.cash.taxWithheld)}</td></tr><tr><td>ספרים מאוזנים</td><td>${s.cash.ledgerBalanced ? '✅' : '❌'}</td></tr><tr><td>התראות פתוחות</td><td>${s.openFlags.length}</td></tr></table>`;
    $('#kyc').innerHTML = s.cash.pendingKyc.length ? '<table>' + s.cash.pendingKyc.map((k) => `<tr><td>${esc(k.name)}</td><td>${esc(k.fullName)} · ת"ז ••${esc(k.idLast3)}</td><td><button data-kyc="${k.id}" data-a="1">אשר</button> <button class="r" data-kyc="${k.id}" data-a="0">דחה</button></td></tr>`).join('') + '</table>' : '<p class="muted">אין.</p>';
    $('#wd').innerHTML = s.cash.pendingWithdrawals.length ? '<table>' + s.cash.pendingWithdrawals.map((w) => `<tr><td>${esc(w.payeeName)}</td><td>${ILS(w.amount)}</td><td>${new Date(w.at).toLocaleString('he-IL')}</td><td><button data-wd="${w.id}" data-a="1">שולם</button> <button class="r" data-wd="${w.id}" data-a="0">בטל</button></td></tr>`).join('') + '</table>' : '<p class="muted">אין.</p>';
    const v = await api('/admin/vouchers');
    $('#codes').innerHTML = v.length ? '<table>' + v.slice(-20).reverse().map((c) => `<tr><td>••${esc(c.last4)}</td><td>${ILS(c.amount)}</td><td>${c.status === 'used' ? 'נוצל' : 'פעיל'}</td><td>${esc(c.note)}</td></tr>`).join('') + '</table>' : '<p class="muted">אין עדיין.</p>';
    users();
  } catch (e) { $('#login').hidden = false; $('#panel').hidden = true; if (TOK) alert('כניסה נכשלה: ' + e.message); }
}
async function users() {
  const list = await api('/admin/users?q=' + encodeURIComponent($('#q').value));
  $('#users').innerHTML = '<table><tr><th>כינוי</th><th>אימות</th><th>₪</th><th>נקודות</th><th>משחקים</th></tr>' + list.map((u) => `<tr><td>${esc(u.name)}</td><td>${{ verified: '✅', pending: '⏳', rejected: '❌', none: '—' }[u.kyc]}</td><td>${ILS(u.cash)}</td><td>${u.points}</td><td>${u.games}</td></tr>`).join('') + '</table>';
}
$('#go').onclick = () => { TOK = $('#tok').value.trim(); sessionStorage.setItem('adm', TOK); load(); };
$('#qs').onclick = users;
$('#mk').onclick = async () => {
  try {
    let userParam = '';
    const n = $('#vuser').value.trim();
    if (n) { const l = await api('/admin/users?q=' + encodeURIComponent(n)); const u = l.find((x) => x.name === n) || l[0]; if (!u) throw new Error('שחקן לא נמצא'); userParam = '&user=' + u.id; }
    const v = await api(`/admin/voucher?amount=${Math.round(Number($('#amt').value) * 100)}&days=14${userParam}&note=${encodeURIComponent($('#note').value)}`, 'POST');
    $('#newcode').innerHTML = `<p>שלח לשחקן את הקוד (מוצג פעם אחת):</p><div class="code">${esc(v.code)}</div>`;
    load();
  } catch (e) { alert(e.message); }
};
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-kyc],button[data-wd]'); if (!b) return;
  try {
    if (b.dataset.kyc) await api(`/admin/kyc?user=${b.dataset.kyc}&approve=${b.dataset.a}`, 'POST');
    else await api(`/admin/withdrawal?id=${b.dataset.wd}&approve=${b.dataset.a}`, 'POST');
    load();
  } catch (err) { alert(err.message); }
});
if (TOK) load();
