'use strict';
/* גלריה – אפליקציית מנטליזם שנראית כמו גלריית התמונות.
   מבנה הקובץ: עזרים · אחסון · מקורות וידאו · רינדור חשיפה · ניווט · גלריה · ניהול · עורך · הגדרות · צפייה/הופעה */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const easeOut = p => 1 - Math.pow(1 - clamp(p), 3);
const backOut = p => { p = clamp(p); const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const isRTL = s => /[֐-׿؀-ۿ]/.test(s);
const fmtDur = s => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
const getPath = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

const FONTS = {
  hand:    { name: 'כתב יד',          css: '"Amatic SC", "Caveat", cursive' },
  script:  { name: 'כתב יד (אנגלית)', css: '"Caveat", "Amatic SC", cursive' },
  bold:    { name: 'כותרת',            css: '"Secular One", sans-serif' },
  clean:   { name: 'נקי',              css: '"Rubik", sans-serif' },
  serif:   { name: 'עיתון',            css: '"Frank Ruhl Libre", serif' },
  digital: { name: 'דיגיטלי',          css: '"Courier New", ui-monospace, monospace' },
};
const DEFAULT_WORDS = ['ישראל', 'צרפת', 'יפן', 'ברזיל', 'מצרים', 'קנדה', 'איטליה', 'הודו', 'מקסיקו', 'יוון', 'תאילנד', 'ספרד'];

const METHODS = {
  grid:     { name: 'מקשים נסתרים 3×3', for: ['number', 'word', 'card'],
              help: 'בזמן שהסרטון מתנגן, המסך מחולק ל-9 מקשים בלתי נראים: 1 בפינה השמאלית העליונה ו-9 בימנית התחתונה. עם "עצירה והמשך": הנגיעה הראשונה עוצרת את הסרטון והשנייה ממשיכה, וכל נגיעה נקלטת כספרה. נראה כמו צפייה רגילה. אחרי מספר הספרות שהגדרת, שאר הנגיעות לא נחשבות.' },
  keyboard: { name: 'מקלדת Bluetooth / שלט', for: ['number', 'word', 'card'],
              help: 'מקלידים במקלדת או בשלט Bluetooth מחוברים. נגיעות במסך לא עושות כלום, אז הצופה יכול להחזיק את הטלפון. רווח או חץ מתחיל את הסרטון.' },
  peek:     { name: 'הצופה מחפש בעצמו (חדש)', for: ['number', 'word', 'card'],
              help: 'הצופה לוחץ על חיפוש בגלריה ומקליד בעצמו את המילה או המספר. הוא מוצא את הסרטון, פותח אותו, והבחירה שלו מופיעה בתוכו. אתה לא נוגע בטלפון. (בהגדרות: אפשר "אין תוצאות" לשימוש כהצצה בלבד.)' },
  pre:      { name: 'לפני ההופעה (מסך חיפוש)', for: ['number', 'word', 'card'],
              help: 'כשנוגעים בסרטון בגלריה, נפתח קודם מסך חיפוש של הגלריה. מקלידים שם את הבחירה ולוחצים "חפש" במקלדת, והסרטון נפתח.' },
  scrub:    { name: 'גרירה ברצועת הפריימים (חדש)', for: ['number', 'word', 'card'], video: true,
              help: 'לפני הניגון גוררים את הסמן ברצועת הפריימים, כאילו מחפשים קטע. כל עזיבה של הרצועה = ספרה לפי המקום: קצה שמאל 0, קצה ימין 9 (10 אזורים). מאפשר גם 0. אחר כך לוחצים ▶.' },
  draw:     { name: 'ציור נסתר', for: ['drawing'],
              help: 'בזמן שהסרטון מתנגן מציירים באצבע על המסך. הקווים לא נראים, והציור מופיע באזור החשיפה. שתי אצבעות מבטלות את הקו האחרון.' },
};

/* ---------- הגדרות ---------- */
const S = { vibrate: true, indicator: false, record: false, contactName: '', contactLink: '', sample: '47', phTheme: 'auto', seenHelp: false, searchMode: 'result', forceId: '',
  startIn: 'hub', memoText: 'תזכורת לעצמי. מחר מישהו יבחר {x}.', flyName: '', findName: 'דני', pinCode: '', chatName: 'אמא', chatBody: 'חלמתי עליך הלילה. מישהו אמר לך {x} ואתה היית בהלם 😮', chatDays: '3', aiText: 'אתה חושב על {x}.', calcEasy: '1', calcMode: 'time', calcNumber: '1089', deckMode: 'force', deckForce: '7 לב',
  notifyFrom: 'אמא', notifyBody: 'חלמתי הלילה על {x} 😮', notifyDelay: '6', license: '',
  callDelay: '8', callName: 'אמא', phoneOS: 'auto', remoteTopic: '', remoteMode: 'g', noteTitle: 'לא לפתוח 🤫', noteBody: 'אני יודע שתבחר ב: {x}', swNumber: '47', swUseLast: true,
  histFill: 'מזג אוויר מחר\nמתכון לפנקייקים\nכמה זה 30 דולר בשקלים\nשעות פתיחה סופר\nתרגום מאנגלית לעברית' };
const PEEK = { text: '', at: 0 };
const LAST = { text: '' }; // הבחירה האחרונה (מחיפוש או מחשיפה) – לפסיפס ולמצגת
let LASTVIEW = null;       // הפריט האחרון שנפתח מהגלריה – לגלריה המתנפצת // החיפוש האחרון של הצופה (בזיכרון בלבד)

/* ===================== אחסון =====================
   local  – IndexedDB באפליקציה המותקנת (קבוע במכשיר)
   cloud  – בתוך הקישור של Claude: מסמכים פרטיים + קבצי וידאו בחשבון
   memory – גיבוי זמני כשאין אף אחד מהם */
const Store = {
  mode: 'memory', idb: null, cdb: null, assets: null, uid: null, mem: new Map(),
  async init() {
    try {
      await new Promise((res, rej) => {
        const r = indexedDB.open('gallery', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('videos', { keyPath: 'id' });
        r.onsuccess = () => { this.idb = r.result; res(); };
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
        setTimeout(() => rej(new Error('timeout')), 4000);
      });
      this.mode = 'local';
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }
      return;
    } catch (e) { this.idb = null; }
    if (window.claude && window.claude.use) {
      try {
        const [db, assets, user] = await Promise.all([claude.use('db'), claude.use('assets'), claude.use('user')]);
        const id = user ? await user.id() : null;
        if (db && id) { this.cdb = db; this.assets = assets; this.uid = id; this.mode = 'cloud'; return; }
      } catch (e) { /* ignore */ }
    }
    this.mode = 'memory';
  },
  _idb(mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.idb.transaction('videos', mode), req = fn(tx.objectStore('videos'));
      tx.oncomplete = () => res(req.result); tx.onerror = tx.onabort = () => rej(tx.error);
    });
  },
  _col() { return this.cdb.collection('data/users/' + this.uid); },
  async all() {
    if (this.mode === 'local') return (await this._idb('readonly', s => s.getAll())).filter(x => x.id !== '__settings');
    if (this.mode === 'cloud') {
      const snap = await this._col().get();
      return snap.docs.filter(d => d.id.startsWith('v_')).map(d => ({ ...d.data() }));
    }
    return [...this.mem.values()];
  },
  async put(item) {
    if (this.mode === 'local') return this._idb('readwrite', s => s.put(item));
    if (this.mode === 'cloud') {
      const { blob, ...rest } = item; void blob;
      return this._col().doc('v_' + item.id).set(JSON.parse(JSON.stringify(rest)));
    }
    this.mem.set(item.id, item);
  },
  async del(item) {
    if (this.mode === 'local') return this._idb('readwrite', s => s.delete(item.id));
    if (this.mode === 'cloud') {
      await this._col().doc('v_' + item.id).delete();
      if (item.assetId && this.assets) { try { await this.assets.delete(item.assetId); } catch (e) { /* ignore */ } }
      return;
    }
    this.mem.delete(item.id);
  },
  async loadSettings() {
    let saved = null;
    try {
      if (this.mode === 'cloud') { const d = await this._col().doc('settings').get(); saved = d.exists ? d.data() : null; }
      else saved = JSON.parse(localStorage.getItem('gallery.settings'));
    } catch (e) { /* ignore */ }
    if (saved) Object.assign(S, saved);
  },
  async saveSettings() {
    try {
      if (this.mode === 'cloud') await this._col().doc('settings').set({ ...S });
      else localStorage.setItem('gallery.settings', JSON.stringify(S));
    } catch (e) { /* ignore */ }
  },
};
let settingsT = 0;
const saveSettings = () => { clearTimeout(settingsT); settingsT = setTimeout(() => Store.saveSettings(), 400); };

/* שמירה בתור – כתיבה אחת בכל פעם לכל סרטון */
const saveChains = {};
function persist(item) {
  if (Store.mode === 'cloud' && item.unsaved) return Promise.resolve(); // עדיין לא נשמר בחשבון
  const snap = { ...item, regions: JSON.parse(JSON.stringify(item.regions || [])) };
  saveChains[item.id] = (saveChains[item.id] || Promise.resolve())
    .then(() => Store.put(snap))
    .catch(err => toast('השמירה נכשלה' + (err && err.code ? ` (${err.code})` : '') + '. נסה שוב'));
  return saveChains[item.id];
}

/* ---------- מודל ---------- */
const defQuad = () => [[0, 0], [1, 0], [1, 1], [0, 1]];
function newRegion(t, extra) {
  const base = { x: .2, y: .4, w: .6, h: .15 };
  return Object.assign({
    id: uid(), ...base, t, fade: 1.5, effect: 'fade', font: 'hand', color: '#ffffff', opacity: .95,
    rot: 0, skew: 0, blend: 'source-over', shadow: true, bold: true,
    trackOn: false, keys: [], persp: { on: false, q: defQuad() }, grain: .12, soft: .15, light: true,
  }, extra || {});
}
function demoItem() {
  const rect = { x: 205 / 720, y: 430 / 1280, w: 310 / 720, h: 400 / 1280 };
  return {
    id: 'demo', builtin: 'demo', name: 'הדגמה: התמונה בגלריה', fileName: 'IMG_4817.MOV', w: 720, h: 1280, duration: 20, created: 0,
    content: 'number', method: 'grid', digits: 2, trick: true, words: DEFAULT_WORDS.slice(),
    regions: [newRegion(15.5, { ...rect, fade: 2.6, color: '#2a1d12', opacity: .9, rot: -4, blend: 'multiply', shadow: false,
      track: { on: false, t2: 18, ...rect } })],
  };
}
/* סרטונים מוכנים (צילומי "טלפון" עם משטח ריק שעליו נכתבת הבחירה) */
/* STOCK-BEGIN */
const STOCK = [{"id":"stk1","v":1795524797,"name":"לוח במשרד","fileName":"IMG_5203.MOV","src":"media/stk1.mp4","thumb":"media/stk1.jpg","strip":"media/stk1-strip.jpg","dur":16.0,"style":{"font":"hand","color":"#1e3277","opacity":0.9,"blend":"multiply","shadow":false,"bold":true,"fade":1.8,"grain":0.06,"soft":0.12,"light":false},"region":{"t":10.5,"x":0.199,"y":0.3296,"w":0.5786,"h":0.1709,"q":[[0.0,0.0657],[0.9996,0.0],[1.0,0.998],[0.0025,1.0]],"keys":[{"t":10.75,"x":0.2037,"y":0.3305,"w":0.5792,"h":0.1714},{"t":11.0,"x":0.2076,"y":0.3311,"w":0.5796,"h":0.1717},{"t":11.25,"x":0.2092,"y":0.3321,"w":0.5799,"h":0.1718},{"t":11.5,"x":0.2097,"y":0.3314,"w":0.58,"h":0.1717},{"t":11.75,"x":0.2076,"y":0.3308,"w":0.5799,"h":0.1714},{"t":12.0,"x":0.2043,"y":0.3299,"w":0.5799,"h":0.171},{"t":12.25,"x":0.2002,"y":0.3288,"w":0.5802,"h":0.1711},{"t":12.5,"x":0.1978,"y":0.3261,"w":0.5805,"h":0.1712},{"t":12.75,"x":0.1976,"y":0.325,"w":0.5808,"h":0.1713},{"t":13.0,"x":0.1976,"y":0.3239,"w":0.5811,"h":0.1713},{"t":13.25,"x":0.1992,"y":0.324,"w":0.5812,"h":0.1714},{"t":13.5,"x":0.2005,"y":0.3245,"w":0.5814,"h":0.1715},{"t":13.75,"x":0.1998,"y":0.3258,"w":0.5816,"h":0.1715},{"t":14.0,"x":0.1975,"y":0.3263,"w":0.582,"h":0.1719},{"t":14.25,"x":0.1929,"y":0.3276,"w":0.5828,"h":0.1726},{"t":14.5,"x":0.1908,"y":0.3279,"w":0.5834,"h":0.1731},{"t":14.75,"x":0.1868,"y":0.3274,"w":0.5838,"h":0.1733},{"t":15.0,"x":0.1877,"y":0.3275,"w":0.584,"h":0.1733},{"t":15.25,"x":0.1895,"y":0.3279,"w":0.584,"h":0.1731},{"t":15.5,"x":0.1953,"y":0.3281,"w":0.5838,"h":0.1727},{"t":15.75,"x":0.1998,"y":0.3286,"w":0.5836,"h":0.1721},{"t":16.0,"x":0.2041,"y":0.3302,"w":0.5839,"h":0.1722}]}},{"id":"stk2","v":1795524840,"name":"מחברת בבית קפה","fileName":"IMG_5188.MOV","src":"media/stk2.mp4","thumb":"media/stk2.jpg","strip":"media/stk2-strip.jpg","dur":16.0,"style":{"font":"hand","color":"#1a2340","opacity":0.85,"blend":"multiply","shadow":false,"bold":false,"fade":2.2,"grain":0.08,"soft":0.18,"light":false},"region":{"t":10.0,"x":0.4355,"y":0.4364,"w":0.4327,"h":0.173,"q":[[0.1419,0.0],[1.0,0.1631],[0.9505,1.0],[0.0,0.7841]],"keys":[{"t":10.25,"x":0.4343,"y":0.4365,"w":0.4326,"h":0.1728},{"t":10.5,"x":0.4303,"y":0.438,"w":0.4324,"h":0.1725},{"t":10.75,"x":0.4263,"y":0.4389,"w":0.4324,"h":0.1723},{"t":11.0,"x":0.4227,"y":0.4405,"w":0.4324,"h":0.1722},{"t":11.25,"x":0.4198,"y":0.4414,"w":0.4325,"h":0.1722},{"t":11.5,"x":0.4195,"y":0.4421,"w":0.4327,"h":0.1724},{"t":11.75,"x":0.4223,"y":0.4413,"w":0.433,"h":0.1725},{"t":12.0,"x":0.4256,"y":0.4413,"w":0.4333,"h":0.1727},{"t":12.25,"x":0.4296,"y":0.4398,"w":0.4336,"h":0.1729},{"t":12.5,"x":0.432,"y":0.4388,"w":0.4338,"h":0.173},{"t":12.75,"x":0.4337,"y":0.4383,"w":0.4339,"h":0.173},{"t":13.0,"x":0.4325,"y":0.4387,"w":0.434,"h":0.173},{"t":13.25,"x":0.4296,"y":0.4384,"w":0.434,"h":0.1728},{"t":13.5,"x":0.4283,"y":0.4385,"w":0.434,"h":0.1727},{"t":13.75,"x":0.4259,"y":0.4379,"w":0.434,"h":0.1726},{"t":14.0,"x":0.4269,"y":0.4372,"w":0.4341,"h":0.1726},{"t":14.25,"x":0.4266,"y":0.4369,"w":0.4343,"h":0.1727},{"t":14.5,"x":0.4304,"y":0.4356,"w":0.4346,"h":0.1729},{"t":14.75,"x":0.4309,"y":0.4337,"w":0.435,"h":0.1732},{"t":15.0,"x":0.4319,"y":0.4321,"w":0.4356,"h":0.1737},{"t":15.25,"x":0.4306,"y":0.432,"w":0.4361,"h":0.1741},{"t":15.5,"x":0.4293,"y":0.4318,"w":0.4366,"h":0.1745},{"t":15.75,"x":0.4269,"y":0.4334,"w":0.4371,"h":0.1749},{"t":16.0,"x":0.4254,"y":0.4348,"w":0.4374,"h":0.1751}]}},{"id":"stk3","v":1795524985,"name":"לוח גיר","fileName":"IMG_5172.MOV","src":"media/stk3.mp4","thumb":"media/stk3.jpg","strip":"media/stk3-strip.jpg","dur":16.0,"style":{"font":"hand","color":"#e9e6da","opacity":0.82,"blend":"source-over","shadow":false,"bold":true,"fade":2.0,"grain":0.45,"soft":0.25,"light":false},"region":{"t":10.5,"x":0.2329,"y":0.3362,"w":0.564,"h":0.2222,"q":[[0.0,0.0],[0.9978,0.045],[1.0,0.9787],[0.0023,1.0]],"keys":[{"t":10.75,"x":0.2352,"y":0.3364,"w":0.5639,"h":0.2223},{"t":11.0,"x":0.2338,"y":0.3361,"w":0.5638,"h":0.2223},{"t":11.25,"x":0.2331,"y":0.3345,"w":0.5636,"h":0.2224},{"t":11.5,"x":0.2297,"y":0.334,"w":0.5639,"h":0.2225},{"t":11.75,"x":0.2293,"y":0.3324,"w":0.5645,"h":0.2226},{"t":12.0,"x":0.2286,"y":0.332,"w":0.5649,"h":0.2227},{"t":12.25,"x":0.2289,"y":0.3312,"w":0.5651,"h":0.2228},{"t":12.5,"x":0.2307,"y":0.3313,"w":0.5653,"h":0.2229},{"t":12.75,"x":0.2311,"y":0.3319,"w":0.5654,"h":0.223},{"t":13.0,"x":0.2318,"y":0.334,"w":0.5656,"h":0.2231},{"t":13.25,"x":0.229,"y":0.3348,"w":0.5659,"h":0.2232},{"t":13.5,"x":0.2277,"y":0.3351,"w":0.5663,"h":0.2233},{"t":13.75,"x":0.2248,"y":0.3348,"w":0.5668,"h":0.2234},{"t":14.0,"x":0.2233,"y":0.3338,"w":0.5674,"h":0.2235},{"t":14.25,"x":0.2234,"y":0.3324,"w":0.5681,"h":0.2236},{"t":14.5,"x":0.226,"y":0.3309,"w":0.5688,"h":0.2237},{"t":14.75,"x":0.2301,"y":0.3294,"w":0.5693,"h":0.2237},{"t":15.0,"x":0.2342,"y":0.3279,"w":0.5696,"h":0.2238},{"t":15.25,"x":0.2378,"y":0.3282,"w":0.5697,"h":0.2239},{"t":15.5,"x":0.2411,"y":0.328,"w":0.5696,"h":0.224},{"t":15.75,"x":0.2401,"y":0.3288,"w":0.5693,"h":0.2241},{"t":16.0,"x":0.2394,"y":0.3295,"w":0.5688,"h":0.2242}]}},{"id":"stk4","v":1795525166,"name":"פתק על המקרר","fileName":"IMG_5231.MOV","src":"media/stk4.mp4","thumb":"media/stk4.jpg","strip":"media/stk4-strip.jpg","dur":16.0,"style":{"font":"hand","color":"#161616","opacity":0.88,"blend":"multiply","shadow":false,"bold":true,"fade":1.6,"grain":0.08,"soft":0.12,"light":false},"region":{"t":10.0,"x":0.3403,"y":0.3243,"w":0.296,"h":0.1593,"q":[[0.0,0.0521],[1.0,0.0],[0.9909,1.0],[0.0015,0.9861]],"keys":[{"t":10.25,"x":0.3365,"y":0.3225,"w":0.2961,"h":0.1594},{"t":10.5,"x":0.3339,"y":0.3213,"w":0.2962,"h":0.1595},{"t":10.75,"x":0.3335,"y":0.3188,"w":0.2963,"h":0.1595},{"t":11.0,"x":0.3337,"y":0.3171,"w":0.2964,"h":0.1596},{"t":11.25,"x":0.3363,"y":0.3164,"w":0.2965,"h":0.1597},{"t":11.5,"x":0.3396,"y":0.3164,"w":0.2966,"h":0.1597},{"t":11.75,"x":0.3399,"y":0.3164,"w":0.2969,"h":0.1598},{"t":12.0,"x":0.3404,"y":0.3165,"w":0.2971,"h":0.1599},{"t":12.25,"x":0.3379,"y":0.3161,"w":0.297,"h":0.1599},{"t":12.5,"x":0.3368,"y":0.3156,"w":0.2971,"h":0.16},{"t":12.75,"x":0.3326,"y":0.316,"w":0.2973,"h":0.1601},{"t":13.0,"x":0.332,"y":0.3154,"w":0.2974,"h":0.1601},{"t":13.25,"x":0.3322,"y":0.3148,"w":0.2976,"h":0.1602},{"t":13.5,"x":0.3334,"y":0.3146,"w":0.2977,"h":0.1603},{"t":13.75,"x":0.3346,"y":0.3157,"w":0.2978,"h":0.1603},{"t":14.0,"x":0.3353,"y":0.3167,"w":0.298,"h":0.1604},{"t":14.25,"x":0.3356,"y":0.3193,"w":0.2981,"h":0.1605},{"t":14.5,"x":0.3323,"y":0.3209,"w":0.2982,"h":0.1605},{"t":14.75,"x":0.3286,"y":0.3225,"w":0.2983,"h":0.1606},{"t":15.0,"x":0.3255,"y":0.3234,"w":0.2984,"h":0.1607},{"t":15.25,"x":0.3228,"y":0.3238,"w":0.2985,"h":0.1607},{"t":15.5,"x":0.3223,"y":0.3225,"w":0.2986,"h":0.1608},{"t":15.75,"x":0.3238,"y":0.3219,"w":0.2987,"h":0.1609},{"t":16.0,"x":0.3285,"y":0.3207,"w":0.2989,"h":0.1609}]}}];
/* STOCK-END */
function stockItem(s, i) {
  const day = 864e5, r = s.region;
  return {
    id: s.id, stock: s.id, kind: 'video', name: s.name, fileName: s.fileName, assetUrl: s.src, thumb: s.thumb, strip: s.strip,
    w: 720, h: 1280, duration: s.dur, created: 1, shotAt: Date.now() - (1 + i * 1.7) * day - (3 + i * 2.3) * 3600e3,
    content: 'number', method: 'grid', digits: 2, trick: true, words: DEFAULT_WORDS.slice(),
    regions: [newRegion(r.t, { x: r.x, y: r.y, w: r.w, h: r.h, ...s.style, persp: { on: true, q: r.q }, trackOn: true, keys: r.keys })],
  };
}
/* התאמת סרטונים שנשמרו בגרסאות קודמות */
function normalize(it) {
  if (it.method === 'list') { it.method = 'grid'; it.digits = 1; }
  delete it._url;
  if (it.name && /^[0-9a-f-]{16,}$/i.test(it.name)) it.name = (it.kind === 'photo' ? 'תמונה ' : 'סרטון ') + new Date(it.shotAt || it.created || Date.now()).toLocaleDateString('he-IL');
  // תיקון לפריטים שנשמרו בטעות כסרטון
  if (!it.builtin && !it.duration && /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i.test(it.fileName || '')) it.kind = 'photo';
  if (!METHODS[it.method]) it.method = it.content === 'drawing' ? 'draw' : 'grid';
  if (!it.digits) it.digits = 2;
  if (it.tapPause === undefined) it.tapPause = true;
  if (it.trick === undefined) it.trick = true;
  if (!it.words) it.words = DEFAULT_WORDS.slice();
  if (!it.regions) it.regions = [];
  if (!it.meta) it.meta = 'none';
  for (const r of it.regions) { // שדרוג אזורים ישנים
    if (!r.keys) { r.keys = []; if (r.track && r.track.on) { r.keys = [{ t: r.track.t2, x: r.track.x, y: r.track.y, w: r.track.w, h: r.track.h }]; r.trackOn = true; } }
    if (r.trackOn === undefined) r.trackOn = false;
    if (!r.persp) r.persp = { on: false, q: defQuad() };
    if (r.grain === undefined) r.grain = .1;
    if (r.soft === undefined) r.soft = .1;
    if (r.light === undefined) r.light = true;
  }
  if (!it.kind) it.kind = 'video';
  if (it.kind === 'photo' && it.method === 'scrub') it.method = 'grid';
  return it;
}
const shotTime = it => it.shotAt || (it.builtin ? Date.now() - 2 * 3600e3 : it.created || Date.now());
const activeRegions = it => (it.trick === false ? [] : it.regions);

class DemoSource {
  constructor() { this.w = 720; this.h = 1280; this.duration = 20; this._t = 0; this._start = 0; this.paused = true; this.ended = false; }
  async ready() {
    try { await Promise.all(['400 40px "Secular One"', '700 40px "Amatic SC"', '400 40px "Rubik"'].map(f => document.fonts.load(f))); }
    catch (e) { /* offline fonts */ }
  }
  get time() {
    if (!this.paused) {
      const t = (performance.now() - this._start) / 1000;
      if (t >= this.duration) { this._t = this.duration; this.paused = true; this.ended = true; } else this._t = t;
    }
    return this._t;
  }
  set time(v) { this._t = clamp(v, 0, this.duration); this.ended = false; this._start = performance.now() - this._t * 1000; }
  play() { if (this.ended) this._t = 0; this.ended = false; this._start = performance.now() - this._t * 1000; this.paused = false; return Promise.resolve(); }
  pause() { void this.time; this.paused = true; }
  draw(ctx, W, H) { ctx.save(); ctx.scale(W / 720, H / 1280); drawDemo(ctx, this.time); ctx.restore(); }
  destroy() { this.pause(); }
}

function drawDemo(ctx, t) {
  // קיר גלריה
  const g = ctx.createLinearGradient(0, 0, 0, 1280);
  g.addColorStop(0, '#3a332c'); g.addColorStop(.65, '#2a2520'); g.addColorStop(.66, '#4a3b2c'); g.addColorStop(1, '#2c2219');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 720, 1280);
  // זרקור
  const flick = 0.92 + 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 13.1);
  const sp = ctx.createRadialGradient(360, 620, 40, 360, 640, 520);
  sp.addColorStop(0, `rgba(255,236,200,${0.32 * flick})`); sp.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, 720, 1280);
  // מסגרת
  const fx = 175, fy = 400, fw = 370, fh = 460;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(fx + 14, fy + 18, fw, fh);
  const fg = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
  fg.addColorStop(0, '#b8893a'); fg.addColorStop(.5, '#e8c77a'); fg.addColorStop(1, '#8a6224');
  ctx.fillStyle = fg; ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = '#5c3f15'; ctx.fillRect(fx + 22, fy + 22, fw - 44, fh - 44);
  // בד
  ctx.fillStyle = '#efe4cc'; ctx.fillRect(fx + 28, fy + 28, fw - 56, fh - 56);
  ctx.fillStyle = 'rgba(120,90,50,.07)';
  for (let i = 0; i < 160; i++) { const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12345.678;
    ctx.fillRect(fx + 30 + (a - Math.floor(a)) * (fw - 60), fy + 30 + (b - Math.floor(b)) * (fh - 60), 3, 2); }
  // שלט
  ctx.fillStyle = '#d9d2c3'; ctx.fillRect(310, 900, 100, 36);
  ctx.fillStyle = '#3a332c'; ctx.font = '400 15px "Rubik", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = 'rtl'; ctx.fillText('ללא כותרת', 360, 918);

  const phases = [
    [0, 4, 'ברוכים הבאים לגלריה', 'יש כאן תמונה אחת. היא עדיין ריקה.'],
    [4, 9.5, 'חשבו על מספר', 'בין 10 ל-99 · אל תגידו אותו בקול'],
    [9.5, 14.5, 'דמיינו אותו', 'כתוב בדיו על הבד הזה'],
    [14.5, 20.5, 'עכשיו הביטו בתמונה', ''],
  ];
  for (const [a, b, title, sub] of phases) {
    if (t < a || t > b) continue;
    const al = Math.min(clamp((t - a) / .6), clamp((b - t) / .6));
    ctx.globalAlpha = al;
    ctx.fillStyle = '#f4ead6'; ctx.font = '400 54px "Secular One", sans-serif'; ctx.fillText(title, 360, 190);
    ctx.fillStyle = '#cbbfa8'; ctx.font = '400 28px "Rubik", sans-serif'; ctx.fillText(sub, 360, 262);
    ctx.globalAlpha = 1;
  }
  if (t > 9.5 && t < 14.5) { // ספירה לאחור
    const n = 5 - Math.floor(t - 9.5), f = (t - 9.5) % 1;
    ctx.globalAlpha = 1 - f; ctx.fillStyle = '#e8c77a';
    ctx.font = `400 ${90 + f * 40}px "Secular One", sans-serif`; ctx.fillText(String(n), 360, 1070);
    ctx.globalAlpha = 1;
  }
  ctx.direction = 'ltr';
}


