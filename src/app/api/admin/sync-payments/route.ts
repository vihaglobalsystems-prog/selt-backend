import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });

// POST /api/admin/sync-payments
// Backfills Payment records from Stripe for all subscription invoices.
// Safe to call multiple times — uses upsert on stripeInvoiceId.
export async function POST(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    // Get all subscriptions that have a stripeSubscriptionId
    const subscriptions = await prisma.subscription.findMany({
      include: { user: { select: { id: true, email: true, stripeCustomerId: true } } },
    });

    let synced = 0;
    let skipped = 0;
    let errors = 0;
    const detail: string[] = [];

    for (const sub of subscriptions) {
      if (!sub.stripeSubscriptionId || !sub.user?.stripeCustomerId) { skipped++; continue; }

      try {
        // Fetch all paid invoices for this subscription from Stripe
        const invoices = await stripe.invoices.list({
          subscription: sub.stripeSubscriptionId,
          status: 'paid',
          limit: 100,
        });

        for (const invoice of invoices.data) {
          if (!invoice.id || invoice.amount_paid <= 0) continue;

          await prisma.payment.upsert({
            where: { stripeInvoiceId: invoice.id },
            create: {
              userId:              sub.userId,
              subscriptionId:      sub.id,
              stripeInvoiceId:     invoice.id,
              stripePaymentIntent: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
              amount:              invoice.amount_paid,
              currency:            invoice.currency,
              status:              'paid',
              paidAt:              invoice.status_transitions?.paid_at
                                     ? new Date(invoice.status_transitions.paid_at * 1000)
                                     : new Date(),
            },
            update: {
              subscriptionId: sub.id,
              status:  'paid',
              paidAt:  invoice.status_transitions?.paid_at
                         ? new Date(invoice.status_transitions.paid_at * 1000)
                         : new Date(),
            },
          });
          synced++;
          detail.push(`${sub.user.email} — ${invoice.id} £${(invoice.amount_paid / 100).toFixed(2)}`);
        }
      } catch (err: any) {
        errors++;
        console.error(`Sync failed for sub ${sub.stripeSubscriptionId}:`, err.message);
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      errors,
      detail,
      message: `Synced ${synced} payment(s) across ${subscriptions.length} subscription(s)`,
    });
  } catch (err: any) {
    console.error('Sync payments error:', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
