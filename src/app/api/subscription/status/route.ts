import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const email = req.headers.get('x-user-email');

  if (!userId && !email) {
    return NextResponse.json({ error: 'userId or email required' }, { status: 401 });
  }

  try {
    let user;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    if (!user) {
      return NextResponse.json({
        hasActiveSubscription: false,
        status: 'none',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json({
        hasActiveSubscription: false,
        status: 'none',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    return NextResponse.json({
      hasActiveSubscription: true,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