/* ---------- רינדור החשיפה ---------- */
/* מיקום האזור בזמן t: נקודת ההתחלה + נקודות מעקב, עם מעבר חלק ביניהן */
function regionRect(r, t) {
  if (!r.trackOn || !r.keys || !r.keys.length) return r;
  const pts = [{ t: r.t, x: r.x, y: r.y, w: r.w, h: r.h }, ...r.keys].sort((a, b) => a.t - b.t);
  if (t <= pts[0].t) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1], b = pts[i], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
    }
  }
  return pts[pts.length - 1];
}
function revealProgress(r, t, t0) {
  if (t < t0) return -1;
  return r.effect === 'cut' ? 1 : clamp((t - t0) / Math.max(.05, r.fade));
}
function drawTextFit(ctx, text, w, h, r) {
  const fam = (FONTS[r.font] || FONTS.clean).css, wt = r.bold ? '700' : '400';
  let size = h * .82;
  ctx.font = `${wt} ${size}px ${fam}`;
  const m = ctx.measureText(text).width;
  if (m > w * .92) size *= (w * .92) / m;
  ctx.font = `${wt} ${size}px ${fam}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = isRTL(text) ? 'rtl' : 'ltr';
  ctx.fillStyle = r.color;
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .08; ctx.shadowOffsetY = size * .03; }
  if ((r.font === 'hand' || r.font === 'script') && !isRTL(text) && text.length <= 10) {
    // כתב יד: לכל תו הטיה, גובה וגודל מעט שונים (קבוע לכל טקסט, כדי שלא "ירקוד" בין פריימים)
    const ws = [...text].map(ch => ctx.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0);
    let x = -total / 2, seed = 0; for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = i => { const v = Math.sin((seed + 1) * 12.9898 + i * 78.233) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
    ctx.textAlign = 'center';
    [...text].forEach((ch, i) => {
      ctx.save(); ctx.translate(x + ws[i] / 2, size * .04 + rnd(i) * size * .035); ctx.rotate(rnd(i + 7) * .07); const k = 1 + rnd(i + 13) * .05; ctx.scale(k, k);
      ctx.fillText(ch, 0, 0); ctx.restore(); x += ws[i];
    });
    return;
  }
  ctx.fillText(text, 0, size * .04);
}
function drawStrokes(ctx, strokes, w, h, r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
  const s = Math.min((w * .82) / bw, (h * .82) / bh);
  ctx.scale(s, s); ctx.translate(-(x0 + bw / 2), -(y0 + bh / 2));
  ctx.strokeStyle = ctx.fillStyle = r.color;
  ctx.lineWidth = Math.max(2, Math.min(w, h) * (r.bold ? .045 : .03)) / s;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; }
  for (const st of strokes) {
    ctx.beginPath();
    if (st.length === 1) { ctx.arc(st[0][0], st[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.moveTo(st[0][0], st[0][1]);
    for (let i = 1; i < st.length - 1; i++) { // החלקה
      const mx = (st[i][0] + st[i + 1][0]) / 2, my = (st[i][1] + st[i + 1][1]) / 2;
      ctx.quadraticCurveTo(st[i][0], st[i][1], mx, my);
    }
    const L = st[st.length - 1]; ctx.lineTo(L[0], L[1]); ctx.stroke();
  }
}
/* ---------- קלפים ---------- */
const SUITS = ['♠', '♥', '♣', '♦'], SUIT_NAMES = ['עלה', 'לב', 'תלתן', 'יהלום'];
const VAL = v => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[v] || String(v));
function parseCard(str) {
  const s = String(str || '').trim(); if (!s) return null;
  if (/^\d+$/.test(s)) { // קוד: צורה (1–4) ואז ערך (1–13)
    const su = +s[0] - 1, v = +s.slice(1);
    return su >= 0 && su < 4 && v >= 1 && v <= 13 ? { s: su, v } : null;
  }
  const t = s.toLowerCase().replace(/\s+/g, ' ');
  let su = -1;
  [['♠', 'עלה', 'ספייד', 'spade', 'פיק'], ['♥', 'לב', 'heart'], ['♣', 'תלתן', 'club'], ['♦', 'יהלום', 'מעוין', 'diamond']]
    .forEach((ws, i) => { if (ws.some(w => t.includes(w))) su = i; });
  let v = 0;
  if (/ace|אס|^a(?![a-z])/.test(t)) v = 1;
  else if (/jack|נסיך|ג'ק|^j(?![a-z])/.test(t)) v = 11;
  else if (/queen|מלכה|^q(?![a-z])/.test(t)) v = 12;
  else if (/king|מלך|^k(?![a-z])/.test(t)) v = 13;
  else { const m = t.match(/\d+/); if (m) v = +m[0]; }
  return su >= 0 && v >= 1 && v <= 13 ? { s: su, v } : null;
}
const cardText = c => `${VAL(c.v)}${SUITS[c.s]}`;
function drawCard(ctx, c, w, h, r) {
  const ar = 2.5 / 3.5; let cw = w * .9, ch = cw / ar; if (ch > h * .9) { ch = h * .9; cw = ch * ar; }
  const red = c.s === 1 || c.s === 3, ink = red ? '#c8102e' : '#141414', rad = cw * .07;
  ctx.save();
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = cw * .06; ctx.shadowOffsetY = cw * .02; }
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-cw / 2, -ch / 2, cw, ch, rad) : ctx.rect(-cw / 2, -ch / 2, cw, ch);
  ctx.fillStyle = '#fbfaf7'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, cw * .01); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke();
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
  const corner = (sx, sy, rot) => {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot);
    ctx.font = `700 ${cw * .17}px Georgia, "Times New Roman", serif`; ctx.fillText(VAL(c.v), 0, 0);
    ctx.font = `${cw * .14}px Georgia, serif`; ctx.fillText(SUITS[c.s], 0, cw * .16); ctx.restore();
  };
  corner(-cw / 2 + cw * .13, -ch / 2 + ch * .1, 0); corner(cw / 2 - cw * .13, ch / 2 - ch * .1, Math.PI);
  ctx.font = `${c.v >= 11 ? cw * .5 : cw * .45}px Georgia, serif`;
  ctx.fillText(c.v >= 11 ? VAL(c.v) + SUITS[c.s] : SUITS[c.s], 0, ch * .02);
  ctx.restore();
}

/* ---------- ריאליזם: שכבה, גרעיניות, רכות, תאורה ופרספקטיבה ---------- */
const LAYER = document.createElement('canvas'), LCTX = LAYER.getContext('2d');
let NOISE = null;
function noiseCanvas() {
  if (!NOISE) {
    NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 128;
    const x = NOISE.getContext('2d'), d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
  }
  return NOISE;
}
const SAMPLE = document.createElement('canvas'); SAMPLE.width = SAMPLE.height = 6;
const SCTX = SAMPLE.getContext('2d', { willReadFrequently: true });
const LIGHT = new Map();
const resetLight = () => LIGHT.clear();
function sampleLum(ctx, x, y, w, h) {
  try {
    const m = ctx.getTransform();
    SCTX.clearRect(0, 0, 6, 6);
    SCTX.drawImage(ctx.canvas, m.a * x + m.e, m.d * y + m.f, Math.max(1, m.a * w), Math.max(1, m.d * h), 0, 0, 6, 6);
    const d = SCTX.getImageData(0, 0, 6, 6).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    return sum / 36 / 255;
  } catch (e) { return null; } // וידאו ממקור חיצוני – בלי דגימה
}
/* התאמת תאורה: כמה בהיר המשטח עכשיו לעומת רגע החשיפה */
function lightFactor(r, ctx, x, y, w, h) {
  if (!r.light) return 1;
  if (!ctx.canvas.__lid) ctx.canvas.__lid = uid();
  const key = r.id + ctx.canvas.__lid;
  let st = LIGHT.get(key); if (!st) { st = { ref: null, val: 1, n: 0 }; LIGHT.set(key, st); }
  if (st.n++ % 3 === 0) {
    const l = sampleLum(ctx, x, y, w, h);
    if (l != null) { if (st.ref == null) st.ref = Math.max(.04, l); st.val = lerp(st.val, clamp(l / st.ref, .25, 1.6), .5); }
  }
  return st.val;
}
/* מיפוי ריבוע היחידה למרובע (פרספקטיבה אמיתית) */
function homography(q) {
  const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a13 = 0, a23 = 0; const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-9) { a13 = (dx3 * dy2 - dx2 * dy3) / den; a23 = (dx1 * dy3 - dx3 * dy1) / den; }
  const a11 = x1 - x0 + a13 * x1, a21 = x3 - x0 + a23 * x3, a12 = y1 - y0 + a13 * y1, a22 = y3 - y0 + a23 * y3;
  return (u, v) => { const z = a13 * u + a23 * v + 1; return [(a11 * u + a21 * v + x0) / z, (a12 * u + a22 * v + y0) / z]; };
}
function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
  const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (Math.abs(det) < 1e-9) return;
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const ex = p => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * .7, p[1] + dy / l * .7]; };
  ctx.save(); ctx.beginPath();
  const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
  ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
  const ax = s1[0] - s0[0], ay = s1[1] - s0[1], bx = s2[0] - s0[0], by = s2[1] - s0[1];
  const ux = d1[0] - d0[0], uy = d1[1] - d0[1], vx = d2[0] - d0[0], vy = d2[1] - d0[1];
  const a = (ux * by - vx * ay) / det, c = (vx * ax - ux * bx) / det;
  const b = (uy * by - vy * ay) / det, d = (vy * ax - uy * bx) / det;
  ctx.transform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
  ctx.drawImage(img, 0, 0); ctx.restore();
}
function drawWarped(ctx, img, quad, pad) {
  const H = homography(quad), N = 6, LW = img.width, LH = img.height, span = 1 + 2 * pad;
  const P = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = -pad + span * i / N, v = -pad + span * j / N;
    P.push({ s: [LW * i / N, LH * j / N], d: H(u, v) });
  }
  const at = (i, j) => P[j * (N + 1) + i];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p00 = at(i, j), p10 = at(i + 1, j), p11 = at(i + 1, j + 1), p01 = at(i, j + 1);
    drawTri(ctx, img, p00.s, p10.s, p11.s, p00.d, p10.d, p11.d);
    drawTri(ctx, img, p00.s, p11.s, p01.s, p00.d, p11.d, p01.d);
  }
}
function drawReveal(ctx, r, payload, p, t, W, H) {
  if (!payload || p < 0) return;
  const R = regionRect(r, t), w = R.w * W, h = R.h * H, x0 = R.x * W, y0 = R.y * H;
  if (w < 2 || h < 2) return;
  const lf = lightFactor(r, ctx, x0, y0, w, h);
  // 1. מציירים את הכתב על שכבה נפרדת (קטנה יותר = רכה יותר)
  const m = ctx.getTransform(), dens = Math.abs(m.a) || 1, sc = 1 / (1 + clamp(r.soft || 0) * 3), pad = .25;
  const lw = Math.max(2, w * dens * sc), lh = Math.max(2, h * dens * sc);
  LAYER.width = Math.ceil(lw * (1 + 2 * pad)); LAYER.height = Math.ceil(lh * (1 + 2 * pad));
  const LW = LAYER.width, LH = LAYER.height;
  LCTX.save(); LCTX.translate(LW / 2, LH / 2); LCTX.scale(dens * sc, dens * sc);
  if (payload.type === 'text') drawTextFit(LCTX, payload.text, w, h, r);
  else if (payload.type === 'card') drawCard(LCTX, payload.card, w, h, r);
  else drawStrokes(LCTX, payload.strokes, w, h, r);
  LCTX.restore();
  // 2. תאורה: המשטח התכהה או התבהר מאז רגע החשיפה
  if (Math.abs(lf - 1) > .02) {
    LCTX.save(); LCTX.globalCompositeOperation = 'source-atop';
    LCTX.fillStyle = lf < 1 ? `rgba(0,0,0,${clamp(1 - lf, 0, .8)})` : `rgba(255,255,255,${clamp((lf - 1) * .6, 0, .5)})`;
    LCTX.fillRect(0, 0, LW, LH); LCTX.restore();
  }
  // 3. גרעיניות מצלמה, מתחלפת בכל פריים
  if (r.grain > 0) {
    LCTX.save(); LCTX.globalCompositeOperation = 'source-atop'; LCTX.globalAlpha = clamp(r.grain) * .45;
    LCTX.fillStyle = LCTX.createPattern(noiseCanvas(), 'repeat');
    LCTX.translate(-(Math.random() * 128 | 0), -(Math.random() * 128 | 0));
    LCTX.fillRect(0, 0, LW + 128, LH + 128); LCTX.restore();
  }
  // 4. אפקט "נכתב": חושפים חלק מהשכבה
  const e = easeOut(p);
  if (r.effect === 'wipe') {
    const rtl = payload.type === 'text' && isRTL(payload.text), ww = lw * 1.1 * clamp(p);
    LCTX.save(); LCTX.globalCompositeOperation = 'destination-in'; LCTX.fillStyle = '#000';
    LCTX.fillRect(rtl ? LW / 2 + lw * .55 - ww : LW / 2 - lw * .55, 0, ww, LH); LCTX.restore();
  }
  // 5. הדבקה על הסרטון
  ctx.save();
  ctx.globalCompositeOperation = r.blend || 'source-over';
  let a = r.opacity, s = 1;
  if (r.effect === 'fade') a *= e;
  else if (r.effect === 'develop') { a *= clamp(p * 1.2); s = 1.06 - .06 * e; }
  else if (r.effect === 'pop') { s = Math.max(.001, backOut(p)); a *= clamp(p * 3); }
  ctx.globalAlpha = a;
  if (r.persp && r.persp.on) {
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const quad = r.persp.q.map(([u, v]) => [cx + (x0 + u * w - cx) * s, cy + (y0 + v * h - cy) * s]);
    drawWarped(ctx, LAYER, quad, pad);
  } else {
    ctx.translate(x0 + w / 2, y0 + h / 2);
    ctx.rotate(r.rot * Math.PI / 180);
    if (r.skew) ctx.transform(1, 0, Math.tan(r.skew * Math.PI / 180), 1, 0, 0);
    ctx.scale(s, s);
    ctx.drawImage(LAYER, -w / 2 * (1 + 2 * pad), -h / 2 * (1 + 2 * pad), w * (1 + 2 * pad), h * (1 + 2 * pad));
  }
  ctx.restore();
}
/* מצייר פריים מלא: וידאו + כל אזורי החשיפה */
function composeFrame(ctx, src, item, payload, payloadAt, W, H, forceFull) {
  src.draw(ctx, W, H);
  const t = src.time;
  for (const r of item.regions) {
    const p = forceFull ? 1 : (payload ? revealProgress(r, t, Math.max(r.t, payloadAt)) : -1);
    drawReveal(ctx, r, payload, p, t, W, H);
  }
}
const fitRect = (sw, sh, cw, ch) => { const s = Math.min(cw / sw, ch / sh), w = sw * s, h = sh * s; return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }; };

/* ===================== מקורות וידאו ===================== */
const mediaSrc = it => it.blob || it.assetUrl || null;
class VideoSource {
  constructor(src) {
    const v = this.el = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    this.owned = src instanceof Blob;
    this.url = this.owned ? URL.createObjectURL(src) : src;
    v.src = this.url;
    $('#vhost').appendChild(v);
  }
  ready() {
    return new Promise((res, rej) => {
      const v = this.el; let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      if (v.readyState >= 2) return ok();
      v.addEventListener('loadeddata', ok, { once: true });
      v.addEventListener('loadedmetadata', () => setTimeout(ok, 900), { once: true });
      v.addEventListener('error', () => {
        if (done) return; done = true;
        const c = v.error && v.error.code;
        rej(new Error(c === 4 ? 'הטלפון לא מצליח לנגן את סוג הסרטון הזה' : c === 2 ? 'בעיית רשת בטעינת הסרטון' : 'לא ניתן לטעון את הסרטון'));
      }, { once: true });
      // אייפון לא טוען פריים לפני ניגון: מנגנים רגע בשקט ועוצרים
      v.muted = true;
      const p = v.play();
      if (p && p.then) p.then(() => { v.pause(); v.currentTime = 0; v.muted = false; ok(); }).catch(() => { v.muted = false; });
      else v.muted = false;
      setTimeout(ok, 4000);
    });
  }
  get w() { return this.el.videoWidth || 720; }
  get h() { return this.el.videoHeight || 1280; }
  get duration() { return isFinite(this.el.duration) ? this.el.duration : 0; }
  get time() { return this.el.currentTime; }
  set time(v) { this.el.currentTime = v; }
  get paused() { return this.el.paused; }
  get ended() { return this.el.ended; }
  play() { return this.el.play(); }
  pause() { this.el.pause(); }
  draw(ctx, w, h) { if (this.el.readyState >= 2) ctx.drawImage(this.el, 0, 0, w, h); }
  destroy() {
    this.el.pause();
    if (this.ac) this.ac.close().catch(() => {});
    this.el.removeAttribute('src'); this.el.load(); this.el.remove();
    if (this.owned) URL.revokeObjectURL(this.url);
  }
}
/* תמונה: "זמן" הוא שעון שמתחיל כשמתחילים להזין */
class ImageSource {
  constructor(src) {
    this.owned = src instanceof Blob; this.url = this.owned ? URL.createObjectURL(src) : src;
    this.img = new Image(); this.img.src = this.url;
    this._t = 0; this._t0 = 0; this.paused = true; this.ended = false; this.duration = 0;
  }
  ready() {
    return new Promise((res, rej) => {
      if (this.img.complete && this.img.naturalWidth) return res();
      this.img.onload = () => res(); this.img.onerror = () => rej(new Error('לא ניתן לטעון את התמונה'));
    });
  }
  get w() { return this.img.naturalWidth || 1080; }
  get h() { return this.img.naturalHeight || 1440; }
  get time() { return this.paused ? this._t : (performance.now() - this._t0) / 1000; }
  set time(v) { this._t = v; this._t0 = performance.now() - v * 1000; }
  play() { this._t0 = performance.now() - this._t * 1000; this.paused = false; return Promise.resolve(); }
  pause() { this._t = this.time; this.paused = true; }
  draw(ctx, w, h) { if (this.img.naturalWidth) ctx.drawImage(this.img, 0, 0, w, h); }
  destroy() { if (this.owned) URL.revokeObjectURL(this.url); }
}
const BLOBS = new Map();
async function ensureBlob(it) {
  if (!it || it.blob || !it.assetUrl || it.kind === 'photo' || it.builtin) return;
  if (BLOBS.has(it.id)) { it.blob = BLOBS.get(it.id); return; }
  toast('טוען את הסרטון…', 30000);
  let res;
  try { res = await fetch(it.assetUrl); } catch (e) { throw new Error('אין חיבור. לא ניתן להוריד את הסרטון מהחשבון'); }
  if (!res.ok) throw new Error(`לא ניתן להוריד את הסרטון מהחשבון (${res.status})`);
  let b = await res.blob();
  if (!b.type || b.type === 'application/octet-stream') b = new Blob([b], { type: 'video/mp4' });
  BLOBS.set(it.id, b); it.blob = b;
  const live = byId(it.id); if (live) live.blob = b;
  $('#toast').hidden = true;
}
async function blobReadable(b) {
  if (!(b instanceof Blob)) return true;
  try { await Promise.race([b.slice(0, 64).arrayBuffer(), new Promise((_, r) => setTimeout(() => r(new Error('t')), 4000))]); return true; } catch (e) { return false; }
}
const BROKEN_MSG = 'הקובץ של הסרטון נמחק מהזיכרון של הטלפון. פתח אותו בעורך ← לשונית "מתקדם" ← "החלף את קובץ הסרטון", ובחר אותו שוב מהגלריה.';
async function checkPlayable(it) {
  if (!it || it.builtin) return;
  await ensureBlob(it);
  if (it.blob && !(await blobReadable(it.blob))) { it.broken = true; throw new Error(BROKEN_MSG); }
  if (it.broken) { delete it.broken; }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
const makeSource = item => {
  if (item.builtin === 'demo') return new DemoSource();
  if (item.kind === 'photo') { const src = mediaSrc(item); if (!src) throw new Error('קובץ התמונה חסר'); return new ImageSource(src); }
  const src = mediaSrc(item);
  if (!src) throw new Error('קובץ הווידאו חסר');
  return new VideoSource(src);
};

/* בדיקת קובץ חדש: מידות, אורך ותמונה ממוזערת */
async function inspect(file) {
  if ((file.type || '').startsWith('image/')) {
    const u = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('לא ניתן לפתוח את התמונה')); img.src = u; });
      const w = img.naturalWidth, h = img.naturalHeight;
      return { kind: 'photo', w, h, duration: 0, thumb: thumbOf(c => c.drawImage(img, 0, 0, w, h), w, h) };
    } finally { URL.revokeObjectURL(u); }
  }
  const v = document.createElement('video'), u = URL.createObjectURL(file);
  v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = u;
  $('#vhost').appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('הדפדפן לא מצליח לפתוח את הסרטון הזה')); setTimeout(res, 6000); });
    try { await v.play(); v.pause(); } catch (e) { /* ignore */ }
    const info = { w: v.videoWidth, h: v.videoHeight, duration: isFinite(v.duration) ? v.duration : 0 };
    await new Promise(res => { v.onseeked = res; v.currentTime = Math.min(.5, (info.duration || 1) / 2); setTimeout(res, 1500); });
    info.thumb = thumbOf(c => c.drawImage(v, 0, 0, info.w || 1, info.h || 1), info.w || 1, info.h || 1);
    // רצועת פריימים קטנה (12 תמונות) – נשמרת עם הסרטון, כך שבזמן הצפייה לא צריך מפענח וידאו נוסף
    try {
      const N = 12, th = 64, tw = Math.max(8, Math.round(th * (info.w || 9) / (info.h || 16)));
      const c = document.createElement('canvas'); c.width = tw * N; c.height = th; const x = c.getContext('2d');
      for (let i = 0; i < N; i++) {
        await new Promise(res => { v.onseeked = res; v.currentTime = Math.min(((i + .5) / N) * (info.duration || 1), Math.max(0, (info.duration || 1) - .05)); setTimeout(res, 1200); });
        x.drawImage(v, i * tw, 0, tw, th);
      }
      info.strip = c.toDataURL('image/jpeg', .6);
    } catch (e) { /* בלי רצועה */ }
    return info;
  } finally { v.remove(); URL.revokeObjectURL(u); }
}
function thumbOf(drawFn, w, h) {
  try {
    const c = document.createElement('canvas'), size = 220; c.width = c.height = size;
    const x = c.getContext('2d'), s = Math.max(size / w, size / h);
    x.translate((size - w * s) / 2, (size - h * s) / 2); x.scale(s, s);
    drawFn(x);
    return c.toDataURL('image/jpeg', .72);
  } catch (e) { return ''; }
}
let DEMO_THUMB = '';
function demoThumb() {
  if (!DEMO_THUMB) { const d = new DemoSource(); d.time = 1.2; DEMO_THUMB = thumbOf(x => d.draw(x, 720, 1280), 720, 1280); }
  return DEMO_THUMB;
}
const thumbFor = it => it.builtin === 'demo' ? demoThumb() : (it.thumb || '');

/* ===================== עזרי ממשק ===================== */
let toastT;
function toast(msg, ms = 2800) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); }
const buzz = () => { if (S.vibrate && navigator.vibrate) navigator.vibrate(12); };
function applyTheme() {
  document.body.classList.toggle('pg-light', S.phTheme === 'light');
  document.body.classList.toggle('pg-dark', S.phTheme === 'dark');
}
/* ---------- מראה הטלפון: הקסמים נראים כמו אייפון או כמו אנדרואיד ---------- */
const isAndroid = () => S.phoneOS === 'android' || (S.phoneOS !== 'ios' && /android/i.test(navigator.userAgent));
function applyOS() { document.documentElement.dataset.os = isAndroid() ? 'android' : 'ios'; fillSbars(); }
// פס עליון מדומה רק כשאין פס אמיתי של הטלפון (תצוגה במחשב או צילום מסך)
const FAKE_SBAR = /[?&]sb=1/.test(location.search) || (matchMedia('(hover: hover) and (pointer: fine)').matches && !/[?&]sb=0/.test(location.search));
document.documentElement.classList.toggle('fake-sbar', FAKE_SBAR);
function fillSbars() {
  if (!FAKE_SBAR) return;
  const d = new Date(), t = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  const sig = '<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
  const wifi = '<svg viewBox="0 0 16 12"><path d="M8 12l-2.4-2.6a3.4 3.4 0 014.8 0zM3.4 7.1a6.5 6.5 0 019.2 0l1.4-1.5a8.6 8.6 0 00-12 0zM.9 4.5a10 10 0 0114.2 0L16.5 3A12 12 0 00-.5 3z"/></svg>';
  const bat = '<svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="16" height="8" rx="2"/><path d="M24.5 4v4a2 2 0 000-4z" opacity=".45"/></svg>';
  $$('.sbar').forEach(el => {
    const lock = el.classList.contains('sbar-lock') && !isAndroid();
    el.innerHTML = `<span>${lock ? '' : t}</span><span class="sb-i">${isAndroid() ? wifi + sig + bat : sig + wifi + bat}</span>`;
  });
}
setInterval(fillSbars, 30000);
/* צבע הפס העליון האמיתי של הטלפון מתאים את עצמו למסך הקסם (במקום פס לבן מעל מסך נעול) */
const BAR_COLORS = { webf: () => isAndroid() ? '' : (matchMedia('(prefers-color-scheme: dark)').matches && S.phTheme !== 'light') || S.phTheme === 'dark' ? '#000000' : '#ffffff', web: () => isAndroid() ? '' : (matchMedia('(prefers-color-scheme: dark)').matches && S.phTheme !== 'light') || S.phTheme === 'dark' ? '#1e1e20' : '#f2f2f7', lock: () => isAndroid() ? '#22302a' : '#1d2a5c', call: () => '#000000', deck: () => '#1b5e3c', calc: () => '#000000', sw: () => '#000000' };
function setBarColor(id) {
  $$('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = (BAR_COLORS[id] && BAR_COLORS[id]()) || m.dataset.orig;
  });
}

/* ===================== ניווט =====================
   מחסנית מסכים. כל מסך יכול לקבל פעולת כניסה ויציאה.
   כפתור "אחורה" של הטלפון/הדפדפן מחזיר מסך אחד. */
const NAV = { stack: [], skipPop: 0 };
const ENTER = {}, LEAVE = {};
const SCREEN_NAMES = { hub: 'מרכז הקסמים', photos: 'גלריה', manage: 'ניהול', edit: 'עריכה', settings: 'הגדרות', help: 'מדריך' };
const SCROLL = {};
function paint(id, restore) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  setBarColor(id); fillSbars();
  const prev = NAV.stack[NAV.stack.length - 2], back = $(`#${id} .nav-back[data-back]`);
  if (back) back.textContent = '‹ ' + (SCREEN_NAMES[prev] || 'חזרה');
  if (id !== 'photos') window.scrollTo(0, restore ? (SCROLL[id] || 0) : 0);
}
async function go(id, opts = {}) {
  const cur = NAV.stack[NAV.stack.length - 1];
  if (cur) SCROLL[cur] = window.scrollY;
  if (cur && LEAVE[cur]) await LEAVE[cur]();
  if (opts.replace) NAV.stack.pop();
  else { try { history.pushState({ g: NAV.stack.length + 1 }, ''); } catch (e) { /* ignore */ } }
  NAV.stack.push(id); paint(id);
  if (ENTER[id]) await ENTER[id]();
}
async function popScreen() {
  if (NAV.stack.length <= 1) return;
  const cur = NAV.stack.pop();
  if (LEAVE[cur]) await LEAVE[cur]();
  const prev = NAV.stack[NAV.stack.length - 1];
  paint(prev, true);
  if (ENTER[prev]) await ENTER[prev]();
}
function uiBack() {
  if (NAV.stack.length <= 1) return;
  NAV.skipPop++;
  try { history.back(); } catch (e) { NAV.skipPop--; }
  popScreen();
}
addEventListener('popstate', () => {
  if (NAV.skipPop > 0) { NAV.skipPop--; return; }
  popScreen();
});
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) { e.preventDefault(); uiBack(); } });
const curScreen = () => NAV.stack[NAV.stack.length - 1];

