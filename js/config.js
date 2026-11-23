// הגדרות כלליות
window.QUAD_CONFIG = {
  // PostHog: מפתח הפרויקט (Project API Key, מתחיל ב-phc_). ריק = לוגים נשמרים רק בדפדפן.
  POSTHOG_KEY: '',
  // שרת PostHog: אירופה https://eu.i.posthog.com | ארה"ב https://us.i.posthog.com
  POSTHOG_HOST: 'https://eu.i.posthog.com',

  // כמה אירועים לשמור מקומית בדפדפן (לצפייה ב-?debug=1)
  LOCAL_LOG_LIMIT: 1000,

  // קישור לשיתוף (ריק = הכתובת הנוכחית)
  SHARE_URL: '',

  // התאריך שממנו סופרים את "משחק היום" (פאזל 0 ביום הזה)
  DAILY_EPOCH: '2026-11-23',
};
