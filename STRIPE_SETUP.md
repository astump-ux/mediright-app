# ─────────────────────────────────────────────────────────────────────────────
# STRIPE — add these to your .env.local (and to Vercel Environment Variables)
# ─────────────────────────────────────────────────────────────────────────────

# 1. Get from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_...          # or sk_test_... for testing

# 2. Create a webhook endpoint in the Stripe Dashboard:
#    Endpoint URL:  https://your-app.vercel.app/api/stripe/webhook
#    Events to send: checkout.session.completed
#                    customer.subscription.deleted
#                    invoice.payment_succeeded
#    Then copy the "Signing secret" here:
STRIPE_WEBHOOK_SECRET=whsec_...

# 3. Your app's public URL (no trailing slash)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# ─────────────────────────────────────────────────────────────────────────────
# STRIPE PRODUCT PRICE IDs
# Create these products in the Stripe Dashboard (Products → Add product)
# ─────────────────────────────────────────────────────────────────────────────

# Starter Pack — 5 Credits, €7.99, One-time payment
STRIPE_PRICE_CREDITS_5=price_...

# Standard Pack — 15 Credits, €19.99, One-time payment
STRIPE_PRICE_CREDITS_15=price_...

# Profi Pack — 40 Credits, €44.99, One-time payment
STRIPE_PRICE_CREDITS_40=price_...

# MediRight PRO — €59.00/year, Recurring subscription (interval: year)
STRIPE_PRICE_PRO_ANNUAL=price_...

# ─────────────────────────────────────────────────────────────────────────────
# SETUP CHECKLIST
# ─────────────────────────────────────────────────────────────────────────────
#
# 1. [ ] Create Stripe account at https://stripe.com
# 2. [ ] Copy STRIPE_SECRET_KEY from Dashboard → API Keys
# 3. [ ] Create 4 products in Dashboard → Products:
#        - "Starter Pack" (€7.99 one-time) → copy price_... ID to STRIPE_PRICE_CREDITS_5
#        - "Standard Pack" (€19.99 one-time) → copy price_... ID to STRIPE_PRICE_CREDITS_15
#        - "Profi Pack" (€44.99 one-time) → copy price_... ID to STRIPE_PRICE_CREDITS_40
#        - "MediRight PRO" (€59.00 / year) → copy price_... ID to STRIPE_PRICE_PRO_ANNUAL
# 4. [ ] Create webhook endpoint at Dashboard → Webhooks
#        URL: https://your-app.vercel.app/api/stripe/webhook
#        Events: checkout.session.completed, customer.subscription.deleted, invoice.payment_succeeded
#        Copy the webhook secret to STRIPE_WEBHOOK_SECRET
# 5. [ ] Add all vars to Vercel → Settings → Environment Variables
# 6. [ ] Run Supabase migration: supabase/migrations/025_credits_and_subscriptions.sql
#
