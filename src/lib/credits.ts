/**
 * Credit system utilities — all DB interactions for credits and subscriptions.
 * Always use supabaseAdmin here (server-side only, never import in client components).
 */
import { getSupabaseAdmin } from './supabase-admin'

export type CreditStatus = {
  balance: number
  freeAnalysesUsed: number
  freeAnalysesLimit: number
  freeRemaining: number
  subscriptionStatus: 'free' | 'pro'
  subscriptionExpiresAt: string | null
  stripeCustomerId: string | null
  isPro: boolean
  /** true if user can run an analysis right now */
  canAnalyze: boolean
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getUserCreditStatus(userId: string): Promise<CreditStatus> {
  const supabase = getSupabaseAdmin()

  let { data } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!data) {
    // Backfill for users created before migration 025
    await supabase
      .from('user_credits')
      .upsert({ user_id: userId, balance: 0, free_analyses_used: 0, free_analyses_limit: 2 })
    data = { balance: 0, free_analyses_used: 0, free_analyses_limit: 2, subscription_status: 'free', subscription_expires_at: null, stripe_customer_id: null }
  }

  const isPro =
    data.subscription_status === 'pro' &&
    (!data.subscription_expires_at || new Date(data.subscription_expires_at) > new Date())

  const freeRemaining = Math.max(0, data.free_analyses_limit - data.free_analyses_used)
  const canAnalyze    = isPro || freeRemaining > 0 || data.balance > 0

  return {
    balance:                data.balance,
    freeAnalysesUsed:       data.free_analyses_used,
    freeAnalysesLimit:      data.free_analyses_limit,
    freeRemaining,
    subscriptionStatus:     data.subscription_status as 'free' | 'pro',
    subscriptionExpiresAt:  data.subscription_expires_at ?? null,
    stripeCustomerId:       data.stripe_customer_id ?? null,
    isPro,
    canAnalyze,
  }
}

// ── Deduct (used in analysis pipeline) ───────────────────────────────────────

type AnalysisReason = 'rechnung_analyse' | 'kasse_analyse'

/**
 * Gate an analysis run behind the credit system.
 * Priority: PRO → free tier → paid credits.
 * Returns { allowed: true } or { allowed: false, reason: 'no_credits' | 'no_free' }
 */
export async function checkAndDeductAnalysisCredit(
  userId:   string,
  reason:   AnalysisReason,
  metadata?: Record<string, unknown>
): Promise<{ allowed: boolean; error?: string; usedFree?: boolean }> {
  const supabase = getSupabaseAdmin()
  const status   = await getUserCreditStatus(userId)

  // ── PRO users pass through, no credit deducted ──
  if (status.isPro) {
    return { allowed: true }
  }

  // ── Free tier analysis ──
  if (status.freeRemaining > 0) {
    await supabase
      .from('user_credits')
      .update({
        free_analyses_used: status.freeAnalysesUsed + 1,
        updated_at:         new Date().toISOString(),
      })
      .eq('user_id', userId)

    await supabase.from('credit_transactions').insert({
      user_id:      userId,
      amount:       0,
      balance_after: status.balance,
      reason:       'free_tier',
      metadata:     { analysisType: reason, ...metadata },
    })

    return { allowed: true, usedFree: true }
  }

  // ── No credits left ──
  if (status.balance <= 0) {
    return { allowed: false, error: 'no_credits' }
  }

  // ── Deduct 1 paid credit via atomic RPC ──
  const { data: newBalance, error } = await supabase.rpc('increment_user_credits', {
    p_user_id:  userId,
    p_amount:   -1,
    p_reason:   reason,
    p_metadata: metadata ?? null,
  })

  if (error) {
    console.error('[credits] deduct RPC error:', error)
    return { allowed: false, error: 'db_error' }
  }

  return { allowed: true, usedFree: false }
}

// ── Add (called by Stripe webhook) ───────────────────────────────────────────

export async function addCredits(
  userId:   string,
  amount:   number,
  reason:   string,
  metadata?: Record<string, unknown>
): Promise<number> {
  const supabase    = getSupabaseAdmin()
  const { data: newBalance, error } = await supabase.rpc('increment_user_credits', {
    p_user_id:  userId,
    p_amount:   amount,
    p_reason:   reason,
    p_metadata: metadata ?? null,
  })
  if (error) throw new Error(`addCredits RPC failed: ${error.message}`)
  return newBalance as number
}

// ── Subscription management (called by Stripe webhook) ───────────────────────

export async function activateProSubscription(
  userId:           string,
  expiresAt:        Date,
  stripeCustomerId?: string
): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('user_credits').upsert(
    {
      user_id:                userId,
      subscription_status:    'pro',
      subscription_expires_at: expiresAt.toISOString(),
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
      updated_at:             new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

export async function deactivateProSubscription(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('user_credits')
    .update({
      subscription_status:     'free',
      subscription_expires_at: null,
      updated_at:              new Date().toISOString(),
    })
    .eq('user_id', userId)
}

/** Look up user_id from stripe_customer_id */
export async function getUserIdByStripeCustomer(customerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('user_credits')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()
  return data?.user_id ?? null
}

/** Persist stripe_customer_id for future lookups */
export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('user_credits')
    .upsert({ user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' })
}
