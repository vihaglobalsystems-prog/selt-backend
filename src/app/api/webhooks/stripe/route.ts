import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { sendPaymentConfirmation, sendAdminNewSubscription, sendRefundEmail } from '@/lib/email';

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

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  // Only handle one-time payment sessions
  if (session.mode !== 'payment') {
    console.log('Skipping non-payment session:', session.mode);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: session.customer as string },
  });
  if (!user) {
    console.error('No user for customer:', session.customer);
    return;
  }

  // Record the payment
  const paymentIntentId = session.payment_intent as string;
  await prisma.payment.upsert({
    where: { stripeInvoiceId: session.id },
    create: {
      userId: user.id,
      stripeInvoiceId: session.id,           // reuse invoice field to store session ID
      stripePaymentIntent: paymentIntentId,
      amount: session.amount_total ?? 499,
      currency: session.currency ?? 'gbp',
      status: 'paid',
      paidAt: new Date(),
    },
    update: {
      status: 'paid',
      paidAt: new Date(),
    },
  });

  // Create a lifetime "subscription" record so existing access checks still work
  const FAR_FUTURE = new Date('2099-12-31T23:59:59Z');
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: 'onetime_' + session.id },
    create: {
      userId: user.id,
      stripeSubscriptionId: 'onetime_' + session.id,
      stripePriceId: process.env.STRIPE_PRICE_ID ?? 'one_time',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: FAR_FUTURE,
      cancelAtPeriodEnd: false,
    },
    update: {
      status: 'active',
      currentPeriodEnd: FAR_FUTURE,
      updatedAt: new Date(),
    },
  });

  console.log(`✓ One-time payment + lifetime access granted for ${user.email}`);

  await sendPaymentConfirmation({ id: user.id, email: user.email, name: user.name });
  await sendAdminNewSubscription({ email: user.email, name: user.name });
}

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

    // If refunded, revoke lifetime access
    if (user) {
      await prisma.subscription.updateMany({
        where: {
          userId: user.id,
          stripeSubscriptionId: { startsWith: 'onetime_' },
          status: 'active',
        },
        data: { status: 'canceled', canceledAt: new Date(), updatedAt: new Date() },
      });

      await sendRefundEmail(
        { id: user.id, email: user.email, name: user.name || '' },
        refund.amount,
        refund.reason || undefined
      ).catch((e) => console.warn('Refund email failed:', e));
    }

    console.log(`✓ Refund synced: ${refund.id} — £${(refund.amount / 100).toFixed(2)}`);
  }
}
