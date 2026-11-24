import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Choice, Limit, Task, Tier } from '../types'
import { FALLBACK, HAIKU_MAX_CHARS, OPUS_MIN_CHARS, RULES } from './rules'

const choice = atom({ plugin: 'model-router', key: 'choice' } as const, null)
const isOn = atom({ plugin: 'model-router', key: 'isOn' } as const, true)
const current = atom({ plugin: 'model-router', key: 'current' } as const, null)
const last = atom({ plugin: 'model-router', key: 'last' } as const, null)
const history = atom({ plugin: 'model-router', key: 'history' } as const, [])
const limits = atom({ plugin: 'model-router', key: 'limits' } as const, [])

const STORE_KEY = 'isOn'
const HISTORY_SIZE = 15
const RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2 }
const LABEL: Record<Tier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
const WINDOW: Record<string, string> = { five_hour: '5 שעות', seven_day: 'שבוע' }

/** Picks a model for one prompt. Exported so the test can call it directly. */
export function classify(raw: string): Choice {
  const text = raw.toLowerCase()

  if (text.length > OPUS_MIN_CHARS) {
    return { tier: 'opus', reason: 'בקשה ארוכה ומפורטת' }
  }

  let best: Choice | null = null
  let rest = text

  // Haiku phrases are specific ("שנה שם"), so they are cut out of the text
  // first; that way a generic verb inside them ("שנה") doesn't count as Sonnet.
  for (const rule of RULES.filter(r => r.tier === 'haiku')) {
    for (const word of rule.words) {
      const w = word.toLowerCase()
      if (rest.includes(w)) {
        rest = rest.split(w).join(' ')
        best ??= { tier: 'haiku', reason: rule.reason }
      }
    }
  }

  if (best && text.length > HAIKU_MAX_CHARS) {
    best = { tier: 'sonnet', reason: `${best.reason}, אבל בקשה ארוכה` }
  }

  for (const rule of RULES.filter(r => r.tier !== 'haiku')) {
    const hit = rule.words.some(w => rest.includes(w.toLowerCase()))
    if (hit && (!best || RANK[rule.tier] > RANK[best.tier])) {
      best = { tier: rule.tier, reason: rule.reason }
    }
  }

  return best ?? { tier: FALLBACK, reason: 'לא ברור מה סוג המשימה, נבחר החזק יותר' }
}

/** 950 -> "950", 12345 -> "12.3K", 2500000 -> "2.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatUsd(usd: number | null): string {
  if (usd === null) return ''
  return usd < 0.01 ? ' · פחות מ-$0.01' : ` · ≈$${usd.toFixed(2)}`
}

function labelOf(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 40 ? `${line.slice(0, 40)}…` : line
}

function describe(task: Task): string {
  const model = task.tier ? `${LABEL[task.tier]} · ` : ''
  return `${model}${formatTokens(task.tokens)} טוקנים (${formatTokens(task.output)} פלט)${formatUsd(task.usd)}`
}

function remaining(list: readonly Limit[]): string {
  return list
    .filter(l => l.kind in WINDOW || l.kind === 'spend_limit')
    .map(l => `${WINDOW[l.kind] ?? 'תקציב'}: ${Math.max(0, Math.round(100 - l.percentUsed))}%`)
    .join(' · ')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'router-off', description: 'Turn off automatic model routing' })
    await $.command.register({ name: 'router-on', description: 'Turn automatic model routing back on' })
    await $.command.register({ name: 'router-usage', description: 'Show tokens spent per task and what is left of the quota' })
    const stored = await $.store.get(STORE_KEY)
    await update($, isOn, () => stored !== false)

    const result = await next(e)
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits.map(l => ({ ...l })))

    return result
  })

  on('command.run', { command: 'router-off' }, async $ => {
    await $.store.set(STORE_KEY, false)
    await update($, isOn, () => false)
    await update($, choice, () => null)

    return { text: 'model-router כבוי. הבקשות ירוצו על המודל של השיחה (/model). ספירת הטוקנים ממשיכה.' }
  })

  on('command.run', { command: 'router-on' }, async $ => {
    await $.store.set(STORE_KEY, true)
    await update($, isOn, () => true)

    return { text: 'model-router פועל. כל בקשה תקבל מודל לפי סוג המשימה.' }
  })

  on('command.run', { command: 'router-usage' }, async $ => {
    const tasks = await read($, history)
    const left = remaining(await read($, limits))
    const lines = tasks.length === 0
      ? ['עוד אין משימות בשיחה הזאת.']
      : [...tasks].reverse().map((t, i) => `${i + 1}. "${t.label}" — ${describe(t)}`)
    const total = tasks.reduce((sum, t) => sum + t.tokens, 0)

    return {
      text: [
        `טוקנים לפי משימה (האחרונה ראשונה):`,
        ...lines,
        `סה"כ ב-${tasks.length} המשימות האחרונות: ${formatTokens(total)} טוקנים`,
        left ? `נשאר מהמכסה: ${left}` : 'אין נתוני מכסה (רק במנוי, ואחרי הבקשה הראשונה).',
      ].join('\n'),
    }
  })

  // A typed prompt opens a task: pick its model and start counting.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) {
      return next(e)
    }

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
      await update($, limits, () => usage.rateLimits.map(l => ({ ...l })))
    }

    return result
  })

  // The rate-limit windows move as responses arrive.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits.map(l => ({ ...l })))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const isRouting = await read($, isOn)
    const picked = await read($, choice)
    const task = await read($, last)
    const left = remaining(await read($, limits))

    if (isRouting && !picked && !task && !left) {
      return next(e)
    }

    return (
      <Box flexDirection="column">
        {isRouting ? (
          picked && (
            <Box>
              <Text bold>{LABEL[picked.tier]}</Text>
              <Text dimColor> · {picked.reason}</Text>
            </Box>
          )
        ) : (
          <Text dimColor>model-router כבוי · /router-on להפעלה</Text>
        )}
        {(task || left) && (
          <Text dimColor>
            {task ? `משימה אחרונה: ${formatTokens(task.tokens)} טוקנים${formatUsd(task.usd)}` : ''}
            {task && left ? ' · ' : ''}
            {left ? `נשאר: ${left}` : ''}
          </Text>
        )}
      </Box>
    )
  })
}
