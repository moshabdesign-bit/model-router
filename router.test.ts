import { expect, test } from 'claude-code/testing'

import { classify, formatTokens } from './hooks/register'

const cases: [string, string][] = [
  ['תסכם לי את הקובץ README', 'haiku'],
  ['translate this paragraph to English', 'haiku'],
  ['תשנה שם לקובץ old.ts ל-new.ts', 'haiku'],
  ['איפה מוגדרת הפונקציה login?', 'haiku'],
  ['תכתוב קומפוננטה של כפתור', 'sonnet'],
  ['תערוך את הטקסט בעמוד הבית', 'sonnet'],
  ['תכנן לי ארכיטקטורה למערכת הזמנות', 'opus'],
  ['יש באג, האפליקציה קורסת בהתחברות', 'opus'],
  ['refactor the auth flow across the codebase', 'opus'],
  ['מה דעתך?', 'opus'],
  ['תחפש איפה יש באג בהתחברות', 'opus'],
]

for (const [text, tier] of cases) {
  test(`"${text}" -> ${tier}`, async () => {
    expect(classify(text).tier).toBe(tier)
  })
}

test('a long summary request is not sent to Haiku', async () => {
  expect(classify('תסכם ' + 'מילה '.repeat(80)).tier).toBe('sonnet')
})

test('token counts read short', async () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(12345)).toBe('12.3K')
  expect(formatTokens(2_500_000)).toBe('2.5M')
})
