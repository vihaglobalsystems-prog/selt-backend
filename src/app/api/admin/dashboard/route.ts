import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const now            = new Date();
    const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd       = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalUsers,
      premiumUsers,
      freeUsers,
      totalPayments,
      revenueResult,
      revenueThisMonth,
      refundAmountResult,
      monthlySubCount,
      annualSubCount,
      renewalsThisMonth,
      recentUsers,
      recentPayments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
      prisma.user.count({ where: { subscriptions: { none: { status: { in: ['active', 'trialing'] } } } } }),
      prisma.payment.count({ where: { status: 'paid' } }),
      prisma.payment.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.payment.aggregate({
        where: { status: 'paid', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.refund.aggregate({ _sum: { amount: true } }),

      // Monthly vs annual subscriber counts
      prisma.subscription.count({
        where: { status: { in: ['active', 'trialing'] }, stripePriceId: process.env.STRIPE_PRICE_ID },
      }),
      prisma.subscription.count({
        where: { status: { in: ['active', 'trialing'] }, stripePriceId: process.env.STRIPE_ANNUAL_PRICE_ID },
      }),

      // Subscriptions renewing this calendar month
      prisma.subscription.findMany({
        where: {
          status: { in: ['active', 'trialing'] },
          cancelAtPeriodEnd: false,
          currentPeriodEnd: { gte: monthStart, lt: monthEnd },
        },
        select: { stripePriceId: true },
      }),

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

    // Fetch Stripe price amounts for MRR calculation
    let monthlyPricePence = 99;
    let annualPricePence  = 0;
    try {
      if (process.env.STRIPE_PRICE_ID) {
        const mp = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
        monthlyPricePence = mp.unit_amount ?? 99;
      }
      if (process.env.STRIPE_ANNUAL_PRICE_ID) {
        const ap = await stripe.prices.retrieve(process.env.STRIPE_ANNUAL_PRICE_ID);
        annualPricePence = ap.unit_amount ?? 0;
      }
    } catch { /* use defaults */ }

    const totalRevenue   = (revenueResult._sum.amount || 0) / 100;
    const totalRefundAmt = (refundAmountResult._sum.amount || 0) / 100;
    const netRevenue     = totalRevenue - totalRefundAmt;
    const collectedThisMonth = (revenueThisMonth._sum.amount || 0) / 100;
    const conversionRate = totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(1) : '0.0';

    // Estimated MRR from active subscribers
    const annualMonthlyEq = annualPricePence / 12;
    const estimatedMRR    = Math.round((monthlySubCount * monthlyPricePence + annualSubCount * annualMonthlyEq) / 100 * 100) / 100;

    // Estimated this-month revenue = collected so far + upcoming renewals
    const pendingRenewal = renewalsThisMonth.reduce((sum, sub) => {
      return sum + (sub.stripePriceId === process.env.STRIPE_ANNUAL_PRICE_ID ? annualPricePence : monthlyPricePence);
    }, 0) / 100;
    const estimatedMonthRevenue  = Math.round((collectedThisMonth + pendingRenewal) * 100) / 100;
    const renewalsThisMonthCount = renewalsThisMonth.length;

    return NextResponse.json({
      stats: {
        totalUsers,
        premiumUsers,
        freeUsers,
        totalPayments,
        totalRevenue,
        netRevenue,
        totalRefundAmount: totalRefundAmt,
        collectedThisMonth,
        estimatedMRR,
        estimatedMonthRevenue,
        renewalsThisMonthCount,
        monthlySubCount,
        annualSubCount,
        conversionRate,
      },
      recentUsers,
      recentPayments,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load dashboard' }, { status: 500 });
  }
}
