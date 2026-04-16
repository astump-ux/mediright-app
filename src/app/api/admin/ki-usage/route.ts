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

export interface KiUsageResponse {
  byDay: Record<string, UsageDayEntry>  // key: 'YYYY-MM-DD'
}

export async function GET(): Promise<NextResponse> {
  const admin = getSupabaseAdmin()

  // Fetch last 90 days of logs
  const since = new Date()
  since.setDate(since.getDate() - 90)

  const { data, error } = await admin
    .from('ki_usage_log')
    .select('created_at, call_type, model, input_tokens, output_tokens')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byDay: Record<string, UsageDayEntry> = {}

  for (const row of data ?? []) {
    const day = (row.created_at as string).slice(0, 10)
    if (!byDay[day]) byDay[day] = { input: 0, output: 0, total: 0, calls: 0, costUsd: 0 }
    const e = byDay[day]
    e.input   += row.input_tokens
    e.output  += row.output_tokens
    e.total   += row.input_tokens + row.output_tokens
    e.calls   ++
    e.costUsd += calcCostUsd(row.model, row.input_tokens, row.output_tokens)
  }

  return NextResponse.json({ byDay } satisfies KiUsageResponse)
}
