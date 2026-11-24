import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Choice, Lang, Limit, Task, Tier } from '../types'
import { FALLBACK, HAIKU_MAX_CHARS, OPUS_MIN_CHARS, RULES } from './rules'

const choice = atom({ plugin: 'model-router', key: 'choice' } as const, null)
const isOn = atom({ plugin: 'model-router', key: 'isOn' } as const, true)
const current = atom({ plugin: 'model-router', key: 'current' } as const, null)
const last = atom({ plugin: 'model-router', key: 'last' } as const, null)
const history = atom({ plugin: 'model-router', key: 'history' } as const, [])
const limits = atom({ plugin: 'model-router', key: 'limits' } as const, [])
const lang = atom({ plugin: 'model-router', key: 'lang' } as const, 'en')

const STORE_KEY = 'isOn'
const HISTORY_SIZE = 15
const RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2 }
const LABEL: Record<Tier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
const HEBREW = /[֐-׿]/

/** Every text the mod shows, in both languages. */
export const TEXT = {
  he: {
    longPrompt: 'בקשה ארוכה ומפורטת',
    longButSimple: (r: string) => `${r}, אבל בקשה ארוכה`,
    unsure: 'לא ברור מה סוג המשימה, נבחר החזק יותר',
    off: 'model-router כבוי. הבקשות ירוצו על המודל של השיחה (/model). ספירת הטוקנים ממשיכה.',
    on: 'model-router פועל. כל בקשה תקבל מודל לפי סוג המשימה.',
    bandOff: 'model-router כבוי · /router-on להפעלה',
    tokens: 'טוקנים',
    output: 'פלט',
    underCent: 'פחות מ-$0.01',
    lastTask: 'משימה אחרונה',
    left: 'נשאר',
    windows: { five_hour: '5 שעות', seven_day: 'שבוע', spend_limit: 'תקציב' } as Record<string, string>,
    usageTitle: 'טוקנים לפי משימה (האחרונה ראשונה):',
    noTasks: 'עוד אין משימות בשיחה הזאת.',
    total: (n: number, t: string) => `סה"כ ב-${n} המשימות האחרונות: ${t} טוקנים`,
    quotaLeft: 'נשאר מהמכסה',
    noQuota: 'אין נתוני מכסה (רק במנוי, ואחרי הבקשה הראשונה).',
  },
  en: {
    longPrompt: 'Long, detailed request',
    longButSimple: (r: string) => `${r}, but a long request`,
    unsure: 'Task type unclear, picked the stronger model',
    off: 'model-router is off. Requests run on the session model (/model). Token counting continues.',
    on: 'model-router is on. Each request gets a model by task type.',
    bandOff: 'model-router is off · /router-on to turn it on',
    tokens: 'tokens',
    output: 'output',
    underCent: 'under $0.01',
    lastTask: 'Last task',
    left: 'Left',
    windows: { five_hour: '5 hours', seven_day: 'week', spend_limit: 'budget' } as Record<string, string>,
    usageTitle: 'Tokens per task (latest first):',
    noTasks: 'No tasks in this session yet.',
    total: (n: number, t: string) => `Total over the last ${n} tasks: ${t} tokens`,
    quotaLeft: 'Quota left',
    noQuota: 'No quota data (subscriptions only, after the first request).',
  },
}

/** The display language: the option, or under `auto` the prompt's own script. */
export function pickLang(option: unknown, prompt: string): Lang {
  if (option === 'he' || option === 'en') return option
  return HEBREW.test(prompt) ? 'he' : 'en'
}

/** Picks a model for one prompt. Exported so the test can call it directly. */
export function classify(raw: string): Choice {
  const text = raw.toLowerCase()
  const he = TEXT.he
  const en = TEXT.en

  if (text.length > OPUS_MIN_CHARS) {
    return { tier: 'opus', reason: he.longPrompt, reasonEn: en.longPrompt }
  }

  let best: Choice | null = null
  let rest = text

  // Haiku phrases are specific ("rename"), so they are cut out of the text
  // first; that way a generic verb inside them doesn't count as Sonnet.
  for (const rule of RULES.filter(r => r.tier === 'haiku')) {
    for (const word of rule.words) {
      const w = word.toLowerCase()
      if (rest.includes(w)) {
        rest = rest.split(w).join(' ')
        best ??= { tier: 'haiku', reason: rule.reason, reasonEn: rule.reasonEn }
      }
    }
  }

  if (best && text.length > HAIKU_MAX_CHARS) {
    best = {
      tier: 'sonnet',
      reason: he.longButSimple(best.reason),
      reasonEn: en.longButSimple(best.reasonEn ?? best.reason),
    }
  }

  for (const rule of RULES.filter(r => r.tier !== 'haiku')) {
    const hit = rule.words.some(w => rest.includes(w.toLowerCase()))
    if (hit && (!best || RANK[rule.tier] > RANK[best.tier])) {
      best = { tier: rule.tier, reason: rule.reason, reasonEn: rule.reasonEn }
    }
  }

  return best ?? { tier: FALLBACK, reason: he.unsure, reasonEn: en.unsure }
}

