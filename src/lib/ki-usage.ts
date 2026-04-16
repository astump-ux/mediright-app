import { getSupabaseAdmin } from './supabase-admin'

export type KiCallType = 'goae_analyse' | 'kasse_analyse' | 'widerspruch_analyse'

// Pricing per million tokens (USD)
// Anthropic: https://www.anthropic.com/pricing
// Google:    https://ai.google.dev/pricing
export const PRICING: Record<string, { input: number; output: number; label: string }> = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00,  label: 'Claude Haiku 4.5'   },
  'claude-haiku-4-5':          { input: 0.80,  output: 4.00,  label: 'Claude Haiku 4.5'   },
  'claude-sonnet-4-5':         { input: 3.00,  output: 15.00, label: 'Claude Sonnet 4.5'  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00, label: 'Claude Sonnet 4.6'  },
  'claude-opus-4-5':           { input: 15.00, output: 75.00, label: 'Claude Opus 4.5'    },
  'claude-opus-4-6':           { input: 15.00, output: 75.00, label: 'Claude Opus 4.6'    },
  // ── Google Gemini ──────────────────────────────────────────────────────────
  'gemini-3-flash-preview':    { input: 0.15,  output: 0.60,  label: 'Gemini 3 Flash'         },
  'gemini-3.1-pro-preview':   { input: 1.25,  output: 10.00, label: 'Gemini 3.1 Pro'        },
  'gemini-2.0-flash':          { input: 0.10,  output: 0.40,  label: 'Gemini 2.0 Flash'  },
  'gemini-1.5-flash':          { input: 0.075, output: 0.30,  label: 'Gemini 1.5 Flash'  },
  'gemini-1.5-pro':            { input: 1.25,  output: 5.00,  label: 'Gemini 1.5 Pro'    },
}

/** Compute USD cost for a single call */
export function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { input: 3.00, output: 15.00, label: model }
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

/** Human-readable label for a model ID */
export function modelLabel(model: string): string {
  return PRICING[model]?.label ?? model
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
