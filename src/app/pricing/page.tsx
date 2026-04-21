// Server wrapper — Suspense boundary required for useSearchParams() in Next.js 15
import { Suspense } from 'react'
import PricingClient from './PricingClient'

export default function PricingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f8fafc' }} />}>
      <PricingClient />
    </Suspense>
  )
}
