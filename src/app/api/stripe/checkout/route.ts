/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for either:
 *   - A one-time credit pack purchase  (type: 'credits', packId: 'starter'|'standard'|'profi')
 *   - An annual PRO subscription        (type: 'pro')
 *
 * Returns { url } — the Stripe-hosted checkout page URL.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { stripe, CREDIT_PACKS, PRO_SUBSCRIPTION, type CreditPackId } from '@/lib/stripe'
import { getUserCreditStatus, setStripeCustomerId } from '@/lib/credits'

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { type, packId } = (await req.json()) as { type: 'credits' | 'pro'; packId?: CreditPackId }

  // ── Resolve price ────────────────────────────────────────────────────────────
  let priceId: string
  let mode: 'payment' | 'subscription'

  if (type === 'pro') {
    if (!PRO_SUBSCRIPTION.priceId) {
      return NextResponse.json({ error: 'PRO price not configured' }, { status: 500 })
    }
    priceId = PRO_SUBSCRIPTION.priceId
    mode    = 'subscription'
  } else if (type === 'credits' && packId) {
    const pack = CREDIT_PACKS.find(p => p.id === packId)
    if (!pack || !pack.priceId) {
      return NextResponse.json({ error: 'Invalid pack or price not configured' }, { status: 400 })
    }
    priceId = pack.priceId
    mode    = 'payment'
  } else {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // ── Get or create Stripe customer ───────────────────────────────────────────
  const creditStatus = await getUserCreditStatus(user.id)
  let stripeCustomerId = creditStatus.stripeCustomerId

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email:    user.email,
      metadata: { supabase_user_id: user.id },
    })
    stripeCustomerId = customer.id
    await setStripeCustomerId(user.id, stripeCustomerId)
  }

  // ── Create checkout session ─────────────────────────────────────────────────
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const session = await stripe.checkout.sessions.create({
    customer:             stripeCustomerId,
    mode,
    line_items:           [{ price: priceId, quantity: 1 }],
    success_url:          `${appUrl}/dashboard?purchase=success`,
    cancel_url:           `${appUrl}/pricing?purchase=cancelled`,
    allow_promotion_codes: true,
    metadata: {
      supabase_user_id: user.id,
      purchase_type:    type,
      ...(packId ? { pack_id: packId } : {}),
    },
    ...(mode === 'subscription' ? {
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    } : {}),
  })

  return NextResponse.json({ url: session.url })
}
