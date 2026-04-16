import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { calcCostUsd } from '@/lib/ki-usage'

export const dynamic = 'force-dynamic'

export interface UsageDayEntry {
  input:   number
  output:  number
  total:   number
  calls:   number
  costUsd: number
}

export interface UsageModelEntry extends UsageDayEntry {
  model: string
}

export interface KiUsageResponse {
  byDay:   Record<string, UsageDayEntry>     // key: 'YYYY-MM-DD'
  byModel: Record<string, UsageModelEntry>   // key: model string
}

export async function GET(): Promise<NextResponse> {
  const admin = getSupabaseAdmin()

  const since = new Date()
  since.setDate(since.getDate() - 90)

  const { data, error } = await admin
    .from('ki_usage_log')
    .select('created_at, call_type, model, input_tokens, output_tokens')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byDay:   Record<string, UsageDayEntry>   = {}
  const byModel: Record<string, UsageModelEntry> = {}

  for (const row of data ?? []) {
    const cost = calcCostUsd(row.model, row.input_tokens, row.output_tokens)

    // Aggregate by day
    const day = (row.created_at as string).slice(0, 10)
    if (!byDay[day]) byDay[day] = { input: 0, output: 0, total: 0, calls: 0, costUsd: 0 }
    byDay[day].input   += row.input_tokens
    byDay[day].output  += row.output_tokens
    byDay[day].total   += row.input_tokens + row.output_tokens
    byDay[day].calls   ++
    byDay[day].costUsd += cost

    // Aggregate by model
    if (!byModel[row.model]) byModel[row.model] = { model: row.model, input: 0, output: 0, total: 0, calls: 0, costUsd: 0 }
    byModel[row.model].input   += row.input_tokens
    byModel[row.model].output  += row.output_tokens
    byModel[row.model].total   += row.input_tokens + row.output_tokens
    byModel[row.model].calls   ++
    byModel[row.model].costUsd += cost
  }

  return NextResponse.json({ byDay, byModel } satisfies KiUsageResponse)
}
