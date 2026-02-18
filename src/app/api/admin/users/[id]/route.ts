import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

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
          take: 10,
          select: { id: true, level: true, score: true, total: true, percentage: true, section: true, timestamp: true },
        },
        userProfile: true,
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