/** 950 -> "950", 12345 -> "12.3K", 2500000 -> "2.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatUsd(usd: number | null, l: Lang): string {
  if (usd === null) return ''
  return usd < 0.01 ? ` · ${TEXT[l].underCent}` : ` · ≈$${usd.toFixed(2)}`
}

function labelOf(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 40 ? `${line.slice(0, 40)}…` : line
}

function reasonOf(c: Choice, l: Lang): string {
  return l === 'en' ? (c.reasonEn ?? c.reason) : c.reason
}

function describe(task: Task, l: Lang): string {
  const t = TEXT[l]
  const model = task.tier ? `${LABEL[task.tier]} · ` : ''
  return `${model}${formatTokens(task.tokens)} ${t.tokens} (${formatTokens(task.output)} ${t.output})${formatUsd(task.usd, l)}`
}

function remaining(list: readonly Limit[], l: Lang): string {
  const names = TEXT[l].windows
  return list
    .filter(x => x.kind in names)
    .map(x => `${names[x.kind]}: ${Math.max(0, Math.round(100 - x.percentUsed))}%`)
    .join(' · ')
}

export const register: Register = (on, options) => {
  const option = options.language ?? 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'router-off', description: 'Turn off automatic model routing' })
    await $.command.register({ name: 'router-on', description: 'Turn automatic model routing back on' })
    await $.command.register({ name: 'router-usage', description: 'Show tokens spent per task and what is left of the quota' })
    const stored = await $.store.get(STORE_KEY)
    await update($, isOn, () => stored !== false)
    if (option === 'he' || option === 'en') {
      await update($, lang, () => option)
    }

    const result = await next(e)
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits.map(x => ({ ...x })))

    return result
  })

  on('command.run', { command: 'router-off' }, async $ => {
    await $.store.set(STORE_KEY, false)
    await update($, isOn, () => false)
    await update($, choice, () => null)

    return { text: TEXT[await read($, lang)].off }
  })

  on('command.run', { command: 'router-on' }, async $ => {
    await $.store.set(STORE_KEY, true)
    await update($, isOn, () => true)

    return { text: TEXT[await read($, lang)].on }
  })

  on('command.run', { command: 'router-usage' }, async $ => {
    const l = await read($, lang)
    const t = TEXT[l]
    const tasks = await read($, history)
    const left = remaining(await read($, limits), l)
    const lines = tasks.length === 0
      ? [t.noTasks]
      : [...tasks].reverse().map((x, i) => `${i + 1}. "${x.label}" — ${describe(x, l)}`)
    const total = tasks.reduce((sum, x) => sum + x.tokens, 0)

    return {
      text: [
        t.usageTitle,
        ...lines,
        t.total(tasks.length, formatTokens(total)),
        left ? `${t.quotaLeft}: ${left}` : t.noQuota,
      ].join('\n'),
    }
  })

  // A typed prompt opens a task: pick its model and start counting.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) {
      return next(e)
    }

    await update($, lang, () => pickLang(option, e.text))

    let tier: Tier | null = null
    if (await read($, isOn)) {
      const picked = classify(e.text)
      await update($, choice, () => picked)
      tier = picked.tier
    }

    const usage = await $.session.usage()
    const task: Task = {
      label: labelOf(e.text),
      tier,
      tokens: 0,
      output: 0,
      usd: null,
      startUsd: usage.cost?.usd ?? null,
    }
    await update($, current, () => task)

    return next(e)
  })

  // Every model request: route the main loop's to the chosen model, and add
  // what every request of the task cost (subagents included) to the task.
  on('turn.step', async function* ($, e, next) {
    let step = e
    if (e.agentId === undefined && (await read($, isOn))) {
      const picked = await read($, choice)
      if (picked) {
        step = { ...e, model: picked.tier }
      }
    }

    const result = yield* next(step)
    const u = result.usage
    if (u) {
      const spent =
        u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, current, task =>
        task ? { ...task, tokens: task.tokens + spent, output: task.output + u.output_tokens } : task,
      )
    }

    return result
  })

  // The main turn's end closes the task.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      return result
    }

    const task = await read($, current)
    if (task) {
      const usage = await $.session.usage()
      const endUsd = usage.cost?.usd
      const done: Task = {
        ...task,
        usd: task.startUsd !== null && endUsd !== undefined ? endUsd - task.startUsd : null,
      }
      await update($, last, () => done)
      await update($, history, list => [...list, done].slice(-HISTORY_SIZE))
      await update($, current, () => null)
      await update($, limits, () => usage.rateLimits.map(x => ({ ...x })))
    }

    return result
  })

  // The rate-limit windows move as responses arrive.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits.map(x => ({ ...x })))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const l = await read($, lang)
    const t = TEXT[l]
    const isRouting = await read($, isOn)
    const picked = await read($, choice)
    const task = await read($, last)
    const left = remaining(await read($, limits), l)

    if (isRouting && !picked && !task && !left) {
      return next(e)
    }

    return (
      <Box flexDirection="column">
        {isRouting ? (
          picked && (
            <Box>
              <Text bold>{LABEL[picked.tier]}</Text>
              <Text dimColor> · {reasonOf(picked, l)}</Text>
            </Box>
          )
        ) : (
          <Text dimColor>{t.bandOff}</Text>
        )}
        {(task || left) && (
          <Text dimColor>
            {task ? `${t.lastTask}: ${formatTokens(task.tokens)} ${t.tokens}${formatUsd(task.usd, l)}` : ''}
            {task && left ? ' · ' : ''}
            {left ? `${t.left}: ${left}` : ''}
          </Text>
        )}
      </Box>
    )
  })
}
