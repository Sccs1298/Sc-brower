// Tests for UTM Nav. Run with: npm install && npm test
//
// 1. The UTM math embedded in nav.html is checked against proj4.
// 2. The whole view script is run with stubbed watch functions, and button
//    presses and GPS updates are simulated.
// 3. All scripts are parsed as ES5, since older watch firmware may not
//    support newer JavaScript.

'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const proj4 = require('proj4');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'nav.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log('ok   ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + '\n     ' + e.message);
  }
};

const attr = (name) => {
  const m = html.match(new RegExp('\\s' + name + '="([^"]*)"'));
  if (!m) throw new Error('attribute ' + name + ' not found');
  return m[1];
};
const onLoadJs = attr('onLoad');
const onActivateJs = attr('onActivate');
const onDeactivateJs = attr('onDeactivate');
const mathJs = onLoadJs.split('/*MATH-START*/')[1].split('/*MATH-END*/')[0];

// ---------- ES5 and template-safety checks ----------

test('scripts parse as ES5', () => {
  for (const [name, src] of [['main.js', mainJs], ['onLoad', onLoadJs],
    ['onActivate', onActivateJs], ['onDeactivate', onDeactivateJs]]) {
    try {
      acorn.parse(src.replace(/\{zapp_index\}/g, '0'), { ecmaVersion: 5 });
    } catch (e) {
      throw new Error(name + ': ' + e.message);
    }
  }
});

test('no double curly braces in view scripts (template tokens)', () => {
  assert(!/\{\{/.test(onLoadJs + onActivateJs + onDeactivateJs));
});

test('no ES2015 Math functions used', () => {
  const all = mainJs + onLoadJs + onActivateJs;
  for (const f of ['sinh', 'cosh', 'tanh', 'atanh', 'asinh', 'hypot', 'trunc', 'sign', 'log10']) {
    assert(!new RegExp('Math\\.' + f + '\\b').test(all), 'uses Math.' + f);
  }
});

// ---------- UTM math against proj4 ----------

const math = new Function(mathJs + '\nreturn { utmToLatLon, latLonToUtm, distBearing, zoneOfLon };')();
const projFor = (zone) => '+proj=utm +zone=' + zone + ' +datum=WGS84 +units=m +no_defs';

test('forward UTM matches proj4 within 1 mm', () => {
  let worst = 0;
  for (let i = 0; i < 5000; i++) {
    const zone = 1 + Math.floor(Math.random() * 60);
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const lat = Math.random() * 80;
    const lon = lon0 - 3 + Math.random() * 6;
    const [e, n] = math.latLonToUtm(lat, lon, zone);
    const [pe, pn] = proj4('WGS84', projFor(zone), [lon, lat]);
    worst = Math.max(worst, Math.abs(e - pe), Math.abs(n - pn));
  }
  assert(worst < 0.001, 'worst error ' + worst + ' m');
});

test('inverse UTM matches proj4 within 1 mm', () => {
  let worst = 0;
  for (let i = 0; i < 5000; i++) {
    const zone = 1 + Math.floor(Math.random() * 60);
    const e = 200000 + Math.random() * 600000;
    const n = Math.random() * 8800000;
    const [lat, lon] = math.utmToLatLon(zone, e, n);
    const [pe, pn] = proj4('WGS84', projFor(zone), [lon, lat]);
    worst = Math.max(worst, Math.abs(e - pe), Math.abs(n - pn));
  }
  assert(worst < 0.001, 'worst error ' + worst + ' m');
});

test('Israel example: Jerusalem old city in zone 36', () => {
  const lat = 31.7767, lon = 35.2345;
  assert.strictEqual(math.zoneOfLon(lon), 36);
  const [e, n] = math.latLonToUtm(lat, lon, 36);
  const [pe, pn] = proj4('WGS84', projFor(36), [lon, lat]);
  assert(Math.abs(e - pe) < 0.001 && Math.abs(n - pn) < 0.001);
});

test('distance and bearing: 1 km due north and due east', () => {
  const [d1, b1] = math.distBearing(31.7, 35.2, 31.7 + 1000 / 111000, 35.2);
  assert(Math.abs(d1 - 1000) < 10 && (b1 < 0.5 || b1 > 359.5), d1 + ' ' + b1);
  const [, b2] = math.distBearing(31.7, 35.2, 31.7, 35.21);
  assert(Math.abs(b2 - 90) < 0.5, '' + b2);
});

// ---------- View behaviour with stubbed watch runtime ----------

const makeView = (stored, brokenStorage) => {
  const screen = {};
  const subs = {};
  const storage = Object.assign({}, stored || {});
  const fail = () => { throw new Error('storage unavailable'); };
  const env = {
    setText: (id, t) => { screen[id] = t; },
    setStyle: () => {},
    getStyle: () => '#ffffff',
    localStorage: brokenStorage ? { getItem: fail, setItem: fail } : {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); }
    },
    $: {
      subscribe: (p, cb) => { subs[p] = cb; return p; },
      unsubscribe: (t) => { delete subs[t]; }
    }
  };
  const body = onLoadJs + '\nreturn { activate: function() {' +
    onActivateJs.replace(/\{zapp_index\}/g, '0') + '}, deactivate: function() {' + onDeactivateJs + '},' +
    ' up: function() { btnUp(); }, upHold: function() { btnUpHold(); },' +
    ' down: function() { btnDown(); }, downHold: function() { btnDownHold(); } };';
  const api = new Function('setText', 'setStyle', 'getStyle', 'localStorage', '$', body)(
    env.setText, env.setStyle, env.getStyle, env.localStorage, env.$);
  api.activate();
  const gps = (lat, lon) => {
    subs['/Zapp/0/Output/ready'](100);
    subs['/Zapp/0/Output/lat'](Math.round(lat * 1e7));
    subs['/Zapp/0/Output/lon'](Math.round(lon * 1e7));
  };
  return { api, screen, subs, storage, gps };
};

