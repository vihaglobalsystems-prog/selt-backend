import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWinBackEmail } from '@/lib/email';

// Win-back cron — runs weekly (Sundays 11:00 UTC)
// Targets users who:
//   - Signed up 30+ days ago
//   - Have NO active subscription
//   - Have NOT received a win-back email in the last 60 days
//   - Have taken at least 1 test (warm leads only — pure no-shows get the
//     engagement nudge instead)
async function runWinBack(req: NextRequest) {
  const cronSecret =
    req.headers.get('x-cron-secret') ||
    new URL(req.url).searchParams.get('secret');
  const isNetlifyCron = req.headers.get('x-netlify-cron') === '1';
  if (!isNetlifyCron && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Find candidates: signed up 30+ days ago, no active sub, took at least 1 test
    const candidates = await prisma.user.findMany({
      where: {
        createdAt: { lte: thirtyDaysAgo },
        subscriptions: { none: { status: 'active' } },
        testResults: { some: {} },    // at least one test taken
      },
      include: {
        emailLogs: {
          where: {
            emailType: 'win_back',
            sentAt: { gte: sixtyDaysAgo },
          },
          take: 1,
        },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const user of candidates) {
      // Skip if already had a win-back email in the last 60 days
      if (user.emailLogs.length > 0) {
        skipped++;
        continue;
      }

      const success = await sendWinBackEmail({
        id: user.id,
        email: user.email,
        name: user.name,
      });

      if (success) sent++;
    }

    return NextResponse.json({
      message: `Win-back: checked ${candidates.length} candidates, sent ${sent}, skipped ${skipped}`,
      sent,
      skipped,
      total: candidates.length,
    });
  } catch (err: any) {
    console.error('Win-back cron error:', err);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runWinBack(req);
}

export async function POST(req: NextRequest) {
  return runWinBack(req);
}
