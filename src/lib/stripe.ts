import Stripe from 'stripe'

// ── Lazy Stripe client — only instantiated at request time, not at build time ─
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
  }
  return _stripe
}

// ── Credit Packs (one-time payments) ────────────────────────────────────────
// Create these products in your Stripe Dashboard and set the price IDs in .env.local
export const CREDIT_PACKS = [
  {
    id: 'starter',
    name: 'Starter Pack',
    credits: 5,
    priceEur: 7.99,
    perCredit: 1.60,
    priceId: process.env.STRIPE_PRICE_CREDITS_5 ?? '',
    popular: false,
    description: 'Zum Kennenlernen',
  },
  {
    id: 'standard',
    name: 'Standard Pack',
    credits: 15,
    priceEur: 19.99,
    perCredit: 1.33,
    priceId: process.env.STRIPE_PRICE_CREDITS_15 ?? '',
    popular: true,
    description: 'Beliebtestes Paket',
  },
  {
    id: 'profi',
    name: 'Profi Pack',
    credits: 40,
    priceEur: 44.99,
    perCredit: 1.12,
    priceId: process.env.STRIPE_PRICE_CREDITS_40 ?? '',
    popular: false,
    description: 'Für aktive Widersprüche',
  },
] as const

export type CreditPackId = typeof CREDIT_PACKS[number]['id']

// ── PRO Annual Subscription ──────────────────────────────────────────────────
export const PRO_SUBSCRIPTION = {
  name: 'MediRight PRO',
  priceEur: 59,
  perMonth: 4.92,
  priceId: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
  features: [
    'Unbegrenzte KI-Analysen',
    'Alle Widerspruchs- & Korrekturbriefe',
    'Chat-Assistent ohne Limit',
    'Beste Modellqualität',
    'PDF-Export & strukturierte Berichte',
    'Frühzeitiger Feature-Zugang',
  ],
}
