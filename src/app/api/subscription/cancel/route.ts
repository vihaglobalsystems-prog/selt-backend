import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { sendCancellationEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'x-user-email header required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const immediate = body.immediate === true;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the user's active subscription — skip lifetime/onetime_ subscriptions
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
        { error: 'No active subscription found. Lifetime access cannot be cancelled — contact support@seltmocktest.co.uk for refunds.' },
        { status: 404 }
      );
    }

    if (immediate) {
      // Cancel immediately via Stripe
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
      return NextResponse.json({ success: true, message: 'Your subscription has been cancelled immediately.' });
    } else {
      // Cancel at period end via Stripe
      const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await sendCancellationEmail(
        { id: user.id, email: user.email, name: user.name },
        false,
        new Date(updated.current_period_end * 1000)
      );
      return NextResponse.json({
        success: true,
        message: `Your subscription will end on ${new Date(updated.current_period_end * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
      });
    }
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    return NextResponse.json({ error: err.message || 'Failed to cancel subscription' }, { status: 500 });
  }
}
