import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

// In App Router, body parsing is NOT automatic — req.text() gives us
// the raw body directly, which is what Stripe needs for signature verification.

export async function POST(req: NextRequest) {
  // 1. Get the raw body and signature
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  // 2. Verify the webhook signature (prevents fake events)
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

  // 3. Handle each event type
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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

// --- Event Handlers ---

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  // Find user by Stripe customer ID
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: session.customer as string },
  });
  if (!user) {
    console.error('No user for customer:', session.customer);
    return;
  }

  // Fetch the full subscription from Stripe
  const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);

  // Save subscription to our database
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: stripeSub.id },
    create: {
      userId: user.id,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: stripeSub.items.data[0].price.id,
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
    update: {
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Subscription created for ${user.email}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: invoice.customer as string },
  });
  if (!user) return;

  // Find the matching subscription in our DB
  const sub = invoice.subscription
    ? await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription as string },
      })
    : null;

  // Record the payment
  await prisma.payment.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      userId: user.id,
      subscriptionId: sub?.id,
      stripeInvoiceId: invoice.id,
      stripePaymentIntent: invoice.payment_intent as string,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid',
      paidAt: new Date(),
    },
    update: {
      status: 'paid',
      paidAt: new Date(),
    },
  });

  // Update subscription period dates (for renewals)
  if (sub && invoice.subscription) {
    const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription as string);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: stripeSub.status,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        updatedAt: new Date(),
      },
    });
  }

  console.log(`✓ Payment recorded for ${user.email}: ${invoice.amount_paid} ${invoice.currency}`);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: invoice.customer as string },
  });
  if (!user) return;

  const sub = invoice.subscription
    ? await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription as string },
      })
    : null;

  // Record the failed payment
  await prisma.payment.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      userId: user.id,
      subscriptionId: sub?.id,
      stripeInvoiceId: invoice.id,
      stripePaymentIntent: invoice.payment_intent as string,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
    },
    update: { status: 'failed' },
  });

  console.log(`✗ Payment failed for ${user.email}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: subscription.customer as string },
  });
  if (!user) return;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0].price.id,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Subscription updated: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log(`✓ Subscription canceled: ${subscription.id}`);
}
