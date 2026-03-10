import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      premiumUsers,
      freeUsers,
      usersToday,
      usersThisWeek,
      totalRevenuePence,
      revenueThisMonth,
      totalTests,
      avgScoreResult,
      recentSignups,
      recentRevenue,
      testsByLevel,
      testsBySection,
      topUsers,
      canceledThisMonth,
    ] = await Promise.all([
      // Totals
      prisma.user.count(),
      prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
      prisma.user.count({ where: { subscriptions: { none: { status: { in: ['active', 'trialing'] } } } } }),

      // Sign-ups today / this week
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),

      // Revenue
      prisma.payment.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.payment.aggregate({
        where: { status: 'paid', paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        _sum: { amount: true },
      }),

      // Tests
      prisma.testResult.count(),
      prisma.testResult.aggregate({ _avg: { percentage: true } }),

      // Daily signups (last 30 days) — raw query for grouping
      prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
        FROM users
        WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY day ORDER BY day ASC
      `,

      // Daily revenue (last 30 days)
      prisma.$queryRaw<{ day: string; total: bigint }[]>`
        SELECT DATE(paid_at AT TIME ZONE 'UTC') AS day, SUM(amount) AS total
        FROM payments
        WHERE status = 'paid' AND paid_at >= ${thirtyDaysAgo}
        GROUP BY day ORDER BY day ASC
      `,

      // Tests by level
      prisma.$queryRaw<{ level: string; count: bigint }[]>`
        SELECT level, COUNT(*) AS count FROM test_results WHERE level IS NOT NULL GROUP BY level ORDER BY count DESC
      `,

      // Tests by section
      prisma.$queryRaw<{ section: string; count: bigint }[]>`
        SELECT section, COUNT(*) AS count FROM test_results WHERE section IS NOT NULL GROUP BY section ORDER BY count DESC
      `,

      // Top 5 most active users by test count
      prisma.$queryRaw<{ email: string; name: string; test_count: bigint; avg_pct: number }[]>`
        SELECT u.email, u.name, COUNT(tr.id) AS test_count, AVG(tr.percentage) AS avg_pct
        FROM users u JOIN test_results tr ON tr.user_id = u.id
        GROUP BY u.id, u.email, u.name
        ORDER BY test_count DESC LIMIT 5
      `,

      // Cancellations this month
      prisma.subscription.count({
        where: {
          canceledAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
      }),
    ]);

    // Build 30-day date range for charts
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const signupMap = Object.fromEntries(recentSignups.map(r => [r.day, Number(r.count)]));
    const revenueMap = Object.fromEntries(recentRevenue.map(r => [r.day, Number(r.total)]));

    const dailySignups  = days.map(d => ({ date: d, count: signupMap[d]  || 0 }));
    const dailyRevenue  = days.map(d => ({ date: d, pence: revenueMap[d] || 0 }));

    const totalRevenue = Number((totalRevenuePence._sum.amount || 0)) / 100;
    const mrr          = Number((revenueThisMonth._sum.amount  || 0)) / 100;
    const conversionRate = totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      summary: {
        totalUsers,
        premiumUsers,
        freeUsers,
        usersToday,
        usersThisWeek,
        totalRevenue,
        mrr,
        avgScore: avgScoreResult._avg.percentage ? Number(avgScoreResult._avg.percentage).toFixed(1) : null,
        totalTests,
        conversionRate,
        canceledThisMonth,
      },
      charts: {
        dailySignups,
        dailyRevenue,
        testsByLevel:   testsByLevel.map(r => ({ level: r.level, count: Number(r.count) })),
        testsBySection: testsBySection.map(r => ({ section: r.section, count: Number(r.count) })),
      },
      topUsers: topUsers.map(u => ({
        email: u.email,
        name: u.name,
        testCount: Number(u.test_count),
        avgScore: u.avg_pct ? Number(u.avg_pct).toFixed(1) : null,
      })),
    });
  } catch (err: any) {
    console.error('Analytics error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load analytics' }, { status: 500 });
  }
}
