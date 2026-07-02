import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendNurtureDay1, sendNurtureDay3, sendNurtureDay7 } from '@/lib/email';

// Nurture cron — runs daily at 08:00 UTC
// Fires three onboarding emails at the right time for each new user:
//   Day 1 (1–23h after sign-up): welcome + how-to
//   Day 3 (48–72h after sign-up, no active sub): check-in
//   Day 7 (144–168h after sign-up, no active sub): upgrade push
//
// Guards: EmailLog prevents duplicate sends per user per type.

async function runNurture(req: NextRequest) {
  const cronSecret =
    req.headers.get('x-cron-secret') ||
    new URL(req.url).searchParams.get('secret');
  const isNetlifyCron = req.headers.get('x-netlify-cron') === '1';
  if (!isNetlifyCron && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // Window boundaries (we run daily so each window is 24 h wide)
    const h1ago  = new Date(now.getTime() -  1 * 60 * 60 * 1000);
    const h25ago = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const h48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const h73ago = new Date(now.getTime() - 73 * 60 * 60 * 1000);
    const h144ago = new Date(now.getTime() - 144 * 60 * 60 * 1000);
    const h169ago = new Date(now.getTime() - 169 * 60 * 60 * 1000);

    // ── Day 1 ─────────────────────────────────────────────────────────────────
    // Users created 1–25 hours ago who haven't had a day-1 nurture yet
    const day1Candidates = await prisma.user.findMany({
      where: {
        createdAt: { gte: h25ago, lte: h1ago },
        emailLogs: { none: { emailType: 'nurture_day1' } },
      },
    });

    // ── Day 3 ─────────────────────────────────────────────────────────────────
    // Users created 48–73 hours ago, no active sub, no day-3 email yet
    const day3Candidates = await prisma.user.findMany({
      where: {
        createdAt: { gte: h73ago, lte: h48ago },
        subscriptions: { none: { status: { in: ['active', 'trialing'] } } },
        emailLogs: { none: { emailType: 'nurture_day3' } },
      },
      include: {
        testResults: { take: 1 },
        userProfile: true,
      },
    });

    // ── Day 7 ─────────────────────────────────────────────────────────────────
    // Users created 144–169 hours ago, no active sub, no day-7 email yet
    const day7Candidates = await prisma.user.findMany({
      where: {
        createdAt: { gte: h169ago, lte: h144ago },
        subscriptions: { none: { status: { in: ['active', 'trialing'] } } },
        emailLogs: { none: { emailType: 'nurture_day7' } },
      },
      include: { userProfile: true },
    });

    // ── Send ─────────────────────────────────────────────────────────────────
    let sent1 = 0, sent3 = 0, sent7 = 0;

    for (const u of day1Candidates) {
      const ok = await sendNurtureDay1({ id: u.id, email: u.email, name: u.name });
      if (ok) sent1++;
    }

    for (const u of day3Candidates) {
      const profile = (u.userProfile?.profile as Record<string, unknown>) || {};
      const examDate = profile.examDate as string | undefined;
      const testCount = u.testResults.length; // rough proxy (1 = at least 1 test)
      const ok = await sendNurtureDay3(
        { id: u.id, email: u.email, name: u.name },
        testCount,
        examDate ?? null
      );
      if (ok) sent3++;
    }

    for (const u of day7Candidates) {
      const profile = (u.userProfile?.profile as Record<string, unknown>) || {};
      const examDate = profile.examDate as string | undefined;
      const ok = await sendNurtureDay7(
        { id: u.id, email: u.email, name: u.name },
        examDate ?? null
      );
      if (ok) sent7++;
    }

    return NextResponse.json({
      message: `Nurture cron done — day1: ${sent1}, day3: ${sent3}, day7: ${sent7}`,
      sent: { day1: sent1, day3: sent3, day7: sent7 },
      candidates: { day1: day1Candidates.length, day3: day3Candidates.length, day7: day7Candidates.length },
    });
  } catch (err: any) {
    console.error('Nurture cron error:', err);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return runNurture(req); }
export async function POST(req: NextRequest) { return runNurture(req); }
