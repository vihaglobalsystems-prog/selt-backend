import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const filter = url.searchParams.get('filter') || 'all'; // 'all' | 'premium' | 'free'
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    // Base search condition
    const searchWhere = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name:  { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Filter by subscription status
    const filterWhere =
      filter === 'premium'
        ? { subscriptions: { some: { status: 'active' } } }
        : filter === 'free'
        ? { subscriptions: { none: { status: 'active' } } }
        : {};

    const where = { ...searchWhere, ...filterWhere };

    // Run paginated query + total count + category counts in parallel
    const [users, total, premiumCount, freeCount, allCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          stripeCustomerId: true,
          createdAt: true,
          subscriptions: {
            where: { status: 'active' },
            take: 1,
            select: { status: true, currentPeriodEnd: true },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...searchWhere, subscriptions: { some: { status: 'active' } } } }),
      prisma.user.count({ where: { ...searchWhere, subscriptions: { none: { status: 'active' } } } }),
      prisma.user.count({ where: searchWhere }),
    ]);

    return NextResponse.json({
      users: users.map(u => ({
        ...u,
        hasActiveSubscription: u.subscriptions.length > 0,
        subscriptionEnd: u.subscriptions[0]?.currentPeriodEnd || null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      counts: {
        all: allCount,
        premium: premiumCount,
        free: freeCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load users' }, { status: 500 });
  }
}
