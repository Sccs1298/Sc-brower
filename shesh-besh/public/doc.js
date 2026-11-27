// Tiny, safe Markdown renderer (headings, lists, tables, quotes, bold, code, links). Escapes all HTML.
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|\.\/|#)[^)\s]*)\)/g, (m, t, u) => `<a href="${u.replace(/^\.\//, '/doc.html?f=')}" rel="noopener">${t}</a>`);
function render(md) {
  const lines = md.split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^#{1,6} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|$/.test(r)));
      out.push('<table>' + body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('') + '</table>');
      continue;
    }
    if (/^> /.test(l)) { const q = []; while (i < lines.length && /^> ?/.test(lines[i])) q.push(lines[i++].replace(/^> ?/, '')); out.push(`<blockquote>${q.map(inline).join('<br>')}</blockquote>`); continue; }
    if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ordered = /^\s*\d+\./.test(l); const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.) /, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    if (/^---+$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#|\||> |\s*([-*]|\d+\.) )/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
const f = new URLSearchParams(location.search).get('f') || 'terms.md';
if (!/^[\w.-]+\.md$/.test(f)) throw new Error('bad file');
fetch(`/docs/${f}`).then((r) => (r.ok ? r.text() : Promise.reject())).then((md) => {
  document.getElementById('doc').innerHTML = render(md);
  const h = document.querySelector('#doc h1'); if (h) document.title = h.textContent;
}).catch(() => { document.getElementById('doc').textContent = 'המסמך לא נמצא'; });
