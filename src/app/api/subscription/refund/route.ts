import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { sendRefundEmail, sendCancellationEmail } from '@/lib/email';

// POST /api/subscription/refund
// Self-service refund: cancels subscription immediately AND issues a Stripe refund
// Eligibility: must be within 14 days of the most recent subscription payment
export async function POST(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'x-user-email header required' }, { status: 401 });
  }

  try {
    // 1. Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2. Find active subscription (skip lifetime/onetime_ users)
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] },
        NOT: { stripeSubscriptionId: { startsWith: 'onetime_' } },
        AND: { NOT: { stripeSubscriptionId: { startsWith: 'manual_' } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found. Lifetime access cannot be refunded via this route — contact support@seltmocktest.co.uk.' },
        { status: 404 }
      );
    }

    // 3. Find the most recent payment for this subscription
    const payment = await prisma.payment.findFirst({
      where: { userId: user.id },
      orderBy: { paidAt: 'desc' },
    });

    if (!payment || !payment.stripePaymentIntent) {
      // No recorded payment — cancel only and tell user to email for refund
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'canceled', cancelAtPeriodEnd: false, canceledAt: new Date(), updatedAt: new Date() },
      });
      await sendCancellationEmail(
        { id: user.id, email: user.email, name: user.name },
        true,
        null
      );
      return NextResponse.json({
        success: true,
        refundIssued: false,
        message: 'Your subscription has been cancelled. No payment record was found for automatic refund — please email support@seltmocktest.co.uk and we will process it within 2 business days.',
      });
    }

    // 4. Check 14-day eligibility
    const paidAt = payment.paidAt ? new Date(payment.paidAt) : null;
    const daysSincePaid = paidAt ? (Date.now() - paidAt.getTime()) / (1000 * 60 * 60 * 24) : 999;

    if (daysSincePaid > 14) {
      return NextResponse.json(
        { error: `Your most recent payment was ${Math.floor(daysSincePaid)} days ago. Automatic refunds are available within 14 days of payment. Please email support@seltmocktest.co.uk to discuss your options.` },
        { status: 400 }
      );
    }

    // 5. Check this payment hasn't already been refunded
    const existingRefund = await prisma.refund.findFirst({
      where: { paymentId: payment.id },
    });
    if (existingRefund) {
      return NextResponse.json(
        { error: 'A refund has already been processed for your most recent payment. Contact support@seltmocktest.co.uk if you need further help.' },
        { status: 400 }
      );
    }

    // 6. Issue the Stripe refund
    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntent,
      reason: 'requested_by_customer',
    });

    // 7. Record the refund in DB
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        stripeRefundId: stripeRefund.id,
        amount: stripeRefund.amount,
        reason: 'Customer requested self-service refund',
        status: stripeRefund.status || 'succeeded',
      },
    });

    // 8. Cancel the subscription immediately in Stripe
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'canceled', cancelAtPeriodEnd: false, canceledAt: new Date(), updatedAt: new Date() },
    });

    // 9. Send confirmation emails
    await sendRefundEmail(
      { id: user.id, email: user.email, name: user.name },
      stripeRefund.amount,
      'Customer requested self-service refund'
    );
    await sendCancellationEmail(
      { id: user.id, email: user.email, name: user.name },
      true,
      null
    );

    const refundAmount = (stripeRefund.amount / 100).toFixed(2);
    return NextResponse.json({
      success: true,
      refundIssued: true,
      message: `Your subscription has been cancelled and a refund of £${refundAmount} has been processed to your original payment method. Please allow 5–10 business days for it to appear.`,
    });
  } catch (err: any) {
    console.error('Subscription refund error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to process refund. Please contact support@seltmocktest.co.uk.' },
      { status: 500 }
    );
  }
}
