import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEngagementNudge } from '@/lib/email';

async function runEngagementNudge(req: NextRequest) {
  const cronSecret =
    req.headers.get('x-cron-secret') ||
    new URL(req.url).searchParams.get('secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find all users who:
    // 1. Signed up more than 24h ago
    // 2. Have NOT paid (no active subscription / lifetime access)
    // 3. Have not been nudged in the last 7 days
    const candidates = await prisma.user.findMany({
      where: {
        createdAt: { lte: oneDayAgo },
        subscriptions: { none: { status: 'active' } },
      },
      include: {
        testResults: { select: { id: true } },
        emailLogs: {
          where: {
            emailType: 'engagement_nudge',
            sentAt: { gte: sevenDaysAgo },
          },
          take: 1,
        },
      },
    });

    let nudged = 0;
    let skipped = 0;

    for (const user of candidates) {
      // Skip if nudged recently
      if (user.emailLogs.length > 0) {
        skipped++;
        continue;
      }

      const testsTaken = user.testResults.length;

      // Nudge users with 0 tests, 1 test, or 2 tests (payment CTA)
      // Skip users with 3+ tests who still haven't paid — they've had enough nudges
      if (testsTaken > 2) {
        skipped++;
        continue;
      }

      const success = await sendEngagementNudge(
        { id: user.id, email: user.email, name: user.name },
        testsTaken
      );

      if (success) nudged++;
    }

    return NextResponse.json({
      message: `Checked ${candidates.length} users, nudged ${nudged}, skipped ${skipped}`,
      nudged,
      skipped,
      total: candidates.length,
    });
  } catch (err: any) {
    console.error('Engagement nudge cron error:', err);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runEngagementNudge(req);
}

export async function POST(req: NextRequest) {
  return runEngagementNudge(req);
}
