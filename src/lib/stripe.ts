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
// 1 Credit = vollständige Kassenbescheid-Analyse + Handlungsempfehlung + fertiger Brief
export const CREDIT_PACKS = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 3,
    priceEur: 7.99,
    perCredit: 2.66,
    priceId: process.env.STRIPE_PRICE_CREDITS_3 ?? '',
    popular: false,
    description: 'Zum Kennenlernen',
  },
  {
    id: 'plus',
    name: 'Plus',
    credits: 10,
    priceEur: 24.99,
    perCredit: 2.49,
    priceId: process.env.STRIPE_PRICE_CREDITS_10 ?? '',
    popular: true,
    description: 'Beliebtestes Paket',
  },
] as const

export type CreditPackId = typeof CREDIT_PACKS[number]['id']

// ── PRO Annual Subscription ──────────────────────────────────────────────────
export const PRO_SUBSCRIPTION = {
  name: 'MediRight PRO',
  priceEur: 34.99,
  perMonth: 2.92,
  priceId: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
  features: [
    'Kassenbescheid-Analysen unbegrenzt',
    'Alle Widerspruchs- & Korrekturbriefe inklusive',
    'Arztrechnung-Analyse unbegrenzt',
    'KI-Chat-Assistent ohne Limit',
    'PDF-Export & Widerspruchs-Tracker',
    'Früher Zugang zu neuen Features',
  ],
}