/* ===================== הגלריה (מסך הבית) ===================== */
let ITEMS = [];
const byId = id => ITEMS.find(x => x.id === id);
function renderGrid() {
  const grid = $('#pgGrid'), list = ITEMS.filter(x => !x.hidden).sort((a, b) => shotTime(a) - shotTime(b));
  const nv = list.filter(x => x.kind !== 'photo').length, np = list.length - nv;
  $('#pgCount').textContent = [np ? (np === 1 ? 'תמונה 1' : `${np} תמונות`) : '', nv ? (nv === 1 ? 'סרטון 1' : `${nv} סרטונים`) : ''].filter(Boolean).join(', ');
  grid.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'pg-cell'; b.type = 'button';
    const th = thumbFor(it);
    b.innerHTML = `${th ? '<img alt="">' : ''}<span class="dur"></span>${it.fav ? '<svg class="fav" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z"/></svg>' : ''}`;
    if (th) $('img', b).src = th;
    $('.dur', b).textContent = it.kind === 'photo' ? '' : fmtDur(it.duration);
    b.addEventListener('click', () => {
      if (performance.now() - GRID.multiAt < 600) return;        // זה היה חלק ממחווה בשתי אצבעות
      if (GRID.select) { b.classList.toggle('sel'); updateSelect(); return; }
      openViewer(it.id, { from: 'photos' });
    });
    grid.appendChild(b);
  }
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); // כמו בגלריה: החדש למטה
}
const GRID = { multiAt: 0, select: false };
function updateSelect() {
  const n = $$('#pgGrid .sel').length;
  $('#pgSelect').textContent = GRID.select ? 'ביטול' : 'בחר';
  $('#photos').classList.toggle('selecting', GRID.select);
  $('#pgTitle').textContent = !GRID.select ? 'ספרייה' : n ? (n === 1 ? 'נבחר פריט 1' : `נבחרו ${n} פריטים`) : 'בחר פריטים';
}
$('#pgSelect').onclick = () => { GRID.select = !GRID.select; if (!GRID.select) $$('#pgGrid .sel').forEach(c => c.classList.remove('sel')); updateSelect(); };
ENTER.photos = () => { applyTheme(); GRID.select = false; renderGrid(); updateSelect(); };
LEAVE.photos = () => { $('#shatter').hidden = true; $('#shatter').innerHTML = ''; $('#mosaic').hidden = true; $('#pgGrid').style.visibility = ''; };


/* ===================== אפקטים בגלריה ===================== */
const visibleItems = () => ITEMS.filter(x => !x.hidden).sort((a, b) => shotTime(a) - shotTime(b));
/* מחוות על הגלריה: הקשה בשתי אצבעות = התנפצות · צביטה פנימה = פסיפס */
(() => {
  const grid = $('#pgGrid'), pts = new Map(); let d0 = 0, t0 = 0, maxN = 0, moved = false, pinched = false;
  const dist = () => { const [a, b] = [...pts.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  grid.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pts.size === 1) { t0 = performance.now(); maxN = 1; moved = false; pinched = false; }
    if (pts.size === 2) { d0 = dist(); maxN = 2; GRID.multiAt = performance.now(); }
  });
  grid.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 12) moved = true;
    if (pts.size === 2 && !pinched && d0 && dist() < d0 * .6) { pinched = true; showMosaic(); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (maxN === 2) GRID.multiAt = performance.now();
    if (pts.size === 0 && maxN === 2 && !moved && !pinched && performance.now() - t0 < 450 && !GRID.select) shatter();
  };
  grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);
  grid.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  addEventListener('wheel', e => { if (curScreen() === 'photos' && e.ctrlKey && e.deltaY > 0) { e.preventDefault(); showMosaic(); } }, { passive: false });
})();

/* התנפצות: כל הפריטים נופלים, נשאר רק מה שהצופה פתח */
function shatter() {
  const target = LASTVIEW && byId(LASTVIEW); if (!target) return;
  const layer = $('#shatter'); layer.innerHTML = ''; layer.hidden = false;
  $('#pgGrid').style.visibility = 'hidden'; // רק השברים נראים
  const cells = [...$('#pgGrid').children], list = visibleItems();
  let keep = null, n = 0;
  cells.forEach((cell, i) => {
    const r = cell.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    const sh = document.createElement('div'); sh.className = 'shard';
    Object.assign(sh.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const img = $('img', cell); if (img) { const im = document.createElement('img'); im.src = img.src; sh.appendChild(im); }
    layer.appendChild(sh);
    if (list[i] && list[i].id === target.id) { keep = { sh, r }; return; }
    const delay = 120 + (n++) * 55 + Math.random() * 60;
    sh.animate([{ transform: 'none', opacity: 1 },
      { transform: `translate(${(Math.random() - .5) * 160}px, ${innerHeight + 200}px) rotate(${(Math.random() - .5) * 120}deg)`, opacity: .9 }],
      { duration: 900 + Math.random() * 400, delay, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
  });
  buzz();
  if (!keep) {
    const size = Math.min(innerWidth, innerHeight) * .78, sh = document.createElement('div'); sh.className = 'shard';
    Object.assign(sh.style, { left: (innerWidth - size) / 2 + 'px', top: (innerHeight - size) / 2 + 'px', width: size + 'px', height: size + 'px', zIndex: 2, borderRadius: '4px' });
    const th = thumbFor(target); if (th) { const im = document.createElement('img'); im.src = th; sh.appendChild(im); }
    layer.appendChild(sh);
    sh.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 300 + n * 55 + 500, easing: 'ease-out', fill: 'both' });
  }
  if (keep) {
    const size = Math.min(innerWidth, innerHeight) * .78, { r } = keep;
    const dx = innerWidth / 2 - (r.left + r.width / 2), dy = innerHeight / 2 - (r.top + r.height / 2), sc = size / r.width;
    keep.sh.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${sc})` }],
      { duration: 700, delay: 200 + n * 55 + 500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    keep.sh.style.zIndex = 2; keep.sh.style.borderRadius = '4px';
  }
  layer.onclick = () => { layer.hidden = true; layer.innerHTML = ''; $('#pgGrid').style.visibility = ''; };
}

/* פסיפס: הגלריה "מתרחקת" והתמונות יוצרות את הבחירה */
const THUMB_IMGS = new Map();
function thumbImg(it) {
  const src = thumbFor(it); if (!src) return null;
  if (!THUMB_IMGS.has(src)) { const im = new Image(); im.src = src; THUMB_IMGS.set(src, im); }
  return THUMB_IMGS.get(src);
}
function showMosaic() {
  const text = (LAST.text || '').trim(); if (!text) return;
  const cv = $('#mosaic'), dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.hidden = false;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const cols = Math.max(14, Math.round(W / 18)), cell = W / cols, rows = Math.ceil(H / cell);
  // מסכה של הטקסט ברזולוציית התאים
  const m = document.createElement('canvas'); m.width = cols; m.height = rows;
  const mx = m.getContext('2d'); mx.fillStyle = '#000'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.direction = isRTL(text) ? 'rtl' : 'ltr';
  let fs = rows * .5; mx.font = `900 ${fs}px "Rubik", "Secular One", sans-serif`;
  const tw = mx.measureText(text).width; if (tw > cols * .9) fs *= cols * .9 / tw;
  mx.font = `900 ${fs}px "Rubik", "Secular One", sans-serif`; mx.fillText(text, cols / 2, rows / 2);
  const mask = mx.getImageData(0, 0, cols, rows).data;
  const imgs = visibleItems().map(thumbImg).filter(Boolean);
  const bg = getComputedStyle($('#photos')).getPropertyValue('--pg-bg').trim() || '#000';
  const t0 = performance.now();
  const frame = now => {
    if (cv.hidden) return;
    const k = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - k, 3), zoom = 4 - 3 * e;
    ctx.save(); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = mask[(y * cols + x) * 4 + 3] > 110, im = imgs.length ? imgs[(x * 7 + y * 13) % imgs.length] : null;
      ctx.globalAlpha = on ? 1 : lerp(1, .13, e);
      if (im && im.complete && im.naturalWidth) ctx.drawImage(im, x * cell + .5, y * cell + .5, cell - 1, cell - 1);
      else { ctx.fillStyle = on ? '#ffcc00' : '#888'; ctx.fillRect(x * cell + .5, y * cell + .5, cell - 1, cell - 1); }
    }
    ctx.restore();
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame); buzz();
  cv.onclick = () => { cv.hidden = true; };
}

/* ===================== מצגת "זכרונות" עם כותרת והכרחה ===================== */
const M = { raf: 0, items: [], imgs: [], i: 0, t0: 0, stopAt: -1, stopped: false, title: '' };
const MEM_URLS = new Map();
function memImage(it) {
  const im = new Image();
  if (it.kind === 'photo' && mediaSrc(it)) {
    const s = mediaSrc(it);
    if (s instanceof Blob) { if (!MEM_URLS.has(it.id)) MEM_URLS.set(it.id, URL.createObjectURL(s)); im.src = MEM_URLS.get(it.id); } else im.src = s;
  }
  else im.src = thumbFor(it) || '';
  return im;
}
ENTER.memories = () => {
  const list = visibleItems(); if (!list.length) { uiBack(); return; }
  // מערבבים, אבל פריט ההכרחה תמיד נמצא ברשימה
  M.items = list.slice().sort(() => Math.random() - .5);
  M.imgs = M.items.map(memImage);
  M.title = (LAST.text || '').trim() || phDate(Date.now())[0];
  M.i = 0; M.t0 = performance.now(); M.stopAt = -1; M.stopped = false;
  const cv = $('#memCv'), dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cancelAnimationFrame(M.raf); M.raf = requestAnimationFrame(memLoop);
};
LEAVE.memories = () => { cancelAnimationFrame(M.raf); };
const MEM_TITLE = 3.2, MEM_SLIDE = 2.2;
function memLoop(now) {
  M.raf = requestAnimationFrame(memLoop);
  const cv = $('#memCv'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, t = (now - M.t0) / 1000;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const drawImg = (im, alpha, zoom) => {
    if (!im || !im.complete || !im.naturalWidth) return;
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * zoom, w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.globalAlpha = alpha; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); ctx.globalAlpha = 1;
  };
  if (t < MEM_TITLE && !M.stopped) { // כרטיס פתיחה: הכותרת היא הבחירה של הצופה
    drawImg(M.imgs[0], .45, 1.08 + t * .02);
    const a = Math.min(1, t / .8) * Math.min(1, (MEM_TITLE - t) / .5);
    ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = isRTL(M.title) ? 'rtl' : 'ltr';
    let fs = W * .14; ctx.font = `800 ${fs}px -apple-system, "SF Pro Display", "Rubik", sans-serif`;
    const tw = ctx.measureText(M.title).width; if (tw > W * .84) { fs *= W * .84 / tw; ctx.font = `800 ${fs}px -apple-system, "SF Pro Display", "Rubik", sans-serif`; }
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = fs * .3; ctx.fillText(M.title, W / 2, H * .46);
    ctx.font = `600 ${W * .045}px -apple-system, "Rubik", sans-serif`; ctx.direction = 'rtl';
    ctx.fillText(new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }), W / 2, H * .46 + fs * .85);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    return;
  }
  if (M.stopped) { drawImg(M.imgs[M.i], 1, 1.02); return; }
  const st = t - MEM_TITLE, idx = Math.floor(st / MEM_SLIDE), k = (st % MEM_SLIDE) / MEM_SLIDE;
  const cur = idx % M.items.length, nxt = (idx + 1) % M.items.length;
  if (M.stopAt >= 0 && idx >= M.stopAt) { M.i = M.stopAt % M.items.length; M.stopped = true; buzz(); return; }
  drawImg(M.imgs[cur], 1, 1.05 + k * .08);
  if (k > .82) drawImg(M.imgs[nxt], (k - .82) / .18, 1.05);
}
/* נגיעה = "עצור": המצגת ממשיכה עוד קצת ועוצרת על פריט ההכרחה */
$('#memCv').addEventListener('click', () => {
  if (M.stopped) { uiBack(); return; }
  const now = (performance.now() - M.t0) / 1000;
  const idx = Math.max(0, Math.floor((now - MEM_TITLE) / MEM_SLIDE));
  const fi = M.items.findIndex(x => x.id === S.forceId);
  if (fi < 0) { M.stopAt = idx; return; }
  // מציבים את פריט ההכרחה שתי שקופיות קדימה (עוד לא נראה), ועוצרים עליו
  const target = idx + 2, ti = target % M.items.length, ci = idx % M.items.length, ni = (idx + 1) % M.items.length;
  if (fi === ci) { M.stopAt = idx; return; }      // כבר על המסך – עוצרים מיד
  if (fi === ni) { M.stopAt = idx + 1; return; }  // השקופית הבאה
  [M.items[fi], M.items[ti]] = [M.items[ti], M.items[fi]];
  [M.imgs[fi], M.imgs[ti]] = [M.imgs[ti], M.imgs[fi]];
  M.stopAt = target;
});
$('#memClose').onclick = () => uiBack();

/* ===================== חיפוש בגלריה: הצופה מקליד בעצמו ===================== */
$('#pgSearch').onclick = () => go('search');
ENTER.search = () => {
  $('#srIn').value = ''; $('#srSuggest').hidden = false; $('#srResults').hidden = true; $('#srEmpty').hidden = true;
  setTimeout(() => $('#srIn').focus(), 80);
};
function runSearch(q) {
  q = (q || '').trim(); if (!q) return;
  PEEK.text = q; PEEK.at = Date.now(); LAST.text = q;
  $('#srIn').blur(); $('#srSuggest').hidden = true;
  const tricks = ITEMS.filter(x => !x.hidden && x.trick !== false && x.method === 'peek').sort((a, b) => shotTime(b) - shotTime(a));
  if (S.searchMode !== 'none' && tricks.length) {
    const it = tricks[0], grid = $('#srGrid');
    $('#srCount').textContent = it.kind === 'photo' ? 'תמונה 1' : 'סרטון 1';
    grid.innerHTML = '';
    const b = document.createElement('button'); b.className = 'pg-cell'; b.type = 'button';
    const th = thumbFor(it);
    b.innerHTML = `${th ? '<img alt="">' : ''}<span class="dur"></span>`;
    if (th) $('img', b).src = th;
    $('.dur', b).textContent = it.kind === 'photo' ? '' : fmtDur(it.duration);
    b.addEventListener('click', () => openViewer(it.id, { from: 'search' }));
    grid.appendChild(b);
    $('#srResults').hidden = false; $('#srEmpty').hidden = true;
  } else {
    $('#srEmptyQ').textContent = q; $('#srEmpty').hidden = false; $('#srResults').hidden = true;
  }
}
$('#srForm').addEventListener('submit', e => { e.preventDefault(); runSearch($('#srIn').value); });
/* הצעות: מציגות פריטים רגילים מהגלריה, בלי לגעת בהצצה */
$('#srSuggest').addEventListener('click', e => {
  const c = e.target.closest('[data-q]'); if (!c) return;
  $('#srIn').value = c.dataset.q; $('#srSuggest').hidden = true; $('#srEmpty').hidden = true;
  let list = ITEMS.filter(x => !x.hidden);
  if (c.dataset.q === 'סרטונים') list = list.filter(x => x.kind !== 'photo');
  else if (c.dataset.q === 'מועדפים') list = list.filter(x => x.fav);
  else list = [];
  if (!list.length) { $('#srEmptyQ').textContent = c.dataset.q; $('#srEmpty').hidden = false; $('#srResults').hidden = true; return; }
  const grid = $('#srGrid'); grid.innerHTML = '';
  $('#srCount').textContent = `${list.length} פריטים`;
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'pg-cell'; b.type = 'button';
    const th = thumbFor(it); b.innerHTML = `${th ? '<img alt="">' : ''}<span class="dur"></span>`;
    if (th) $('img', b).src = th; $('.dur', b).textContent = it.kind === 'photo' ? '' : fmtDur(it.duration);
    b.addEventListener('click', () => openViewer(it.id, { from: 'search' })); grid.appendChild(b);
  }
  $('#srResults').hidden = false;
});

/* לחיצה ארוכה על "ספרייה" = כניסה נסתרת לניהול */
(() => {
  const t = $('#pgTitle').parentElement; let timer = 0;
  t.addEventListener('pointerdown', () => { clearTimeout(timer); timer = setTimeout(() => { buzz(); go('manage'); }, 900); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => t.addEventListener(ev, () => clearTimeout(timer)));
  t.addEventListener('contextmenu', e => e.preventDefault());
})();

/* ===================== ניהול ===================== */
function renderManage() {
  const st = $('#mgStore');
  const msg = {
    local: ['#34c759', 'הסרטונים נשמרים במכשיר הזה לצמיתות.'],
    cloud: ['#0a84ff', 'הסרטונים נשמרים בחשבון Claude שלך ונשארים גם אחרי סגירה. עד 20MB לכל סרטון.'],
    memory: ['#ff9f0a', 'שמירה זמנית בלבד: הסרטונים יימחקו כשהדף ייסגר. כדי לשמור לתמיד, התקן את האפליקציה (ראה מדריך).'],
  }[Store.mode];
  st.innerHTML = '<span class="dot"></span><span></span>';
  $('.dot', st).style.background = msg[0]; $('span:last-child', st).textContent = msg[1];

  const box = $('#mgList'); box.innerHTML = '';
  const list = ITEMS.slice().sort((a, b) => shotTime(b) - shotTime(a));
  for (const it of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mg-item';
    const kind = { number: `מספר, ${it.digits} ספרות`, word: 'מילה מרשימה', drawing: 'ציור', card: 'קלף' }[it.content];
    const isTrick = it.trick !== false && (it.regions.length || (it.meta && it.meta !== 'none'));
    b.innerHTML = '<img alt=""><div class="txt"><b></b><span></span></div><span class="tag"></span>';
    const th = thumbFor(it); if (th) $('img', b).src = th;
    $('b', b).textContent = it.name;
    const SHORT = { grid: 'מקשים', keyboard: 'מקלדת', peek: 'הצופה מחפש', pre: 'מסך חיפוש', scrub: 'גרירה', draw: 'ציור' };
    $('.txt span', b).textContent = (it.kind === 'photo' ? 'תמונה · ' : `${fmtDur(it.duration)} · `) + (isTrick ? `${kind} · ${SHORT[it.method] || ''}` : (it.kind === 'photo' ? 'רגילה' : 'סרטון רגיל'));
    const tag = $('.tag', b);
    tag.textContent = it.broken ? 'צריך קובץ' : (Store.mode === 'cloud' && it.unsaved) ? 'לא נשמר' : it.hidden ? 'מוסתר' : isTrick ? 'טריק' : 'רגיל';
    if (it.broken || (Store.mode === 'cloud' && it.unsaved)) tag.classList.add('warn');
    if (isTrick && !it.hidden) tag.classList.add('is-trick');
    b.addEventListener('click', () => { E.id = it.id; go('edit'); });
    box.appendChild(b);
  }
}
ENTER.manage = renderManage;
$('#mgHelp').onclick = () => go('help');
$('#mgHelp2').onclick = () => go('help');
$('#mgSettings').onclick = () => go('settings');
/* תוכן המדריך: גלילה לסעיף בלי לשנות את כתובת הדף */
$('#help .toc').addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a) return; e.preventDefault();
  const el = document.getElementById(a.getAttribute('href').slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#helpDone').onclick = () => { if (!S.seenHelp) { S.seenHelp = true; saveSettings(); } uiBack(); };


/* ===================== העלאה לחשבון: סוגים, גודל, כיווץ ===================== */
const MAX_ASSET = 20 * 1024 * 1024 - 96 * 1024;
const IMG_OK = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ERR_TEXT = {
  too_large: 'גדול מ-20MB', unsupported_type: 'סוג קובץ לא נתמך', not_granted: 'לא אישרת שמירת קבצים',
  quota_or_state: 'נגמר המקום בחשבון', rate_limited: 'יותר מדי העלאות, נסה עוד דקה', store_unavailable: 'השירות לא זמין כרגע',
};
const errText = err => (err && ERR_TEXT[err.code]) || (err && err.message) || 'שגיאה לא ידועה';
/* תמונה: ממירים ל-JPEG (גם HEIC של אייפון) ומקטינים אם צריך */
async function toJpeg(file, maxSide = 2600, q = .86) {
  const u = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('לא ניתן לפתוח את התמונה')); img.src = u; });
    const sc = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  } finally { URL.revokeObjectURL(u); }
}
async function uploadMedia(file, kind) {
  let blob = file, type = (file.type || '').split(';')[0];
  if (kind === 'photo') {
    if (!IMG_OK.includes(type) || blob.size > MAX_ASSET) {
      blob = await toJpeg(file); type = 'image/jpeg';
      if (blob.size > MAX_ASSET) blob = await toJpeg(file, 1800, .8);
    }
  } else {
    // סרטון אייפון (MOV) הוא אותו מבנה כמו MP4 – שומרים אותו כ-MP4
    if (type !== 'video/mp4' && type !== 'video/webm') type = 'video/mp4';
    if (blob.size > MAX_ASSET) throw { code: 'too_large' };
  }
  return Store.assets.upload(blob, { type });
}
/* כיווץ סרטון גדול: מנגנים אותו בשקט ומקליטים מחדש באיכות נמוכה יותר, עם הקול */
function compressVideo(file, onProgress) {
  // כל ההכנה קורית מיד בתוך הלחיצה, כדי שהדפדפן ירשה לנגן עם קול
  const v = document.createElement('video'), u = URL.createObjectURL(file);
  v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = u;
  $('#vhost').appendChild(v);
  let ac = null, dest = null;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const node = ac.createMediaElementSource(v); dest = ac.createMediaStreamDestination(); node.connect(dest); // לא לרמקולים
  } catch (e) { v.muted = true; dest = null; }
  const playP = v.play();
  return (async () => {
    try {
      if (playP && playP.catch) await playP.catch(() => { v.muted = true; return v.play(); });
      v.pause(); v.currentTime = 0;
      if (ac) await ac.resume().catch(() => {});
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 30;
      const sc = Math.min(1, 1280 / Math.max(v.videoWidth || 1280, v.videoHeight || 720));
      const c = document.createElement('canvas'); c.width = Math.round((v.videoWidth || 1280) * sc / 2) * 2; c.height = Math.round((v.videoHeight || 720) * sc / 2) * 2;
      const x = c.getContext('2d'), stream = c.captureStream(30);
      if (dest) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      const mime = pickMime();
      const vbps = Math.max(500e3, Math.min(4e6, (MAX_ASSET * 8 * .82) / dur - 96e3));
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: vbps, audioBitsPerSecond: 96e3 });
      const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(r => { rec.onstop = r; });
      x.drawImage(v, 0, 0, c.width, c.height);
      rec.start(1000);
      await v.play();
      await new Promise(res => {
        const tick = () => {
          if (v.readyState >= 2) x.drawImage(v, 0, 0, c.width, c.height);
          onProgress && onProgress(Math.min(1, v.currentTime / dur));
          if (v.ended || v.currentTime >= dur - .03) return res();
          requestAnimationFrame(tick);
        };
        v.onended = res; tick();
      });
      rec.stop(); await stopped;
      const type = ((rec.mimeType || mime || 'video/webm').split(';')[0]) || 'video/webm';
      return new Blob(chunks, { type });
    } finally {
      v.pause(); v.remove(); URL.revokeObjectURL(u);
      if (ac) ac.close().catch(() => {});
    }
  })();
}
/* חלון "כווץ ושמור" */
function offerCompress(it) {
  if (!it || !it.blob || !Store.assets) return;
  const dlg = $('#cmp'), mb = (it.blob.size / 1048576).toFixed(0);
  $('#cmpTitle').textContent = `הסרטון גדול (${mb}MB)`;
  $('#cmpText').textContent = `כדי לשמור אותו בחשבון צריך לכווץ אותו מתחת ל-20MB. זה לוקח בערך ${Math.ceil(it.duration || 20)} שניות. עד אז הוא בגלריה ואפשר להופיע איתו, אבל הוא יימחק אם תסגור את הדף.`;
  $('#cmpBar').style.width = '0%'; $('#cmpProg').hidden = true; $('#cmpGo').disabled = false; $('#cmpLater').disabled = false;
  dlg.hidden = false;
  $('#cmpLater').onclick = () => { dlg.hidden = true; };
  $('#cmpGo').onclick = () => {
    $('#cmpGo').disabled = true; $('#cmpLater').disabled = true; $('#cmpProg').hidden = false;
    $('#cmpText').textContent = 'מכווץ… אל תסגור את המסך.';
    compressVideo(it.blob, p => { $('#cmpBar').style.width = Math.round(p * 100) + '%'; })
      .then(async small => {
        $('#cmpText').textContent = `שומר בחשבון (${(small.size / 1048576).toFixed(1)}MB)…`;
        const r = await Store.assets.upload(small, { type: small.type });
        Object.assign(it, { assetId: r.id, assetUrl: r.url, size: r.sizeBytes, blob: small }); delete it.unsaved;
        const live = byId(it.id); if (live && live !== it) Object.assign(live, it), delete live.unsaved;
        await persist(byId(it.id) || it);
        dlg.hidden = true; toast('הסרטון כווץ ונשמר בחשבון ✓');
        if (curScreen() === 'manage') renderManage();
        if (E.item && E.item.id === it.id) { Object.assign(E.item, { assetId: r.id, assetUrl: r.url, size: r.sizeBytes }); delete E.item.unsaved; syncUnsaved(); }
      })
      .catch(err => { $('#cmpText').textContent = 'הכיווץ או השמירה נכשלו: ' + errText(err) + '. הסרטון עדיין בגלריה עד סגירת הדף.'; $('#cmpLater').disabled = false; $('#cmpLater').textContent = 'סגור'; });
  };
}
function setEdTab(t) {
  $('#edit').dataset.tab = t;
  $$('#edTabs [data-go]').forEach(b => { b.classList.toggle('on', b.dataset.go === t); b.setAttribute('aria-selected', b.dataset.go === t); });
  window.scrollTo(0, 0);
}
$('#edTabs').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.disabled) setEdTab(b.dataset.go); });
function syncUnsaved() {
  const b = $('#edUnsaved'); if (!b || !E.item) return;
  b.hidden = !(Store.mode === 'cloud' && E.item.unsaved);
}

function niceName(f, photo) {
  const base = f.name.replace(/\.[^.]+$/, '');
  if (/^[0-9a-f-]{16,}$/i.test(base) || /^(image|video|trim)[-_.]?\d*$/i.test(base)) {
    const d = new Date(f.lastModified || Date.now());
    return `${photo ? 'תמונה' : 'סרטון'} ${d.getDate()}.${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return base;
}
async function onFiles(e) {
  if (!licensed()) { e.target.value = ''; paywall('הוספת סרטונים ותמונות משלך היא חלק מהגרסה המלאה.'); return; }
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  let last = null, n = 0; const bigOnes = [];
  for (const f of files) {
    toast(files.length > 1 ? `טוען ${n + 1} מתוך ${files.length}…` : 'טוען…', 60000);
    let info;
    try { info = await inspect(f); } catch (err) { toast(`${f.name}: ${err.message || 'לא ניתן לפתוח'}`, 4000); continue; }
    const photo = info.kind === 'photo';
    let data = f;
    if (f.size > 300 * 1048576) { toast(`${f.name}: הסרטון גדול מדי (${Math.round(f.size / 1048576)}MB). קצר אותו לעד דקה ונסה שוב`, 7000); continue; }
    try { data = new Blob([await f.arrayBuffer()], { type: f.type || (photo ? 'image/jpeg' : 'video/mp4') }); } catch (e) { /* נשאר הקובץ המקורי */ }
    const t = photo ? 1.5 : info.duration ? +(info.duration * .75).toFixed(2) : 3;
    const it = normalize({
      id: uid(), kind: photo ? 'photo' : 'video', name: niceName(f, photo), fileName: f.name, size: f.size, blob: data,
      w: info.w, h: info.h, duration: info.duration, thumb: info.thumb, strip: info.strip || '', created: Date.now(), shotAt: f.lastModified || Date.now(),
      content: 'number', method: 'grid', digits: 2, trick: !photo, meta: 'none', words: DEFAULT_WORDS.slice(), regions: [newRegion(t, photo ? { fade: 3, effect: 'develop' } : {})],
    });
    if (Store.mode === 'cloud') {
      if (!Store.assets) { it.unsaved = true; toast('אין הרשאה לשמור קבצים בקישור הזה. הפריט בגלריה עד סגירת הדף', 4500); }
      else {
        toast(files.length > 1 ? `שומר ${n + 1} מתוך ${files.length} בחשבון…` : 'שומר בחשבון…', 60000);
        try { const r = await uploadMedia(f, it.kind); it.assetId = r.id; it.assetUrl = r.url; it.size = r.sizeBytes; }
        catch (err) {
          it.unsaved = true;   // נשאר בגלריה עכשיו, גם אם לא נשמר
          if (err && err.code === 'too_large' && it.kind !== 'photo') bigOnes.push(it);
          else toast(`${f.name}: לא נשמר בחשבון (${errText(err)}). הוא בגלריה עד סגירת הדף`, 6000);
        }
      }
    }
    ITEMS.push(it); await persist(it); last = it; n++;
  }
  if (!last) return;
  if (bigOnes.length) setTimeout(() => offerCompress(bigOnes[0]), 400);
  if (n === 1) { toast(last.kind === 'photo' ? 'נוספה תמונה רגילה. אפשר להפוך אותה לטריק כאן' : 'נוסף. עכשיו סמן איפה ומתי הבחירה תופיע'); E.id = last.id; go('edit'); }
  else { toast(`נוספו ${n} פריטים לגלריה`); renderManage(); }
}
$$('.file-in').forEach(inp => inp.addEventListener('change', onFiles));

/* ===================== עורך ===================== */
const E = { id: null, item: null, src: null, sel: 0, target: 'start', raf: 0, drag: null, saveT: 0, scrubbing: false };
const SAMPLE_DRAW = { type: 'draw', strokes: [
  Array.from({ length: 33 }, (_, i) => [100 + 80 * Math.cos(i / 32 * Math.PI * 2), 100 + 80 * Math.sin(i / 32 * Math.PI * 2)]),
  [[70, 80]], [[130, 80]],
  Array.from({ length: 12 }, (_, i) => [60 + i * 7.3, 120 + 25 * Math.sin(i / 11 * Math.PI)]),
] };
function fillSelect(sel, entries, value) { sel.innerHTML = entries.map(([v, n]) => `<option value="${v}">${n}</option>`).join(''); sel.value = value; }
const curRegion = () => E.item && E.item.regions[E.sel];

function syncEditorForm() {
  const it = E.item;
  const ok = Object.entries(METHODS).filter(([, m]) => m.for.includes(it.content) && !(m.video && it.kind === 'photo'));
  if (!ok.some(([k]) => k === it.method)) it.method = ok[0][0];
  fillSelect($('#edMethod'), ok.map(([k, m]) => [k, m.name]), it.method);
  $('#edMethodHelp').textContent = METHODS[it.method].help;
  $('#edTapRow').hidden = true;
  $('#edG1').textContent = it.kind === 'photo' ? 'פרטי התמונה' : 'פרטי הסרטון';
  $$('#edTabs [data-go]').forEach(b => { if (b.dataset.go === 'where' || b.dataset.go === 'look') b.disabled = it.trick === false; });
  if (it.trick === false && ['where', 'look'].includes($('#edit').dataset.tab)) setEdTab('basic');
  $('#edTrickLbl').textContent = it.kind === 'photo' ? 'תמונת טריק (עם חשיפה)' : 'סרטון טריק (עם חשיפה)';
  $('#edTap').checked = it.tapPause !== false;
  $('#edWordsWrap').hidden = it.content !== 'word';
  $('#edDigitsRow').hidden = it.content === 'drawing' || it.content === 'card';
  $('#edForce').checked = S.forceId === it.id;
  $('#edDigits').value = String(it.digits);
  $('#edDigitsHelp').textContent = it.content === 'number'
    ? `מזינים ${it.digits} ספרות. אחרי ${it.digits} נגיעות, שאר הנגיעות לא נחשבות.`
    : it.content === 'word' ? 'הספרות הן מספר המילה ברשימה. עם ספרה אחת בוחרים מבין 9 המילים הראשונות.'
    : it.content === 'card' ? 'קוד הקלף: צורה (1♠ 2♥ 3♣ 4♦) ואז ערך (1 אס … 11 נסיך, 12 מלכה, 13 מלך). למשל 27 = 7♥. בחיפוש אפשר לכתוב גם "7 לב".' : '';
  $('#edTrickWrap').hidden = it.trick === false;
  $('#edTrick').checked = it.trick !== false;
  $('#edHideLabel').textContent = it.hidden ? 'הצג בגלריה' : 'הסתר מהגלריה';
  $('#edDelete').hidden = it.id === 'demo' || (!!it.stock && it.id === it.stock);
  $('#edMeta').value = it.meta || 'none';
  const photo = it.kind === 'photo';
  $('#edTransport').hidden = photo;
  $('#rgTLabel').textContent = photo ? 'שניות אחרי שההזנה הושלמה' : 'שנייה בסרטון שבה זה מופיע';
  $('#rgNow').hidden = photo;
  $('#edTitle').textContent = it.name || 'עריכה';
}
function renderRegions() {
  const box = $('#edRegions'); box.innerHTML = '';
  E.item.regions.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (i === E.sel ? ' on' : '');
    b.textContent = `${i + 1} · ${(+r.t).toFixed(1)} שנ׳`;
    b.onclick = () => { E.sel = i; renderRegions(); };
    box.appendChild(b);
  });
  const r = curRegion();
  $$('[data-r]').forEach(el => {
    el.disabled = !r; if (!r) return;
    const v = getPath(r, el.dataset.r);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  const kb = $('#rgKeys'); kb.innerHTML = '';
  if (r) {
    if (!r.keys.length) kb.innerHTML = '<span class="help-inline">אין עדיין</span>';
    r.keys.forEach((k, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = `${(+k.t).toFixed(1)} ✕`;
      b.title = 'מחק נקודה'; b.onclick = () => { r.keys.splice(i, 1); renderRegions(); scheduleSave(); };
      kb.appendChild(b);
    });
  }
}
ENTER.edit = async () => {
  $('#edBar').hidden = false; edStatus(''); if (!$('#edit').dataset.tab || E.id !== E.lastId) setEdTab('basic'); E.lastId = E.id;
  document.documentElement.style.setProperty('--navh', ($('#edit .nav').offsetHeight || 52) + 'px');
  const src = byId(E.id); if (!src) { uiBack(); return; }
  E.item = { ...src, regions: JSON.parse(JSON.stringify(src.regions)), words: (src.words || []).slice() };
  syncUnsaved();
  E.sel = Math.min(E.sel, Math.max(0, E.item.regions.length - 1)); E.target = 'start';
  $('#edName').value = E.item.name;
  $('#edContent').value = E.item.content;
  $('#edWords').value = E.item.words.join('\n');
  $('#edSample').value = S.sample;
  const ts = shotTime(E.item);
  $('#edShot').value = new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  fillSelect($('#rgFont'), Object.entries(FONTS).map(([k, f]) => [k, f.name]), 'hand');
  syncEditorForm(); renderRegions();
  try { const live = byId(E.item.id); await checkPlayable(live); if (live && live.blob) E.item.blob = live.blob; E.src = makeSource(E.item); await E.src.ready(); } catch (err) { toast(err.message, 8000); if (/נמחק/.test(err.message)) setEdTab('more'); return; }
  if (curScreen() !== 'edit') { E.src.destroy(); E.src = null; return; }
  if (!E.item.duration && E.src.duration) E.item.duration = E.src.duration;
  E.item.w = E.src.w; E.item.h = E.src.h;
  $('#edScrub').max = E.src.duration || E.item.duration || 10;
  sizeEdCanvas();
  const r = curRegion(); if (r) E.src.time = Math.min(r.t + (r.fade || 0), (E.src.duration || 10) - .05);
  cancelAnimationFrame(E.raf); edLoop();
};
LEAVE.edit = async () => {
  $('#edBar').hidden = true;
  cancelAnimationFrame(E.raf);
  if (E.src) { E.src.destroy(); E.src = null; }
  await flushEdit();
};
function commitEdit() {
  const it = E.item; if (!it) return;
  const i = ITEMS.findIndex(x => x.id === it.id);
  const keep = i >= 0 ? ITEMS[i] : {};
  const merged = { ...keep, ...it, blob: keep.blob || it.blob };
  if (i >= 0) ITEMS[i] = merged; else ITEMS.push(merged);
  return merged;
}
function edStatus(kind) {
  const el = $('#edStatus'); if (!el) return;
  el.className = 'ed-status ' + (kind || '');
  el.textContent = kind === 'dirty' ? 'שומר…' : kind === 'saved' ? 'נשמר ✓' : 'כל השינויים נשמרים';
}
function scheduleSave() {
  edStatus('dirty'); clearTimeout(E.saveT);
  E.saveT = setTimeout(async () => { const m = commitEdit(); if (m) { await persist(m); edStatus('saved'); } }, 400);
}
async function flushEdit() { clearTimeout(E.saveT); const m = commitEdit(); if (m) { await persist(m); edStatus('saved'); } }

function sizeEdCanvas() {
  if (!E.src) return;
  const c = $('#edCanvas'), maxW = Math.min($('#edit .preview').clientWidth || 360, 680), maxH = innerHeight * (innerHeight < 560 ? .36 : .24);
  const s = Math.min(maxW / E.src.w, maxH / E.src.h), dpr = Math.min(devicePixelRatio || 1, 2);
  c.style.width = `${Math.round(E.src.w * s)}px`; c.style.height = `${Math.round(E.src.h * s)}px`;
  c.width = Math.round(E.src.w * s * dpr); c.height = Math.round(E.src.h * s * dpr);
}
function edPayload() {
  const it = E.item;
  if (it.content === 'drawing') return SAMPLE_DRAW;
  if (it.content === 'card') return { type: 'card', card: parseCard(S.sample) || { s: 1, v: 7 }, text: '' };
  return { type: 'text', text: S.sample || (it.content === 'word' ? it.words[0] : '47') || '47' };
}
function edLoop() {
  E.raf = requestAnimationFrame(edLoop);
  if (!E.src) return;
  const c = $('#edCanvas'), ctx = c.getContext('2d'), W = c.width, H = c.height, t = E.src.time;
  ctx.clearRect(0, 0, W, H);
  composeFrame(ctx, E.src, { regions: activeRegions(E.item) }, edPayload(), 0, W, H, $('#edShowAll').checked);
  if (E.item.trick !== false) E.item.regions.forEach((r, i) => {
    const R = regionRect(r, t), on = i === E.sel;
    ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = on ? 2.5 : 1.2;
    ctx.strokeStyle = on ? '#ffcc00' : 'rgba(255,255,255,.55)';
    ctx.strokeRect(R.x * W, R.y * H, R.w * W, R.h * H);
    if (on) { ctx.setLineDash([]); ctx.fillStyle = '#ffcc00'; ctx.fillRect((R.x + R.w) * W - 10, (R.y + R.h) * H - 10, 16, 16); }
    if (on && r.trackOn && r.keys.length) { // מסלול המעקב
      ctx.setLineDash([]); ctx.strokeStyle = '#5ac8fa'; ctx.fillStyle = '#5ac8fa'; ctx.lineWidth = 1.5; ctx.beginPath();
      [{ t: r.t, x: r.x, y: r.y, w: r.w, h: r.h }, ...r.keys].sort((a, b) => a.t - b.t).forEach((k, n) => {
        const kx = (k.x + k.w / 2) * W, ky = (k.y + k.h / 2) * H; if (n) ctx.lineTo(kx, ky); else ctx.moveTo(kx, ky);
      });
      ctx.stroke();
      r.keys.forEach(k => { ctx.beginPath(); ctx.arc((k.x + k.w / 2) * W, (k.y + k.h / 2) * H, Math.abs(k.t - t) < .15 ? 6 : 3.5, 0, 7); ctx.fill(); });
    }
    if (on && r.persp && r.persp.on) { // פינות הפרספקטיבה
      ctx.setLineDash([]); ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 2; ctx.beginPath();
      const pts = r.persp.q.map(([u, v]) => [(R.x + u * R.w) * W, (R.y + v * R.h) * H]);
      pts.forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#0a84ff'; pts.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); });
    }
    ctx.restore();
  });
  if (!E.scrubbing) $('#edScrub').value = t;
  $('#edTime').textContent = t.toFixed(2);
  $('#edPlay').textContent = E.src.paused ? '▶' : '❚❚';
}

$('#edit').addEventListener('input', e => {
  const el = e.target, it = E.item; if (!it) return;
  if (el.dataset.i) {
    it[el.dataset.i] = el.value;
    if (el.dataset.i === 'content' || el.dataset.i === 'method') syncEditorForm();
    if (el.dataset.i === 'name') $('#edTitle').textContent = el.value || 'עריכה';
  } else if (el.dataset.r && curRegion()) {
    const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) || 0 : el.value;
    setPath(curRegion(), el.dataset.r, v);
    if (el.dataset.r === 'trackOn' && v) toast('הזז את הסרגל לרגע אחר וגרור את המסגרת למקום החדש');
    if (el.dataset.r === 'persp.on' && v) toast('גרור את 4 הנקודות הכחולות לפינות המשטח');
    resetLight();
    if (el.dataset.r === 't') renderRegions();
  } else if (el.id === 'edWords') it.words = el.value.split('\n').map(s => s.trim()).filter(Boolean);
  else if (el.id === 'edDigits') { it.digits = parseInt(el.value, 10) || 2; syncEditorForm(); }
  else if (el.id === 'edTrick') { it.trick = el.checked; syncEditorForm(); }
  else if (el.id === 'edTap') it.tapPause = el.checked;
  else if (el.id === 'edForce') { S.forceId = el.checked ? it.id : (S.forceId === it.id ? '' : S.forceId); saveSettings(); return; }
  else if (el.id === 'edShot') it.shotAt = new Date(el.value).getTime() || undefined;
  else if (el.id === 'edSample') { S.sample = el.value; saveSettings(); return; }
  else if (el.name === 'edTarget') { E.target = el.value; return; }
  else return;
  scheduleSave();
});
$('#edScrub').addEventListener('input', e => { E.scrubbing = true; resetLight(); if (E.src) { E.src.pause(); E.src.time = parseFloat(e.target.value); } });
$('#edScrub').addEventListener('change', () => { E.scrubbing = false; });
$('#edPlay').onclick = () => { if (!E.src) return; if (E.src.paused) { if (E.src.ended || E.src.time >= E.src.duration - .05) E.src.time = 0; E.src.play(); } else E.src.pause(); };
$('#rgAdd').onclick = () => { E.item.regions.push(newRegion(+(E.src ? E.src.time : 0).toFixed(2))); E.sel = E.item.regions.length - 1; E.target = 'start'; renderRegions(); scheduleSave(); toast('גרור על התמונה כדי לסמן את האזור החדש'); $('#edSticky').scrollIntoView({ block: 'nearest' }); };
$('#rgDel').onclick = () => { if (!curRegion()) return; E.item.regions.splice(E.sel, 1); E.sel = Math.max(0, E.sel - 1); renderRegions(); scheduleSave(); };
$('#rgNow').onclick = () => { const r = curRegion(); if (!r || !E.src) return; r.t = +E.src.time.toFixed(2); r.keys = r.keys.filter(k => k.t > r.t); renderRegions(); scheduleSave(); };
$('#rgKeysClear').onclick = () => { const r = curRegion(); if (!r) return; r.keys = []; renderRegions(); scheduleSave(); };
$('#rgQuadReset').onclick = () => { const r = curRegion(); if (!r) return; r.persp.q = defQuad(); scheduleSave(); };
$('#edTry').onclick = async () => { if (!E.item) return; await flushEdit(); openViewer(E.item.id, { from: 'edit' }); };
$('#edUnsavedGo').onclick = () => { const it = byId(E.item && E.item.id); if (it) offerCompress(it); };
/* החלפת קובץ הסרטון / התמונה – כל ההגדרות נשמרות */
$('#edReplace').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !E.item) return;
  toast('טוען את הקובץ החדש…', 30000);
  let info; try { info = await inspect(f); } catch (err) { toast(err.message || 'לא ניתן לפתוח את הקובץ'); return; }
  let data = f; try { data = new Blob([await f.arrayBuffer()], { type: f.type || 'video/mp4' }); } catch (err) { /* ignore */ }
  const live = byId(E.item.id);
  const patch = { blob: data, kind: info.kind || 'video', w: info.w, h: info.h, duration: info.duration, thumb: info.thumb, strip: info.strip || '', size: f.size, fileName: f.name };
  if (Store.mode === 'cloud' && Store.assets) {
    try { const r = await uploadMedia(f, patch.kind); Object.assign(patch, { assetId: r.id, assetUrl: r.url, size: r.sizeBytes }); delete live.unsaved; }
    catch (err) { live.unsaved = true; toast('הקובץ הוחלף, אבל לא נשמר בחשבון: ' + errText(err), 6000); }
  }
  Object.assign(live, patch); Object.assign(E.item, patch); delete live.broken; BLOBS.delete(live.id);
  await persist(live);
  toast('הקובץ הוחלף ✓');
  go('edit', { replace: true });
});
$('#edSave').onclick = async () => { if (!E.item) return; await flushEdit(); toast('נשמר ✓', 1400); };
$('#edDone').onclick = async () => { if (E.item) await flushEdit(); uiBack(); };
$('#edStage').onclick = async () => { await flushEdit(); openViewer(E.item.id, { from: 'edit', stage: true }); };
$('#edHide').onclick = () => { E.item.hidden = !E.item.hidden; syncEditorForm(); scheduleSave(); toast(E.item.hidden ? 'הסרטון הוסתר מהגלריה' : 'הסרטון מוצג בגלריה'); };
$('#edDup').onclick = async () => {
  await flushEdit();
  const src = byId(E.item.id);
  const c = { ...src, regions: JSON.parse(JSON.stringify(src.regions)), id: uid(), name: src.name + ' (עותק)', created: Date.now() };
  if (c.builtin) c.id = 'demo_' + uid();
  ITEMS.push(c); await persist(c); toast('נוצר עותק');
  E.id = c.id; go('edit', { replace: true });
};
$('#edDelete').onclick = async () => {
  const b = $('#edDelete');
  if (!b.dataset.armed) {
    b.dataset.armed = '1'; $('span', b).textContent = 'לחץ שוב כדי למחוק לצמיתות';
    setTimeout(() => { delete b.dataset.armed; $('span', b).textContent = 'מחק סרטון'; }, 3000);
    return;
  }
  delete b.dataset.armed; $('span', b).textContent = 'מחק סרטון';
  const it = byId(E.item.id); clearTimeout(E.saveT); E.item = null;
  ITEMS = ITEMS.filter(x => x !== it);
  if (it) await Store.del(it);
  toast('הסרטון נמחק'); uiBack();
};

