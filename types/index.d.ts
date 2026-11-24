export type Tier = 'haiku' | 'sonnet' | 'opus'
export type Lang = 'he' | 'en'
/** `reason` is Hebrew; `reasonEn` its English (absent in values stored before 0.2.0). */
export type Choice = { tier: Tier; reason: string; reasonEn?: string }

/** One task: a prompt the person typed and everything the model did for it. */
export type Task = {
  label: string
  tier: Tier | null
  /** All tokens of the task's requests: input, cache reads and writes, output. */
  tokens: number
  output: number
  /** Estimated cost of the task in USD (the session's cost before and after). */
  usd: number | null
  startUsd: number | null
}

/** A rate-limit window: `five_hour` or `seven_day`, and how full it is. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      choice: Choice | null
      isOn: boolean
      current: Task | null
      last: Task | null
      history: Task[]
      limits: Limit[]
      lang: Lang
    }
  }
}
