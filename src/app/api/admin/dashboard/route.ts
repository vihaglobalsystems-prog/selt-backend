import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const [
      totalUsers,
      activeSubscriptions,
      totalPayments,
      revenueResult,
      totalRefunds,
      refundAmountResult,
      recentUsers,
      recentPayments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.payment.count({ where: { status: 'paid' } }),
      prisma.payment.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.refund.count(),
      prisma.refund.aggregate({ _sum: { amount: true } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { email: true, name: true } } },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers,
        activeSubscriptions,
        totalPayments,
        totalRevenue: (revenueResult._sum.amount || 0) / 100, // Convert from pence to pounds
        totalRefunds,
        totalRefundAmount: (refundAmountResult._sum.amount || 0) / 100,
      },
      recentUsers,
      recentPayments,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load dashboard' }, { status: 500 });
  }
}