/* גרירה על התצוגה: סימון / הזזה / שינוי גודל של אזור */
const edCanvas = $('#edCanvas');
const normPt = e => { const b = edCanvas.getBoundingClientRect(); return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) }; };
edCanvas.addEventListener('pointerdown', e => {
  const r = curRegion(); if (!r || E.item.trick === false) return;
  const t = E.src ? E.src.time : 0, p = normPt(e), b = edCanvas.getBoundingClientRect();
  // פינות פרספקטיבה
  if (r.persp && r.persp.on) {
    const R = regionRect(r, t);
    const i = r.persp.q.findIndex(([u, v]) => Math.hypot((R.x + u * R.w - p.x) * b.width, (R.y + v * R.h - p.y) * b.height) < 24);
    if (i >= 0) { E.drag = { mode: 'corner', i, R }; edCanvas.setPointerCapture(e.pointerId); return; }
  }
  // במעקב: גרירה ברגע אחר יוצרת/עורכת נקודת מעקב
  let tgt = r;
  if (r.trackOn && t > r.t + .05) {
    let k = r.keys.find(k => Math.abs(k.t - t) < .15);
    if (!k) { const cur = regionRect(r, t); k = { t: +t.toFixed(2), x: cur.x, y: cur.y, w: cur.w, h: cur.h }; r.keys.push(k); r.keys.sort((a, c) => a.t - c.t); renderRegions(); }
    tgt = k;
  }
  const nearCorner = Math.abs(p.x - (tgt.x + tgt.w)) * b.width < 24 && Math.abs(p.y - (tgt.y + tgt.h)) * b.height < 24;
  const inside = p.x > tgt.x && p.x < tgt.x + tgt.w && p.y > tgt.y && p.y < tgt.y + tgt.h;
  E.drag = { tgt, mode: nearCorner ? 'size' : inside ? 'move' : 'new', sx: p.x, sy: p.y, o: { ...tgt } };
  if (E.drag.mode === 'new') Object.assign(tgt, { x: p.x, y: p.y, w: .001, h: .001 });
  edCanvas.setPointerCapture(e.pointerId);
});
edCanvas.addEventListener('pointermove', e => {
  const d = E.drag; if (!d) return; const p = normPt(e);
  if (d.mode === 'corner') { const R = d.R; curRegion().persp.q[d.i] = [(p.x - R.x) / R.w, (p.y - R.y) / R.h]; return; }
  const t = d.tgt;
  if (d.mode === 'move') { t.x = clamp(d.o.x + p.x - d.sx, 0, 1 - t.w); t.y = clamp(d.o.y + p.y - d.sy, 0, 1 - t.h); }
  else if (d.mode === 'size') { t.w = clamp(d.o.w + p.x - d.sx, .02, 1 - t.x); t.h = clamp(d.o.h + p.y - d.sy, .02, 1 - t.y); }
  else { t.x = Math.min(p.x, d.sx); t.y = Math.min(p.y, d.sy); t.w = Math.max(.02, Math.abs(p.x - d.sx)); t.h = Math.max(.02, Math.abs(p.y - d.sy)); }
});
const endDrag = () => { if (E.drag) { E.drag = null; scheduleSave(); } };
edCanvas.addEventListener('pointerup', endDrag); edCanvas.addEventListener('pointercancel', endDrag);

/* ===================== הגדרות ===================== */
const fillS = root => $$('[data-s]', root).forEach(el => { if (el.type === 'checkbox') el.checked = !!S[el.dataset.s]; else el.value = S[el.dataset.s] ?? ''; });
ENTER.settings = () => { $('#stPeek').textContent = PEEK.text || '—'; fillS($('#settings')); syncLicense(); };
const onSetting = e => {
  const el = e.target; if (!el.dataset.s) return;
  S[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.s === 'phTheme') applyTheme();
  if (el.dataset.s === 'phoneOS') applyOS();
  saveSettings();
};
$('#settings').addEventListener('input', onSetting);
$('#hub').addEventListener('input', onSetting);

/* ===================== צפייה / הופעה ===================== */
class SecretInput {
  constructor(item) { this.item = item; this.buf = ''; this.strokes = []; }
  get cap() { return this.item.content === 'drawing' ? Infinity : this.item.content === 'card' ? 3 : (this.item.digits || 2); }
  digit(d) { if (this.buf.length >= this.cap) return false; this.buf += d; this.at = performance.now(); return true; } // שאר הנגיעות לא נחשבות
  typeKey(k) {
    const it = this.item;
    if (it.content === 'number' && (!/\d/.test(k) || this.buf.length >= this.cap)) return false;
    if (it.content === 'card') { this.buf += k; return true; }
    if (it.content === 'word' && /\d/.test(k) && /^\d*$/.test(this.buf) && this.buf.length >= this.cap) return false;
    this.buf += k; return true;
  }
  undo() { if (this.item.content === 'drawing') this.strokes.pop(); else this.buf = this.buf.slice(0, -1); }
  complete(it) { if (it.content === 'drawing') return false;
    if (it.content === 'card' && /^\d+$/.test(this.buf) && it.method !== 'peek' && it.method !== 'pre') return this.buf.length >= 3 || (this.buf.length === 2 && (this.buf[1] !== '1' || performance.now() - (this.at || 0) > 1300)); if (it.method === 'pre' || it.method === 'peek') return !!this.buf.trim(); return /^\d+$/.test(this.buf) && this.buf.length >= this.cap; }
  get count() { return this.item.content === 'drawing' ? this.strokes.length : this.buf.length; }
  payload() {
    const it = this.item;
    if (it.content === 'drawing') return this.strokes.length ? { type: 'draw', strokes: this.strokes.map(s => s.slice()) } : null;
    const b = this.buf.trim(); if (!b) return null;
    if (it.content === 'card') { const c = parseCard(b); return c ? { type: 'card', card: c, text: cardText(c) } : null; }
    if (it.content === 'word' && /^\d+$/.test(b)) { const w = (it.words || [])[parseInt(b, 10) - 1]; return w ? { type: 'text', text: w } : null; }
    return { type: 'text', text: b };
  }
}

const P = { active: false, req: null, item: null, src: null, input: null, started: false, frozen: null, frozenAt: 0, regions: [],
  raf: 0, stage: false, vr: null, dpr: 1, menu: false, rec: null, rc: null, rctx: null, clip: null, endAt: 0, wake: null, minT: Infinity,
  chrome: true, lastPlaying: false, phIcon: null };
const stageCv = $('#stage'), sctx = stageCv.getContext('2d'), pBack = $('#pBack'), phHead = $('#phHead');
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.6v14.8c0 .8.9 1.3 1.6.9l12-7.4c.6-.4.6-1.4 0-1.8l-12-7.4C7.9 3.3 7 3.8 7 4.6z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>';
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 010 6M18 6.5a8 8 0 010 11"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const photosMode = () => !P.stage;

/* פתיחת סרטון מהגלריה או מהעורך */
function openViewer(id, opts = {}) {
  const item = byId(id); if (!item) return;
  if (item.stock && !licensed()) { paywall('הסרטונים המוכנים הם חלק מהגרסה המלאה.'); return; }
  P.req = { id, stage: !!opts.stage, from: opts.from || 'photos', preText: '' };
  if (P.req.from === 'photos') LASTVIEW = id;
  if (item.trick !== false && item.method === 'pre' && item.content !== 'drawing') go('pre');
  else go('perform');
}
ENTER.pre = () => {
  const item = byId(P.req.id);
  $('#preIn').value = ''; $('#preIn').inputMode = item && item.content === 'number' ? 'numeric' : 'text';
  setTimeout(() => $('#preIn').focus(), 60);
};
$('#preForm').addEventListener('submit', e => {
  e.preventDefault(); P.req.preText = $('#preIn').value; $('#preIn').blur();
  go('perform', { replace: true });
});

