// ============================================================
//  כללי הניתוב של model-router  —  זה הקובץ לעריכה
// ============================================================
//  כל כלל: מודל (tier), מילים שמפעילות אותו (words), וסיבה קצרה שתוצג.
//  החיפוש לא תלוי באותיות גדולות/קטנות, ומספיק שהמילה מופיעה בתוך הבקשה.
//  אם כמה כללים מתאימים — נבחר המודל החזק מביניהם.
//  אחרי שמירה, השינוי ייטען בסוף התור הבא.
// ============================================================

import type { Tier } from '../types'

export type Rule = { tier: Tier; words: string[]; reason: string }

export const RULES: Rule[] = [
  // ---------- Opus: תכנון, באגים מורכבים, הרבה קבצים ----------
  {
    tier: 'opus',
    reason: 'תכנון או ארכיטקטורה',
    words: ['תכנן', 'תכנון', 'תוכנית', 'ארכיטקט', 'אסטרטגיה', 'plan', 'architect', 'design the', 'strategy'],
  },
  {
    tier: 'opus',
    reason: 'באג מורכב / דיבאג',
    words: ['באג', 'bug', 'debug', 'דיבאג', 'קורס', 'crash', 'לא עובד', "doesn't work", 'not working', 'שגיאה', 'error', 'exception', 'race condition', 'memory leak', 'למה זה'],
  },
  {
    tier: 'opus',
    reason: 'שינוי בהרבה קבצים',
    words: ['כל הקבצים', 'בכל הפרויקט', 'הרבה קבצים', 'ריפקטור', 'refactor', 'migrate', 'מיגרציה', 'across the', 'all files', 'whole project', 'codebase'],
  },

  // ---------- Sonnet: כתיבה ועריכה רגילות ----------
  {
    tier: 'sonnet',
    reason: 'כתיבה או עריכה רגילה',
    words: ['כתוב', 'תכתוב', 'ערוך', 'תערוך', 'שנה', 'תשנה', 'תקן', 'תוסיף', 'הוסף', 'עדכן', 'צור', 'תבנה', 'write', 'edit', 'add', 'update', 'create', 'implement', 'fix', 'change', 'component', 'קומפוננטה', 'עמוד', 'page', 'css', 'עיצוב'],
  },

  // ---------- Haiku: משימות קצרות ופשוטות ----------
  {
    tier: 'haiku',
    reason: 'סיכום',
    words: ['סכם', 'תסכם', 'סיכום', 'summarize', 'summary', 'tl;dr', 'tldr'],
  },
  {
    tier: 'haiku',
    reason: 'תרגום',
    words: ['תרגם', 'תתרגם', 'תרגום', 'translate', 'translation'],
  },
  {
    tier: 'haiku',
    reason: 'שינוי שם של קובץ',
    words: ['שנה שם', 'תשנה שם', 'שינוי שם', 'rename'],
  },
  {
    tier: 'haiku',
    reason: 'חיפוש בקבצים',
    words: ['חפש', 'תחפש', 'מצא', 'תמצא', 'איפה', 'find', 'search', 'grep', 'where is', 'list files', 'רשימת קבצים'],
  },
]

// בקשה ארוכה מזה (בתווים) לא תלך ל-Haiku גם אם יש בה מילת Haiku.
export const HAIKU_MAX_CHARS = 300

// בקשה ארוכה מזה תלך תמיד ל-Opus.
export const OPUS_MIN_CHARS = 1500

// כשאף כלל לא התאים ("לא בטוח") — לאיזה מודל ללכת. לפי הכלל: החזק יותר.
// אפשר לשנות ל-'sonnet' כדי לחסוך יותר מכסה.
export const FALLBACK: Tier = 'opus'
