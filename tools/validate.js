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
  if (p.cells) {
    if (p.cells.length !== 4) err(id, 'cells חייב להיות 4');
    p.cells.forEach((c, i) => {
      if (!c.e) err(id, 'רמז ' + i + ' בלי אימוג׳י');
      checkText(id, 'רמז ' + i, c.t);
      const len = (c.t || '').replace(/\[([^\/\]]*)\/([^\]]*)\]/g, '$2').length;
      if (len > 34) warn(id, 'רמז ' + i + ' ארוך (' + len + ' תווים)');
    });
  }
  if (p.words) {
    if (p.words.length !== 4) err(id, 'words חייב להיות 4');
    p.words.forEach((w, i) => {
      const label = typeof w === 'string' ? w : w.label;
      checkText(id, 'מילה ' + i, label);
      if ((label || '').replace(/\[([^\/\]]*)\/([^\]]*)\]/g, '$2').length > 14) warn(id, 'מילה ' + i + ' ארוכה: ' + label);
    });
  }
  if (p.ideal) {
    if (p.ideal.length !== 4 || [...p.ideal].sort().join() !== '0,1,2,3') err(id, 'ideal חייב להיות סידור של 0,1,2,3');
    if (!p.idealRes) warn(id, 'יש ideal בלי idealRes');
  }
  if (p.idealRes) { checkText(id, 'idealRes.title', p.idealRes.title); checkText(id, 'idealRes.text', p.idealRes.text); }
  (p.notes || []).forEach((n, i) => {
    if (!(n.word >= 0 && n.word <= 3 && n.cell >= 0 && n.cell <= 3)) err(id, 'note ' + i + ': word/cell לא תקינים');
    checkText(id, 'note ' + i, n.text);
  });
  if (p.question) checkText(id, 'question', p.question);
  for (const k of ['rowRes', 'colRes']) {
    if (!Array.isArray(p[k]) || p[k].length !== 3) { err(id, k + ' חייב להיות 3'); continue; }
    p[k].forEach((r, i) => {
      if (!r.emoji) err(id, k + '[' + i + '] בלי אימוג׳י');
      checkText(id, k + '[' + i + '].title', r.title);
      checkText(id, k + '[' + i + '].text', r.text);
    });
  }
}
const topics = {};
P.forEach(p => { topics[p.topic] = (topics[p.topic] || 0) + 1; });
console.log('\n' + P.length + ' פאזלים |', Object.entries(topics).map(([t, n]) => t + ':' + n).join(' '));
console.log(errors + ' שגיאות, ' + warns + ' אזהרות');
process.exit(errors ? 1 : 0);
