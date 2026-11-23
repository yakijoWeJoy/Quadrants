// בדיקת תקינות למאגר הפאזלים: node tools/validate.js
global.window = {};
require('../js/puzzles.js');
const P = window.QUAD_PUZZLES;
let errors = 0, warns = 0;
const err = (id, m) => { errors++; console.log('❌', id, '-', m); };
const warn = (id, m) => { warns++; console.log('⚠️ ', id, '-', m); };
const ids = new Set();

function checkText(id, where, s) {
  if (typeof s !== 'string' || !s.trim()) return err(id, where + ': טקסט ריק');
  const stripped = s.replace(/\[[^\[\]\/]*\/[^\[\]\/]*\]/g, '');
  if (/[\[\]]/.test(stripped)) err(id, where + ': סוגריים מגדריים שבורים: ' + s);
}

for (const p of P) {
  const id = p.id || '(no id)';
  if (!p.id) err(id, 'חסר id');
  if (ids.has(p.id)) err(id, 'id כפול');
  ids.add(p.id);
  if (!p.topic) warn(id, 'חסר topic');
  for (const k of ['title', 'emoji']) if (!p[k]) err(id, 'חסר ' + k);
  if (!Array.isArray(p.rows) || p.rows.length !== 2) err(id, 'rows חייב להיות 2');
  [...(p.rows || []), ...(p.cols || [])].forEach(a => { if (a.length > 16) warn(id, 'כותרת ציר ארוכה: ' + a); });
  if (!Array.isArray(p.cols) || p.cols.length !== 2) err(id, 'cols חייב להיות 2');
  if (!Array.isArray(p.cards) || p.cards.length !== 4) err(id, 'cards חייב להיות 4');
  (p.cards || []).forEach((c, i) => {
    if (!c.e) err(id, 'כרטיס ' + i + ' בלי אימוג׳י');
    checkText(id, 'כרטיס ' + i, c.t);
    const len = (c.t || '').replace(/\[([^\/\]]*)\/([^\]]*)\]/g, '$2').length;
    if (len > 40) warn(id, 'כרטיס ' + i + ' ארוך (' + len + ' תווים)');
  });
  for (const k of ['rowRes', 'colRes']) {
    if (!Array.isArray(p[k]) || p[k].length !== 3) { err(id, k + ' חייב להיות 3'); continue; }
    p[k].forEach((r, i) => {
      if (!r.emoji) err(id, k + '[' + i + '] בלי אימוג׳י');
      checkText(id, k + '[' + i + '].title', r.title);
      checkText(id, k + '[' + i + '].text', r.text);
    });
  }
  if (p.slots) {
    if (p.slots.length !== 4) err(id, 'slots חייב להיות 4');
    p.slots.forEach((s, i) => checkText(id, 'slot ' + i, typeof s === 'string' ? s : s.label));
  }
}
const topics = {};
P.forEach(p => { topics[p.topic] = (topics[p.topic] || 0) + 1; });
console.log('\n' + P.length + ' פאזלים |', Object.entries(topics).map(([t, n]) => t + ':' + n).join(' '));
console.log(errors + ' שגיאות, ' + warns + ' אזהרות');
process.exit(errors ? 1 : 0);
