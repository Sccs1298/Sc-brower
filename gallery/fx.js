/* אפקטים מרחוק בטלפון של הצופה ("רוח רפאים"): הקוסם שולח פקודה, והמסך של הצופה מגיב.
   #crack = מסך מנופץ, #fix = המסך חוזר לקדמותו. מילים רגילות מטופלות בדף עצמו (הקלדה לבד). */
(function () {
  var el = null;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function crack() {
    fix();
    var W = innerWidth, H = innerHeight, cx = rnd(W * .3, W * .7), cy = rnd(H * .45, H * .75), R = Math.hypot(W, H);
    var lines = [], rays = [], n = 22 + (Math.random() * 7 | 0);
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + rnd(-.15, .15), x = cx, y = cy, pts = [[x, y]], d = 0;
      while (d < R) { var st = rnd(18, 70); d += st; a += rnd(-.22, .22); x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d; pts.push([x, y]); }
      rays.push(pts);
      lines.push('M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L'));
      if (Math.random() < .6) { var k = 2 + (Math.random() * (pts.length - 3) | 0), p = pts[k], b = a + rnd(-1, 1), L = rnd(30, 120); lines.push('M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + 'L' + (p[0] + Math.cos(b) * L).toFixed(1) + ' ' + (p[1] + Math.sin(b) * L).toFixed(1)); }
    }
    [1, 2, 4, 7, 11].forEach(function (ring) { // טבעות שמחברות בין הקרניים, כמו זכוכית אמיתית
      var seg = rays.map(function (r) { return r[Math.min(ring, r.length - 1)]; });
      for (var j = 0; j < seg.length; j++) if (Math.random() < .75) { var p1 = seg[j], p2 = seg[(j + 1) % seg.length]; lines.push('M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'L' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1)); }
    });
    var path = lines.join(' ');
    el = document.createElement('div');
    el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;pointer-events:auto;background:radial-gradient(circle at ' + cx + 'px ' + cy + 'px, rgba(0,0,0,.28), rgba(0,0,0,.08) 22%, rgba(0,0,0,.14))');
    el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 ' + W + ' ' + H + '" style="position:absolute;inset:0;width:100%;height:100%;max-width:none"><path d="' + path + '" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="2.2" transform="translate(-.8 -.8)"/><path d="' + path + '" fill="none" stroke="rgba(20,20,24,.78)" stroke-width="1.2"/><circle cx="' + cx + '" cy="' + cy + '" r="14" fill="rgba(30,30,34,.55)"/><circle cx="' + cx + '" cy="' + cy + '" r="6" fill="rgba(255,255,255,.9)"/></svg>';
    document.body.appendChild(el);
    try { if (navigator.vibrate) navigator.vibrate([120, 40, 60]); } catch (e) {}
    try { // צליל זכוכית נשברת: רעש קצר שדועך
      var ac = new (window.AudioContext || window.webkitAudioContext)(), len = ac.sampleRate * .6, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var s = 0; s < len; s++) d[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / len, 3) * (s % 900 < 300 ? 1 : .4);
      var src = ac.createBufferSource(), f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; src.buffer = buf; src.connect(f); f.connect(ac.destination); src.start();
    } catch (e) {}
  }
  function fix() { if (el) { el.remove(); el = null; } }
  // סימון מילה בדף: הדף גולל לבד אל המילה ומדליק אותה (בלי מילה: מילה ארוכה אקראית מהערך)
  function mark(word) {
    var root = document.querySelector('article, main, .content, #content') || document.body, walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [], n;
    while ((n = walker.nextNode())) if (n.nodeValue.trim() && !/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) && n.parentNode.offsetParent !== null) nodes.push(n);
    var hit = null, w = String(word || '').trim();
    if (!w) { var pool = []; nodes.forEach(function (t) { (t.nodeValue.match(/[֐-׿A-Za-z]{6,}/g) || []).forEach(function (x) { pool.push(x); }); }); w = pool.length ? pool[Math.floor(Math.random() * pool.length)] : ''; }
    if (!w) return;
    for (var i = 0; i < nodes.length && !hit; i++) { var k = nodes[i].nodeValue.indexOf(w); if (k >= 0) hit = [nodes[i], k]; }
    if (!hit) return;
    var r = document.createRange(); r.setStart(hit[0], hit[1]); r.setEnd(hit[0], hit[1] + w.length);
    var m = document.createElement('mark'); m.setAttribute('style', 'background:transparent;color:inherit;border-radius:3px;transition:background 1.2s, box-shadow 1.2s;padding:0 1px');
    try { r.surroundContents(m); } catch (e) { return; }
    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { m.style.background = '#ffe066'; m.style.boxShadow = '0 0 0 3px #ffe066'; try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {} }, 1300);
  }
  window.GKFX = {
    crack: crack, fix: fix, mark: mark,
    listen: function (topic) {
      if (!topic || !window.EventSource) return;
      try {
        var es = new EventSource('https://ntfy.sh/' + topic + 'x/sse?since=' + Math.floor(Date.now() / 1000));
        es.onmessage = function (e) { try { var m = JSON.parse(e.data); if (m.event !== 'message') return; if (m.message === '#crack') crack(); else if (m.message === '#fix') fix(); else if (m.message.indexOf('#mark:') === 0) mark(m.message.slice(6)); } catch (err) {} };
      } catch (e) {}
    }
  };
})();
