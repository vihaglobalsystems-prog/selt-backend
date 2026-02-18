import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { validateAdmin } from '@/lib/admin';

export async function POST(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { paymentId, amount, reason } = await req.json();

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: { select: { email: true, name: true } } },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (!payment.stripePaymentIntent) {
      return NextResponse.json({ error: 'No Stripe payment intent for this payment' }, { status: 400 });
    }

    // Create refund in Stripe
    const refundParams: any = { payment_intent: payment.stripePaymentIntent };
    if (amount) refundParams.amount = Math.round(amount * 100); // Convert pounds to pence
    if (reason) refundParams.reason = 'requested_by_customer';

    const stripeRefund = await stripe.refunds.create(refundParams);

    // Save to database
    const refund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        stripeRefundId: stripeRefund.id,
        amount: stripeRefund.amount,
        reason: reason || 'Admin initiated refund',
        status: stripeRefund.status || 'succeeded',
      },
    });

    return NextResponse.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        stripeRefundId: refund.stripeRefundId,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Refund failed' }, { status: 500 });
  }
}