ENTER.perform = async () => {
  const req = P.req, item = byId(req.id); if (!item) { uiBack(); return; }
  const de = document.documentElement;
  if (req.stage) { try { const r = (de.requestFullscreen || de.webkitRequestFullscreen || (() => {})).call(de); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
  Object.assign(P, { active: true, item, stage: req.stage, started: false, frozen: null, frozenAt: 0, menu: false, clip: null, endAt: 0,
    lastPlaying: false, phIcon: null, tapPaused: false, regions: activeRegions(item), isPhoto: item.kind === 'photo', forceFreeze: false, lastStrokeAt: 0,
    meta: item.trick === false ? 'none' : (item.meta || 'none') });
  P.hasTrick = item.trick !== false && (P.regions.length > 0 || P.meta !== 'none');
  P.drawRegions = P.regions;
  P.input = new SecretInput(item); P.input.buf = item.method === 'peek' ? PEEK.text : (req.preText || '');
  P.minT = P.regions.length ? Math.min(...P.regions.map(r => r.t)) : Infinity;
  $('#pmenu').hidden = true; closePops();
  initPhotosUI();
  $('#pLoad').hidden = false;
  try {
    await checkPlayable(item);
    P.src = makeSource(item); await P.src.ready();
    // אם אחרי ההמתנה הסרטון עדיין בלי תמונה – מחכים עוד קצת ואז מודיעים במקום להיתקע
    if (P.src.el && !P.src.el.videoWidth) {
      await withTimeout(new Promise(r => P.src.el.addEventListener('loadedmetadata', r, { once: true })), 6000);
      if (!P.src.el.videoWidth) throw new Error('הסרטון לא נטען. נסה לסגור ולפתוח את האפליקציה, או להחליף את הקובץ בעורך');
    }
  } catch (err) { $('#pLoad').hidden = true; toast(err.message, 7000); if (P.src) { P.src.destroy(); P.src = null; } uiBack(); return; }
  $('#pLoad').hidden = true;
  if (!P.active) { P.src.destroy(); P.src = null; return; }
  P.src.time = 0;
  if (req.stage && screen.orientation && screen.orientation.lock) screen.orientation.lock(P.src.w >= P.src.h ? 'landscape' : 'portrait').catch(() => {});
  try { P.wake = await withTimeout(navigator.wakeLock?.request('screen'), 1500); } catch (e) { /* ignore */ }
  // גופנים מהאינטרנט: מחכים לכל היותר שנייה וחצי, כדי לא להיתקע בלי רשת
  try { await withTimeout(Promise.all(P.regions.map(r => document.fonts.load(`700 40px ${(FONTS[r.font] || FONTS.clean).css}`).catch(() => {}))), 1500); } catch (e) { /* ignore */ }
  sizeStage(); if (!P.isPhoto) buildStrip();
  cancelAnimationFrame(P.raf); perfLoop();
};
LEAVE.perform = () => {
  zoomReset();
  $('#pLoad').hidden = true;
  P.active = false; cancelAnimationFrame(P.raf); P.stripRun = (P.stripRun || 0) + 1;
  if (P.stripCleanup) { P.stripCleanup(); P.stripCleanup = null; }
  discardRec();
  if (P.src) { P.src.destroy(); P.src = null; }
  try { P.wake && P.wake.release(); } catch (e) { /* ignore */ }
  try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) { /* ignore */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#perform').classList.remove('ph-chrome');
};
function sizeStage() {
  P.dpr = Math.min(devicePixelRatio || 1, 2);
  stageCv.width = Math.round(innerWidth * P.dpr); stageCv.height = Math.round(innerHeight * P.dpr);
  if (P.src) P.vr = fitRect(P.src.w, P.src.h, stageCv.width, stageCv.height);
}
addEventListener('resize', () => { if (curScreen() === 'edit') sizeEdCanvas(); if (P.active) { sizeStage(); if (!P.isPhoto) buildStrip(); } });

function begin() {
  P.tapPaused = false;
  resetLight();
  P.started = true; P.frozen = null; P.frozenAt = 0; P.endAt = 0; P.clip = null; P.drawRegions = P.regions; updateHeader();
  P.src.time = 0;
  setupRecorder();
  const pr = P.src.play(); if (pr && pr.catch) pr.catch(() => toast('הקש שוב כדי לנגן'));
}
function resume() { P.endAt = 0; const pr = P.src.play(); if (pr && pr.catch) pr.catch(() => {}); }

function perfLoop() {
  P.raf = requestAnimationFrame(perfLoop);
  const src = P.src;
  const playing = !P.isPhoto && !!(src && P.started && !src.ended && !src.paused);
  const showBack = P.stage && !playing;
  if (pBack.hidden === showBack) pBack.hidden = !showBack;
  if (photosMode() && src) {
    // כמו בגלריה: הכפתורים נעלמים כשמנגנים וחוזרים כשהסרטון נגמר
    if (playing && !P.lastPlaying) { setChrome(false); closePops(); }
    if (!playing && P.lastPlaying && !P.menu && src.ended) setChrome(true);
    const dur = src.duration || P.item.duration || 1;
    phHead.style.left = (clamp(src.time / dur) * 100) + '%';
    if (P.phIcon !== playing) { P.phIcon = playing; $('#phPlay').innerHTML = playing ? ICON_PAUSE : ICON_PLAY; }
  }
  P.lastPlaying = playing;
  if (!src || !P.vr) return;
  const t = src.time;
  // הקלט ננעל ברגע שהחשיפה מתחילה (לא באמצע קו בציור)
  if (P.started && !P.frozen && !T.drawing && P.hasTrick) {
    let due;
    if (P.isPhoto) due = P.forceFreeze || P.input.complete(P.item) || (P.item.content === 'drawing' && P.input.strokes.length && performance.now() - P.lastStrokeAt > 2500);
    else due = t >= P.minT || src.ended || (P.forceFreeze && P.minT === Infinity);
    if (due) { const pl = P.input.payload(); if (pl) { P.frozen = pl; P.frozenAt = t; onFrozen(); } }
  }
  sctx.clearRect(0, 0, stageCv.width, stageCv.height);
  sctx.save(); sctx.translate(P.vr.x, P.vr.y);
  composeFrame(sctx, src, { regions: P.drawRegions }, P.frozen, P.frozenAt, P.vr.w, P.vr.h, false);
  sctx.restore();
  if (S.indicator && !P.stage && P.hasTrick) {
    const n = P.input.count, d = 2.2 * P.dpr;
    sctx.fillStyle = P.frozen ? 'rgba(120,200,120,.4)' : 'rgba(127,127,127,.35)';
    for (let i = 0; i < n; i++) sctx.fillRect(stageCv.width - (i + 1) * d * 3, stageCv.height * .5, d, d);
  }
  if (P.rec && P.rec.state === 'recording') {
    const rc = P.rc, rx = P.rctx;
    if (src.ended || (src.duration && t >= src.duration - .02 && src.paused)) {
      if (!P.endAt) P.endAt = performance.now();
      drawEndCard(rx, rc.width, rc.height, (performance.now() - P.endAt) / 1000);
      if (performance.now() - P.endAt > 3200) P.rec.stop();
    } else composeFrame(rx, src, { regions: P.drawRegions }, P.frozen, P.frozenAt, rc.width, rc.height, false);
  }
}
function drawEndCard(ctx, W, H, t) {
  ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = clamp(t / .6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const u = Math.min(W, H) / 12, name = S.contactName || '', link = S.contactLink || '';
  ctx.direction = isRTL(name) ? 'rtl' : 'ltr'; ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${u * 1.3}px "Secular One", sans-serif`; ctx.fillText(name, W / 2, H / 2 - u * .6);
  ctx.direction = isRTL(link) ? 'rtl' : 'ltr'; ctx.fillStyle = '#c7c7cc';
  ctx.font = `400 ${u * .7}px "Rubik", sans-serif`; ctx.fillText(link, W / 2, H / 2 + u * .8);
  ctx.globalAlpha = 1;
}

/* ---------- ממשק הגלריה בזמן צפייה ---------- */
function phDate(ts) {
  const d = new Date(ts), now = new Date();
  const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(now) - day0(d)) / 864e5);
  const day = diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : diff > 1 && diff < 7
    ? d.toLocaleDateString('he-IL', { weekday: 'long' })
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return [day, d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })];
}
/* ---------- חשיפה בפרטי הסרטון ---------- */
function shownDate() {
  const d = new Date(shotTime(P.item)), pl = P.frozen;
  if (!pl || pl.type !== 'text' || !/^\d+$/.test(pl.text)) return d;
  const s = pl.text, n = parseInt(s, 10);
  if (P.meta === 'time') {
    if (s.length <= 2) { if (n < 60) d.setMinutes(n); }
    else { const hh = parseInt(s.slice(0, -2), 10), mm = parseInt(s.slice(-2), 10); if (hh < 24 && mm < 60) d.setHours(hh, mm); }
  } else if (P.meta === 'date') {
    if (s.length <= 2) { if (n >= 1 && n <= 31) d.setDate(n); }
    else { const dd = parseInt(s.slice(0, -2), 10), mm = parseInt(s.slice(-2), 10); if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) d.setMonth(mm - 1, dd); }
  }
  return d;
}
function updateHeader() {
  const d = shownDate(), [day, time] = phDate(d.getTime()), pl = P.frozen;
  if (P.meta === 'place' && pl && pl.type === 'text') { $('#phDay').textContent = pl.text; $('#phTime').textContent = `${day} · ${time}`; }
  else { $('#phDay').textContent = day; $('#phTime').textContent = time; }
}
function onFrozen() {
  if (P.frozen.text) LAST.text = P.frozen.text;
  updateHeader();
  if (P.meta === 'caption' && P.frozen.type === 'text') $('.ph-caption').value = P.frozen.text;
  if (P.isPhoto && P.regions.length) {
    const t0 = P.frozenAt;
    P.drawRegions = P.regions.map(r => ({ ...r, t: t0 + r.t, keys: (r.keys || []).map(k => ({ ...k, t: t0 + k.t })) }));
  }
}
function setChrome(v) {
  P.chrome = v;
  $('#ph').classList.toggle('off', !v);
  $('#perform').classList.toggle('ph-chrome', v && photosMode());
}
function closePops() { $('#phMenu').hidden = true; $('#phSheet').hidden = true; $('#phAction').hidden = true; if (!$('#phEditor').hidden) closeEditor(); }
const anyPop = () => !$('#phMenu').hidden || !$('#phSheet').hidden || !$('#phAction').hidden;
function fakeName(it) {
  const m = (it.fileName || '').match(/^(IMG_\d+)/i); if (m) return m[1].toUpperCase();
  let h = 0; for (const ch of it.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'IMG_' + String(1000 + h % 8999);
}
function initPhotosUI() {
  const on = photosMode(), it = P.item;
  $('#ph').hidden = !on;
  $('#phHeart').classList.toggle('on', !!it.fav);
  $('#phMute').innerHTML = ICON_SOUND; $('#phPlay').innerHTML = ICON_PLAY;
  updateHeader(); $('.ph-caption').value = '';
  $('#ph').classList.toggle('is-photo', !!P.isPhoto);
  phHead.style.left = '0%';
  const sc = $('#phStrip'); sc.getContext('2d').clearRect(0, 0, sc.width, sc.height);
  setChrome(on);
}
function fillInfo() {
  const it = P.item, d = shownDate();
  const wd = d.toLocaleDateString('he-IL', { weekday: 'long' });
  const date = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#phiDate').textContent = `${wd} • ${date} • ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  $('#phiName').textContent = fakeName(it);
  const w = (P.src && P.src.w) || it.w || 1080, h = (P.src && P.src.h) || it.h || 1920, short = Math.min(w, h);
  const res = short >= 2000 ? '4K' : short >= 1000 ? '1080p' : short >= 700 ? '720p' : `${short}p`;
  const mb = it.size ? (it.size / 1048576).toFixed(1) : ((it.duration || 20) * 1.1).toFixed(1);
  $('#phiSpec').textContent = `${res} • ${w} × ${h} • ${mb} MB` + (it.kind === 'photo' ? '' : ` • ${fmtDur(it.duration)}`);
  const place = $('#phiPlace'), pl = P.frozen;
  place.hidden = !(P.meta === 'place' && pl && pl.type === 'text');
  if (!place.hidden) place.textContent = '📍 ' + pl.text;
  $('#phiDevice').textContent = it.kind === 'photo' ? 'מצלמה ראשית' : 'מצלמה ראשית · וידאו';
}
/* רצועת פריימים */
async function buildStrip() {
  if (!photosMode()) return;
  const item = P.item, cv = $('#phStrip'), dpr = P.dpr || 1;
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  if (!cv.width || !cv.height) return;
  const ctx = cv.getContext('2d'), aspect = (P.src.w || 9) / (P.src.h || 16);
  const tw = Math.max(cv.height * aspect, 8 * dpr), n = Math.ceil(cv.width / tw);
  const dur = P.src.duration || item.duration || 1, myRun = P.stripRun = (P.stripRun || 0) + 1;
  let draw;
  if (item.builtin === 'demo') { const d = new DemoSource(); draw = async (t, x) => { d.time = t; ctx.save(); ctx.translate(x, 0); d.draw(ctx, tw, cv.height); ctx.restore(); }; }
  else {
    // בלי מפענח וידאו שני: משתמשים ברצועה שנשמרה בהוספה, או בתמונה הממוזערת
    const img = new Image(); img.src = item.strip || item.thumb || '';
    if (!img.src) return;
    await new Promise(res => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } });
    if (!img.naturalWidth) return;
    const frames = item.strip ? 12 : 1, fw = img.naturalWidth / frames;
    draw = async (t, x) => {
      const f = Math.min(frames - 1, Math.floor((t / dur) * frames));
      const sh = img.naturalHeight, sw = Math.min(fw, sh * aspect), sx = f * fw + (fw - sw) / 2;
      ctx.drawImage(img, sx, 0, sw, sh, x, 0, tw, cv.height);
    };
  }
  for (let i = 0; i < n; i++) {
    if (P.stripRun !== myRun || !P.active) break;
    await draw((i + .5) / n * dur, i * tw);
  }
  if (P.stripRun === myRun && P.stripCleanup) { P.stripCleanup(); P.stripCleanup = null; }
}
(() => {
  const box = $('#phStripBox'); let drag = false;
  const seek = e => {
    if (!P.src) return; const b = box.getBoundingClientRect();
    P.src.time = clamp((e.clientX - b.left) / b.width) * (P.src.duration || P.item.duration || 1);
  };
  box.addEventListener('pointerdown', e => { drag = true; box.setPointerCapture(e.pointerId); if (P.src && !P.src.paused) P.src.pause(); seek(e); });
  box.addEventListener('pointermove', e => { if (drag) seek(e); });
  box.addEventListener('pointerup', e => {
    if (!drag) return; drag = false;
    // שיטת "גרירה ברצועה": המקום שבו עוזבים = ספרה 0–9
    if (P.item && P.item.method === 'scrub' && P.hasTrick && !P.frozen) {
      const b = box.getBoundingClientRect();
      if (P.input.digit(String(clamp(Math.floor((e.clientX - b.left) / b.width * 10), 0, 9)))) buzz();
    }
  });
  box.addEventListener('pointercancel', () => { drag = false; });
})();
$('#phPlay').onclick = () => {
  if (!P.src) return; closePops();
  P.tapPaused = false;
  if (!P.started) begin();
  else if (P.src.paused || P.src.ended) resume();
  else { P.src.pause(); P.tapPaused = true; } // נגיעה בסרטון אחרי עצירה מהכפתור ממשיכה אותו
};
$('#phBack').onclick = () => uiBack();
$('#pBack').onclick = () => uiBack();
$('#phMore').onclick = () => { const m = $('#phMenu'); const open = m.hidden; closePops(); m.hidden = !open; };
$('#phMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-pm]'); if (!b) return;
  $('#phMenu').hidden = true;
  const a = b.dataset.pm;
  if (a === 'hide') hideCurrent();
  else if (a === 'memories') go('memories');
  else if (a === 'replay') restartPerformance();
});
$('#phInfo').onclick = () => { const s = $('#phSheet'); const open = s.hidden; closePops(); if (open) { fillInfo(); s.hidden = false; } };
$('#phEdit').onclick = () => {
  closePops(); if (P.src && !P.src.paused) P.src.pause();
  $('#phEditor').hidden = false; $('#ph').classList.add('editing'); $('#peRange').value = 0; stageCv.style.filter = '';
};
const closeEditor = () => { $('#phEditor').hidden = true; $('#ph').classList.remove('editing'); stageCv.style.filter = ''; };
$('#peCancel').onclick = closeEditor; $('#peDone').onclick = closeEditor;
$('#peRange').addEventListener('input', e => {
  const v = +e.target.value, tool = $('#peTools .on').dataset.t;
  stageCv.style.filter = tool === 'bright' ? `brightness(${1 + v / 200})` : tool === 'contrast' ? `contrast(${1 + v / 200})` : `saturate(${1 + v / 100})`;
  $('#peVal').textContent = v;
});
$('#peTools').addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  $$('#peTools [data-t]').forEach(x => x.classList.toggle('on', x === b)); $('#peRange').value = 0; $('#peVal').textContent = '0'; stageCv.style.filter = '';
});
$('#phHeart').onclick = () => {
  const it = byId(P.item.id); if (!it) return;
  it.fav = !it.fav; P.item.fav = it.fav; $('#phHeart').classList.toggle('on', it.fav); persist(it);
};
$('#phMute').onclick = () => {
  const el = P.src && P.src.el; if (!el) return;
  el.muted = !el.muted; $('#phMute').innerHTML = el.muted ? ICON_MUTE : ICON_SOUND;
};
$('#phShare').onclick = async () => {
  closePops();
  if (S.record && P.clip) { shareClip(); return; }
  const it = P.item; let blob = it.blob;
  try {
    if (!blob && it.assetUrl) blob = await (await fetch(it.assetUrl)).blob();
    if (!blob) return;
    const file = new File([blob], (fakeName(it) + '.' + ((blob.type || '').includes('mp4') ? 'MP4' : 'MOV')), { type: blob.type || 'video/quicktime' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
  } catch (e) { /* בוטל */ }
};
$('#phTrash').onclick = () => { closePops(); $('#phAction').hidden = false; };
$('#phDelCancel').onclick = () => { $('#phAction').hidden = true; };
$('#phAction').addEventListener('click', e => { if (e.target.id === 'phAction') $('#phAction').hidden = true; });
$('#phDelOk').onclick = () => { $('#phAction').hidden = true; hideCurrent(); };
$('#phSheet').addEventListener('click', e => { if (e.target.classList.contains('grab')) $('#phSheet').hidden = true; });
/* החלקה בין פריטים כמו בגלריה (בעברית: ימינה = הפריט הבא) */
async function swipeItem(dir) {
  const list = ITEMS.filter(x => !x.hidden).sort((a, b) => shotTime(a) - shotTime(b));
  const i = list.findIndex(x => x.id === P.item.id), next = list[i + dir];
  if (!next) return;
  LEAVE.perform();
  P.req = { ...P.req, id: next.id, preText: '', stage: false };
  if (P.req.from === 'photos') LASTVIEW = next.id;
  $('#perform').classList.remove('swap'); void $('#perform').offsetWidth; $('#perform').classList.add('swap');
  await ENTER.perform();
}
function hideCurrent() { // "מחיקה" בגלריה = הסתרה (אפשר להחזיר בניהול)
  const it = byId(P.item.id); if (it) { it.hidden = true; persist(it); }
  uiBack();
}
function restartPerformance() {
  P.tapPaused = false;
  resetLight();
  P.input = new SecretInput(P.item); P.started = false; P.frozen = null; P.forceFreeze = false; P.drawRegions = P.regions;
  P.src.pause(); P.src.time = 0; discardRec(); setChrome(photosMode()); updateHeader(); $('.ph-caption').value = '';
}

/* ---------- הקלטה לשיתוף ---------- */
function pickMime() {
  if (!window.MediaRecorder) return null;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || '';
}
function discardRec() {
  if (P.rec && P.rec.state !== 'inactive') { P.rec.ondataavailable = null; P.rec.onstop = null; try { P.rec.stop(); } catch (e) { /* ignore */ } }
  P.rec = null; P.clip = null;
}
function setupRecorder() {
  discardRec();
  const mime = pickMime(); if (!S.record || mime === null) return;
  try {
    const src = P.src, sc = Math.min(1, 1280 / Math.max(src.w, src.h));
    const rc = P.rc = document.createElement('canvas');
    rc.width = Math.round(src.w * sc / 2) * 2; rc.height = Math.round(src.h * sc / 2) * 2;
    P.rctx = rc.getContext('2d');
    composeFrame(P.rctx, src, { regions: P.regions }, null, 0, rc.width, rc.height, false);
    const stream = rc.captureStream(30);
    if (src.el) {
      try {
        if (!src.ac) {
          src.ac = new (window.AudioContext || window.webkitAudioContext)();
          const node = src.ac.createMediaElementSource(src.el);
          src.dest = src.ac.createMediaStreamDestination();
          node.connect(src.dest); node.connect(src.ac.destination);
        }
        src.ac.resume();
        src.dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
      } catch (e) { /* בלי שמע */ }
    }
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5e6 } : undefined), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { P.clip = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }); };
    rec.start(500); P.rec = rec;
  } catch (e) { P.rec = null; }
}
async function shareClip() {
  if (!P.clip) { toast(P.rec && P.rec.state === 'recording' ? 'ההקלטה עדיין נשמרת…' : 'אין הקלטה. אפשר להפעיל אותה בהגדרות'); return; }
  const ext = P.clip.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([P.clip], `video-${Date.now()}.${ext}`, { type: P.clip.type });
  const text = [S.contactName, S.contactLink].filter(Boolean).join(' · ');
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  toast('השיתוף לא זמין כאן. באפליקציה המותקנת זה עובד');
}

/* ---------- תפריט סודי (לחיצה ארוכה) ---------- */
function openMenu() {
  if (!P.active || P.menu) return;
  P.menu = true; P.wasPlaying = P.src && !P.src.paused; if (P.wasPlaying) P.src.pause();
  $('[data-m=share]', $('#pmenu')).hidden = !S.record;
  $('#pmenu').hidden = false;
}
$('#pmenu').addEventListener('click', e => {
  const m = e.target.dataset.m; if (!m) return;
  if (m === 'share') { shareClip(); return; }
  $('#pmenu').hidden = true; P.menu = false;
  if (m === 'resume') { if (P.wasPlaying) resume(); }
  else if (m === 'restart') restartPerformance();
  else if (m === 'exit') uiBack();
});

/* ---------- מגע על הסרטון ---------- */
const touch = $('#touch');
const T = { pts: new Map(), max: 0, moved: false, t0: 0, sx: 0, sy: 0, ex: 0, ey: 0, lp: 0, lpFired: false, stroke: null, pushed: false, drawing: false };
const toVideo = e => {
  const vr = P.vr, x = (e.clientX * P.dpr - vr.x) / vr.w, y = (e.clientY * P.dpr - vr.y) / vr.h;
  return [x * P.src.w, y * P.src.h];
};
const isPlaying = () => !P.isPhoto && !!(P.src && P.started && !P.src.ended && !P.src.paused);
/* שלב ההזנה: בסרטון – בזמן ניגון; בתמונה – אחרי שהסתירו את הכפתורים ועד שהחשיפה ננעלה */
const inputPhase = () => P.isPhoto ? (P.hasTrick && P.started && !P.chrome && !P.frozen) : (isPlaying() || P.tapPaused);
const drawMode = () => P.item && P.item.content === 'drawing' && P.regions.length;

touch.addEventListener('pointerdown', e => {
  e.preventDefault(); if (P.menu || !P.src) return;
  if (anyPop()) { closePops(); T.swallow = true; return; }
  T.swallow = false;
  try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  T.pts.set(e.pointerId, true);
  if (T.pts.size === 1) {
    Object.assign(T, { max: 1, moved: false, t0: performance.now(), sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY, lpFired: false, pushed: false, drawing: false });
    T.stroke = drawMode() && inputPhase() && !P.frozen ? [toVideo(e)] : null;
    clearTimeout(T.lp);
    T.lp = setTimeout(() => { if (!T.moved && T.pts.size === 1) { T.lpFired = true; openMenu(); } }, 800);
  } else {
    T.max = Math.max(T.max, T.pts.size); clearTimeout(T.lp);
    if (T.pushed) P.input.strokes.pop();
    T.stroke = null; T.pushed = false; T.drawing = false;
  }
});
touch.addEventListener('pointermove', e => {
  if (!T.pts.has(e.pointerId) || T.pts.size !== 1) return;
  if (Z.on && zoomAllowed()) { Z.x += e.clientX - T.ex; Z.y += e.clientY - T.ey; zoomClamp(); zoomApply(false); T.moved = true; }
  T.ex = e.clientX; T.ey = e.clientY;
  if (!T.moved && Math.hypot(e.clientX - T.sx, e.clientY - T.sy) > 10) { T.moved = true; clearTimeout(T.lp); }
  if (T.stroke && T.moved) {
    if (!T.pushed) { P.input.strokes.push(T.stroke); T.pushed = true; T.drawing = true; }
    T.stroke.push(toVideo(e));
  }
});
function pointerEnd(e) {
  if (!T.pts.has(e.pointerId)) return;
  T.pts.delete(e.pointerId);
  if (T.pts.size) return;
  clearTimeout(T.lp); T.drawing = false;
  const dur = performance.now() - T.t0, stroke = T.stroke; T.stroke = null;
  if (T.swallow || T.lpFired || P.menu || e.type === 'pointercancel') return;
  if (T.max >= 2) { if (P.started && !P.frozen && P.hasTrick) { P.input.undo(); buzz(); } return; }
  if (T.moved) {
    // החלקה למטה סוגרת את הסרטון, כמו בגלריה (רק כשהוא לא מתנגן)
    if (Z.on) return; // בזמן זום גוררים את התמונה, לא סוגרים ולא מחליפים
    const dx = T.ex - T.sx, dy = T.ey - T.sy;
    if (!inputPhase() && !T.pushed && dy > 110 && Math.abs(dx) < 90) { uiBack(); return; }
    if (!inputPhase() && !T.pushed && photosMode() && Math.abs(dx) > 70 && Math.abs(dy) < 70) { swipeItem(dx > 0 ? 1 : -1); return; }
    if (T.pushed) { buzz(); P.lastStrokeAt = performance.now(); }
    return;
  }
  if (dur < 500) secretTap(e, stroke);
}
touch.addEventListener('pointerup', pointerEnd);
touch.addEventListener('pointercancel', pointerEnd);
touch.addEventListener('contextmenu', e => e.preventDefault());

function secretTap(e, stroke) {
  if (P.isPhoto) {
    if (!P.hasTrick || P.frozen) {
      // הקשה כפולה = זום, כמו בגלריה. הקשה אחת = הצג/הסתר כפתורים
      const now = performance.now();
      if (now - Z.tapAt < 300) { clearTimeout(Z.tapT); Z.tapAt = 0; zoomToggle(e.clientX, e.clientY); return; }
      Z.tapAt = now; clearTimeout(Z.tapT); Z.tapT = setTimeout(() => { if (!Z.on) setChrome(!P.chrome); }, 310);
      return;
    }
    if (!P.started) { P.started = true; P.src.play(); setChrome(false); return; } // נגיעה ראשונה מסתירה כפתורים ומתחילה
    if (P.chrome) { setChrome(false); return; }
    const it = P.item;
    if (it.content === 'drawing') { if (stroke) { P.input.strokes.push(stroke); P.lastStrokeAt = performance.now(); buzz(); } return; }
    if (it.method !== 'grid') return;
    const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 3), 0, 2);
    if (P.input.digit(String(row * 3 + col + 1))) buzz();
    return;
  }
  // נגיעה כשהסרטון נעצר בנגיעה קודמת: ממשיכה את הסרטון (וקולטת ספרה)
  if (P.tapPaused) {
    P.tapPaused = false;
    if (!P.frozen && P.hasTrick && P.item.method === 'grid') tapDigit(e);
    resume(); return;
  }
  if (!isPlaying()) {
    // לפני ניגון / בסוף: נגיעה מסתירה ומציגה את הכפתורים כמו בגלריה. במצב במה נגיעה מתחילה.
    if (photosMode()) setChrome(!P.chrome);
    else if (!P.started) begin();
    return;
  }
  const it = P.item;
  // ציור נסתר: נגיעה היא נקודה בציור, לא עצירה
  if (it.content === 'drawing' && P.hasTrick && !P.frozen) { if (stroke) { P.input.strokes.push(stroke); buzz(); } return; }
  // בכל הסרטונים: נגיעה עוצרת, והנגיעה הבאה ממשיכה. במקשים הנסתרים כל נגיעה גם נקלטת כספרה.
  if (!P.frozen && P.hasTrick && it.method === 'grid') tapDigit(e);
  P.src.pause(); P.tapPaused = true;
  // כמו באייפון: העצירה מציגה גם את הפס התחתון עם כל הכפתורים. ההמשך מסתיר אותו שוב
  if (photosMode()) setChrome(true);
}
function tapDigit(e) {
  const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 3), 0, 2);
  if (P.input.digit(String(row * 3 + col + 1))) buzz();
}