// Press UP until the digit under the cursor becomes the wanted value, then DOWN
const typeDigits = (v, s) => {
  for (const ch of s) {
    const want = Number(ch);
    let guard = 0;
    while (true) {
      const row = v.screen['#l1'] + v.screen['#l2'] + v.screen['#l3'];
      const cur = Number(row.match(/\[(\d)\]/)[1]);
      if (cur === want) break;
      v.api.up();
      if (++guard > 10) throw new Error('digit did not cycle');
    }
    v.api.down();
  }
};

test('first start without target asks for one', () => {
  const v = makeView();
  assert.strictEqual(v.screen['#l1'], 'NO TARGET');
});

test('enter a target with buttons, then navigate to it', () => {
  const v = makeView();
  v.api.downHold();                                   // enter edit mode
  assert.strictEqual(v.screen['#l0'], 'SET TARGET UTM');
  const [tlat, tlon] = [31.7767, 35.2345];
  const [te, tn] = math.latLonToUtm(tlat, tlon, 36);
  const digits = '36' + String(Math.round(te)).padStart(6, '0') + String(Math.round(tn)).padStart(7, '0');
  typeDigits(v, digits);
  assert(/^\d+(\.\d+)? (m|km)$/.test(v.screen['#l1']) || v.screen['#l1'] === 'WAIT GPS', v.screen['#l1']);
  assert.strictEqual(v.storage.utmTarget, digits.slice(0, 2) * 1 + ',' + Math.round(te) + ',' + Math.round(tn));

  // Stand 1 km south of the target, facing north (compass reports radians)
  v.gps(tlat - 1000 / 110900, tlon);
  v.subs['/Fusion/Compass/Heading'](0);
  assert(/^0\.99 km$|^1\.00 km$|^99\d m$/.test(v.screen['#l1']), v.screen['#l1']);
  assert.strictEqual(v.screen['#l0'], 'BRG 000');
  assert.strictEqual(v.screen['#l2'], '^ AHEAD ^');

  // Face east: target is 90 degrees to the left
  v.subs['/Fusion/Compass/Heading'](Math.PI / 2);
  assert.strictEqual(v.screen['#l2'], 'LEFT 90');

  // Arrive
  v.gps(tlat, tlon);
  assert.strictEqual(v.screen['#l2'], 'ARRIVED');
});

