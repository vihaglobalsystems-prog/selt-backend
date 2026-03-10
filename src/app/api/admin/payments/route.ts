import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const url = new URL(req.url);
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
    const limit  = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));
    const skip   = (page - 1) * limit;
    const status = url.searchParams.get('status') || '';

    const where = status ? { status } : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          refunds: true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({ payments, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load payments' }, { status: 500 });
  }
}