document.addEventListener('keydown', e => {
  if (!P.active) { if (e.key === 'Escape' && NAV.stack.length > 1 && curScreen() !== 'photos') uiBack(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (P.menu) $('[data-m=resume]').click(); else openMenu(); return; }
  if (P.menu) return;
  if (!P.started) { if ([' ', 'Enter', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'PageDown', 'PageUp'].includes(e.key)) { e.preventDefault(); if (P.isPhoto) { P.started = true; P.src.play(); setChrome(false); } else begin(); } return; }
  if (P.frozen || drawMode() || !P.hasTrick) return;
  if (e.key === 'Enter') { P.forceFreeze = true; e.preventDefault(); return; }
  if (e.key === 'Backspace') P.input.undo();
  else if (e.key.length === 1 && e.key !== ' ') { if (!P.input.typeKey(e.key)) return; }
  else if (e.key === ' ' && P.item.content === 'word' && P.input.buf) P.input.buf += ' ';
  else return;
  e.preventDefault(); buzz();
});
document.addEventListener('visibilitychange', async () => {
  if (P.active && document.visibilityState === 'visible') { try { P.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* ignore */ } }
});



/* ===================== רישיון: גרסת ניסיון / גרסה מלאה ===================== */
const GK = window.GK || { NAME: 'גלריית הקסם', PRICE: 99, PAY_URL: '', WHATSAPP: '', SITE: '', SALT: '', CODES: [] };
const cyrb53 = (str, seed = 7) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GK/, '');
const codeValid = c => { const n = normCode(c); return n.length === 8 && GK.CODES.includes(cyrb53(n + GK.SALT)); };
const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]lock=1/.test(location.search); // סביבת פיתוח בלבד
const licensed = () => DEV || codeValid(S.license);
const buyUrl = () => GK.PAY_URL || (GK.SITE ? GK.SITE + 'buy.html#buy' : '#');
function syncLicense() {
  const full = licensed(), chip = $('#hubLic');
  chip.textContent = full ? 'גרסה מלאה ✓' : `גרסת ניסיון · לגרסה המלאה ב-${GK.PRICE} ₪`;
  chip.classList.toggle('full', full);
  $('#stLicText').textContent = full ? 'גרסה מלאה ✓' : 'גרסת ניסיון. הזן קוד או רכוש';
}
function paywall(why) {
  $('#payWhy').textContent = (why ? why + ' ' : '') + 'בגרסת הניסיון אפשר לנסות את סרטון ההדגמה. הגרסה המלאה פותחת הכל:';
  const a = $('#payBuy'); a.textContent = `לרכישה · ${GK.PRICE} ₪, תשלום אחד`; a.href = buyUrl();
  $('#payErr').hidden = true; $('#payCode').value = ''; $('#pay').hidden = false;
}
/* בדיקה לפני פעולה בתשלום. מחזיר true אם מותר להמשיך */
function needFull(why) { if (licensed()) return true; paywall(why); return false; }
$('#payClose').onclick = () => { $('#pay').hidden = true; };
$('#pay').addEventListener('click', e => { if (e.target.id === 'pay') $('#pay').hidden = true; });
$('#payForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#payCode').value;
  if (!codeValid(v)) { $('#payErr').hidden = false; return; }
  S.license = 'GK-' + normCode(v).slice(0, 4) + '-' + normCode(v).slice(4); saveSettings();
  $('#pay').hidden = true; syncLicense(); toast('הגרסה המלאה הופעלה ✓ תהנה!', 3500);
});
$('#hubLic').onclick = () => { if (!licensed()) paywall(); };
$('#stLic').onclick = () => { if (licensed()) toast('הגרסה המלאה פעילה ✓'); else paywall(); };
/* בחירת קבצים נחסמת לפני שהגלריה של הטלפון נפתחת */
document.addEventListener('click', e => {
  const inp = e.target.closest('input[type=file]');
  if (inp && !licensed()) { e.preventDefault(); paywall('הוספת סרטונים ותמונות משלך היא חלק מהגרסה המלאה.'); }
}, true);

/* ===================== מרכז הקסמים ===================== */
function longPress(el, ms, fn) {
  let t = 0;
  el.addEventListener('pointerdown', () => { clearTimeout(t); t = setTimeout(() => { buzz(); fn(); }, ms); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
async function goHome() {
  const cur = curScreen(); if (cur === 'hub') return;
  if (LEAVE[cur]) await LEAVE[cur]();
  NAV.stack = ['hub']; try { history.pushState({ g: 1 }, ''); } catch (e) { /* ignore */ }
  paint('hub'); ENTER.hub();
}
ENTER.hub = () => { $('#hubPeek').textContent = LAST.text || '—'; fillS($('#hub')); syncLicense(); try { $('#lWallDel').hidden = !localStorage.getItem('gk-lockwall'); } catch (e) { /* ignore */ } };
const PAID_SCREENS = { song: 'השיר שבראש', lie: 'גלאי השקר', memo: 'ההקלטה מאתמול', fly: 'כרטיס הטיסה', find: 'האיתור', pin: 'קוד הנעילה', chat: 'ההודעה מלפני כמה ימים', remote: 'הקסם בטלפון של הצופה', calc: 'המחשבון', web: 'קסם החיפוש', deck: 'חפיסת הקלפים', lock: 'קסם ההתראה', call: 'השיחה הנכנסת', notes: 'הפתק הישן', sw: 'הסטופר' };
$('#hub').addEventListener('click', e => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  const t = b.dataset.open;
  if (PAID_SCREENS[t] && !needFull(`${PAID_SCREENS[t]} הוא חלק מהגרסה המלאה.`)) return;
  if (t === 'pin') PIN.home = !!b.dataset.home;
  go(t);
});
$('#mgHub').onclick = () => goHome();
$$('.exit-band').forEach(el => longPress(el, 900, goHome));
let AWAKE = null;
async function keepAwake(on) {
  try { if (on) AWAKE = await navigator.wakeLock?.request('screen'); else { AWAKE && AWAKE.release(); AWAKE = null; } } catch (e) { /* ignore */ }
}
$('#hubClear').onclick = () => { PEEK.text = ''; LAST.text = ''; LASTVIEW = null; ENTER.hub(); toast('הבחירה נוקתה'); };
const setChoice = t => { PEEK.text = t; PEEK.at = Date.now(); LAST.text = t; };

/* ---------- מחשבון עם הכרחה (כמו iOS 26: כל התרגיל מוצג בזמן ההקלדה) ---------- */
const C = { acc: null, op: null, cur: '0', fresh: true, armed: false, force: null, fi: 0, expr: '', done: false, easyUsed: false };
function calcTarget() {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  if (S.calcMode === 'time') return +(p2(d.getHours()) + p2(d.getMinutes()));
  if (S.calcMode === 'date') return +(p2(d.getDate()) + p2(d.getMonth() + 1) + d.getFullYear());
  if (S.calcMode === 'last') { const n = parseInt(String(LAST.text || '').replace(/\D/g, ''), 10); if (n) return n; }
  return parseFloat(S.calcNumber) || 1089;
}
const calcFmt = v => {
  if (!isFinite(v)) return 'שגיאה';
  if (Math.abs(v) >= 1e12) return v.toExponential(5);
  const [i, f] = String(+v.toPrecision(10)).split('.');
  return Number(i).toLocaleString('en-US') + (f ? '.' + f : '');
};
const curFmt = () => {
  const neg = C.cur.startsWith('-'), [i, f] = C.cur.replace('-', '').split('.');
  return (neg ? '-' : '') + Number(i || '0').toLocaleString('en-US') + (C.cur.includes('.') ? '.' + (f || '') : '');
};
const OPS = { '+': '+', '-': '−', '×': '×', '÷': '÷' };
function calcShow(txt, exp) {
  const el = $('#cDisp'); el.textContent = txt;
  const n = txt.length; el.style.fontSize = n <= 7 ? '' : Math.max(30, Math.floor(68 * 7.4 / n)) + 'px';
  $('#cExp').textContent = exp || '';
}
const calcMain = () => C.expr + ((C.fresh && C.op) ? '' : curFmt());
const calcApply = (a, op, b) => op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b;
function calcKey(k) {
  if (/^[\d.]$/.test(k)) {
    if (C.done) { Object.assign(C, { acc: null, op: null, cur: '0', fresh: true, expr: '', done: false }); }
    if (C.armed && C.op === '+') { // הכרחה: כל מקש מקליד את הספרה הבאה של המספר הדרוש
      if (C.force === null) {
        let need = Math.round((calcTarget() - C.acc) * 1e6) / 1e6;
        if (need <= 0) { C.armed = false; toast('הסכום כבר גדול מהתוצאה שנקבעה'); return calcKey(k); }
        C.force = String(need); C.fi = 0; C.cur = '';
      }
      if (C.fi >= C.force.length) return;
      C.cur += C.force[C.fi++]; if (C.cur === '-') C.cur += C.force[C.fi++] || '';
      C.fresh = false; calcShow(calcMain()); return;
    }
    if (C.fresh) { C.cur = k === '.' ? '0.' : k; C.fresh = false; }
    else { if (k === '.' && C.cur.includes('.')) return; if (C.cur.replace(/[-.]/g, '').length >= 9) return; C.cur = C.cur === '0' && k !== '.' ? k : C.cur + k; }
    calcShow(calcMain()); return;
  }
  if (k === 'ac') { Object.assign(C, { acc: null, op: null, cur: '0', fresh: true, armed: false, force: null, expr: '', done: false }); calcShow('0'); return; }
  if (k === 'del') {
    if (C.done || C.force !== null) return;
    if (!C.fresh) { C.cur = C.cur.length > 1 ? C.cur.slice(0, -1) : '0'; if (C.cur === '-' || C.cur === '') C.cur = '0'; if (C.cur === '0' && C.op) C.fresh = true; }
    else return;
    calcShow(calcMain() || '0'); return;
  }
  if (k === 'neg') { if (C.done) return; C.cur = C.cur.startsWith('-') ? C.cur.slice(1) : (C.cur === '0' ? '0' : '-' + C.cur); C.fresh = false; calcShow(calcMain()); return; }
  if (k === 'pct') { if (C.done) return; C.cur = String(parseFloat(C.cur) / 100); C.fresh = false; calcShow(calcMain()); return; }
  if (k === '=') {
    if (C.done) return;
    const exp = calcMain();
    if (C.op === '×' && wkPairFrom(exp)) { /* חיבור לוויקיפדיה, בלי הכרחה */ }
    else if (S.calcEasy !== '0' && C.op && !C.easyUsed && C.force === null) { // שיטה פשוטה: ה-= הראשון מביא את המספר שנקבע
      C.easyUsed = true;
      const T = calcTarget(), A = C.acc;
      let op = C.op, b = op === '+' ? T - A : op === '-' ? A - T : NaN;
      if (!isFinite(b)) { op = '+'; b = T - A; } // כפל/חילוק: מוחלפים בחיבור
      if (b < 0) { op = op === '+' ? '-' : '+'; b = -b; }
      b = Math.round(b * 1e6) / 1e6;
      const shown = C.expr.slice(0, -1) + OPS[op] + calcFmt(b); // התרגיל האפור מסתדר כך שהחשבון נכון
      C.acc = T; C.op = null; C.cur = String(T); C.fresh = true; C.expr = ''; C.done = true;
      calcShow(calcFmt(T), shown); setChoice(String(T)); return;
    }
    if (C.op) { C.acc = calcApply(C.acc, C.op, parseFloat(C.cur)); C.op = null; }
    else C.acc = parseFloat(C.cur);
    C.cur = String(C.acc); C.fresh = true; C.expr = ''; C.done = true; if (C.force !== null) { C.armed = false; C.force = null; }
    calcShow(calcFmt(C.acc), exp); return;
  }
  // + − × ÷
  if (C.done) { C.done = false; C.expr = ''; C.acc = parseFloat(C.cur); C.op = null; C.fresh = false; C.cur = String(C.acc); }
  if (C.op && C.fresh) { C.expr = C.expr.slice(0, -1) + OPS[k]; C.op = k; calcShow(calcMain()); return; } // החלפת פעולה
  if (C.op) C.acc = calcApply(C.acc, C.op, parseFloat(C.cur));
  else C.acc = parseFloat(C.cur);
  C.expr += curFmt() + OPS[k];
  C.op = k; C.fresh = true; if (C.force !== null) { C.force = null; }
  calcShow(calcMain());
}
$('#calc .c-keys').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) calcKey(b.dataset.k); });
longPress($('#cDisp'), 800, () => { C.armed = true; const d = $('#cDisp'); d.style.opacity = '.55'; setTimeout(() => d.style.opacity = '', 160); });
ENTER.calc = () => { calcKey('ac'); C.easyUsed = false; keepAwake(true); };
LEAVE.calc = () => keepAwake(false);
/* החלקה על המספר מוחקת ספרה, כמו במחשבון אמיתי */
(() => {
  const d = $('#cDisp'); let sx = null;
  d.addEventListener('pointerdown', e => { sx = e.clientX; });
  d.addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 30) calcKey('del'); sx = null; });
})();

/* ---------- חיפוש באינטרנט (הצצה): נראה כמו הדפדפן של הטלפון ---------- */
const W = { t: 0, at: 0, host: 'google.com' };
const WEB_FAVS = [['חדשות', '#e0332f'], ['מזג אוויר', '#2f7fe0'], ['ספורט', '#1f9d55'], ['מתכונים', '#f08a24'], ['מפות', '#34a3a0'], ['בנק', '#6a4fd0'], ['קניות', '#d0447a'], ['דואר', '#4a5568']];
const SF_FAVS = [['Apple', '<svg viewBox="0 0 24 24"><path fill="#6e6e73" d="M16.37 12.62c-.02-2.33 1.9-3.45 1.99-3.5-1.08-1.58-2.77-1.8-3.37-1.82-1.43-.15-2.8.84-3.53.84-.73 0-1.85-.82-3.04-.8-1.56.02-3 .91-3.81 2.31-1.62 2.82-.41 6.99 1.17 9.28.77 1.12 1.69 2.38 2.89 2.33 1.16-.05 1.6-.75 3-.75s1.8.75 3.03.73c1.25-.02 2.04-1.14 2.81-2.27.88-1.3 1.25-2.56 1.27-2.63-.03-.01-2.43-.93-2.45-3.72zM14.06 5.77c.64-.78 1.07-1.85.95-2.93-.92.04-2.04.61-2.7 1.39-.59.69-1.11 1.79-.97 2.85 1.03.08 2.07-.52 2.72-1.31z"/></svg>', 'sf-apple'], ['Bing', '<svg viewBox="0 0 48 48"><defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#37bdff"/><stop offset=".6" stop-color="#2779f0"/><stop offset="1" stop-color="#1a5bd6"/></linearGradient><linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1fd2ff"/><stop offset=".55" stop-color="#1b9cf2"/><stop offset="1" stop-color="#2468e8"/></linearGradient></defs><path d="M12 3.5l8 2.8v27.5l9.5-5.5-4.6-2.2-2.9-7.1 15 5.2v7.6L20 44.5l-8-4.5z" fill="url(#bg1)"/><path d="M22 19l15 5.2v7.6L20 44.5l-8-4.5 17.5-11.7-4.6-2.2z" fill="url(#bg2)" opacity=".9"/></svg>', ''], ['Google', '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>', '']];
$('#sfExtX').onclick = () => { $('#sfExt').hidden = true; try { localStorage.setItem('gk-sf-ext', '1'); } catch (e) { /* ignore */ } };
function webFavs() {
  const box = $('#wFavs'); box.innerHTML = '';
  if (!isAndroid()) { // ספארי: הלוגואים האמיתיים
    for (const [n, svg, cls] of SF_FAVS) { const d = document.createElement('div'); d.className = 'w-fav'; const i = document.createElement('i'); i.className = cls; i.innerHTML = svg; d.append(i, document.createTextNode(n)); box.appendChild(d); }
    try { $('#sfExt').hidden = !!localStorage.getItem('gk-sf-ext'); } catch (e) { /* ignore */ }
    return;
  }
  for (const [n, c, g] of WEB_FAVS) { const d = document.createElement('div'); d.className = 'w-fav'; const i = document.createElement('i'); i.style.background = c; i.textContent = g || n[0]; d.append(i, document.createTextNode(n)); box.appendChild(d); }
}
ENTER.web = () => {
  webFavs(); $('#wIn').value = ''; $('#wHome').hidden = false; $('#wOff').hidden = true; $('#wPeek').hidden = true; $('#wHist').hidden = true; $('#wBar').hidden = true;
  $('#web').classList.remove('is-off'); $('#wIn').placeholder = isAndroid() ? 'חיפוש או הקלדת כתובת URL' : 'חיפוש או הזנת אתר';
  clearTimeout(W.t); setTimeout(() => $('#wIn').focus(), 80);
};
/* ספארי: כשנוגעים בשורת החיפוש, הדף מתחלף ל"החיפושים האחרונים שלך יופיעו כאן" */
const sfFocus = on => { if (isAndroid()) return; const f = on && !$('#web').classList.contains('is-off'); $('#web').classList.toggle('w-focus', f); if (curScreen() === 'web') setBarColor(f ? 'webf' : 'web'); };
$('#wIn').addEventListener('focus', () => sfFocus(true));
$('#wIn').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('#wIn')) sfFocus(false); }, 120));
$('#wX').addEventListener('pointerdown', e => e.preventDefault());
$('#wX').onclick = () => { $('#wIn').value = ''; $('#wIn').blur(); sfFocus(false); };
$('#wForm').addEventListener('submit', e => {
  e.preventDefault(); const q = $('#wIn').value.trim(); if (!q || q === W.host) return;
  setChoice(q); W.at = Date.now(); $('#wIn').blur();
  $('#wIn').value = W.host; // כמו בדפדפן אמיתי: בשורת הכתובת נשאר רק שם האתר, בלי המילה של הצופה
  const bar = $('#wBar'); bar.hidden = true; void bar.offsetWidth; bar.hidden = false;   // נראה כמו טעינה אמיתית
  clearTimeout(W.t); W.t = setTimeout(() => { bar.hidden = true; $('#wHome').hidden = true; $('#wOff').hidden = false; $('#web').classList.add('is-off'); }, 2300);
});
function showHistory() {
  const box = $('#wHistList'), term = PEEK.text || LAST.text || '', fill = String(S.histFill || '').split('\n').map(x => x.trim()).filter(Boolean);
  const hhmm = (h, m) => String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const and = isAndroid();
  const row = (t, time) => {
    const d = document.createElement('div'); d.className = 'w-row';
    const i = document.createElement('i'), b = document.createElement('b'), s = document.createElement('small');
    i.textContent = 'G'; b.textContent = t + ' - חיפוש ב-Google'; s.textContent = and ? 'google.com' : 'google.com · ' + time;
    d.append(i, b, s); return d;
  };
  const day = t => { const d = document.createElement('div'); d.className = 'w-day'; d.textContent = t; return d; };
  const today = new Date(), yest = new Date(Date.now() - 864e5);
  const dayName = d => d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'short' });
  box.innerHTML = '';
  // המילה של הצופה מופיעה כחיפוש מאתמול, בין חיפושים רגילים
  box.append(day(and ? 'היום - ' + dayName(today) : 'היום'), row(fill[0] || 'מזג אוויר', hhmm(8, 12)));
  box.append(day(and ? 'אתמול - ' + dayName(yest) : 'אתמול'));
  if (fill[1]) box.append(row(fill[1], hhmm(22, 41)));
  if (term) box.append(row(term, hhmm(21, 7)));
  fill.slice(2).forEach((t, i) => box.append(row(t, hhmm(18 - i * 2, 15 + i * 9))));
  $('#wHist').hidden = false;
}
$('#wHistBtn').onclick = showHistory;
$('#wIn').addEventListener('focus', () => { if ($('#wIn').value === W.host) $('#wIn').value = ''; });
$('#wHistBack').onclick = () => { $('#wHist').hidden = true; };
$('#wRetry').onclick = () => { const bar = $('#wBar'); bar.hidden = true; void bar.offsetWidth; bar.hidden = false; clearTimeout(W.t); W.t = setTimeout(() => { bar.hidden = true; }, 1900); };
const webPeek = () => { const p = $('#wPeek'); p.textContent = PEEK.text; p.hidden = false; setTimeout(() => p.hidden = true, 1600); };
longPress($('#wOffT'), 600, webPeek); longPress($('#wOffIco'), 600, webPeek); longPress($('#wOffT2'), 600, webPeek);

/* ---------- חפיסת קלפים ---------- */
function buildDeck() {
  const fan = $('#dFan'); fan.innerHTML = '';
  for (let i = 0; i < 52; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'dcard'; b.setAttribute('aria-label', 'קלף'); fan.appendChild(b); }
  requestAnimationFrame(() => { fan.scrollLeft = (fan.scrollWidth - fan.clientWidth) / 2; });
  $('#dPick').hidden = true;
}
ENTER.deck = buildDeck;
$('#dShuffle').onclick = () => { const fan = $('#dFan'); fan.scrollTo({ left: Math.random() * (fan.scrollWidth - fan.clientWidth), behavior: 'smooth' }); };
$('#dFan').addEventListener('click', e => {
  if (!e.target.closest('.dcard')) return;
  const c = S.deckMode === 'free' ? { s: Math.floor(Math.random() * 4), v: 1 + Math.floor(Math.random() * 13) } : (parseCard(S.deckForce) || { s: 1, v: 7 });
  const red = c.s === 1 || c.s === 3, col = red ? '#c8102e' : '#141414', face = $('#dFace');
  face.innerHTML = `<div class="c1"><span></span><i></i></div><div class="mid"></div><div class="c2"><span></span><i></i></div>`;
  $$('span', face).forEach(x => x.textContent = VAL(c.v)); $$('i', face).forEach(x => x.textContent = SUITS[c.s]);
  $('.mid', face).textContent = c.v >= 11 ? VAL(c.v) + SUITS[c.s] : SUITS[c.s]; face.style.color = col;
  face.style.animation = 'none'; void face.offsetWidth; face.style.animation = '';
  $('#dPick').hidden = false; setChoice(cardText(c)); buzz();
});
$('#dPick').onclick = () => { $('#dPick').hidden = true; };

/* ---------- מסך נעול + התראה ---------- */
const L = { t: 0, tick: 0, buf: '', fired: false, torch: false, stream: null };
function lockClock() {
  const d = new Date(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  $('#lTime').textContent = isAndroid() ? hh + '\n' + mm : hh + ':' + mm;
  $('#lDate').textContent = d.toLocaleDateString('he-IL', isAndroid() ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });
  $('#lWx').textContent = '☁︎ 19°';
}
function fireNote(x) {
  if (L.fired) return; L.fired = true;
  $('#lFrom').textContent = S.notifyFrom || 'הודעה';
  $('#lText').textContent = (S.notifyBody || '{x}').split('{x}').join(x);
  const n = $('#lNote'); n.hidden = true; void n.offsetWidth; n.hidden = false;
  if (navigator.vibrate && S.vibrate) navigator.vibrate(isAndroid() ? [60, 60, 60] : [30, 90, 30]); // רטט של הודעה, לא של הקשה
}
/* פנס: באנדרואיד מדליק את הפנס האמיתי של המצלמה. באייפון הדפדפן לא מאפשר, אז רק הכפתור נדלק כמו באמת */
async function setTorch(on) {
  L.torch = on; $('#lTorch').classList.toggle('on', on);
  if (!isAndroid() || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    if (on) {
      L.stream = L.stream || await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      const tr = L.stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {};
      if (caps.torch) await tr.applyConstraints({ advanced: [{ torch: true }] });
    } else if (L.stream) { L.stream.getTracks().forEach(t => t.stop()); L.stream = null; }
  } catch (e) { /* בלי הרשאה: הכפתור עדיין נדלק */ }
}
/* כפתורי מסך הנעילה עובדים כמו בטלפון: לחיצה ארוכה */
function lockHold(el, fn) {
  let t = 0;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); el.classList.add('press'); clearTimeout(t); t = setTimeout(() => { el.classList.remove('press'); if (navigator.vibrate && S.vibrate) navigator.vibrate(18); fn(); }, isAndroid() ? 380 : 450); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { clearTimeout(t); el.classList.remove('press'); }));
  el.addEventListener('click', e => e.stopPropagation());
  el.addEventListener('contextmenu', e => e.preventDefault());
}
lockHold($('#lTorch'), () => setTorch(!L.torch));
lockHold($('#lCam'), () => { $('#lCamIn').value = ''; $('#lCamIn').click(); }); // פותח את המצלמה האמיתית של הטלפון
$('#lCamIn').addEventListener('change', () => { $('#lCamIn').value = ''; });
function lockWall() {
  let w = ''; try { w = localStorage.getItem('gk-lockwall') || ''; } catch (e) { /* ignore */ }
  const el = $('#lWall'); el.classList.toggle('own', !!w); el.style.backgroundImage = w ? `url("${w}")` : '';
  $('#lWallDel').hidden = !w;
}
$('#lWallIn').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const bmp = await createImageBitmap(f), k = Math.min(1, 1170 / bmp.width), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    localStorage.setItem('gk-lockwall', cv.toDataURL('image/jpeg', .86)); lockWall(); toast('הטפט נשמר');
  } catch (err) { toast('לא הצלחתי לשמור את התמונה. נסה תמונה אחרת'); }
});
$('#lWallDel').onclick = () => { try { localStorage.removeItem('gk-lockwall'); } catch (e) { /* ignore */ } lockWall(); };
ENTER.lock = () => {
  lockWall(); lockClock(); clearInterval(L.tick); L.tick = setInterval(lockClock, 15000);
  clearTimeout(L.t); L.buf = ''; L.fired = false; $('#lNote').hidden = true;
  L.auto = !!LAST.text;
  if (L.auto) L.t = setTimeout(() => fireNote(LAST.text), (parseFloat(S.notifyDelay) || 6) * 1000);
  keepAwake(true);
};
LEAVE.lock = () => { clearTimeout(L.t); clearInterval(L.tick); keepAwake(false); if (L.torch) setTorch(false); };
$('#lTouch').addEventListener('click', e => { // מקשים נסתרים 3×3 כשאין בחירה שנקלטה
  if (L.fired || L.auto || L.buf.length >= 2) return;
  const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor(e.clientY / innerHeight * 3), 0, 2);
  L.buf += String(row * 3 + col + 1); buzz();
  if (L.buf.length >= 2) { clearTimeout(L.t); const v = L.buf; L.t = setTimeout(() => { setChoice(v); fireNote(v); }, 2000); }
});


/* ===================== קוד הנעילה + מסך הבית + העוזר הקולי =====================
   הטלפון נפתח רק עם המספר שהצופה בחר (4–6 ספרות). אחרי הפתיחה מופיע מסך בית רגיל,
   וממנו פותחים את שאר הקסמים. לחיצה ארוכה על מקום ריק במסך הבית מפעילה את "העוזר הקולי". */
