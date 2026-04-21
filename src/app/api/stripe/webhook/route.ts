/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events:
 *   checkout.session.completed   → fulfil credit pack or activate PRO
 *   customer.subscription.deleted → deactivate PRO
 *   invoice.payment_succeeded    → renew PRO subscription period
 *
 * Idempotent: stripe_events table prevents double-processing.
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe, CREDIT_PACKS } from '@/lib/stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  addCredits,
  activateProSubscription,
  deactivateProSubscription,
  getUserIdByStripeCustomer,
} from '@/lib/credits'

async function markEventProcessed(eventId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('stripe_events')
    .insert({ stripe_event_id: eventId })
  return !error // false = duplicate
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!
  const secret    = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── Idempotency guard ────────────────────────────────────────────────────────
  const isNew = await markEventProcessed(event.id)
  if (!isNew) {
    console.log('[stripe-webhook] duplicate event, skipping:', event.id)
    return NextResponse.json({ ok: true })
  }

  console.log('[stripe-webhook] processing event:', event.type, event.id)

  try {
    switch (event.type) {

      // ── One-time credit purchase OR initial PRO subscription checkout ────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId  = session.metadata?.supabase_user_id
        if (!userId) { console.error('[stripe-webhook] missing user_id in session metadata'); break }

        if (session.mode === 'payment' && session.payment_status === 'paid') {
          // Credit pack purchase
          const packId = session.metadata?.pack_id
          const pack   = CREDIT_PACKS.find(p => p.id === packId)
          if (!pack) { console.error('[stripe-webhook] unknown pack_id:', packId); break }

          await addCredits(userId, pack.credits, 'credit_purchase', {
            pack_id:           pack.id,
            stripe_session_id: session.id,
            amount_eur:        pack.priceEur,
          })
          console.log(`[stripe-webhook] +${pack.credits} credits for user ${userId} (${pack.id})`)

        } else if (session.mode === 'subscription') {
          // First PRO checkout — set expiry to 1 year from now
          const expiresAt = new Date()
          expiresAt.setFullYear(expiresAt.getFullYear() + 1)
          await activateProSubscription(userId, expiresAt, session.customer as string)
          console.log(`[stripe-webhook] PRO activated for user ${userId} until ${expiresAt.toISOString()}`)
        }
        break
      }

      // ── Subscription renewed — use invoice.period_end as new expiry ─────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        // Only handle subscription invoices (not one-time)
        const billingReason = invoice.billing_reason
        if (!billingReason || billingReason === 'manual') break

        const customerId = invoice.customer as string
        if (!customerId) break

        const userId = await getUserIdByStripeCustomer(customerId)
        if (!userId) { console.error('[stripe-webhook] no user for customer:', customerId); break }

        // invoice.period_end is the unix timestamp for end of billing period
        const expiresAt = new Date((invoice.period_end + 86400) * 1000) // +1 day buffer
        await activateProSubscription(userId, expiresAt, customerId)
        console.log(`[stripe-webhook] PRO renewed for user ${userId} until ${expiresAt.toISOString()}`)
        break
      }

      // ── Subscription cancelled / expired ────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId   = subscription.customer as string
        const userId       = await getUserIdByStripeCustomer(customerId)
        if (!userId) { console.error('[stripe-webhook] no user for customer:', customerId); break }

        await deactivateProSubscription(userId)
        console.log(`[stripe-webhook] PRO deactivated for user ${userId}`)
        break
      }

      default:
        console.log('[stripe-webhook] unhandled event type:', event.type)
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
