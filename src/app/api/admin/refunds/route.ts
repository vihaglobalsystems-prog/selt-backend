import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { validateAdmin } from '@/lib/admin';
import { sendRefundEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const url   = new URL(req.url);
    const page  = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));
    const skip  = (page - 1) * limit;

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      }),
      prisma.refund.count(),
    ]);

    return NextResponse.json({ refunds, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load refunds' }, { status: 500 });
  }
}

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

    let paymentIntentId = payment.stripePaymentIntent;

    // If payment intent is missing, try to fetch it from Stripe via invoice
    if (!paymentIntentId && payment.stripeInvoiceId) {
      try {
        const invoice = await stripe.invoices.retrieve(payment.stripeInvoiceId);
        if (invoice.payment_intent) {
          paymentIntentId = invoice.payment_intent as string;
          // Save it for future use
          await prisma.payment.update({
            where: { id: payment.id },
            data: { stripePaymentIntent: paymentIntentId },
          });
        }
      } catch (e) {
        console.error('Could not fetch invoice from Stripe:', e);
      }
    }

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'No Stripe payment intent found. Cannot process refund.' }, { status: 400 });
    }

    // Create refund in Stripe
    const refundParams: any = { payment_intent: paymentIntentId };
    if (amount) refundParams.amount = Math.round(amount * 100);
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

    // Send refund confirmation email
    if (payment.user && payment.userId) {
      sendRefundEmail({ id: payment.userId, email: payment.user.email, name: payment.user.name || '' }, stripeRefund.amount, reason);
    }

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
