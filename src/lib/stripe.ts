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
    id: 'standard',
    name: 'Standard',
    credits: 10,
    priceEur: 24.99,
    perCredit: 2.49,
    priceId: process.env.STRIPE_PRICE_CREDITS_10 ?? '',
    popular: true,
    description: 'Beliebtestes Paket',
  },
  {
    id: 'profi',
    name: 'Profi',
    credits: 25,
    priceEur: 54.99,
    perCredit: 2.19,
    priceId: process.env.STRIPE_PRICE_CREDITS_25 ?? '',
    popular: false,
    description: 'Für mehrere offene Fälle',
  },
] as const

export type CreditPackId = typeof CREDIT_PACKS[number]['id']

// ── PRO Annual Subscription ──────────────────────────────────────────────────
export const PRO_SUBSCRIPTION = {
  name: 'MediRight PRO',
  priceEur: 29,
  perMonth: 2.41,
  priceId: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
  features: [
    'Unbegrenzte Kassenbescheid-Analysen',
    'Alle Widerspruchs- & Korrekturbriefe',
    'Unbegrenzte Follow-up-Analysen',
    'Chat-Assistent ohne Limit',
    'PDF-Export & strukturierte Berichte',
    'Frühzeitiger Feature-Zugang',
  ],
}
