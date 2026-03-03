import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { sendCancellationEmail } from '@/lib/email';

// POST /api/subscription/cancel
// User-facing: cancels the subscription at period end (keeps access until billing cycle ends).
// The user is identified by the x-user-email header (no admin auth required).
export async function POST(req: NextRequest) {
  const email = req.headers.get('x-user-email');

  if (!email) {
    return NextResponse.json({ error: 'x-user-email header required' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] },
        cancelAtPeriodEnd: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found to cancel' },
        { status: 404 }
      );
    }

    // Cancel at period end via Stripe — access remains until currentPeriodEnd
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update our DB
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, updatedAt: new Date() },
    });

    // Send cancellation confirmation email
    try {
      await sendCancellationEmail(
        { id: user.id, email: user.email, name: user.name || '' },
        false, // not immediate — cancels at period end
        subscription.currentPeriodEnd
      );
    } catch (emailErr) {
      // Don't fail the request if email fails
      console.warn('Cancellation email failed:', emailErr);
    }

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
      message: 'Your subscription will remain active until the end of your current billing period.',
    });
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
