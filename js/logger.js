// לוגים של התנהגות משתמשים
// כל אירוע נשמר ב-localStorage, ואם הוגדר LOG_ENDPOINT – נשלח גם לשרת (באצוות).
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
  const base = {
    uid, sid,
    ref: document.referrer || null,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    via: params.get('via'),            // מי שיתף (uid של המשתף) – מאפשר למדוד ויראליות
    lang: navigator.language,
    screen: window.innerWidth + 'x' + window.innerHeight,
    touch: 'ontouchstart' in window,
  };

  let queue = [];
  let flushTimer = null;

  function store(evt) {
    let arr = [];
    try { arr = JSON.parse(safeGet(LS_KEY) || '[]'); } catch (e) {}
    arr.push(evt);
    const lim = cfg.LOCAL_LOG_LIMIT || 1000;
    if (arr.length > lim) arr = arr.slice(arr.length - lim);
    safeSet(LS_KEY, JSON.stringify(arr));
  }

  function flush(useBeacon) {
    if (!cfg.LOG_ENDPOINT || !queue.length) return;
    const body = JSON.stringify({ events: queue });
    queue = [];
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(cfg.LOG_ENDPOINT, new Blob([body], { type: 'text/plain' }));
      } else {
        fetch(cfg.LOG_ENDPOINT, { method: 'POST', body, keepalive: true,
          headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
      }
    } catch (e) {}
  }

  function log(name, data) {
    const evt = Object.assign({ e: name, t: Date.now(), iso: new Date().toISOString() }, base, data || {});
    store(evt);
    queue.push(evt);
    if (params.has('debug')) console.log('[log]', name, data || '');
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush(false), 3000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { log('page_hidden'); flush(true); }
  });
  window.addEventListener('error', (ev) => log('js_error', { msg: String(ev.message), src: ev.filename, line: ev.lineno }));

  window.QuadLog = {
    log, uid, sid, isNewUser,
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