const PIN = { buf: '', tick: 0, sy: null, home: false, ai: 0 };
function pinCode() {
  const d = String(LAST.text || '').replace(/\D/g, '');
  if (d.length >= 4 && d.length <= 6) return d;
  const c = String(S.pinCode || '').replace(/\D/g, '');
  return c.length >= 4 && c.length <= 6 ? c : '1089';
}
function pinClock() {
  const d = new Date(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  $('#pTime').textContent = isAndroid() ? hh + '\n' + mm : hh + ':' + mm;
  $('#pDate').textContent = d.toLocaleDateString('he-IL', isAndroid() ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });
}
function pinDots() {
  const n = pinCode().length, box = $('#pDots'); box.innerHTML = '';
  for (let i = 0; i < n; i++) { const d = document.createElement('i'); if (i < PIN.buf.length) d.className = 'on'; box.appendChild(d); }
  $('#pDel').textContent = PIN.buf ? 'מחק' : 'ביטול';
}
function pinView(v) { // 'lock' | 'code' | 'home'
  const sc = $('#pin');
  sc.classList.toggle('p-blur', v === 'code');
  $('#pLock').classList.toggle('up', v !== 'lock'); $('#pLock').hidden = v === 'home';
  $('#pCode').hidden = v !== 'code'; $('#pHome').hidden = v !== 'home';
  if (v === 'code') { PIN.buf = ''; pinDots(); }
  if (v !== 'home') aiStop();
}
ENTER.pin = () => {
  let w = ''; try { w = localStorage.getItem('gk-lockwall') || ''; } catch (e) { /* ignore */ }
  const el = $('#pWall'); el.classList.toggle('own', !!w); el.style.backgroundImage = w ? `url("${w}")` : '';
  pinClock(); clearInterval(PIN.tick); PIN.tick = setInterval(pinClock, 15000);
  const now = new Date(); $('#hsCalNum').textContent = now.getDate(); $('#hsCalDay').textContent = now.toLocaleDateString('he-IL', { weekday: 'short' });
  pinView(PIN.home ? 'home' : 'lock'); PIN.home = false; keepAwake(true);
};
LEAVE.pin = () => { clearInterval(PIN.tick); aiStop(); keepAwake(false); };
(() => { // החלקה למעלה (או נגיעה) פותחת את מסך הקוד
  const el = $('#pLock');
  el.addEventListener('pointerdown', e => { PIN.sy = e.clientY; });
  el.addEventListener('pointerup', e => { if (PIN.sy !== null && (PIN.sy - e.clientY > 30 || e.clientY > innerHeight * .75)) pinView('code'); PIN.sy = null; });
})();
$('#pKeys').addEventListener('click', e => {
  const k = e.target.closest('[data-d]'); if (!k) return;
  const code = pinCode(); if (PIN.buf.length >= code.length) return;
  PIN.buf += k.dataset.d; pinDots();
  if (PIN.buf.length < code.length) return;
  if (PIN.buf === code) { if (navigator.vibrate) navigator.vibrate(15); setTimeout(() => pinView('home'), 160); return; }
  const dots = $('#pDots'); dots.classList.remove('bad'); void dots.offsetWidth; dots.classList.add('bad');
  if (navigator.vibrate) navigator.vibrate([70, 50, 70]);
  setTimeout(() => { PIN.buf = ''; pinDots(); dots.classList.remove('bad'); }, 480);
});
$('#pDel').onclick = () => { if (PIN.buf) { PIN.buf = PIN.buf.slice(0, -1); pinDots(); } else pinView('lock'); };
$('#pHome').addEventListener('click', e => {
  if (Date.now() - (PIN.lpAt || 0) < 700) return; // שחרור של לחיצה ארוכה
  if (PIN.ai) { aiStop(); return; }
  const a = e.target.closest('[data-app]'); if (!a) return;
  if (a.dataset.app === '-') { a.animate([{ transform: 'scale(1)' }, { transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 260 }); return; }
  go(a.dataset.app);
});
$('#pHome').addEventListener('pointerdown', e => { PIN.onApp = !!e.target.closest('[data-app], .hs-dock'); });
longPress($('#pHome'), 650, () => { if (!PIN.ai && !PIN.onApp) { PIN.lpAt = Date.now(); aiStart(); } });
function aiSpeak(text) {
  try {
    const ss = window.speechSynthesis; if (!ss) return;
    ss.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'he-IL'; u.rate = .95; u.pitch = 1;
    const v = ss.getVoices().find(x => /^he/i.test(x.lang)); if (v) u.voice = v;
    ss.speak(u);
  } catch (e) { /* בלי קול */ }
}
function aiStart() {
  const x = LAST.text || '';
  $('#aiGlow').hidden = false; $('#aiSay').hidden = true; if (navigator.vibrate) navigator.vibrate(25);
  PIN.ai = setTimeout(() => {
    const t = x ? (S.aiText || 'אתה חושב על {x}.').split('{x}').join(x) : 'לא שמעתי. תחשוב על זה שוב, חזק יותר.';
    $('#aiSay').textContent = t; $('#aiSay').hidden = false; aiSpeak(t);
    PIN.ai = setTimeout(() => { $('#aiGlow').hidden = true; PIN.ai = -1; }, 4200);
  }, 2200);
}
function aiStop() { if (PIN.ai > 0) clearTimeout(PIN.ai); PIN.ai = 0; $('#aiGlow').hidden = true; $('#aiSay').hidden = true; try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
try { speechSynthesis.getVoices(); } catch (e) { /* ignore */ }

/* ===================== הודעה מלפני כמה ימים =====================
   שיחה רגילה עם "אמא". לפני כמה ימים, באמצע הלילה, היא כתבה בדיוק את מה שהצופה בחר עכשיו. */
const CH = { buf: '' };
function chatWhen(daysAgo, h, m) {
  const d = new Date(Date.now() - daysAgo * 864e5); d.setHours(h, m, 0, 0);
  const t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  if (daysAgo === 0) return `<b>היום</b> ${t}`;
  if (daysAgo === 1) return `<b>אתמול</b> ${t}`;
  if (daysAgo < 7) return `<b>${d.toLocaleDateString('he-IL', { weekday: 'long' })}</b> ${t}`;
  return `<b>${d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${t}`;
}
function chatBuild() {
  const name = S.chatName || 'אמא', x = LAST.text || '', D = clamp(parseInt(S.chatDays, 10) || 3, 2, 6);
  $('#chName').textContent = name; $('#chAva').textContent = [...name.trim()][0] || '?';
  const L2 = [];
  const time = (d, h, m) => L2.push(`<div class="ch-time">${chatWhen(d, h, m)}</div>`);
  const b = (dir, t, tail = true) => { const e = document.createElement('div'); e.className = `bub ${dir}${tail ? ' tail' : ''}`; e.textContent = t; L2.push(e.outerHTML); };
  time(D + 6, 19, 2); b('in', 'קנית חלב?'); b('out', 'כן, ולחם'); b('in', '👍');
  time(D + 3, 12, 40); b('out', 'אגיע מאוחר היום', false); b('out', 'אל תחכי לי לאוכל'); b('in', 'בסדר. יש אורז במקרר ❤️');
  if (x) {
    time(D, 23, 14); b('in', (S.chatBody || '{x}').split('{x}').join(x));
    time(D - 1, 8, 3); b('out', 'מה?? 😂'); b('in', 'לא יודעת, זה היה חלום מוזר. רק תזכור את זה', false); b('in', 'אוהבת');
  }
  time(1, 18, 20); b('out', 'אתקשר אלייך אחר כך'); b('in', '👍');
  L2.push('<div class="ch-read">נקרא אתמול</div>');
  const list = $('#chList'); list.innerHTML = L2.join(''); list.scrollTop = list.scrollHeight;
  $('#chTouch').classList.toggle('on', !x); CH.buf = '';
}
ENTER.chat = () => { chatBuild(); };
$('#chBack').onclick = () => uiBack();
$('#chTouch').addEventListener('click', e => { // מקשים נסתרים 3×3 כשאין בחירה: שתי נגיעות = מספר
  const col = clamp(Math.floor(e.clientX / innerWidth * 3), 0, 2), row = clamp(Math.floor((e.clientY - innerHeight * .3) / (innerHeight * .5) * 3), 0, 2);
  CH.buf += String(row * 3 + col + 1); buzz();
  if (CH.buf.length >= 2) { setChoice(CH.buf); chatBuild(); }
});


/* ===================== איתור: החבר נמצא במקום שהצופה בחר =====================
   הבחירה האחרונה (שם של מקום) עוברת המרה למיקום דרך OpenStreetMap, והמפה "עפה" לשם. */
const FM = { cache: {}, run: 0 };
const FM_HOME = { lat: 32.0809, lon: 34.7806, label: 'תל אביב-יפו, ישראל' };
function fmTile(lat, lon, z) {
  const n = 2 ** z, x = (lon + 180) / 360 * n, r = lat * Math.PI / 180;
  return { x, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n };
}
function fmDraw(lat, lon, z, animate) {
  const box = $('#fmTiles'), W = innerWidth, H = innerHeight, c = fmTile(lat, lon, z), px = c.x * 256, py = c.y * 256;
  const cx = W / 2, cy = H * .36; // נקודת המרכז: מעל הגיליון התחתון
  const x0 = Math.floor((px - cx) / 256) - 1, x1 = Math.floor((px + W - cx) / 256) + 1, y0 = Math.floor((py - cy) / 256) - 1, y1 = Math.floor((py + H - cy) / 256) + 1;
  const n = 2 ** z, frag = document.createDocumentFragment();
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    const im = new Image(); im.alt = ''; im.decoding = 'async';
    im.src = `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`;
    im.style.left = (tx * 256) + 'px'; im.style.top = (ty * 256) + 'px'; frag.appendChild(im);
  }
  box.style.transition = 'none'; box.style.transformOrigin = `${px}px ${py}px`;
  box.replaceChildren(frag);
  const T = `translate(${cx - px}px, ${cy - py}px)`;
  if (!animate) { box.style.transform = T; box.style.opacity = 1; return; }
  box.style.transform = T + ' scale(.18)'; box.style.opacity = .2; void box.offsetWidth; // "מעוף" אל המקום
  box.style.transition = 'transform 1.4s cubic-bezier(.2,.7,.2,1), opacity .5s'; box.style.transform = T; box.style.opacity = 1;
}
function fmKm(a, b) {
  const R = 6371, t = x => x * Math.PI / 180, dl = t(b.lat - a.lat), dn = t(b.lon - a.lon);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function fmFind(q) {
  if (FM.cache[q]) return FM.cache[q];
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=he&q=${encodeURIComponent(q)}`);
  const j = await r.json(); if (!j[0]) return null;
  const a = j[0].address || {}, name = a.city || a.town || a.village || a.municipality || a.state || j[0].name || q;
  const place = a.country && a.country !== name ? `${name}, ${a.country}` : name;
  const type = j[0].addresstype || j[0].type || '';
  const z = /country/.test(type) ? 5 : /state|region|province/.test(type) ? 7 : /city|town|municipality/.test(type) ? 12 : 14;
  return (FM.cache[q] = { lat: +j[0].lat, lon: +j[0].lon, label: place, z });
}
ENTER.find = async () => {
  const name = S.findName || 'דני', ini = [...name.trim()][0] || '?', run = ++FM.run;
  $('#fmName').textContent = name; $('#fmAva').textContent = ini; $('#fmAva2').textContent = ini;
  $('.fm-me small').textContent = 'משתף/ת עם ' + name;
  $('#fmPlace').textContent = 'מאתר…'; $('#fmDist').textContent = ''; $('#fmPin').classList.remove('on');
  fmDraw(31.4, 35.0, 7, false); // מתחילים ממפת ישראל
  const q = String(LAST.text || '').trim();
  let loc = null;
  try { if (q) loc = await fmFind(q); } catch (e) { /* בלי אינטרנט */ }
  await new Promise(res => setTimeout(res, 1800)); // "מאתר…" כמו באמת
  if (run !== FM.run) return;
  if (!loc) loc = { ...FM_HOME, z: 12 };
  fmDraw(loc.lat, loc.lon, loc.z, true);
  setTimeout(() => {
    if (run !== FM.run) return;
    $('#fmPin').classList.add('on'); $('#fmPlace').textContent = `${loc.label} · עכשיו`;
    const km = fmKm(FM_HOME, loc); $('#fmDist').textContent = km < 1 ? '' : Math.round(km).toLocaleString('he-IL') + ' ק״מ';
    if (navigator.vibrate) navigator.vibrate(15);
  }, 900);
};
LEAVE.find = () => { FM.run++; };

$('#ghGo').onclick = async () => { // רוח רפאים: המילה מוקלדת לבד בטלפון של הצופה
  if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) return;
  const w = $('#ghIn').value.trim() || LAST.text; if (!w) { toast('כתוב מילה, או קלוט בחירה קודם'); return; }
  try { await fetch(`https://ntfy.sh/${remTopic()}x`, { method: 'POST', body: w }); toast('נשלח. המילה מוקלדת אצלו עכשיו'); $('#ghIn').value = ''; }
  catch (e) { toast('אין חיבור לאינטרנט'); }
};

/* ===================== כרטיס הטיסה =====================
   כרטיס עלייה למטוס בארנק, ליעד שהצופה בחר. שם היעד מומר לקוד שדה תעופה (רשימה של ערים מוכרות,
   ואחרת שלוש האותיות הראשונות של שם העיר באנגלית). */
const IATA = { 'פריז': 'CDG', 'לונדון': 'LHR', 'ניו יורק': 'JFK', 'רומא': 'FCO', 'ברצלונה': 'BCN', 'מדריד': 'MAD', 'אמסטרדם': 'AMS', 'ברלין': 'BER', 'אתונה': 'ATH', 'פראג': 'PRG', 'בודפשט': 'BUD', 'וינה': 'VIE', 'ליסבון': 'LIS', 'מילאנו': 'MXP', 'ונציה': 'VCE', 'דובאי': 'DXB', 'בנגקוק': 'BKK', 'טוקיו': 'HND', 'לוס אנג\'לס': 'LAX', 'מיאמי': 'MIA', 'לאס וגאס': 'LAS', 'סן פרנסיסקו': 'SFO', 'קהיר': 'CAI', 'איסטנבול': 'IST', 'מוסקבה': 'SVO', 'ז\'נבה': 'GVA', 'ציריך': 'ZRH', 'קפריסין': 'LCA', 'לרנקה': 'LCA', 'פאפוס': 'PFO', 'סידני': 'SYD', 'ריו דה ז\'ניירו': 'GIG', 'בואנוס איירס': 'EZE', 'מקסיקו סיטי': 'MEX', 'טורונטו': 'YYZ', 'מונטריאול': 'YUL', 'אילת': 'ETM', 'קייפטאון': 'CPT', 'מומבאי': 'BOM', 'דלהי': 'DEL', 'ניו דלהי': 'DEL', 'סינגפור': 'SIN', 'הונג קונג': 'HKG', 'בייג\'ינג': 'PEK', 'סיאול': 'ICN', 'מרקש': 'RAK', 'בטומי': 'BUS', 'טביליסי': 'TBS', 'בוקרשט': 'OTP', 'ורשה': 'WAW', 'קרקוב': 'KRK', 'קופנהגן': 'CPH', 'שטוקהולם': 'ARN', 'אוסלו': 'OSL', 'הלסינקי': 'HEL', 'דבלין': 'DUB', 'אדינבורו': 'EDI', 'מינכן': 'MUC', 'פרנקפורט': 'FRA', 'ניס': 'NCE', 'נאפולי': 'NAP', 'פירנצה': 'FLR', 'סופיה': 'SOF', 'בלגרד': 'BEG', 'קייב': 'KBP', 'מרסיי': 'MRS', 'ליון': 'LYS', 'רודוס': 'RHO', 'כרתים': 'HER', 'סנטוריני': 'JTR', 'מאלי': 'MLE', 'האיים המלדיביים': 'MLE', 'זנזיבר': 'ZNZ', 'סיישל': 'SEZ', 'באלי': 'DPS', 'פוקט': 'HKT', 'הוואי': 'HNL', 'שיקגו': 'ORD', 'בוסטון': 'BOS', 'וושינגטון': 'IAD', 'אורלנדו': 'MCO' };
const FLY = { run: 0 };
async function flyDest(q) {
  const key = String(q).trim();
  if (IATA[key]) return { city: key, code: IATA[key] };
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&namedetails=1&accept-language=he&q=${encodeURIComponent(key)}`);
    const j = (await r.json())[0]; if (!j) throw 0;
    const a = j.address || {}, city = a.city || a.town || a.state || a.country || j.name || key;
    if (IATA[city]) return { city, code: IATA[city] };
    const en = (j.namedetails && (j.namedetails['name:en'] || j.namedetails.name) || 'XXX').normalize('NFD').replace(/[^A-Za-z]/g, '');
    return { city, code: (en.slice(0, 3) || 'INT').toUpperCase() };
  } catch (e) { return { city: key, code: 'INT' }; }
}
function flyQr(seed) { // "ברקוד" שנראה אמיתי (לא נסרק לשום דבר)
  const c = $('#bpQr'), x = c.getContext('2d'), N = 29, s = c.width / N; let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (rnd() < .5) x.fillRect(i * s, j * s, s + .3, s + .3);
  const eye = (cx, cy) => { x.fillStyle = '#000'; x.fillRect(cx * s, cy * s, 7 * s, 7 * s); x.fillStyle = '#fff'; x.fillRect((cx + 1) * s, (cy + 1) * s, 5 * s, 5 * s); x.fillStyle = '#000'; x.fillRect((cx + 2) * s, (cy + 2) * s, 3 * s, 3 * s); };
  eye(0, 0); eye(N - 7, 0); eye(0, N - 7);
}
ENTER.fly = async () => {
  const run = ++FLY.run, d = new Date(), p2 = n => String(n).padStart(2, '0');
  const dep = new Date(d.getTime() + 3 * 3600e3); dep.setMinutes(Math.round(dep.getMinutes() / 5) * 5);
  $('#bpName').textContent = (S.flyName || 'ISRAELI/ISRAEL').toUpperCase();
  $('#bpDate').textContent = dep.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  $('#bpDep').textContent = p2(dep.getHours()) + ':' + p2(dep.getMinutes());
  const bd = new Date(dep.getTime() - 40 * 60e3); $('#bpBoard').textContent = p2(bd.getHours()) + ':' + p2(bd.getMinutes());
  const bought = new Date(d.getTime() - 6 * 864e5); $('#bpFoot').textContent = 'נקנה ב-' + bought.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) + ' · כרטיס אלקטרוני';
  $('#bpCity').textContent = '…'; $('#bpCode').textContent = '···';
  const q = String(LAST.text || '').trim() || 'פריז', dst = await flyDest(q); if (run !== FLY.run) return;
  let h = 0; for (const ch of dst.code) h = h * 31 + ch.charCodeAt(0);
  $('#bpCity').textContent = dst.city; $('#bpCode').textContent = dst.code;
  $('#bpFlt').textContent = 'SK ' + (300 + h % 600); $('#bpGate').textContent = 'B' + (2 + h % 9); $('#bpSeat').textContent = (8 + h % 22) + 'ABCDEF'[h % 6];
  flyQr(dst.code + q);
};
LEAVE.fly = () => { FLY.run++; };


/* ===================== ההקלטה מאתמול =====================
   רשימת הקלטות רגילה. ההקלטה העליונה (מאתמול בלילה) "מתנגנת": הגל זז והטלפון אומר את הבחירה בקול. */
const VM = { t: 0, raf: 0, t0: 0, dur: 9, playing: false };
const VM_ITEMS = [ // [שם, לפני כמה ימים, שעה, אורך בשניות]
  ['הקלטה חדשה 23', 1, '23:48', 9], ['רחוב הרצל', 4, '18:02', 47], ['הקלטה חדשה 22', 9, '08:15', 12], ['חזרה לפני ההופעה', 15, '21:30', 154], ['הקלטה חדשה 21', 23, '13:44', 6],
];
const vmFmt = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
function vmDay(n) { if (n === 1) return 'אתמול'; const d = new Date(Date.now() - n * 864e5); return n < 7 ? d.toLocaleDateString('he-IL', { weekday: 'long' }) : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }); }
function vmBuild() {
  const list = $('#vmList'); list.innerHTML = '';
  VM_ITEMS.forEach(([name, days, , dur], i) => {
    const it = document.createElement('div'); it.className = 'vm-it' + (i === 0 ? '' : '');
    it.innerHTML = `<b></b><div class="vm-meta"><span>${vmDay(days)}</span><span>${vmFmt(dur)}</span></div>`;
    it.querySelector('b').textContent = name;
    if (i === 0) {
      let bars = ''; let h = 7; for (let k = 0; k < 70; k++) { h = (h * 1103515245 + 12345) >>> 0; const env = k < 8 || k > 62 ? .25 : 1; bars += `<i style="height:${Math.round((8 + (h % 70)) * env)}%"></i>`; }
      it.insertAdjacentHTML('beforeend', `<div class="vm-open"><div class="vm-wave" id="vmWave">${bars}<span class="vm-head" id="vmHead"></span></div>
        <div class="vm-times"><span id="vmCur">0:00</span><span id="vmLeft">-${vmFmt(dur)}</span></div>
        <div class="vm-ctl"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5a7 7 0 107 7"/><path d="M12 2l3 3-3 3"/><text x="12" y="15" font-size="6" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg></span><span class="vm-play" id="vmPlay"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg></span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5a7 7 0 11-7 7"/><path d="M12 2L9 5l3 3"/><text x="12" y="15" font-size="6" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg></span></div></div>`);
    }
    it.addEventListener('click', e => {
      if (e.target.closest('#vmPlay')) { vmToggle(); return; }
      if (i !== 0 || e.target.closest('.vm-open')) return;
      it.classList.toggle('on');
    });
    list.appendChild(it);
  });
}
function vmDraw(t) {
  const bars = $$('#vmWave i'), k = Math.min(1, t / VM.dur);
  bars.forEach((b, j) => b.classList.toggle('p', j / bars.length < k));
  $('#vmHead').style.left = (k * 100) + '%'; $('#vmCur').textContent = vmFmt(t); $('#vmLeft').textContent = '-' + vmFmt(Math.max(0, VM.dur - t));
}
function vmToggle() {
  if (VM.playing) return vmStop();
  VM.playing = true; VM.t0 = performance.now();
  $('#vmPlay').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const x = LAST.text || '';
  const txt = x ? (S.memoText || '{x}').split('{x}').join(x) : 'בדיקה, בדיקה. אחת, שתיים.';
  VM.t = setTimeout(() => aiSpeak(txt), 1400); // נשימה קצרה לפני שהקול מתחיל, כמו בהקלטה אמיתית
  const step = () => { const t = (performance.now() - VM.t0) / 1000; vmDraw(Math.min(t, VM.dur)); if (t >= VM.dur) return vmStop(true); VM.raf = requestAnimationFrame(step); };
  step();
}
function vmStop(end) {
  VM.playing = false; clearTimeout(VM.t); cancelAnimationFrame(VM.raf); if (!end) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  const p = $('#vmPlay'); if (p) p.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>';
  if (end) setTimeout(() => vmDraw(0), 400);
}
ENTER.memo = () => { vmStop(); vmBuild(); };
LEAVE.memo = () => vmStop();


/* ===================== גלאי השקר =====================
   המצלמה האחורית קוראת את הבהירות של האצבע (זה הדופק האמיתי שמשנה את צבע העור),
   והגרף מצויר ממנה. כשאין מצלמה, הגרף מדומה. על הבחירה של הצופה הדופק "קופץ". */
const LD = { raf: 0, stream: null, cv: null, ctx: null, buf: [], bpm: 74, target: 74, busy: false, phase: 0, cam: false };
function ldOptions(x) {
  const n = String(x).replace(/\D/g, ''), isNum = n && n.length === String(x).trim().length;
  let pool;
  if (isNum) { const v = +n, set = new Set([v]); while (set.size < 6) { const d = Math.max(1, v + Math.round((Math.random() - .5) * Math.max(20, v * .6))); set.add(d); } pool = [...set].map(String); }
  else { pool = [String(x)]; const src = (DEFAULT_WORDS || []).filter(w => w !== x); while (pool.length < 6 && src.length) pool.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]); }
  return pool.sort(() => Math.random() - .5);
}
async function ldCam(on) {
  if (!on) { if (LD.stream) LD.stream.getTracks().forEach(t => t.stop()); LD.stream = null; LD.cam = false; return; }
  try {
    LD.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 }, audio: false });
    const v = $('#ldCam'); v.srcObject = LD.stream; await v.play();
    try { const t = LD.stream.getVideoTracks()[0]; if (t.getCapabilities && t.getCapabilities().torch) await t.applyConstraints({ advanced: [{ torch: true }] }); } catch (e) { /* בלי פנס */ }
    LD.cam = true; $('#ldState').textContent = 'מודד…';
  } catch (e) { LD.cam = false; $('#ldState').textContent = 'מודד…'; }
}
function ldLoop() {
  const c = $('#ldWave'), w = c.clientWidth, h = c.clientHeight, dpr = devicePixelRatio || 1;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const x = c.getContext('2d');
  // דגימה: מהמצלמה אם יש, אחרת גל דופק מדומה
  LD.bpm += (LD.target - LD.bpm) * .02;
  LD.phase += (LD.bpm / 60) / 60 * Math.PI * 2;
  let v = Math.pow(Math.max(0, Math.sin(LD.phase)), 8) * .9 + Math.sin(LD.phase * 2 + 1) * .08 + (Math.random() - .5) * .04;
  if (LD.cam) {
    try {
      const vid = $('#ldCam'); if (!LD.cv) { LD.cv = document.createElement('canvas'); LD.cv.width = 16; LD.cv.height = 12; LD.ctx = LD.cv.getContext('2d', { willReadFrequently: true }); }
      LD.ctx.drawImage(vid, 0, 0, 16, 12); const d = LD.ctx.getImageData(0, 0, 16, 12).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i];
      LD.raw = (LD.raw || sum) * .9 + sum * .1; v = v * .7 + Math.max(-1, Math.min(1, (sum - LD.raw) / 400)) * .3; // מערבב את הדופק האמיתי לגרף
    } catch (e) { /* ignore */ }
  }
  LD.buf.push(v); if (LD.buf.length > 240) LD.buf.shift();
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1; for (let gy = 0; gy < h; gy += 26) { x.beginPath(); x.moveTo(0, gy); x.lineTo(w, gy); x.stroke(); }
  x.strokeStyle = LD.target > 95 ? '#ff375f' : '#30d158'; x.lineWidth = 2.2; x.lineJoin = 'round'; x.beginPath();
  LD.buf.forEach((y, i) => { const px = w - (LD.buf.length - 1 - i) * (w / 240), py = h * .72 - y * h * .55; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
  $('#ldBpm').textContent = Math.round(LD.bpm); $('.ld-bpm').classList.toggle('hot', LD.target > 95);
  LD.raf = requestAnimationFrame(ldLoop);
}
ENTER.lie = () => {
  const x = LAST.text || '47';
  $('#ldRes').hidden = true; LD.busy = false; LD.target = 72 + Math.random() * 6; LD.bpm = LD.target; LD.buf = [];
  const box = $('#ldOpts'); box.innerHTML = '';
  ldOptions(x).forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o; b.dataset.hit = o === String(x) ? '1' : ''; box.appendChild(b); });
  $('#ldState').textContent = 'הנח אצבע על המצלמה'; ldCam(true); cancelAnimationFrame(LD.raf); ldLoop(); keepAwake(true);
};
LEAVE.lie = () => { cancelAnimationFrame(LD.raf); ldCam(false); keepAwake(false); };
$('#ldOpts').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || LD.busy || b.classList.contains('ok') || b.classList.contains('bad')) return;
  LD.busy = true; b.classList.add('wait'); $('#ldState').textContent = 'מנתח…';
  if (b.dataset.hit) { LD.target = 112 + Math.random() * 10; if (navigator.vibrate) navigator.vibrate([40, 80, 40, 80, 40]); }
  setTimeout(() => {
    b.classList.remove('wait'); LD.busy = false; $('#ldState').textContent = 'מודד…';
    if (b.dataset.hit) { b.classList.add('bad'); $('#ldRes').textContent = `שקר. בחרת ${b.textContent}.`; $('#ldRes').hidden = false; }
    else { b.classList.add('ok'); LD.target = 72 + Math.random() * 6; }
  }, 2600);
});


/* ===================== השיר שבראש =====================
   הבחירה האחרונה (שיר שהצופה חיפש) נמצאת במאגר השירים של Apple: עטיפה, זמר, וקטע של 30 שניות שמתנגן. */
const SG = { t: 0, run: 0, hit: null };
async function sgLookup(q) {
  const url = `https://itunes.apple.com/search?entity=song&limit=1&country=il&term=${encodeURIComponent(q)}`;
  const j = await (await fetch(url)).json(); const t = j.results && j.results[0]; if (!t) return null;
  return { title: t.trackName, artist: t.artistName, album: t.collectionName, year: (t.releaseDate || '').slice(0, 4), art: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb'), audio: t.previewUrl };
}
function sgReset() {
  clearTimeout(SG.t); SG.run++; const a = $('#sgAudio'); a.pause();
  $('#sgRes').hidden = true; $('#sgHome').hidden = false; $('#sgBtn').classList.remove('on');
  $('#sgHint').textContent = 'הקש/י כדי לזהות'; $('#sgSub').textContent = '';
  const q = String(LAST.text || '').trim(); SG.hit = null;
  if (q) sgLookup(q).then(h => { SG.hit = h; if (h && h.art) { const im = new Image(); im.src = h.art; } }).catch(() => {}); // טוענים מראש, בשקט
}
ENTER.song = () => sgReset();
LEAVE.song = () => { clearTimeout(SG.t); SG.run++; $('#sgAudio').pause(); };
$('#sgBtn').onclick = () => {
  const b = $('#sgBtn'); if (b.classList.contains('on')) return;
  const run = ++SG.run; b.classList.add('on'); $('#sgHint').textContent = 'מקשיב…'; $('#sgSub').textContent = 'שיר/י בראש, בלי קול';
  // מכינים את הנגן בתוך הנגיעה (באייפון מותר לנגן רק אחרי נגיעה)
  const a = $('#sgAudio'); try { a.muted = true; a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); } catch (e) { /* ignore */ }
  SG.t = setTimeout(() => {
    if (run !== SG.run) return; $('#sgHint').textContent = 'מחפש התאמה…'; $('#sgSub').textContent = '';
    SG.t = setTimeout(async () => {
      if (run !== SG.run) return;
      let h = SG.hit; if (!h && LAST.text) { try { h = await sgLookup(LAST.text); } catch (e) { /* ignore */ } }
      if (run !== SG.run) return;
      if (!h) { b.classList.remove('on'); $('#sgHint').textContent = 'אין התאמה'; $('#sgSub').textContent = 'נסה/י שוב, ולחשוב חזק יותר'; return; }
      $('#sgArt').src = h.art; $('#sgTitle').textContent = h.title; $('#sgArtist').textContent = h.artist; $('#sgAlbum').textContent = [h.album, h.year].filter(Boolean).join(' · ');
      $('#sgHome').hidden = true; $('#sgRes').hidden = false; if (navigator.vibrate) navigator.vibrate(30);
      if (h.audio) { a.src = h.audio; a.currentTime = 0; a.play().then(sgPlayIcon).catch(sgPlayIcon); }
    }, 2400);
  }, 3600);
};
function sgPlayIcon() { const a = $('#sgAudio'); $('#sgPlay').innerHTML = a.paused ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'; }
$('#sgPlay').onclick = () => { const a = $('#sgAudio'); if (a.paused) a.play().catch(() => {}); else a.pause(); setTimeout(sgPlayIcon, 50); };
$('#sgAudio').addEventListener('timeupdate', e => { const a = e.target; $('#sgProg').style.width = (a.duration ? a.currentTime / a.duration * 100 : 0) + '%'; });
$('#sgAudio').addEventListener('ended', sgPlayIcon);
$('#sgAgain').onclick = () => sgReset();

/* ===================== שיחה נכנסת ===================== */
const CALL = { t: 0, tick: 0, ac: null, ring: 0, t0: 0 };
const ICO = {
  speaker: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="M17 10l4-3v10l-4-3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM6 11a6 6 0 0012 0M12 17v4M4 4l16 16"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>',
  keypad: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="5" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="18" cy="5" r="1.7"/><circle cx="6" cy="11" r="1.7"/><circle cx="12" cy="11" r="1.7"/><circle cx="18" cy="11" r="1.7"/><circle cx="6" cy="17" r="1.7"/><circle cx="12" cy="17" r="1.7"/><circle cx="18" cy="17" r="1.7"/><circle cx="12" cy="22" r="1.7"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  hold: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>',
};
function ringStart() {
  try {
    const ac = CALL.ac; if (!ac) return; ac.resume();
    // מנגינת צלצול קצרה (שונה באייפון ובאנדרואיד), במקום צפצוף
    const notes = isAndroid() ? [659, 784, 988, 784, 659, 523] : [1047, 784, 1319, 1047, 784, 1175];
    const ring = () => {
      notes.forEach((f, k) => {
        const t = ac.currentTime + k * .17, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + .45);
        const g2 = ac.createGain(); g2.gain.value = .25; o2.connect(g2); g2.connect(g);
        o.connect(g); g.connect(ac.destination); o.start(t); o2.start(t); o.stop(t + .5); o2.stop(t + .5);
      });
      if (navigator.vibrate && S.vibrate) navigator.vibrate([400, 200, 400]);
    };
    ring(); CALL.ring = setInterval(ring, 2600);
  } catch (e) { /* בלי צליל */ }
}
function ringStop() { clearInterval(CALL.ring); CALL.ring = 0; if (navigator.vibrate) navigator.vibrate(0); }
function callReset() {
  clearTimeout(CALL.t); clearInterval(CALL.tick); ringStop(); $('#callUi').hidden = true; $('#callIn').hidden = false; $('#callOn').hidden = true;
  $('#callYes').style.transform = ''; $('#callYesA').style.transform = '';
}
function fakeNumber(name) { let h = 7; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const n = String(1000000 + h % 8999999).slice(-7); return '05' + (2 + h % 7) + '-' + n.slice(0, 3) + '-' + n.slice(3); }
function buildCallGrid() {
  const g = $('#callGrid'); g.innerHTML = '';
  const items = isAndroid()
    ? [['השתק', 'mute'], ['מקלדת', 'keypad'], ['רמקול', 'speaker'], ['הוספת שיחה', 'add'], ['המתנה', 'hold'], ['וידאו', 'video']]
    : [['רמקול', 'speaker'], ['FaceTime', 'video'], ['השתק', 'mute'], ['עוד', 'more'], [null], ['מקלדת', 'keypad']];
  for (const [label, ic] of items) {
    if (!label) { g.appendChild($('#callEnd')); continue; } // באייפון כפתור הניתוק יושב בתוך הרשת
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cg';
    b.innerHTML = `<i>${ICO[ic]}</i>`; b.append(label);
    if (ic === 'speaker' || ic === 'mute' || ic === 'hold') b.onclick = () => b.classList.toggle('on');
    g.appendChild(b);
  }
  if (isAndroid()) $('#callOn').appendChild($('#callEnd'));
}
ENTER.call = () => {
  callReset(); keepAwake(true);
  try { CALL.ac = CALL.ac || new (window.AudioContext || window.webkitAudioContext)(); CALL.ac.resume(); } catch (e) { CALL.ac = null; }
  CALL.t = setTimeout(() => {
    const name = LAST.text || S.callName || 'מספר חסוי';
    $('#callName').textContent = name; $('#callSub').textContent = isAndroid() ? 'נייד ' + fakeNumber(name) : 'נייד';
    $('#callAv').textContent = name.trim()[0] || '?'; $('#callLabel').textContent = 'שיחה נכנסת';
    $('#callUi').hidden = false; ringStart();
    $$('meta[name="theme-color"]').forEach(m => { m.content = isAndroid() ? '#141218' : '#6b7280'; });
  }, (parseFloat(S.callDelay) || 8) * 1000);
};
LEAVE.call = () => { callReset(); keepAwake(false); };
function callAnswer() {
  ringStop(); buildCallGrid(); $('#callIn').hidden = true; $('#callOn').hidden = false; CALL.t0 = Date.now();
  const tick = () => { const sec = Math.floor((Date.now() - CALL.t0) / 1000); $('#callSub').textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
  tick(); CALL.tick = setInterval(tick, 500);
}
$('#callNo').onclick = () => callReset();
$('#callEnd').onclick = () => callReset();
/* אייפון: מחליקים את הכפתור ימינה כדי לענות (נגיעה בו גם עונה) */
(function slideToAnswer() {
  const k = $('#callYes'), box = $('#callSlide'); let x0 = null, dx = 0, moved = false;
  k.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; moved = false; k.style.transition = 'none'; try { k.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } });
  k.addEventListener('pointermove', e => { if (x0 == null) return; const max = box.clientWidth - k.offsetWidth - 10; dx = clamp(e.clientX - x0, 0, max); if (dx > 6) moved = true; k.style.transform = `translateX(${dx}px)`; });
  const end = () => { if (x0 == null) return; x0 = null; const max = box.clientWidth - k.offsetWidth - 10; k.style.transition = 'transform .25s'; if (dx > max * .7) { k.style.transform = `translateX(${max}px)`; setTimeout(callAnswer, 150); } else k.style.transform = ''; };
  k.addEventListener('pointerup', end); k.addEventListener('pointercancel', end);
  k.addEventListener('click', () => { if (!moved) callAnswer(); });
})();
/* אנדרואיד: מחליקים למעלה כדי לענות, למטה כדי לדחות (נגיעה גם עונה) */
(function swipeToAnswer() {
  const o = $('#callYesA'); let y0 = null, dy = 0, moved = false;
  o.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; moved = false; o.style.animation = 'none'; try { o.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } });
  o.addEventListener('pointermove', e => { if (y0 == null) return; dy = clamp(e.clientY - y0, -140, 140); if (Math.abs(dy) > 6) moved = true; o.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; o.style.transform = ''; o.style.animation = ''; if (dy < -80) callAnswer(); else if (dy > 80) callReset(); };
  o.addEventListener('pointerup', end); o.addEventListener('pointercancel', end);
  o.addEventListener('click', () => { if (!moved) callAnswer(); });
})();

