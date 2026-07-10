import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

// GET /api/admin/test-results
// Query params: page, limit, search (email/name), level, section, userId
export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const url    = new URL(req.url);
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
    const limit  = Math.min(50, parseInt(url.searchParams.get('limit') || '25'));
    const skip   = (page - 1) * limit;
    const search = url.searchParams.get('search') || '';
    const level  = url.searchParams.get('level')  || '';
    const section = url.searchParams.get('section') || '';
    const userId = url.searchParams.get('userId')  || '';

    // Build where clause
    const where: any = {};
    if (level)   where.level   = level;
    if (section) where.section = section;
    if (userId)  where.userId  = userId;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { user:  { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [results, total, levelStats, sectionStats, avgScore, passRate] = await Promise.all([
      prisma.testResult.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),

      prisma.testResult.count({ where }),

      // Tests taken per CEFR level
      prisma.$queryRaw<{ level: string; count: bigint; avg_pct: number }[]>`
        SELECT level, COUNT(*) AS count, AVG(percentage) AS avg_pct
        FROM test_results
        WHERE level IS NOT NULL
        GROUP BY level ORDER BY count DESC
      `,

      // Tests taken per section
      prisma.$queryRaw<{ section: string; count: bigint; avg_pct: number }[]>`
        SELECT section, COUNT(*) AS count, AVG(percentage) AS avg_pct
        FROM test_results
        WHERE section IS NOT NULL
        GROUP BY section ORDER BY count DESC
      `,

      // Overall average score
      prisma.testResult.aggregate({ _avg: { percentage: true } }),

      // Pass rate (>=70%)
      prisma.$queryRaw<{ pass_count: bigint; total_count: bigint }[]>`
        SELECT
          COUNT(*) FILTER (WHERE percentage >= 70) AS pass_count,
          COUNT(*) AS total_count
        FROM test_results
        WHERE percentage IS NOT NULL
      `,
    ]);

    const passData   = passRate[0] || { pass_count: 0n, total_count: 0n };
    const totalCount = Number(passData.total_count);
    const passCount  = Number(passData.pass_count);

    return NextResponse.json({
      results: results.map(r => ({
        id:         r.id,
        userId:     r.userId,
        email:      r.email,
        testId:     r.testId,
        level:      r.level,
        section:    r.section,
        score:      r.score,
        total:      r.total,
        percentage: r.percentage ? Number(r.percentage) : null,
        timestamp:  r.timestamp,
        data:       r.data,
        user:       r.user,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        avgScore:   avgScore._avg.percentage ? Number(avgScore._avg.percentage).toFixed(1) : null,
        passRate:   totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : null,
        levelStats: levelStats.map(r => ({ level: r.level, count: Number(r.count), avgPct: r.avg_pct ? Number(r.avg_pct).toFixed(1) : null })),
        sectionStats: sectionStats.map(r => ({ section: r.section, count: Number(r.count), avgPct: r.avg_pct ? Number(r.avg_pct).toFixed(1) : null })),
      },
    });
  } catch (err: any) {
    console.error('Test results admin error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load test results' }, { status: 500 });
  }
}
