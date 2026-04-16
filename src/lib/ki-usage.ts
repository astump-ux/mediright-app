import { getSupabaseAdmin } from './supabase-admin'

export type KiCallType = 'goae_analyse' | 'kasse_analyse' | 'widerspruch_analyse'

// Pricing per million tokens (USD) — update if Anthropic changes pricing
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-haiku-4-5':          { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-5':         { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-5':           { input: 15.00, output: 75.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
}

/** Compute USD cost for a single call */
export function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { input: 3.00, output: 15.00 }
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

/** Fire-and-forget: log a completed AI call to ki_usage_log */
export async function logKiUsage(params: {
  callType: KiCallType
  model: string
  inputTokens: number
  outputTokens: number
  userId?: string | null
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin()
    await admin.from('ki_usage_log').insert({
      call_type:     params.callType,
      model:         params.model,
      input_tokens:  params.inputTokens,
      output_tokens: params.outputTokens,
      user_id:       params.userId ?? null,
    })
  } catch {
    // Non-critical: never fail the main request because of logging
  }
}
