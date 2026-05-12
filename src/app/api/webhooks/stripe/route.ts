import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { sendSubscriptionConfirmation, sendAdminNewSubscription, sendRefundEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`Error processing ${event.type}:`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// ── New monthly subscription checkout completed ───────────────────────────────
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') {
    // Legacy one-time payment path — keep existing onetime_ subscriptions intact
    console.log('Skipping non-subscription session:', session.mode);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: session.customer as string },
  });
  if (!user) {
    console.error('No user for customer:', session.customer);
    return;
  }

  const stripeSubId = session.subscription as string;
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: stripeSubId },
    create: {
      userId: user.id,
      stripeSubscriptionId: stripeSubId,
      stripePriceId: process.env.STRIPE_PRICE_ID ?? '',
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
    update: {
      status: stripeSub.status,
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Subscription created for ${user.email} — ${stripeSubId}`);

  await sendSubscriptionConfirmation({ id: user.id, email: user.email, name: user.name });
  await sendAdminNewSubscription({ id: user.id, email: user.email, name: user.name });
}

// ── Monthly invoice paid — keep period end in sync ────────────────────────────
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const stripeSubId = invoice.subscription as string;
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);

  // Record the payment
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: invoice.customer as string },
  });

  if (user && invoice.id) {
    await prisma.payment.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: {
        userId: user.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntent: invoice.payment_intent as string ?? null,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: 'paid',
        paidAt: new Date(),
      },
      update: { status: 'paid', paidAt: new Date() },
    });
  }

  // Update subscription period end
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSubId },
    data: {
      status: 'active',
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Invoice paid for sub ${stripeSubId} — period end updated`);
}

// ── Subscription status changed (cancelled, paused, etc.) ────────────────────
async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data: {
      status: sub.status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Subscription updated: ${sub.id} — status: ${sub.status}`);
}

// ── Subscription fully deleted ────────────────────────────────────────────────
async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data: {
      status: 'canceled',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Subscription deleted: ${sub.id}`);
}

// ── Charge refunded ───────────────────────────────────────────────────────────
async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunds?.data?.length) return;

  const user = charge.customer
    ? await prisma.user.findUnique({ where: { stripeCustomerId: charge.customer as string } })
    : null;

  for (const refund of charge.refunds.data) {
    const existing = await prisma.refund.findUnique({ where: { stripeRefundId: refund.id } });
    if (existing) continue;

    const payment = charge.invoice
      ? await prisma.payment.findUnique({ where: { stripeInvoiceId: charge.invoice as string } })
      : null;

    await prisma.refund.create({
      data: {
        paymentId: payment?.id ?? null,
        stripeRefundId: refund.id,
        amount: refund.amount,
        reason: refund.reason || 'requested_by_customer',
        status: refund.status || 'succeeded',
      },
    });

    console.log(`✓ Refund synced: ${refund.id} — £${(refund.amount / 100).toFixed(2)}`);

    if (user) {
      await sendRefundEmail(
        { id: user.id, email: user.email, name: user.name || '' },
        refund.amount,
        refund.reason || undefined
      ).catch((e) => console.warn('Refund email failed:', e));
    }
  }
}
