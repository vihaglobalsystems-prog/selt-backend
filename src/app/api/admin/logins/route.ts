import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

// GET /api/admin/logins
// Returns paginated login history from email_log where emailType = 'user.login'
// Admin only (x-admin-email header required).
export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const { searchParams } = new URL(req.url);
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'));
    const skip  = (page - 1) * limit;

    const [total, logins] = await Promise.all([
      prisma.emailLog.count({ where: { emailType: 'user.login' } }),
      prisma.emailLog.findMany({
        where:   { emailType: 'user.login' },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
        },
      }),
    ]);

    return NextResponse.json({
      logins,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('Admin logins error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load logins' }, { status: 500 });
  }
}
