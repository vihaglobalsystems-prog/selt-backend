# SELT Backend - Production Checklist

## 1. Stripe: Switch to Live Mode
- Go to [Stripe Dashboard](https://dashboard.stripe.com)
- Toggle the "Test mode" switch OFF (top right)
- Go to **Developers → API keys**
- Copy your **live** publishable key (`pk_live_...`) and secret key (`sk_live_...`)

## 2. Create Live Product & Price
Run this in your project folder (update .env with live secret key first):
```bash
node setup-stripe-price.js
```
This creates the £12.99/31-day price in live mode. Copy the new `price_` ID.

## 3. Set Up Live Webhook
- Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://your-netlify-backend.netlify.app/api/webhooks/stripe`
- Events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted
- Copy the new `whsec_` signing secret

## 4. Update Environment Variables
In your Netlify dashboard (or .env.local for local), update:
```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_ID=price_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...
CLIENT_URL=https://seltmocktest.co.uk
```

## 5. Deploy to Netlify
```bash
cd selt-backend
git init
git add .
git commit -m "SELT backend with Stripe subscriptions"
```
- Push to GitHub
- Connect repo to Netlify
- Add all env vars in Netlify dashboard → Site Settings → Environment Variables

## 6. Set Up Email Reminders (REMINDER)
- Sign up at https://resend.com
- Verify domain: seltmocktest.co.uk
- Get API key → update RESEND_API_KEY in Netlify env vars
- Sign up at https://cron-job.org (free)
- Create daily POST job to: https://your-backend.netlify.app/api/cron/billing-reminders
- Add header: x-cron-secret = your CRON_SECRET value
- Schedule: Daily at 9:00 AM UTC

## 7. Test Live Mode
- Make a real £12.99 payment with your own card
- Verify webhook fires and subscription appears in database
- Immediately refund yourself from Stripe Dashboard
- Verify the refund appears in your database

## 8. Security Checklist
- [ ] .env.local is in .gitignore (never commit secrets)
- [ ] Webhook signature verification is enabled
- [ ] CORS only allows your frontend domain
- [ ] CRON_SECRET is a strong random string
- [ ] No test keys in production