test('target survives restart through localStorage', () => {
  const v = makeView({ utmTarget: '36,711234,3518000' });
  v.api.up();                                          // show target screen
  assert.strictEqual(v.screen['#l2'], 'E 711234');
  assert.strictEqual(v.screen['#l3'], 'N 3518000');
});

test('edit is prefilled from current GPS position', () => {
  const v = makeView();
  v.gps(31.7767, 35.2345);
  v.api.downHold();
  const [e, n] = math.latLonToUtm(31.7767, 35.2345, 36);
  const strip = (s) => s.replace(/[\[\]]/g, '');
  assert.strictEqual(strip(v.screen['#l1']), 'Z 36 N');
  assert.strictEqual(strip(v.screen['#l2']), 'E ' + Math.round(e));
  assert.strictEqual(strip(v.screen['#l3']), 'N ' + Math.round(n));
});

test('hold UP decrements, hold DOWN goes back and cancels', () => {
  const v = makeView({ utmTarget: '36,711234,3518000' });
  v.api.downHold();                                    // edit, no GPS: prefilled from target
  assert.strictEqual(v.screen['#l1'], 'Z [3]6 N');
  v.api.upHold();
  assert.strictEqual(v.screen['#l1'], 'Z [2]6 N');
  v.api.down();
  assert.strictEqual(v.screen['#l1'], 'Z 2[6] N');
  v.api.downHold();
  assert.strictEqual(v.screen['#l1'], 'Z [2]6 N');
  v.api.downHold();                                    // cancel: back to navigation, target unchanged
  assert.strictEqual(v.storage.utmTarget, '36,711234,3518000');
  assert.notStrictEqual(v.screen['#l0'], 'SET TARGET UTM');
});

test('invalid easting is rejected', () => {
  const v = makeView();
  v.api.downHold();
  typeDigits(v, '36' + '050000' + '3500000');
  assert.strictEqual(v.screen['#l0'], 'BAD EASTING');
  assert.strictEqual(v.storage.utmTarget, undefined);
});

test('falls back to direction of travel when compass is missing', () => {
  const v = makeView({ utmTarget: '36,711234,3518000' });
  const [lat, lon] = math.utmToLatLon(36, 711234, 3517000); // 1 km south
  v.gps(lat, lon);
  assert.strictEqual(v.screen['#l2'], 'NO HEADING');
  v.subs['/Zapp/0/Output/cog'](0);
  assert.strictEqual(v.screen['#l2'], '^ AHEAD ^');
  assert.strictEqual(v.screen['#l3'], 'by track');
});

test('works when localStorage throws', () => {
  const v = makeView(null, true);
  assert.strictEqual(v.screen['#l1'], 'NO TARGET');
  v.api.downHold();
  assert.strictEqual(v.screen['#l0'], 'SET TARGET UTM');
  typeDigits(v, '36' + '711234' + '3518000');
  v.gps(31.7, 35.2);
  assert(/km$/.test(v.screen['#l1']), v.screen['#l1']);
});

// ---------- main.js ----------

test('main.js forwards fix and computes direction of travel', () => {
  const m = new Function(mainJs + '\nreturn { onLoad, evaluate, getUserInterface };')();
  const out = {};
  m.onLoad({}, out);
  assert.strictEqual(out.cog, -1);
  const lat0 = 31.7, lon0 = 35.2;
  m.evaluate({ gpsReadiness: 50, latitude: 0, longitude: 0 }, out);
  assert.strictEqual(out.ready, 50);
  m.evaluate({ gpsReadiness: 100, latitude: lat0 * 1e7, longitude: lon0 * 1e7 }, out);
  assert.strictEqual(out.lat, lat0 * 1e7);
  m.evaluate({ gpsReadiness: 100, latitude: lat0 * 1e7, longitude: (lon0 + 0.0003) * 1e7 }, out);
  assert(Math.abs(out.cog - 90) <= 1, 'cog ' + out.cog);
  assert.strictEqual(m.getUserInterface().template, 'nav');
});

console.log(failures ? '\n' + failures + ' test(s) failed' : '\nall tests passed');
process.exit(failures ? 1 : 0);
