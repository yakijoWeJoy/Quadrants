// הגדרות כלליות
window.QUAD_CONFIG = {
  // כתובת שרת לאיסוף לוגים (POST של JSON). ריק = לוגים נשמרים רק בדפדפן.
  // לדוגמה: Google Apps Script / Supabase Edge Function / כל endpoint שמקבל JSON.
  LOG_ENDPOINT: '',

  // כמה אירועים לשמור מקומית בדפדפן (לצפייה ב-?debug=1)
  LOCAL_LOG_LIMIT: 1000,

  // קישור לשיתוף (ריק = הכתובת הנוכחית)
  SHARE_URL: '',

  // התאריך שממנו סופרים את "משחק היום" (פאזל 0 ביום הזה)
  DAILY_EPOCH: '2026-11-23',
};
