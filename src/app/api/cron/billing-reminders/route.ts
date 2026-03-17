import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBillingReminder } from '@/lib/email';

async function runBillingReminders(req: NextRequest) {
  // Verify the cron secret — check header or query param (Resend sends GET with secret in header)
  const cronSecret =
    req.headers.get('x-cron-secret') ||
    new URL(req.url).searchParams.get('secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find subscriptions renewing within the next 7 days
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const expiringSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: {
          gte: now,
          lte: sevenDaysFromNow,
        },
      },
      include: {
        user: true,
      },
    });

    let sent = 0;

    for (const sub of expiringSubscriptions) {
      if (!sub.user || !sub.currentPeriodEnd) continue;

      // Check if we already sent a reminder for this billing period
      const alreadySent = await prisma.emailLog.findFirst({
        where: {
          userId: sub.user.id,
          emailType: 'billing_reminder',
          sentAt: { gte: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) },
        },
      });

      if (alreadySent) continue;

      // Send the reminder
      const success = await sendBillingReminder(
        { id: sub.user.id, email: sub.user.email, name: sub.user.name },
        sub.currentPeriodEnd
      );

      if (success) sent++;
    }

    return NextResponse.json({
      message: `Processed ${expiringSubscriptions.length} expiring, sent ${sent} reminders`,
    });
  } catch (err: any) {
    console.error('Cron error:', err);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

// GET — used by Resend cron jobs (sends GET requests)
export async function GET(req: NextRequest) {
  return runBillingReminders(req);
}

// POST — kept for manual triggers or other cron services
export async function POST(req: NextRequest) {
  return runBillingReminders(req);
}
