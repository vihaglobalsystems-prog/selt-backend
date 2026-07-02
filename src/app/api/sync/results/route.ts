import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTestCompletedEmail } from '@/lib/email';

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

    // ── Send post-test result email for complete tests ──────────────────────
    // A complete test has all 4 section scores in `rest`. Individual section
    // saves won't have listeningScore + readingScore + writingScore + speakingScore.
    const hasAllSections =
      rest.listeningScore !== undefined &&
      rest.readingScore !== undefined &&
      rest.writingScore !== undefined &&
      rest.speakingScore !== undefined;

    if (hasAllSections && user?.id) {
      // Avoid sending more than one result email per user per hour
      // (simpler and TypeScript-safe vs JSON path filter on metadata)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const alreadySent = await prisma.emailLog.findFirst({
        where: { userId: user.id, emailType: 'test_completed', sentAt: { gte: oneHourAgo } },
      });

      if (!alreadySent) {
        // Check if user has an active subscription (to personalise upsell)
        const activeSub = await prisma.subscription.findFirst({
          where: { userId: user.id, status: { in: ['active', 'trialing'] } },
        });

        const overallScore = rest.overallScore ??
          Math.round(
            (rest.listeningScore + rest.readingScore + rest.writingScore + rest.speakingScore) / 4
          );

        // Fire-and-forget — don't block the response
        sendTestCompletedEmail(
          { id: user.id, email: user.email, name: user.name },
          {
            testId: result.testId,
            level: level ?? 'B1',
            listeningScore: rest.listeningScore,
            readingScore: rest.readingScore,
            writingScore: rest.writingScore,
            speakingScore: rest.speakingScore,
            overallScore,
            duration: rest.duration,
          },
          !!activeSub
        ).catch((e) => console.warn('Post-test email failed (non-fatal):', e));
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    return NextResponse.json({ saved: true, id: result.id });
  } catch (err: any) {
    console.error('Save result error:', err);
    return NextResponse.json({ error: 'Failed to save result' }, { status: 500 });
  }
}
