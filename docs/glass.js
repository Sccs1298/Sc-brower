/* KLARO — rainy oily windshield renderer (original, procedural).
   new Glass(canvas, {interactive, onProgress}) */
(function () {
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  function drawCity(c, w, h) {
    var r = rng(7), hz = h * 0.56, lights = [];
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#040912'); g.addColorStop(0.45, '#0d1f35'); g.addColorStop(0.56, '#1b2a3d'); g.addColorStop(1, '#07090c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // far buildings
    var s = w / 400;
    for (var layer = 0; layer < 2; layer++) {
      var x = -10;
      while (x < w) {
        var bw = (26 + r() * 60) * s, bh = (layer ? 40 + r() * 110 : 80 + r() * 160) * s;
        c.fillStyle = layer ? '#0b1626' : '#08111d';
        c.fillRect(x, hz - bh, bw, bh + 2);
        for (var wy = hz - bh + 6 * s; wy < hz - 6 * s; wy += 9 * s)
          for (var wx = x + 4 * s; wx < x + bw - 6 * s; wx += 8 * s)
            if (r() < 0.32) {
              c.fillStyle = r() < 0.75 ? 'rgba(255,205,120,' + (0.35 + r() * 0.6) + ')' : 'rgba(150,210,255,' + (0.3 + r() * 0.5) + ')';
              c.fillRect(wx, wy, 3.2 * s, 4.2 * s);
            }
        x += bw + (layer ? 4 : 10) * s;
      }
    }
    // road
    c.fillStyle = '#101317';
    c.beginPath(); c.moveTo(w * 0.42, hz); c.lineTo(w * 0.58, hz); c.lineTo(w * 1.25, h); c.lineTo(-w * 0.25, h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3 * s;
    for (var i = 0; i < 7; i++) {
      var t0 = Math.pow(i / 7, 1.8), t1 = Math.pow((i + 0.45) / 7, 1.8);
      c.beginPath(); c.moveTo(w / 2, hz + (h - hz) * t0); c.lineTo(w / 2, hz + (h - hz) * t1); c.lineWidth = (1 + 7 * t1) * s; c.stroke();
    }
    c.strokeStyle = 'rgba(242,201,76,.8)'; c.lineWidth = 3 * s;
    c.beginPath(); c.moveTo(w * 0.43, hz); c.lineTo(-w * 0.1, h); c.stroke();
    // light sources
    function L(x, y, rad, col, kind) { lights.push({ x: x, y: y, r: rad, c: col, k: kind }); }
    L(w * 0.12, h * 0.2, 34 * s, '255,200,120', 'lamp'); L(w * 0.86, h * 0.17, 38 * s, '255,200,120', 'lamp');
    L(w * 0.3, h * 0.36, 20 * s, '255,200,120', 'lamp'); L(w * 0.7, h * 0.35, 22 * s, '255,200,120', 'lamp');
    L(w * 0.555, hz + 10 * s, 13 * s, '255,250,235', 'head'); L(w * 0.605, hz + 10 * s, 13 * s, '255,250,235', 'head');
    L(w * 0.61, hz + 48 * s, 26 * s, '255,250,235', 'head'); L(w * 0.72, hz + 48 * s, 26 * s, '255,250,235', 'head');
    L(w * 0.38, hz + 26 * s, 10 * s, '255,40,50', 'tail'); L(w * 0.445, hz + 26 * s, 10 * s, '255,40,50', 'tail');
    L(w * 0.2, h * 0.47, 9 * s, '60,255,140', 'sig');
    // poles
    c.fillStyle = '#1a222c';
    [[0.12, 0.2], [0.86, 0.17]].forEach(function (p) { c.fillRect(w * p[0] - 2 * s, h * p[1], 4 * s, hz - h * p[1] + 20 * s); });
    // car silhouettes
    c.fillStyle = '#0b0e12';
    c.fillRect(w * 0.35, hz + 14 * s, w * 0.12, 20 * s); c.fillRect(w * 0.585, hz + 30 * s, w * 0.16, 30 * s);
    // sign
    c.fillStyle = '#126b42'; c.fillRect(w * 0.06, h * 0.06, 120 * s, 30 * s);
    c.strokeStyle = '#e8f5ee'; c.lineWidth = 1.5 * s; c.strokeRect(w * 0.06 + 3 * s, h * 0.06 + 3 * s, 114 * s, 24 * s);
    c.fillStyle = '#fff'; c.font = '700 ' + (14 * s) + 'px Heebo, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.direction = 'rtl'; c.fillText('תל אביב 12 ←', w * 0.06 + 60 * s, h * 0.06 + 16 * s);
    lights.forEach(function (l) {
      var gg = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(0.25, 'rgba(' + l.c + ',.95)'); gg.addColorStop(1, 'rgba(' + l.c + ',0)');
      c.fillStyle = gg; c.beginPath(); c.arc(l.x, l.y, l.r, 0, 7); c.fill();
    });
    return lights;
  }

  function makeDirty(sharp, lights, w, h) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    var sm = document.createElement('canvas'); sm.width = Math.max(8, w / 16 | 0); sm.height = Math.max(8, h / 16 | 0);
    var sc = sm.getContext('2d'); sc.imageSmoothingEnabled = true; sc.drawImage(sharp, 0, 0, sm.width, sm.height);
    var md = document.createElement('canvas'); md.width = w / 5 | 0; md.height = h / 5 | 0;
    md.getContext('2d').drawImage(sm, 0, 0, md.width, md.height);
    c.imageSmoothingEnabled = true; c.drawImage(md, 0, 0, w, h);
    c.fillStyle = 'rgba(160,180,200,.16)'; c.fillRect(0, 0, w, h);
    var s = w / 400;
    // glare blooms + starbursts
    c.globalCompositeOperation = 'lighter';
    lights.forEach(function (l) {
      var R = l.r * 3.2, gg = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, R);
      gg.addColorStop(0, 'rgba(' + l.c + ',.55)'); gg.addColorStop(1, 'rgba(' + l.c + ',0)');
      c.fillStyle = gg; c.beginPath(); c.arc(l.x, l.y, R, 0, 7); c.fill();
      for (var k = 0; k < 6; k++) {
        var a = k * Math.PI / 6 + 0.3, len = l.r * (4 + (k % 2) * 3);
        var lg = c.createLinearGradient(l.x - Math.cos(a) * len, l.y - Math.sin(a) * len, l.x + Math.cos(a) * len, l.y + Math.sin(a) * len);
        lg.addColorStop(0, 'rgba(' + l.c + ',0)'); lg.addColorStop(0.5, 'rgba(' + l.c + ',.35)'); lg.addColorStop(1, 'rgba(' + l.c + ',0)');
        c.strokeStyle = lg; c.lineWidth = 1.6 * s; c.beginPath();
        c.moveTo(l.x - Math.cos(a) * len, l.y - Math.sin(a) * len); c.lineTo(l.x + Math.cos(a) * len, l.y + Math.sin(a) * len); c.stroke();
      }
    });
    c.globalCompositeOperation = 'source-over';
    // wiper smear arcs
    var r = rng(3), px = w / 2, py = h * 1.15;
    for (var i = 0; i < 70; i++) {
      var rad = h * (0.35 + r() * 0.85), a0 = Math.PI * (1.1 + r() * 0.25), a1 = Math.PI * (1.65 + r() * 0.25);
      c.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,' + (0.03 + r() * 0.07) + ')' : 'rgba(190,220,255,' + (0.03 + r() * 0.06) + ')';
      c.lineWidth = (1 + r() * 6) * s; c.beginPath(); c.arc(px, py, rad, a0, a1); c.stroke();
    }
    // greasy rainbow film
    var og = c.createLinearGradient(0, 0, w, h);
    og.addColorStop(0, 'rgba(255,200,150,.06)'); og.addColorStop(0.5, 'rgba(150,220,255,.07)'); og.addColorStop(1, 'rgba(230,180,255,.06)');
    c.fillStyle = og; c.fillRect(0, 0, w, h);
    return cv;
  }

  function Glass(canvas, opts) {
    opts = opts || {};
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.opts = opts; this.drops = []; this.t = 0; this.running = false; this.clean = 0;
    this.sponge = null;
    this.resize();
    var self = this;
    if (opts.interactive) {
      var down = false, last = null;
      function pos(e) { var b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) * self.dpr, y: (e.clientY - b.top) * self.dpr }; }
      canvas.addEventListener('pointerdown', function (e) { down = true; last = pos(e); self.userTouched = true; self.wipe(last.x, last.y); try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
      canvas.addEventListener('pointermove', function (e) {
        var p = pos(e);
        if (down || e.pointerType === 'mouse') { if (e.pointerType === 'mouse' && !down) { self.userTouched = true; } self.stroke(last || p, p); }
        last = p;
      });
      window.addEventListener('pointerup', function () { down = false; last = null; });
      canvas.addEventListener('pointerleave', function () { last = null; });
    }
    var ro = window.ResizeObserver ? new ResizeObserver(function () { self.resize(); }) : null;
    if (ro) ro.observe(canvas);
  }

  Glass.prototype.resize = function () {
    var b = this.cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(200, Math.round(b.width * dpr)), h = Math.max(150, Math.round(b.height * dpr));
    if (w === this.w && h === this.h) return;
    this.dpr = dpr; this.w = w; this.h = h; this.cv.width = w; this.cv.height = h;
    this.sharp = document.createElement('canvas'); this.sharp.width = w; this.sharp.height = h;
    var lights = drawCity(this.sharp.getContext('2d'), w, h);
    this.dirty = makeDirty(this.sharp, lights, w, h);
    this.mask = document.createElement('canvas'); this.mask.width = w; this.mask.height = h;
    this.tmp = document.createElement('canvas'); this.tmp.width = w; this.tmp.height = h;
    this.GX = 40; this.GY = Math.max(10, Math.round(40 * h / w));
    this.reset();
    this.brush = Math.max(w, h) * 0.075;
  };

  Glass.prototype.reset = function () {
    var m = this.mask.getContext('2d');
    m.globalCompositeOperation = 'source-over'; m.fillStyle = '#000'; m.fillRect(0, 0, this.w, this.h);
    this.grid = new Float32Array(this.GX * this.GY).fill(1);
    this.drops = []; this.clean = 0; this.celebrated = false;
    for (var i = 0; i < this.w * this.h / 2600; i++) this.spawn(true);
  };

  Glass.prototype.dirtAt = function (x, y) {
    var gx = Math.min(this.GX - 1, Math.max(0, x / this.w * this.GX | 0)), gy = Math.min(this.GY - 1, Math.max(0, y / this.h * this.GY | 0));
    return this.grid[gy * this.GX + gx];
  };

  Glass.prototype.wipe = function (x, y, r) {
    r = r || this.brush;
    var m = this.mask.getContext('2d');
    m.globalCompositeOperation = 'destination-out';
    var g = m.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = g; m.beginPath(); m.arc(x, y, r, 0, 7); m.fill();
    var cw = this.w / this.GX, ch = this.h / this.GY, sum = 0;
    for (var gy = 0; gy < this.GY; gy++) for (var gx = 0; gx < this.GX; gx++) {
      var cx = (gx + 0.5) * cw, cy = (gy + 0.5) * ch, d = Math.hypot(cx - x, cy - y) / r;
      var i = gy * this.GX + gx;
      if (d < 1) this.grid[i] = Math.min(this.grid[i], Math.max(0, d * d * 1.2 - 0.2));
      sum += this.grid[i];
    }
    this.clean = 1 - sum / (this.GX * this.GY);
    // wiped drops disappear
    var self = this;
    this.drops = this.drops.filter(function (d) { return Math.hypot(d.x - x, d.y - y) > r * 0.8; });
    if (this.opts.onProgress) this.opts.onProgress(this.clean);
  };

  Glass.prototype.clearAll = function () {
    if (this.clean > 0.999) return;
    this.mask.getContext('2d').clearRect(0, 0, this.w, this.h);
    this.grid.fill(0); this.clean = 1;
    if (this.opts.onProgress) this.opts.onProgress(1);
  };

  Glass.prototype.stroke = function (a, b) {
    var d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / (this.brush * 0.3)));
    for (var i = 1; i <= n; i++) this.wipe(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n);
  };

  Glass.prototype.spawn = function (anywhere) {
    var s = this.w / 400;
    this.drops.push({ x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : Math.random() * this.h * 0.9,
      r: (1.2 + Math.pow(Math.random(), 2.5) * 5) * s * (this.dpr > 1 ? 1 : 0.8), v: 0, life: 1, slide: Math.random() < 0.08 });
  };

  Glass.prototype.frame = function (dt) {
    var c = this.ctx, w = this.w, h = this.h, s = w / 400;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.sharp, 0, 0);
    var t = this.tmp.getContext('2d');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, w, h);
    t.drawImage(this.mask, 0, 0);
    t.globalCompositeOperation = 'source-in'; t.drawImage(this.dirty, 0, 0);
    c.drawImage(this.tmp, 0, 0);
    // rain
    var rate = this.opts.rain === 0 ? 0 : (this.opts.rain || 1);
    for (var k = 0; k < rate * 3; k++) if (Math.random() < 0.6) this.spawn(false);
    var keep = [];
    for (var i = 0; i < this.drops.length; i++) {
      var d = this.drops[i], dirt = this.dirtAt(d.x, d.y);
      if (dirt < 0.35) { d.life -= 0.06; d.v += 0.6 * s; d.r *= 0.97; }
      else if (d.slide || d.r > 4.5 * s) { d.v = Math.min(d.v + 0.04 * s, 2.2 * s); }
      d.y += d.v;
      if (d.life <= 0 || d.y > h + 10 || d.r < 0.4) continue;
      keep.push(d);
      var a = d.life * (dirt < 0.35 ? 0.5 : 1);
      if (d.v > 0.5 * s && dirt >= 0.35) { c.strokeStyle = 'rgba(200,220,240,' + 0.12 * a + ')'; c.lineWidth = d.r * 0.9; c.beginPath(); c.moveTo(d.x, d.y - d.r * 6); c.lineTo(d.x, d.y); c.stroke(); }
      var g = c.createRadialGradient(d.x - d.r * 0.35, d.y - d.r * 0.4, d.r * 0.1, d.x, d.y, d.r);
      g.addColorStop(0, 'rgba(255,255,255,' + 0.85 * a + ')'); g.addColorStop(0.35, 'rgba(210,230,255,' + 0.22 * a + ')');
      g.addColorStop(0.85, 'rgba(10,20,35,' + 0.35 * a + ')'); g.addColorStop(1, 'rgba(255,255,255,' + 0.25 * a + ')');
      c.fillStyle = g; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill();
    }
    var max = w * h / 1500;
    this.drops = keep.length > max ? keep.slice(keep.length - max) : keep;
    if (this.sponge) this.drawSponge(this.sponge.x, this.sponge.y, this.sponge.a || 0);
  };

  Glass.prototype.drawSponge = function (x, y, a) {
    var c = this.ctx, s = this.w / 400 * 1.1;
    c.save(); c.translate(x, y); c.rotate(a);
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16 * s; c.shadowOffsetY = 6 * s;
    c.fillStyle = '#1d2a36'; this.rr(c, -26 * s, 4 * s, 52 * s, 34 * s, 8 * s); c.fill();
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    var g = c.createLinearGradient(0, -28 * s, 0, 8 * s); g.addColorStop(0, '#d4ff4a'); g.addColorStop(1, '#8fc000');
    c.fillStyle = g; this.rr(c, -34 * s, -26 * s, 68 * s, 34 * s, 12 * s); c.fill();
    c.strokeStyle = 'rgba(80,110,0,.5)'; c.lineWidth = 1.5 * s;
    for (var i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-28 * s, (-9 + i * 8) * s); c.lineTo(28 * s, (-9 + i * 8) * s); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.7)';
    for (i = 0; i < 6; i++) { c.beginPath(); c.arc((-24 + i * 10) * s, 10 * s + Math.sin(this.t / 90 + i) * 2 * s, 2.5 * s, 0, 7); c.fill(); }
    c.restore();
  };
  Glass.prototype.rr = function (c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

  Glass.prototype.start = function () {
    if (this.running) return; this.running = true;
    var self = this, last = performance.now();
    function loop(now) { if (!self.running) return; self.t = now; self.frame(now - last); last = now; if (self.onTick) self.onTick(now); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  };
  Glass.prototype.stop = function () { this.running = false; };

  // serpentine sponge path in normalized coords
  Glass.path = function (rows) {
    rows = rows || 5; var pts = [];
    for (var r = 0; r < rows; r++) {
      var y = 0.12 + r * (0.78 / (rows - 1));
      for (var i = 0; i <= 40; i++) {
        var t = i / 40, x = r % 2 ? 0.92 - t * 0.84 : 0.08 + t * 0.84;
        pts.push([x, y + Math.sin(t * Math.PI * 6) * 0.035]);
      }
    }
    return pts;
  };

  window.Glass = Glass;
})();
