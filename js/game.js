(function () {
  'use strict';
  const cfg = window.QUAD_CONFIG || {};
  const PUZZLES = window.QUAD_PUZZLES;
  const DEFAULT_SLOTS = window.QUAD_SLOTS;
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

  // ---------- משחק היום ----------
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dailyIndex() {
    const epoch = new Date((cfg.DAILY_EPOCH || '2026-01-01') + 'T00:00:00');
    const now = new Date(todayKey() + 'T00:00:00');
    const days = Math.round((now - epoch) / 86400000);
    return ((days % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  }

  // ---------- מצב ----------
  let puzzle, slots, mode, placement, origin, startedAt, moves, selected = null;

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

  // ריבועי תשובה לפאזל: מערך של 4 תוויות (מהכי הרבה להכי מעט), או אובייקטים חלקיים.
  // ניקוד, צבע ואימוג'י נלקחים מברירת המחדל לפי המיקום, אם לא הוגדרו.
  function normalizeSlots(custom) {
    if (!custom) return DEFAULT_SLOTS;
    return DEFAULT_SLOTS.map((d, i) => {
      const c = custom[i];
      if (c == null) return d;
      return Object.assign({}, d, typeof c === 'string' ? { label: c } : c);
    });
  }

  // ---------- התחלת פאזל ----------
  function startPuzzle(p, how) {
    puzzle = p; mode = how;
    slots = normalizeSlots(p.slots);
    placement = [null, null, null, null]; // לכל כרטיס: null (במטריצה) | 0..3 | 'skip'
    moves = 0; selected = null;
    startedAt = Date.now();

    const badge = { daily: '📅 משחק היום', shared: '💌 מישהו שלח לך את זה', more: '🎲 ריבוע בונוס' }[how] || '';
    $('#game-badge').textContent = badge;
    $('#game-title').textContent = p.emoji + ' ' + g(p.title);
    $('#col-0').textContent = g(p.cols[0]);
    $('#col-1').textContent = g(p.cols[1]);
    $('#row-0').textContent = g(p.rows[0]);
    $('#row-1').textContent = g(p.rows[1]);

    // כרטיסים
    $$('.cell').forEach((cell, i) => {
      cell.innerHTML = '';
      const c = p.cards[i];
      const el = document.createElement('div');
      el.className = 'card pop-in';
      el.style.animationDelay = (i * 70) + 'ms';
      el.dataset.card = i;
      el.innerHTML = '<span class="card-e">' + c.e + '</span><span class="card-t">' + g(c.t) + '</span>';
      cell.appendChild(el);
      bindCard(el);
    });

    // ריבועי תשובה
    const wrap = $('#slots');
    wrap.innerHTML = '';
    slots.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'slot slot-' + s.color;
      el.dataset.slot = i;
      el.innerHTML = '<div class="slot-label"><span>' + s.emoji + '</span> ' + g(s.label) + '</div><div class="slot-body"></div>';
      wrap.appendChild(el);
    });
    $('#skip-zone .slot-body').innerHTML = '';
    $$('.slot').forEach(bindSlot);
    updateDone();
    show('screen-game');
    L.log('puzzle_start', { pid: p.id, topic: p.topic, mode: how });
  }

  // ---------- גרירה (עכבר + מגע) ----------
  let drag = null;

  function bindCard(el) {
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      ev.preventDefault();
      drag = { el, id: +el.dataset.card, x0: ev.clientX, y0: ev.clientY, active: false, pid: ev.pointerId };
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
      ghost.classList.remove('pop-in', 'selected');
      ghost.style.width = r.width + 'px';
      ghost.style.height = r.height + 'px';
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      drag.offX = drag.x0 - r.left; drag.offY = drag.y0 - r.top;
      drag.el.classList.add('dragging');
      clearSelection();
      L.log('drag_start', { pid: puzzle.id, card: drag.id, from: where(drag.id) });
    }
    if (drag.active) {
      drag.lastX = ev.clientX; drag.lastY = ev.clientY;
      if (!drag.raf) drag.raf = requestAnimationFrame(autoScroll);
      drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.offX) + 'px,' + (ev.clientY - drag.offY) + 'px) rotate(-4deg) scale(1.05)';
      const target = dropTarget(ev.clientX, ev.clientY);
      $$('.slot, .cell').forEach(s => s.classList.toggle('hover', s === target));
    }
  }

  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const d = drag;
    if (d.active) {
      const target = dropTarget(ev.clientX, ev.clientY);
      cancelDrag();
      if (target) dropOn(d.id, target, 'drag');
      else L.log('drop_miss', { pid: puzzle.id, card: d.id });
    } else {
      cancelDrag();
      tapCard(d.id);
    }
  }

  // גלילה אוטומטית כשגוררים לקצה המסך (חשוב בטלפון)
  function autoScroll() {
    if (!drag || !drag.active) return;
    const edge = 70, y = drag.lastY;
    let dy = 0;
    if (y > innerHeight - edge) dy = Math.ceil((y - (innerHeight - edge)) / 4);
    else if (y < edge) dy = -Math.ceil((edge - y) / 4);
    if (dy) {
      window.scrollBy(0, dy);
      const target = dropTarget(drag.lastX, drag.lastY);
      $$('.slot, .cell').forEach(s => s.classList.toggle('hover', s === target));
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function cancelDrag() {
    if (!drag) return;
    if (drag.raf) cancelAnimationFrame(drag.raf);
    drag.ghost && drag.ghost.remove();
    drag.el.classList.remove('dragging');
    $$('.hover').forEach(s => s.classList.remove('hover'));
    drag = null;
  }

  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('.slot') || el.closest('.cell');
  }

  function where(id) { const p = placement[id]; return p === null ? 'matrix' : p; }

  // ---------- הקשה (חלופה לגרירה) ----------
  function tapCard(id) {
    if (selected === id) { clearSelection(); return; }
    // אם כבר נבחר כרטיס ולוחצים על כרטיס שנמצא בריבוע – מחליפים ביניהם
    if (selected !== null && typeof placement[id] === 'number') {
      const slotEl = $('.slot[data-slot="' + placement[id] + '"]');
      const s = selected; clearSelection();
      dropOn(s, slotEl, 'tap');
      return;
    }
    clearSelection();
    selected = id;
    $('.card[data-card="' + id + '"]').classList.add('selected');
    document.body.classList.add('has-selection');
    $('#game-hint').textContent = 'עכשיו לחצו על הריבוע המתאים 👇';
  }
  function clearSelection() {
    selected = null;
    $$('.card.selected').forEach(c => c.classList.remove('selected'));
    document.body.classList.remove('has-selection');
    $('#game-hint').textContent = 'גררו כל היגד לריבוע שמתאים לך';
  }
  function bindSlot(el) {
    el.addEventListener('click', (ev) => {
      if (selected === null) return;
      if (ev.target.closest('.card')) return; // טופל ב-tapCard
      const s = selected; clearSelection();
      dropOn(s, el, 'tap');
    });
  }
  $$('.cell').forEach(cell => cell.addEventListener('click', (ev) => {
    if (selected === null || ev.target.closest('.card')) return;
    const s = selected; clearSelection();
    dropOn(s, cell, 'tap');
  }));

  // ---------- הנחת כרטיס ----------
  function dropOn(id, target, how) {
    const from = placement[id];
    let to;
    if (target.classList.contains('cell')) to = null;
    else to = target.dataset.slot === 'skip' ? 'skip' : +target.dataset.slot;

    if (from === to) return;

    // ריבוע תפוס? מחליפים – הכרטיס הקודם עובר למקום שממנו הגיע הכרטיס החדש
    if (typeof to === 'number') {
      const other = placement.findIndex((p, i) => p === to && i !== id);
      if (other > -1) { placement[other] = from; moveEl(other); }
    }
    placement[id] = to;
    moveEl(id);
    moves++;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    L.log('card_drop', { pid: puzzle.id, card: id, from: from === null ? 'matrix' : from, to: to === null ? 'matrix' : to, how, ms: Date.now() - startedAt });
    updateDone();
  }

  function moveEl(id) {
    const el = $('.card[data-card="' + id + '"]');
    const p = placement[id];
    const parent = p === null ? $('.cell[data-cell="' + id + '"]')
      : p === 'skip' ? $('#skip-zone .slot-body')
      : $('.slot[data-slot="' + p + '"] .slot-body');
    parent.appendChild(el);
    el.classList.remove('pop-in', 'land');
    void el.offsetWidth;
    el.classList.add('land');
    $$('.cell').forEach(c => c.classList.toggle('empty', !c.querySelector('.card')));
    $$('.slot').forEach(s => s.classList.toggle('filled', !!s.querySelector('.card')));
  }

  function updateDone() {
    const done = placement.every(p => p !== null);
    const btn = $('#btn-done');
    btn.disabled = !done;
    btn.classList.toggle('ready', done);
    const left = placement.filter(p => p === null).length;
    btn.textContent = done ? 'מה זה אומר עליי? ✨' : 'נשארו עוד ' + left + ' היגדים';
  }

  // ---------- חישוב תוצאה ----------
  function computeResult() {
    const sc = placement.map(p => (typeof p === 'number' ? slots[p].score : 1.5)); // דילוג = ניטרלי
    const row0 = sc[0] + sc[1], row1 = sc[2] + sc[3];
    const col0 = sc[0] + sc[2], col1 = sc[1] + sc[3];
    const dRow = row0 - row1, dCol = col0 - col1;
    const r = puzzle.rowRes[dRow > 0 ? 0 : dRow < 0 ? 1 : 2];
    const c = puzzle.colRes[dCol > 0 ? 0 : dCol < 0 ? 1 : 2];
    const head = Math.abs(dRow) > Math.abs(dCol) ? r : c;
    const second = head === r ? c : r;
    let text = g(head.text) + ' ' + g(second.text);
    const skipped = placement.filter(p => p === 'skip').length;
    if (skipped === 4) text = 'שום דבר פה לא מתאים לך? את[ה/] [מסתורי/מסתורית] במיוחד 🕵️';
    else if (skipped) text += ' ' + (skipped === 1 ? 'ויש דבר אחד שפשוט לא מתאים לך – גם זה אומר משהו 😉' : 'ויש כמה דברים שפשוט לא מתאימים לך – גם זה אומר משהו 😉');
    const res = skipped === 4
      ? { emoji: '🕵️', title: g('[המסתורי/המסתורית]'), text: g(text), key: 'all_skip' }
      : { emoji: head.emoji, title: g(head.title), sub: g(second.title), text, key: (dRow > 0 ? 'r0' : dRow < 0 ? 'r1' : 'rT') + '_' + (dCol > 0 ? 'c0' : dCol < 0 ? 'c1' : 'cT') };
    return res;
  }

  let lastResult = null;
  function finish() {
    const res = computeResult();
    lastResult = res;
    const ms = Date.now() - startedAt;
    $('#result-emoji').textContent = res.emoji;
    $('#result-title').textContent = res.title;
    $('#result-text').textContent = res.text;

    // סיכום הבחירות
    const recap = $('#recap');
    recap.innerHTML = '';
    slots.forEach((s, i) => {
      const id = placement.indexOf(i);
      const row = document.createElement('div');
      row.className = 'recap-row slot-' + s.color;
      row.innerHTML = '<b>' + s.emoji + ' ' + g(s.label) + '</b><span>' + (id > -1 ? puzzle.cards[id].e + ' ' + g(puzzle.cards[id].t) : '—') + '</span>';
      recap.appendChild(row);
    });
    placement.forEach((p, id) => {
      if (p !== 'skip') return;
      const row = document.createElement('div');
      row.className = 'recap-row slot-gray';
      row.innerHTML = '<b>🤷 לא מתאים</b><span>' + puzzle.cards[id].e + ' ' + g(puzzle.cards[id].t) + '</span>';
      recap.appendChild(row);
    });

    // שיתוף
    $('#btn-wa').href = 'https://wa.me/?text=' + encodeURIComponent(shareText());

    // רצף ימים
    if (mode === 'daily') {
      const last = store.get('lastDaily', null), today = todayKey();
      if (last !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yKey = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
        store.set('streak', last === yKey ? store.get('streak', 0) + 1 : 1);
        store.set('lastDaily', today);
      }
    }
    const played = store.get('played', []);
    if (!played.includes(puzzle.id)) { played.push(puzzle.id); store.set('played', played); }

    L.log('puzzle_complete', {
      pid: puzzle.id, topic: puzzle.topic, mode, ms, moves, result: res.key, result_title: res.title,
      placement: placement.map(p => (p === null ? 'matrix' : p)),
      skipped: placement.filter(p => p === 'skip').length,
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
    const grid = placement.map(p => (typeof p === 'number' ? sq[slots[p].color] : '⬜'));
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
    ctx.scale(dpr, dpr);
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
      '<select id="dbg-pz">' + PUZZLES.map(p => '<option value="' + p.id + '">' + p.title + '</option>').join('') + '</select></div>';
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
