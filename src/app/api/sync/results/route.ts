import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }
  try {
    const results = await prisma.testResult.findMany({
      where: { email },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('Sync results error:', err);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const { testId, level, score, total, percentage, section, timestamp, ...rest } = body;
    const user = await prisma.user.findUnique({ where: { email } });
    const result = await prisma.testResult.create({
      data: {
        email,
        userId: user?.id,
        testId: testId || ('test_' + Date.now()),
        level,
        score,
        total,
        percentage,
        section,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        data: rest,
      },
    });
    return NextResponse.json({ saved: true, id: result.id });
  } catch (err: any) {
    console.error('Save result error:', err);
    return NextResponse.json({ error: 'Failed to save result' }, { status: 500 });
  }
}
