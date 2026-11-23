// לוגים של התנהגות משתמשים
// כל אירוע נשמר ב-localStorage (לצפייה ב-?debug=1), ואם הוגדר POSTHOG_KEY – נשלח גם ל-PostHog.
(function () {
  const cfg = window.QUAD_CONFIG || {};
  const LS_KEY = 'quad_logs';
  const UID_KEY = 'quad_uid';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  let uid = safeGet(UID_KEY);
  const isNewUser = !uid;
  if (!uid) { uid = 'u_' + rid(); safeSet(UID_KEY, uid); }
  const sid = 's_' + rid();

  const params = new URLSearchParams(location.search);
  const via = params.get('via');      // מי שיתף (uid של המשתף) – מודדים ויראליות
  const base = {
    sid,
    via,
    ref: document.referrer || null,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    screen: window.innerWidth + 'x' + window.innerHeight,
    touch: 'ontouchstart' in window,
  };

  // ---------- PostHog ----------
  let ph = null;          // מופע PostHog אחרי טעינה
  let pending = [];       // אירועים שנרשמו לפני שהספרייה נטענה
  let pendingProps = {};

  if (cfg.POSTHOG_KEY) {
    const host = (cfg.POSTHOG_HOST || 'https://eu.i.posthog.com').replace(/\/$/, '');
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    s.onload = function () {
      if (!window.posthog || !window.posthog.init) return;
      window.posthog.init(cfg.POSTHOG_KEY, {
        api_host: host,
        bootstrap: { distinctID: uid },     // אותו מזהה משתמש כמו בלוג המקומי
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,                 // רק האירועים שאנחנו מגדירים – נתונים נקיים
        loaded: function (inst) {
          ph = inst;
          if (via) ph.register_once({ referred_by: via });
          ph.register(pendingProps);
          pending.forEach(([n, p]) => ph.capture(n, p));
          pending = [];
        },
      });
    };
    document.head.appendChild(s);
  }

  function store(evt) {
    let arr = [];
    try { arr = JSON.parse(safeGet(LS_KEY) || '[]'); } catch (e) {}
    arr.push(evt);
    const lim = cfg.LOCAL_LOG_LIMIT || 1000;
    if (arr.length > lim) arr = arr.slice(arr.length - lim);
    safeSet(LS_KEY, JSON.stringify(arr));
  }

  function log(name, data) {
    const props = Object.assign({}, base, data || {});
    store(Object.assign({ e: name, t: Date.now(), iso: new Date().toISOString(), uid }, props));
    if (cfg.POSTHOG_KEY) { if (ph) ph.capture(name, props); else pending.push([name, props]); }
    if (params.has('debug')) console.log('[log]', name, data || '');
  }

  // מאפיינים שיצורפו לכל אירוע מעכשיו (למשל מגדר)
  function setProps(obj) {
    Object.assign(base, obj);
    if (ph) ph.register(obj); else Object.assign(pendingProps, obj);
  }

  window.addEventListener('error', (ev) => log('js_error', { msg: String(ev.message), src: ev.filename, line: ev.lineno }));

  window.QuadLog = {
    log, setProps, uid, sid, isNewUser,
    all() { try { return JSON.parse(safeGet(LS_KEY) || '[]'); } catch (e) { return []; } },
    clear() { safeSet(LS_KEY, '[]'); },
    download() {
      const blob = new Blob([JSON.stringify(this.all(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'quadrants-logs.json';
      a.click();
    },
  };
})();