/* ===================== פתק ישן ===================== */
const NOTE_FILL = [['רשימת קניות', 'חלב\nביצים\nלחם\nעגבניות'], ['רעיונות למתנה', 'אוזניות, ספר, שובר למסעדה'], ['דברים לעשות', 'להתקשר לביטוח\nלקבוע תור לרופא'], ['סיסמה לוויי-פיי של העבודה', 'לשאול את דנה'], ['חניה', 'קומה 2, אזור C']];
function noteDate(daysAgo) { const d = new Date(Date.now() - daysAgo * 864e5); d.setHours(21, 14, 0, 0); return d; }
function noteBody() { return (S.noteBody || '{x}').split('{x}').join(LAST.text || '…'); }
function renderNotes(q) {
  const box = $('#ntItems'); box.innerHTML = '';
  const and = isAndroid();
  const all = [[NOTE_FILL[0][0], NOTE_FILL[0][1], 1], [S.noteTitle || 'לא לפתוח 🤫', '', 7, true], [NOTE_FILL[4][0], NOTE_FILL[4][1], 5],
    ...NOTE_FILL.slice(1, 4).map((n, i) => [n[0], n[1], 12 + i * 9])];
  const list = q ? all.filter(n => (n[0] + ' ' + (n[3] ? '' : n[1])).includes(q)) : all;
  const fmt = d => d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
  const period = n => n[2] < 1 ? 'היום' : n[2] < 2 ? 'אתמול' : n[2] <= 7 ? '7 הימים הקודמים' : n[2] <= 30 ? '30 הימים הקודמים' : noteDate(n[2]).toLocaleDateString('he-IL', { month: 'long' });
  const groups = and ? [['מוצמדים', n => n[3]], ['אחרים', n => !n[3]]] : [...new Set(list.map(period))].map(t => [t, n => period(n) === t]);
  for (const [title, f] of groups) {
    const part = list.filter(f); if (!part.length) continue;
    const h = document.createElement('div'); h.className = 'nt-sec'; h.textContent = title; box.appendChild(h);
    const g = document.createElement('div'); g.className = 'nt-group'; box.appendChild(g);
    for (const n of part) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nt-item';
      const t = document.createElement('b'), sp = document.createElement('span'); t.textContent = n[0];
      if (and) { sp.textContent = n[3] ? '' : n[1]; b.append(t); if (sp.textContent) b.append(sp); if (n[3]) { const c = document.createElement('small'); c.className = 'nt-chip'; c.textContent = noteDate(n[2]).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); b.append(c); } }
      else {
        sp.textContent = fmt(noteDate(n[2]));
        const em = document.createElement('em');
        if (n[3]) { em.textContent = 'נעול'; b.insertAdjacentHTML('beforeend', '<svg class="nt-lk" viewBox="0 0 12 16"><path d="M3 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="0" y="6.5" width="12" height="9.5" rx="2" fill="currentColor"/></svg>'); }
        else em.textContent = n[1].split('\n').join(' ');
        sp.append(em); b.append(t, sp);
      }
      b.onclick = () => openNote(n); g.appendChild(b);
    }
  }
  $('#ntCount').textContent = all.length === 1 ? 'פתק אחד' : `${all.length} פתקים`;
}
function showNoteText(n) {
  const d = noteDate(n[2]);
  $('#ntDate').textContent = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) + ' בשעה ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  $('#ntTitle').textContent = n[0];
  $('#ntBody').textContent = n[3] ? noteBody() : n[1];
  $('#ntEdited').textContent = 'נערך ב-' + d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  $('#ntLocked').hidden = true; $('#ntContent').hidden = false;
}
function openNote(n) {
  $('#ntView').hidden = false; $('#ntView').scrollTop = 0;
  $('#ntPadArc').setAttribute('d', PAD_SHUT); $('#ntPad').style.display = n[3] ? '' : 'none';
  if (n[3] && !isAndroid()) { // באייפון הפתק נעול: "הצגת הפתק", זיהוי פנים, ואז הוא נפתח
    $('#ntContent').hidden = true; $('#ntLocked').hidden = false; NT.cur = n; return;
  }
  showNoteText(n); if (n[3]) buzz();
}
const NT = { cur: null };
const PAD_SHUT = 'M8.5 10.5V7.5a3.5 3.5 0 017 0v3', PAD_OPEN = 'M8.5 10.5V7.5a3.5 3.5 0 017 0';
$('#ntUnlock').onclick = () => { // כמו בטלפון: Face ID קופץ למעלה, מזהה, והפתק נפתח
  const f = $('#ntFace'); f.classList.remove('ok'); f.hidden = false;
  setTimeout(() => f.classList.add('ok'), 800);
  setTimeout(() => { f.hidden = true; f.classList.remove('ok'); $('#ntPadArc').setAttribute('d', PAD_OPEN); showNoteText(NT.cur); buzz(); }, 1300);
};
ENTER.notes = () => { $('#ntSearch').value = ''; $('#ntView').hidden = true; $('#ntSearch').placeholder = isAndroid() ? 'חיפוש בפתקים' : 'חיפוש'; renderNotes(''); };
$('#ntBack').onclick = () => { $('#ntView').hidden = true; };
$('#ntSearch').addEventListener('input', e => renderNotes(e.target.value.trim()));

/* ===================== הטלפון של הצופה + שעון =====================
   הצופה מחפש בדף go.html בטלפון שלו. הדף שולח את המילה דרך ntfy.sh:
   ntfy מקפיץ התראה בטלפון של הקוסם ומשם לשעון, והאפליקציה הזאת קולטת אותה ומעבירה לכל הקסמים. */
const REM = { es: null, last: 0, qr: '' };
try { REM.last = +localStorage.getItem('gk-rem-last') || 0; } catch (e) { /* ignore */ }
const remNew = () => { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = 'gk'; const r = new Uint32Array(14); crypto.getRandomValues(r); for (const x of r) s += a[x % a.length]; return s; };
function remTopic() { if (!S.remoteTopic) { S.remoteTopic = remNew(); saveSettings(); } return S.remoteTopic; }
const remLink = () => new URL('go.html', location.href).href + '#' + remTopic() + '~' + (S.remoteMode || 'g');
function remGot(m) {
  if (!m || m.event !== 'message' || !m.message) return;
  if (m.time && m.time <= REM.last) return;
  REM.last = m.time || Math.floor(Date.now() / 1000); try { localStorage.setItem('gk-rem-last', String(REM.last)); } catch (e) { /* ignore */ }
  if (m.title === 'בדיקה') { $('#rmTestRes').textContent = 'התקבלה ✓'; return; }
  const msg = String(m.message);
  if (msg === '✓') { if (navigator.vibrate) navigator.vibrate(20); return; } // הצופה פתח את הקישור
  setChoice(msg.split('\n')[0].replace(/ \(חיפש: .*\)$/, '').slice(0, 80)); // ויקיפדיה: שם הערך בלבד
  if (navigator.vibrate) navigator.vibrate([25, 60, 25]);
  if (curScreen() === 'hub') $('#hubPeek').textContent = LAST.text;
}
function remListen() {
  if (REM.es) { try { REM.es.close(); } catch (e) { /* ignore */ } REM.es = null; }
  if (!S.remoteTopic || typeof EventSource === 'undefined' || !navigator.onLine) return;
  const since = Math.max(REM.last + 1, Math.floor(Date.now() / 1000) - 15 * 60); // רק מילים מ-15 הדקות האחרונות
  try {
    REM.es = new EventSource(`https://ntfy.sh/${S.remoteTopic}/sse?since=${since}`);
    REM.es.onmessage = e => { try { remGot(JSON.parse(e.data)); } catch (err) { /* ignore */ } };
  } catch (e) { REM.es = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') remListen(); });
addEventListener('online', remListen);
async function remCopy(text, btn) {
  const old = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'הועתק ✓'; }
  catch (e) { prompt('העתק:', text); }
  setTimeout(() => { btn.textContent = old; }, 1600);
}
// שליחת קישור בלי סריקה: חלון השיתוף של הטלפון (וואטסאפ, AirDrop, הודעה). אם אין, מעתיק
async function remShare(url, btn) {
  if (navigator.share) { try { await navigator.share({ url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  remCopy(url, btn);
}
function remFill() { $('#rmTopic').textContent = remTopic(); }
$('#rmSetup').addEventListener('toggle', () => { if ($('#rmSetup').open) remFill(); });
$('#rmCopyTopic').onclick = e => remCopy(remTopic(), e.currentTarget);
$('#rmShare').onclick = e => { if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) return; remListen(); remShare(remLink(), e.currentTarget); };
$('#rmCopyLink').onclick = e => { if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) return; remListen(); remCopy(remLink(), e.currentTarget); };
$('#rmNew').onclick = () => { S.remoteTopic = remNew(); saveSettings(); remFill(); remListen(); toast('נוצר קוד חדש. צריך להחליף אותו גם באפליקציית ntfy'); };
$('#rmTest').onclick = async () => {
  const res = $('#rmTestRes'); res.textContent = 'שולח…'; remListen();
  try {
    const r = await fetch(`https://ntfy.sh/${remTopic()}?title=${encodeURIComponent('בדיקה')}`, { method: 'POST', body: 'אם זה הגיע לשעון, הכל מוכן ✓' });
    res.textContent = r.ok ? 'נשלחה. בדוק את השעון' : r.status === 429 ? 'יותר מדי בדיקות היום, נסה מחר' : 'לא נשלחה (' + r.status + ')';
  } catch (e) { res.textContent = 'אין חיבור לאינטרנט'; }
};
ENTER.remote = () => {
  remListen();
  const box = $('#rmQr'); box.innerHTML = '';
  const link = REM.qr || remLink(); REM.qr = '';
  try { const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }
  catch (e) { box.textContent = link; }
  keepAwake(true);
};
LEAVE.remote = () => keepAwake(false);
$('#rmDone').onclick = () => uiBack();

/* ===================== ויקיפדיה בטלפון של הצופה =====================
   wikistat.html מציג מספר ערכים שארבע הספרות האחרונות שלו הן קוד, וממוצע מילים 5XX (עוד שתי ספרות).
   כשהקוסם מכפיל את שני המספרים במחשבון, האפליקציה מזהה את הקוד ומאזינה לחיפושים של הצופה (w.html). */
const WK = { es: null, code: '', got: false, t: 0 };
const wkLink = () => { const t = remTopic(); if (!REM.es) remListen(); return new URL('wikistat.html', location.href).href + '#' + t; };
function wkPairFrom(expr) { // מהמחשבון: מספר הערכים × משהו
  const e = String(expr), m = e.match(/^([\d,]{6,9})×/) || e.match(/×([\d,]{6,9})$/); return m ? wkPairNum(m[1]) : false;
}
function wkPairNum(v) { // מספר הערכים שהצופה הקריא: 5 הספרות האחרונות הן הקוד
  const n = String(v).replace(/\D/g, ''); if (n.length < 6) return false;
  wkPair(n.slice(-5)); return true;
}
function wkPair(code) {
  if (WK.es) { try { WK.es.close(); } catch (e) { /* ignore */ } }
  WK.code = code; WK.got = ''; WK.hello = false; clearTimeout(WK.t);
  if (typeof EventSource === 'undefined') return;
  try {
    WK.es = new EventSource(`https://ntfy.sh/gkw${code}/sse?since=${Math.floor(Date.now() / 1000) - 120}`);
    WK.es.onmessage = e => { try { const m = JSON.parse(e.data); if (m.event === 'message') wkGot(m.message); } catch (err) { /* ignore */ } };
  } catch (e) { WK.es = null; }
  WK.t = setTimeout(() => { if (WK.es) { WK.es.close(); WK.es = null; } }, 30 * 60 * 1000); // החיבור נסגר אחרי חצי שעה
}
function wkGot(raw) {
  let d = {}; try { d = JSON.parse(raw); } catch (e) { d = { t: String(raw) }; }
  if (d.hello) { // הטלפון של הצופה מחובר: אישור שקט לשעון, כדי שתדע שהקלדת נכון
    if (WK.hello) return; WK.hello = true;
    const st = $('#wkStat'); if (st) st.textContent = 'מחובר ✓ עכשיו שיחפש בוויקיפדיה';
    if (navigator.vibrate) navigator.vibrate(20);
    if (S.remoteTopic) fetch(`https://ntfy.sh/${S.remoteTopic}?title=${encodeURIComponent('תזכורת')}`, { method: 'POST', body: '✓' }).catch(() => {});
    return;
  }
  const word = String(d.t || d.q || '').slice(0, 80); if (!word || word === WK.got) return;
  WK.got = word; setChoice(word); // הצופה עבר לערך אחר: תמיד הערך האחרון שהוא פתח
  if (navigator.vibrate) navigator.vibrate([25, 60, 25]);
  if (S.remoteTopic) { // מעביר גם לשעון, דרך ההתראות של "הטלפון של הצופה + שעון"
    const body = (d.q && d.t && d.q !== d.t ? `${d.t} (חיפש: ${d.q})` : word) + (d.f ? `\n${d.f}…` : '');
    fetch(`https://ntfy.sh/${S.remoteTopic}?title=${encodeURIComponent('תזכורת')}`, { method: 'POST', body }).catch(() => {});
  }
}
// הצצה במחשבון: לחיצה ארוכה על השורה האפורה שמעל התוצאה
longPress($('#cExp'), 600, () => { const el = $('#cExp'), old = el.textContent; el.textContent = LAST.text || '—'; setTimeout(() => { el.textContent = old; }, 1500); });
$('#wkNum').addEventListener('input', e => {
  const n = e.target.value.replace(/\D/g, '');
  if (n.length < 6) { $('#wkStat').textContent = ''; return; }
  if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) { e.target.value = ''; return; }
  if (n.slice(-5) === WK.code) return;
  wkPairNum(n); $('#wkStat').textContent = 'ממתין לצופה…'; e.target.blur();
});
$('#wkQr').onclick = () => { if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) return; REM.qr = wkLink(); go('remote'); };
$('#wkShare').onclick = e => { if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) return; remShare(wkLink(), e.currentTarget); };
$('#wkCopy').onclick = e => { if (!needFull('הקסם בטלפון של הצופה הוא חלק מהגרסה המלאה.')) return; remCopy(wkLink(), e.currentTarget); };

/* ===================== סטופר (כמו iOS 26) ===================== */
const SW = { run: false, t0: 0, acc: 0, raf: 0, laps: [], lapAt: 0 };
const swFmt = ms => { const cs = Math.floor(ms / 10) % 100, sec = Math.floor(ms / 1000) % 60, min = Math.floor(ms / 60000); return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(cs).padStart(2, '0'); };
function swTarget() {
  const last = String(LAST.text || '').replace(/\D/g, '');
  const src = (S.swUseLast && last) ? last : String(S.swNumber || '47').replace(/\D/g, '');
  return (parseInt(src.slice(-2), 10) || 0) % 100;
}
const swNow = () => SW.acc + (SW.run ? performance.now() - SW.t0 : 0);
function swRow(label, val, cls) { const d = document.createElement('div'); if (cls) d.className = cls; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = label; b.textContent = val; d.append(a, b); return d; }
function swRenderLaps() {
  const box = $('#swLaps'); box.innerHTML = '';
  const started = SW.run || SW.acc > 0; if (!started) return;
  const n = SW.laps.length, cur = swNow() - SW.lapAt;
  box.appendChild(swRow(`הקפה מס׳ ${n + 1}`, swFmt(cur)));            // ההקפה שרצה עכשיו, למעלה
  const mn = n >= 2 ? Math.min(...SW.laps) : -1, mx = n >= 2 ? Math.max(...SW.laps) : -1;
  for (let i = n - 1; i >= 0; i--) box.appendChild(swRow(`הקפה מס׳ ${i + 1}`, swFmt(SW.laps[i]), SW.laps[i] === mn ? 'best' : SW.laps[i] === mx ? 'worst' : ''));
}
function swLoop() { if (!SW.run) return; $('#swTime').textContent = swFmt(swNow()); const first = $('#swLaps').firstChild; if (first) first.lastChild.textContent = swFmt(swNow() - SW.lapAt); SW.raf = requestAnimationFrame(swLoop); }
function swSync() {
  const r = $('#swRight'), l = $('#swLeft');
  r.textContent = SW.run ? 'עצירה' : 'התחלה'; r.className = 'sw-b ' + (SW.run ? 'stop' : 'go');
  l.textContent = (!SW.run && SW.acc) ? 'איפוס' : 'הקפה'; l.className = 'sw-b gray' + (!SW.run && !SW.acc ? ' dim' : '');
}
$('#swRight').onclick = () => {
  if (!SW.run) { SW.run = true; SW.t0 = performance.now(); swRenderLaps(); swLoop(); }
  else {
    SW.run = false; cancelAnimationFrame(SW.raf);
    let ms = SW.acc + performance.now() - SW.t0;
    // ההכרחה: המאיות יוצאות המספר שנקבע (מעגלים לזמן הקרוב ביותר שמסתיים בו)
    const base = Math.floor(ms / 1000) * 1000, want = swTarget() * 10; ms = base + want + 4; if (ms < 300) ms += 1000;
    SW.acc = ms; $('#swTime').textContent = swFmt(ms); swRenderLaps(); buzz();
  }
  swSync();
};
$('#swLeft').onclick = () => {
  if (SW.run) { const now = swNow(); SW.laps.push(now - SW.lapAt); SW.lapAt = now; swRenderLaps(); }
  else if (SW.acc) { SW.acc = 0; SW.laps = []; SW.lapAt = 0; $('#swLaps').innerHTML = ''; $('#swTime').textContent = '00:00.00'; }
  swSync();
};
ENTER.sw = () => { SW.run = false; cancelAnimationFrame(SW.raf); SW.acc = 0; SW.laps = []; SW.lapAt = 0; $('#swLaps').innerHTML = ''; $('#swTime').textContent = '00:00.00'; swSync(); keepAwake(true); };
LEAVE.sw = () => { SW.run = false; cancelAnimationFrame(SW.raf); keepAwake(false); };

/* ===================== זום בתמונה (כמו בגלריה) ===================== */
const Z = { on: false, s: 1, x: 0, y: 0, tapT: 0, tapAt: 0 };
function zoomApply(anim) { stageCv.classList.toggle('panning', !anim); stageCv.style.transform = Z.on ? `translate(${Z.x}px, ${Z.y}px) scale(${Z.s})` : ''; }
function zoomReset() { Z.on = false; Z.s = 1; Z.x = 0; Z.y = 0; clearTimeout(Z.tapT); stageCv.style.transform = ''; }
function zoomToggle(cx, cy) {
  if (Z.on) { zoomReset(); return; }
  Z.on = true; Z.s = 2.6; Z.x = -(cx * (Z.s - 1)); Z.y = -(cy * (Z.s - 1)); zoomClamp(); zoomApply(true); setChrome(false);
}
function zoomClamp() { Z.x = clamp(Z.x, -innerWidth * (Z.s - 1), 0); Z.y = clamp(Z.y, -innerHeight * (Z.s - 1), 0); }
const zoomAllowed = () => P.isPhoto && (!P.hasTrick || !!P.frozen);

/* ===================== הפעלה ===================== */
(async function init() {
  await Store.init();
  await Store.loadSettings();
  applyTheme();
  applyOS();
  remListen();
  try { ITEMS = (await Store.all()).map(normalize); } catch (e) { ITEMS = []; }
  if (!ITEMS.some(i => i.id === 'demo')) { const d = normalize(demoItem()); ITEMS.push(d); persist(d); }
  STOCK.forEach((s, i) => {
    const old = ITEMS.find(x => x.id === s.id);
    if (old && old.stockV === s.v) return;
    const d = normalize(stockItem(s, i)); d.stockV = s.v;
    if (old) { d.shotAt = old.shotAt; d.content = old.content; d.method = old.method; d.digits = old.digits; d.words = old.words; ITEMS[ITEMS.indexOf(old)] = d; }
    else ITEMS.push(d);
    persist(d);
  });
  try { history.replaceState({ g: 1 }, ''); } catch (e) { /* ignore */ }
  const root = S.startIn === 'photos' ? 'photos' : 'hub';
  NAV.stack = [root]; paint(root); ENTER[root]();
  try { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); }
  catch (e) { /* מסגרת מוגבלת */ }
})();
