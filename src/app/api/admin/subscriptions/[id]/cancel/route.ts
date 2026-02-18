import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { validateAdmin } from '@/lib/admin';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const immediate = body.immediate === true;

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.status === 'canceled') {
      return NextResponse.json({ error: 'Subscription already canceled' }, { status: 400 });
    }

    if (immediate) {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      await prisma.subscription.update({
        where: { id },
        data: { status: 'canceled', canceledAt: new Date(), updatedAt: new Date() },
      });
    } else {
      // Cancel at end of billing period
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await prisma.subscription.update({
        where: { id },
        data: { cancelAtPeriodEnd: true, updatedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, immediate });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to cancel subscription' }, { status: 500 });
  }
}
