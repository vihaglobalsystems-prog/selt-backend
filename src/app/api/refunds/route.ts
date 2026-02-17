import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { paymentId, reason } = await req.json();
    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
    }

    // 1. Find the payment in our database
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // 2. Verify the payment belongs to this user
    if (payment.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 3. Check there's a payment intent to refund
    if (!payment.stripePaymentIntent) {
      return NextResponse.json({ error: 'No payment intent found for this payment' }, { status: 400 });
    }

    // 4. Create the refund via Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntent,
      reason: 'requested_by_customer',
    });

    // 5. Record the refund in our database
    const dbRefund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        stripeRefundId: refund.id,
        amount: refund.amount,
        reason: reason || 'Customer requested',
        status: refund.status || 'succeeded',
      },
    });

    return NextResponse.json({
      message: 'Refund processed',
      refund: dbRefund,
    });
  } catch (error: any) {
    console.error('Refund error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process refund' },
      { status: 500 }
    );
  }
}
