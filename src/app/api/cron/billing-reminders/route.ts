import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBillingReminder } from '@/lib/email';

export async function POST(req: NextRequest) {
  // 1. Verify the cron secret (so only your cron service can trigger this)
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Find subscriptions renewing within the next 7 days
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

      // 3. Check if we already sent a reminder for this billing period
      const alreadySent = await prisma.emailLog.findFirst({
        where: {
          userId: sub.user.id,
          emailType: 'billing_reminder',
          sentAt: { gte: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) },
        },
      });

      if (alreadySent) continue;

      // 4. Send the reminder
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
