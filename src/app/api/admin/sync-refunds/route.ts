import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });

// POST /api/admin/sync-refunds
// Pulls all refunds from Stripe and upserts them into the DB.
// Safe to run multiple times — upserts on stripeRefundId.
export async function POST(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    let synced = 0;
    let skipped = 0;
    const detail: string[] = [];

    // Page through all Stripe refunds (up to 1000)
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.RefundListParams = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;

      const stripeRefunds = await stripe.refunds.list(params);
      hasMore = stripeRefunds.has_more;
      if (stripeRefunds.data.length > 0) {
        startingAfter = stripeRefunds.data[stripeRefunds.data.length - 1].id;
      }

      for (const ref of stripeRefunds.data) {
        if (!ref.payment_intent) { skipped++; continue; }

        const paymentIntentId = typeof ref.payment_intent === 'string'
          ? ref.payment_intent
          : ref.payment_intent.id;

        // Find matching payment in DB
        const payment = await prisma.payment.findFirst({
          where: { stripePaymentIntent: paymentIntentId },
          include: { user: { select: { email: true } } },
        });

        if (!payment) { skipped++; continue; }

        await prisma.refund.upsert({
          where: { stripeRefundId: ref.id },
          create: {
            paymentId:      payment.id,
            stripeRefundId: ref.id,
            amount:         ref.amount,
            reason:         ref.reason || 'requested_by_customer',
            status:         ref.status || 'succeeded',
            createdAt:      new Date(ref.created * 1000),
          },
          update: {
            paymentId: payment.id,
            amount:    ref.amount,
            status:    ref.status || 'succeeded',
          },
        });

        synced++;
        detail.push(`${payment.user?.email || payment.id} — ${ref.id} £${(ref.amount / 100).toFixed(2)}`);
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      detail,
      message: `Synced ${synced} refund(s) from Stripe`,
    });
  } catch (err: any) {
    console.error('Sync refunds error:', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
