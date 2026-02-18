import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { validateAdmin } from '@/lib/admin';
import { sendCancellationEmail } from '@/lib/email';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const immediate = body.immediate === true;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.status === 'canceled') {
      return NextResponse.json({ error: 'Subscription already canceled' }, { status: 400 });
    }

    if (immediate) {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      await prisma.subscription.update({
        where: { id },
        data: { status: 'canceled', canceledAt: new Date(), updatedAt: new Date() },
      });
    } else {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await prisma.subscription.update({
        where: { id },
        data: { cancelAtPeriodEnd: true, updatedAt: new Date() },
      });
    }

    // Send cancellation email to user
    if (subscription.user) {
      sendCancellationEmail(
        { id: subscription.user.id, email: subscription.user.email, name: subscription.user.name || '' },
        immediate,
        subscription.currentPeriodEnd
      );
    }

    return NextResponse.json({ success: true, immediate });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to cancel subscription' }, { status: 500 });
  }
}
