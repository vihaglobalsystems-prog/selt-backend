import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { validateAdmin } from '@/lib/admin';

// GET /api/admin/users/[id] — full user detail
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { id } = params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            payments: {
              orderBy: { createdAt: 'desc' },
              include: { refunds: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { refunds: true },
        },
        testResults: {
          orderBy: { timestamp: 'desc' },
          take: 50,
          select: { id: true, level: true, score: true, total: true, percentage: true, section: true, timestamp: true },
        },
        userProfile: true,
        _count: { select: { testResults: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load user' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — permanently delete a user and all their data
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { id } = params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Delete in FK-safe order (no cascade on payments/refunds/emailLog)
    const payments = await prisma.payment.findMany({ where: { userId: id }, select: { id: true } });
    const paymentIds = payments.map(p => p.id);

    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.emailLog.deleteMany({ where: { userId: id } });
    await prisma.payment.deleteMany({ where: { userId: id } });
    // Subscription, TestResult, UserProfile cascade from user delete
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true, deleted: { email: user.email } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete user' }, { status: 500 });
  }
}

// PATCH /api/admin/users/[id] — grant or revoke manual premium access
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { id } = params;
    const body = await req.json();
    const { action } = body; // 'grant_premium' | 'revoke_premium' | 'cancel_subscription'

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (action === 'grant_premium') {
      // Create a manual subscription record (no Stripe) valid for 1 year
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      await prisma.subscription.create({
        data: {
          userId: id,
          stripeSubscriptionId: 'manual_' + id + '_' + Date.now(),
          stripePriceId: 'manual',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: oneYearFromNow,
          cancelAtPeriodEnd: false,
        },
      });
      return NextResponse.json({ success: true, message: 'Premium granted (manual, 1 year)' });
    }

    if (action === 'revoke_premium') {
      // Mark all active manual subscriptions as canceled
      await prisma.subscription.updateMany({
        where: {
          userId: id,
          status: { in: ['active', 'trialing'] },
          stripeSubscriptionId: { startsWith: 'manual_' },
        },
        data: { status: 'canceled', canceledAt: new Date() },
      });
      // Also cancel real Stripe subscriptions
      const stripeSubs = await prisma.subscription.findMany({
        where: {
          userId: id,
          status: { in: ['active', 'trialing'] },
          NOT: { stripeSubscriptionId: { startsWith: 'manual_' } },
        },
      });
      for (const sub of stripeSubs) {
        try {
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        } catch {}
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'canceled', canceledAt: new Date() },
        });
      }
      return NextResponse.json({ success: true, message: 'Premium revoked' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 });
  }
}
