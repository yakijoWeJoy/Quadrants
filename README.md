# ריבועי קסם 🔮

משחק יומי קצר: מטריצה של 4 היגדים (2 שורות × 2 עמודות), גוררים כל היגד לאחד מ-4 ריבועים
(**כל יום / ברור / כשאין ברירה / בחיים לא**) או ל"אף תשובה לא מתאימה", ומקבלים משפט מצחיק על עצמך.

## הרצה
אתר סטטי, בלי build. מקומית: `python3 -m http.server` ולפתוח `http://localhost:8000`.
לפרסום: GitHub Pages / Netlify / Vercel.

## מבנה
| קובץ | תפקיד |
|---|---|
| `index.html` | 3 מסכים: פתיחה (בחירת פנייה בן/בת), משחק, תוצאה |
| `js/puzzles.js` | **מאגר הפאזלים** – כאן מוסיפים ריבועים חדשים (הוראות בראש הקובץ) |
| `js/game.js` | גרירה (עכבר + מגע + הקשה), חישוב תוצאה, שיתוף, רצף ימים |
| `js/logger.js` | לוגים של התנהגות משתמשים |
| `js/config.js` | הגדרות: כתובת שרת לוגים, תאריך התחלה של "משחק היום" |

## איך מחושבת התוצאה
ניקוד: כל יום=3, ברור=2, כשאין ברירה=1, בחיים לא=0, "לא מתאים"=1.5 (ניטרלי).
משווים בין השורות (למשל אבא מול אמא) ובין העמודות (חיבוק מול כסף). כל השוואה בוחרת משפט
מתוך 3 (ראשון ניצח / שני ניצח / תיקו). הכותרת באה מהציר עם הפער הגדול יותר.

## ויראליות
- כפתור שיתוף (Web Share בטלפון, וואטסאפ, העתקה) עם התוצאה וגריד אימוג'ים 🟩🟦🟧🟥.
- הקישור המשותף פותח **את אותו פאזל** (`?p=id`) ומכיל `via=<uid>` כדי למדוד מי הביא את מי.

## הוספת פאזל
כל פאזל ב-`js/puzzles.js` מגדיר: `id`, `topic` (נושא), `title`, `emoji`, שני צירים (`rows`, `cols`),
4 היגדים (`cards`), 3 משפטי תוצאה לכל ציר (`rowRes`, `colRes`), ואופציונלית `slots` – 4 תוויות משלו
לריבועי התשובה (מהכי הרבה להכי מעט), למשל `['כל שבת', 'פעם בחודש', 'פעם בשנה', 'רק בתמונות']`.

אחרי עריכה מריצים בדיקה: `node tools/validate.js` – בודק מבנה, מזהים כפולים, סוגריים מגדריים ואורך טקסטים.

## לוגים – PostHog
1. ב-PostHog: Project settings → Project API Key (מתחיל ב-`phc_`).
2. ב-`js/config.js`: למלא `POSTHOG_KEY`, ולוודא ש-`POSTHOG_HOST` תואם לאזור הפרויקט (EU / US).

בלי מפתח – הכל עובד, והלוגים נשמרים רק בדפדפן (`?debug=1` להצגה והורדה).
מזהה המשתמש ב-PostHog זהה למזהה המקומי, ו-autocapture כבוי כדי שהנתונים יהיו נקיים.

**אירועים**
| אירוע | מאפיינים עיקריים |
|---|---|
| `session_start` | newUser, sharedPid, streak |
| `intro_view`, `gender_select` | gender |
| `puzzle_start` | pid, topic, mode (daily / shared / more) |
| `drag_start`, `card_drop`, `drop_miss` | card, from, to, how (drag / tap), ms |
| `puzzle_complete` | pid, topic, ms, moves, placement, skipped, result, result_title |
| `share_click`, `share_success`, `share_cancel` | channel (native / whatsapp / copy) |
| `next_click`, `replay_click`, `js_error` | |

מאפיינים קבועים בכל אירוע: `gender`, `via`, `referred_by` (מי שיתף), `utm_*`, `screen`, `touch`.

**דשבורדים מומלצים ב-PostHog**
- משפך: `puzzle_start` → `puzzle_complete` → `share_click` → `share_success` (לפי pid / topic).
- ויראליות: משתמשים חדשים עם `referred_by` מוגדר, ביחס לשיתופים.
- פאזלים שנזנחים: `puzzle_start` בלי `puzzle_complete`, וכמה פעמים בוחרים "לא מתאים" (`skipped`).
- גרירה מול הקשה: `card_drop` לפי `how` (לזהות קושי בגרירה במובייל).
- חזרה יומית: Retention על `puzzle_complete`.
