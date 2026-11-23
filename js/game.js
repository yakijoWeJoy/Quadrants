(function () {
  'use strict';
  const cfg = window.QUAD_CONFIG || {};
  const PUZZLES = window.QUAD_PUZZLES;
  const DEFAULT_WORDS = window.QUAD_WORDS;
  const L = window.QuadLog;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const params = new URLSearchParams(location.search);

  // ---------- אחסון ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('quad_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('quad_' + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- מגדר ----------
  let gender = store.get('gender', null);
  function g(str) {
    return String(str).replace(/\[([^\/\]]*)\/([^\]]*)\]/g, (_, m, f) => {
      if (m === f) return m;
      if (gender === 'm') return m;
      if (gender === 'f') return f;
      if (m && f) return m + '/' + f;
      return '/' + (m || f);
    });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------- משחק היום ----------
  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayKey() { return dateKey(new Date()); }
  function dailyIndex() {
    const epoch = new Date((cfg.DAILY_EPOCH || '2026-01-01') + 'T00:00:00');
    const now = new Date(todayKey() + 'T00:00:00');
    const days = Math.round((now - epoch) / 86400000);
    return ((days % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  }

  // ---------- מצב ----------
  // words: 4 המילים שגוררים. wordPos[w] = null (במגש) | 0..3 (רבע במטריצה) | 'skip'
  let puzzle, words, mode, wordPos, startedAt, moves, selected = null;
  const wordInCell = (c) => wordPos.indexOf(c);

  // ---------- מסכים ----------
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // מילים לפאזל: מערך של 4 (מהערך הגבוה לנמוך), מחרוזות או אובייקטים חלקיים.
  // ערך, צבע ואימוג'י נלקחים מברירת המחדל לפי המיקום, אם לא הוגדרו.
  function normalizeWords(custom) {
    if (!custom) return DEFAULT_WORDS;
    return DEFAULT_WORDS.map((d, i) => {
      const c = custom[i];
      if (c == null) return d;
      return Object.assign({}, d, typeof c === 'string' ? { label: c } : c);
    });
  }

  // ---------- התחלת פאזל ----------
  function startPuzzle(p, how) {
    puzzle = p; mode = how;
    words = normalizeWords(p.words);
    wordPos = [null, null, null, null];
    moves = 0; selected = null;
    startedAt = Date.now();

    const badge = { daily: '📅 משחק היום', shared: '💌 מישהו שלח לך את זה', more: '🎲 ריבוע בונוס' }[how] || '';
    $('#game-badge').textContent = badge;
    $('#game-title').textContent = p.emoji + ' ' + g(p.title);
    $('#game-q').textContent = p.question ? g(p.question) : '';
    $('#game-q').hidden = !p.question;
    $('#col-0').textContent = g(p.cols[0]);
    $('#col-1').textContent = g(p.cols[1]);
    $('#row-0').textContent = g(p.rows[0]);
    $('#row-1').textContent = g(p.rows[1]);

    // רבעי ריבוע הקסם (יעדי הגרירה)
    $$('.cell').forEach((cell, i) => {
      const h = p.cells && p.cells[i];
      cell.innerHTML = (h ? '<div class="cell-hint"><span>' + h.e + '</span> ' + esc(g(h.t)) + '</div>' : '') +
        '<div class="cell-body"><span class="cell-drop">⬇</span></div>';
      cell.classList.remove('filled');
    });

    // המילים במגש
    const tray = $('#tray');
    tray.innerHTML = '';
    words.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'word word-' + w.color + ' pop-in';
      el.style.animationDelay = (i * 70) + 'ms';
      el.dataset.word = i;
      el.innerHTML = '<span class="word-e">' + w.emoji + '</span><span class="word-t">' + esc(g(w.label)) + '</span>';
      tray.appendChild(el);
      bindWord(el);
    });
    $('#skip-zone .slot-body').innerHTML = '';
    updateDone();
    show('screen-game');
    L.log('puzzle_start', { pid: p.id, topic: p.topic, mode: how });
  }

  // ---------- גרירה (עכבר + מגע) ----------
  let drag = null;

  function bindWord(el) {
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      ev.preventDefault();
      drag = { el, id: +el.dataset.word, x0: ev.clientX, y0: ev.clientY, active: false, pid: ev.pointerId };
      el.setPointerCapture && el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => cancelDrag());
  }

  function onMove(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0;
    if (!drag.active && Math.hypot(dx, dy) > 6) {
      drag.active = true;
      const r = drag.el.getBoundingClientRect();
      const ghost = drag.el.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.classList.remove('pop-in', 'selected', 'land');
      ghost.style.width = r.width + 'px';
      ghost.style.height = r.height + 'px';
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      drag.offX = drag.x0 - r.left; drag.offY = drag.y0 - r.top;
      drag.el.classList.add('dragging');
      document.body.classList.add('is-dragging');
      clearSelection();
      L.log('drag_start', { pid: puzzle.id, word: drag.id, from: where(drag.id) });
    }
    if (drag.active) {
      drag.lastX = ev.clientX; drag.lastY = ev.clientY;
      if (!drag.raf) drag.raf = requestAnimationFrame(autoScroll);
      drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.offX) + 'px,' + (ev.clientY - drag.offY) + 'px) rotate(-4deg) scale(1.08)';
      highlight(dropTarget(ev.clientX, ev.clientY));
    }
  }

  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const d = drag;
    if (d.active) {
      const target = dropTarget(ev.clientX, ev.clientY);
      cancelDrag();
      if (target) dropOn(d.id, target, 'drag');
      else L.log('drop_miss', { pid: puzzle.id, word: d.id });
    } else {
      cancelDrag();
      tapWord(d.id);
    }
  }

  // גלילה אוטומטית כשגוררים לקצה המסך (חשוב בטלפון)
  function autoScroll() {
    if (!drag || !drag.active) return;
    const edge = 70, y = drag.lastY;
    let dy = 0;
    if (y > innerHeight - edge) dy = Math.ceil((y - (innerHeight - edge)) / 4);
    else if (y < edge) dy = -Math.ceil((edge - y) / 4);
    if (dy) { window.scrollBy(0, dy); highlight(dropTarget(drag.lastX, drag.lastY)); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function cancelDrag() {
    if (!drag) return;
    if (drag.raf) cancelAnimationFrame(drag.raf);
    drag.ghost && drag.ghost.remove();
    drag.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    highlight(null);
    drag = null;
  }

  function highlight(target) { $$('.cell, .tray, .skip-zone').forEach(s => s.classList.toggle('hover', s === target)); }

  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('.cell') || el.closest('.tray') || el.closest('.skip-zone');
  }

  function where(id) { const p = wordPos[id]; return p === null ? 'tray' : p; }

  // ---------- הקשה (חלופה לגרירה) ----------
  function tapWord(id) {
    if (selected === id) { clearSelection(); return; }
    // נבחרה מילה ולוחצים על מילה שכבר ברבע – מחליפים ביניהן
    if (selected !== null && typeof wordPos[id] === 'number') {
      const s = selected; clearSelection();
      dropOn(s, $('.cell[data-cell="' + wordPos[id] + '"]'), 'tap');
      return;
    }
    clearSelection();
    selected = id;
    $('.word[data-word="' + id + '"]').classList.add('selected');
    document.body.classList.add('has-selection');
    $('#game-hint').textContent = 'עכשיו לחצו על הרבע המתאים בריבוע ☝️';
  }
  function clearSelection() {
    selected = null;
    $$('.word.selected').forEach(c => c.classList.remove('selected'));
    document.body.classList.remove('has-selection');
    $('#game-hint').textContent = 'גררו כל מילה לרבע שמתאים לה בריבוע הקסם';
  }
  $$('.cell, .tray, .skip-zone').forEach(zone => zone.addEventListener('click', (ev) => {
    if (selected === null || ev.target.closest('.word')) return;
    const s = selected; clearSelection();
    dropOn(s, zone, 'tap');
  }));

  // ---------- הנחת מילה ----------
  function dropOn(id, target, how) {
    const from = wordPos[id];
    let to;
    if (target.classList.contains('cell')) to = +target.dataset.cell;
    else if (target.classList.contains('skip-zone')) to = 'skip';
    else to = null;
    if (from === to) return;

    // רבע תפוס? המילה שהייתה בו עוברת למקום שממנו הגיעה המילה החדשה
    if (typeof to === 'number') {
      const other = wordInCell(to);
      if (other > -1 && other !== id) { wordPos[other] = from; moveEl(other); }
    }
    wordPos[id] = to;
    moveEl(id);
    moves++;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    L.log('word_drop', { pid: puzzle.id, word: id, label: words[id].label, from: from === null ? 'tray' : from, to: to === null ? 'tray' : to, how, ms: Date.now() - startedAt });
    updateDone();
  }

  function moveEl(id) {
    const el = $('.word[data-word="' + id + '"]');
    const p = wordPos[id];
    const parent = p === null ? $('#tray')
      : p === 'skip' ? $('#skip-zone .slot-body')
      : $('.cell[data-cell="' + p + '"] .cell-body');
    parent.appendChild(el);
    el.classList.remove('pop-in', 'land');
    void el.offsetWidth;
    el.classList.add('land');
    $$('.cell').forEach(c => c.classList.toggle('filled', !!c.querySelector('.word')));
    $('#tray').classList.toggle('empty', !$('#tray .word'));
  }

  function updateDone() {
    const done = wordPos.every(p => p !== null);
    const btn = $('#btn-done');
    btn.disabled = !done;
    btn.classList.toggle('ready', done);
    const left = wordPos.filter(p => p === null).length;
    btn.textContent = done ? 'מה זה אומר עליי? ✨' : (left === 1 ? 'נשארה עוד מילה אחת' : 'נשארו עוד ' + left + ' מילים');
  }

  // ---------- חישוב תוצאה ----------
  // ערך כל רבע = הערך של המילה שהונחה בו (רבע ריק = 1.5, ניטרלי).
  // משווים שורה מול שורה ועמודה מול עמודה, ובוחרים משפטים מ-rowRes / colRes.
  function computeResult() {
    const sc = [0, 1, 2, 3].map(c => { const w = wordInCell(c); return w > -1 ? words[w].value : 1.5; });
    const dRow = (sc[0] + sc[1]) - (sc[2] + sc[3]);
    const dCol = (sc[0] + sc[2]) - (sc[1] + sc[3]);
    const r = puzzle.rowRes[dRow > 0 ? 0 : dRow < 0 ? 1 : 2];
    const c = puzzle.colRes[dCol > 0 ? 0 : dCol < 0 ? 1 : 2];
    const key = (dRow > 0 ? 'r0' : dRow < 0 ? 'r1' : 'rT') + '_' + (dCol > 0 ? 'c0' : dCol < 0 ? 'c1' : 'cT');
    const skipped = wordPos.filter(p => p === 'skip').length;

    if (skipped === 4) return { emoji: '🕵️', title: g('[המסתורי/המסתורית]'), text: g('שום מילה לא מתאימה לך? את[ה/] [מסתורי/מסתורית] במיוחד 🕵️'), key: 'all_skip' };

    // סידור "לפי הספר" (למשל מטריצת ניהול)
    const isIdeal = puzzle.ideal && puzzle.ideal.every((w, cell) => wordPos[w] === cell);
    let head = Math.abs(dRow) > Math.abs(dCol) ? r : c;
    const second = head === r ? c : r;
    let text = g(head.text) + ' ' + g(second.text);
    if (isIdeal && puzzle.idealRes) { head = puzzle.idealRes; text = g(puzzle.idealRes.text); }

    // הערות מיוחדות למילה שנגררה לרבע מסוים
    (puzzle.notes || []).forEach(n => { if (wordPos[n.word] === n.cell) text += ' ' + g(n.text); });

    if (skipped) text += ' ' + (skipped === 1 ? 'ויש מילה אחת שפשוט לא מצאה מקום – גם זה אומר משהו 😉' : 'ויש כמה מילים שלא מצאו מקום – גם זה אומר משהו 😉');
    return { emoji: head.emoji, title: g(head.title), text, key: isIdeal ? 'ideal' : key };
  }

  let lastResult = null;
  function finish() {
    const res = computeResult();
    lastResult = res;
    const ms = Date.now() - startedAt;
    $('#result-emoji').textContent = res.emoji;
    $('#result-title').textContent = res.title;
    $('#result-text').textContent = res.text;

    // ריבוע הקסם של המשתמש
    const recap = $('#recap');
    let html = '<div class="mini"><div></div><b>' + esc(g(puzzle.cols[0])) + '</b><b>' + esc(g(puzzle.cols[1])) + '</b>';
    [0, 1].forEach(row => {
      html += '<b class="mini-r">' + esc(g(puzzle.rows[row])) + '</b>';
      [0, 1].forEach(col => {
        const cell = row * 2 + col, w = wordInCell(cell);
        html += w > -1
          ? '<span class="word-' + words[w].color + '">' + words[w].emoji + ' ' + esc(g(words[w].label)) + '</span>'
          : '<span class="mini-empty">—</span>';
      });
    });
    html += '</div>';
    const skippedW = wordPos.map((p, i) => (p === 'skip' ? i : -1)).filter(i => i > -1);
    if (skippedW.length) html += '<div class="mini-skip">🤷 לא מצאו מקום: ' + skippedW.map(i => esc(g(words[i].label))).join(', ') + '</div>';
    recap.innerHTML = html;

    $('#btn-wa').href = 'https://wa.me/?text=' + encodeURIComponent(shareText('whatsapp'));

    // רצף ימים
    if (mode === 'daily') {
      const last = store.get('lastDaily', null), today = todayKey();
      if (last !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        store.set('streak', last === dateKey(y) ? store.get('streak', 0) + 1 : 1);
        store.set('lastDaily', today);
      }
    }
    const played = store.get('played', []);
    if (!played.includes(puzzle.id)) { played.push(puzzle.id); store.set('played', played); }

    L.log('puzzle_complete', {
      pid: puzzle.id, topic: puzzle.topic, mode, ms, moves, result: res.key, result_title: res.title,
      layout: [0, 1, 2, 3].map(c => { const w = wordInCell(c); return w > -1 ? words[w].label : null; }),
      skipped: wordPos.filter(p => p === 'skip').length,
    });
    show('screen-result');
    setTimeout(confetti, 250);
  }

  // ---------- שיתוף ----------
  function shareUrl(channel) {
    const base = cfg.SHARE_URL || (location.origin + location.pathname);
    return base + '?p=' + encodeURIComponent(puzzle.id) + '&via=' + encodeURIComponent(L.uid) + '&utm_source=share&utm_medium=' + channel;
  }
  function shareText(channel) {
    const sq = { green: '🟩', blue: '🟦', orange: '🟧', red: '🟥' };
    const grid = [0, 1, 2, 3].map(c => { const w = wordInCell(c); return w > -1 ? sq[words[w].color] : '⬜'; });
    return lastResult.emoji + ' יצא לי: ' + lastResult.title + '\n' +
      '"' + lastResult.text + '"\n\n' +
      grid[0] + grid[1] + '\n' + grid[2] + grid[3] + '\n\n' +
      '🔮 ריבועי קסם – ' + g(puzzle.title) + '\nמה יוצא לך? 👇\n' + shareUrl(channel || 'whatsapp');
  }

  $('#btn-share').addEventListener('click', async () => {
    L.log('share_click', { pid: puzzle.id, channel: 'native', supported: !!navigator.share });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ריבועי קסם', text: shareText('native') });
        L.log('share_success', { pid: puzzle.id, channel: 'native' });
      } catch (e) {
        L.log('share_cancel', { pid: puzzle.id, channel: 'native' });
      }
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(shareText('whatsapp')), '_blank');
    }
  });
  $('#btn-wa').addEventListener('click', () => L.log('share_click', { pid: puzzle.id, channel: 'whatsapp' }));
  $('#btn-copy').addEventListener('click', async () => {
    L.log('share_click', { pid: puzzle.id, channel: 'copy' });
    const txt = shareText('copy');
    try { await navigator.clipboard.writeText(txt); toast('הועתק! עכשיו להדביק לחברים 📋'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); toast('הועתק! 📋'); } catch (e2) {} ta.remove();
    }
  });

  // ---------- כפתורים ----------
  $('#btn-done').addEventListener('click', finish);
  $('#btn-next').addEventListener('click', () => {
    const played = store.get('played', []);
    let pool = PUZZLES.filter(p => !played.includes(p.id) && p.id !== puzzle.id);
    if (!pool.length) { pool = PUZZLES.filter(p => p.id !== puzzle.id); toast('שיחקת בהכל! מתחילים סיבוב חדש 🎉'); }
    const next = pool[Math.floor(Math.random() * pool.length)];
    L.log('next_click', { from: puzzle.id, to: next.id });
    startPuzzle(next, 'more');
  });
  $('#btn-replay').addEventListener('click', () => {
    L.log('replay_click', { pid: puzzle.id });
    startPuzzle(puzzle, mode);
  });

  $$('[data-gender]').forEach(b => b.addEventListener('click', () => {
    gender = b.dataset.gender;
    store.set('gender', gender);
    L.setProps({ gender });
    L.log('gender_select', { gender });
    boot();
  }));

  // ---------- קונפטי ----------
  function confetti() {
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#7c3aed', '#ec4899', '#facc15', '#22c55e', '#3b82f6', '#f97316'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4,
      s: 6 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (++frame < 160) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  // ---------- מצב דיבאג: ?debug=1 ----------
  function debugPanel() {
    const d = document.createElement('div');
    d.className = 'debug';
    const logs = L.all();
    const counts = {};
    logs.forEach(e => { counts[e.e] = (counts[e.e] || 0) + 1; });
    d.innerHTML = '<b>🛠 לוגים (' + logs.length + ')</b> ' +
      Object.entries(counts).map(([k, v]) => k + ':' + v).join(' · ') +
      '<div><button id="dbg-dl">הורדה JSON</button> <button id="dbg-clr">ניקוי</button> ' +
      '<select id="dbg-pz">' + PUZZLES.map(p => '<option value="' + p.id + '">' + esc(g(p.title)) + '</option>').join('') + '</select></div>';
    document.body.appendChild(d);
    $('#dbg-dl').onclick = () => L.download();
    $('#dbg-clr').onclick = () => { L.clear(); toast('נוקה'); };
    $('#dbg-pz').onchange = (e) => startPuzzle(PUZZLES.find(p => p.id === e.target.value), 'more');
  }

  // ---------- אתחול ----------
  function boot() {
    const pid = params.get('p');
    const shared = pid && PUZZLES.find(p => p.id === pid);
    if (shared) startPuzzle(shared, 'shared');
    else startPuzzle(PUZZLES[dailyIndex()], 'daily');
  }

  if (gender) L.setProps({ gender });
  L.log('session_start', { newUser: L.isNewUser, sharedPid: params.get('p'), streak: store.get('streak', 0) });
  if (params.has('debug')) debugPanel();

  const streak = store.get('streak', 0);
  if (streak > 1) { const s = $('#streak-intro'); s.hidden = false; s.textContent = '🔥 רצף של ' + streak + ' ימים!'; }

  if (gender) boot();
  else { show('screen-intro'); L.log('intro_view'); }
})();
