import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

// GET /api/admin/activity?userId=xxx
// Returns a unified activity timeline for a user: tests, emails, payments, subscriptions, sign-up
export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  try {
    const url    = new URL(req.url);
    const userId = url.searchParams.get('userId') || '';

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all activity sources in parallel
    const [tests, emails, payments, subscriptions] = await Promise.all([
      prisma.testResult.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),

      prisma.emailLog.findMany({
        where: { userId },
        orderBy: { sentAt: 'desc' },
        take: 50,
      }),

      prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { refunds: true },
      }),

      prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build unified timeline events
    type Event = {
      id: string;
      type: string;
      category: string;
      title: string;
      detail: string;
      timestamp: Date | string | null;
      meta?: Record<string, any>;
    };

    const events: Event[] = [];

    // Sign-up event
    events.push({
      id:        'signup_' + user.id,
      type:      'signup',
      category:  'account',
      title:     'Account created',
      detail:    `Signed up via ${user.googleId ? 'Google' : 'email'}`,
      timestamp: user.createdAt,
    });

    // Test results
    for (const t of tests) {
      const pct  = t.percentage ? Number(t.percentage) : null;
      const pass = pct !== null && pct >= 70;
      events.push({
        id:       'test_' + t.id,
        type:     'test',
        category: 'test',
        title:    `${t.level || '?'} test — ${t.section || 'full'}`,
        detail:   pct !== null ? `Score: ${t.score}/${t.total} (${pct.toFixed(1)}%) — ${pass ? 'PASS ✓' : 'BELOW 70%'}` : `Score: ${t.score}/${t.total}`,
        timestamp: t.timestamp,
        meta: {
          level:      t.level,
          section:    t.section,
          score:      t.score,
          total:      t.total,
          percentage: pct,
          pass,
          data:       t.data,
        },
      });
    }

    // Emails
    const emailLabels: Record<string, string> = {
      signup_confirmation:       'Welcome email sent',
      engagement_nudge:          'Re-engagement nudge sent',
      subscription_confirmation: 'Subscription confirmation sent',
      billing_reminder:          'Billing reminder sent',
      cancellation:              'Cancellation email sent',
      subscription_cancelled:    'Cancellation email sent',
      refund:                    'Refund confirmation sent',
      refund_confirmation:       'Refund confirmation sent',
      admin_new_subscription:    'Admin notified of subscription',
      login:                     'Login notification logged',
      'user.login':              'Login recorded',
      'otp.pending':             'OTP verification code sent',
      'support.contact':         'Support request submitted',
    };

    for (const e of emails) {
      events.push({
        id:       'email_' + e.id,
        type:     'email',
        category: 'email',
        title:    emailLabels[e.emailType] || `Email: ${e.emailType}`,
        detail:   e.emailType,
        timestamp: e.sentAt,
        meta: e.metadata as Record<string, any> | undefined,
      });
    }

    // Payments
    for (const p of payments) {
      events.push({
        id:       'payment_' + p.id,
        type:     'payment',
        category: 'billing',
        title:    `Payment — £${(p.amount / 100).toFixed(2)}`,
        detail:   `Status: ${p.status}${p.refunds.length > 0 ? ` · Refunded £${(p.refunds.reduce((s, r) => s + r.amount, 0) / 100).toFixed(2)}` : ''}`,
        timestamp: p.paidAt || p.createdAt,
        meta: {
          amount:   p.amount,
          status:   p.status,
          refunds:  p.refunds.length,
          stripePI: p.stripePaymentIntent,
        },
      });
    }

    // Subscriptions
    for (const s of subscriptions) {
      const isManual  = s.stripeSubscriptionId?.startsWith('manual_');
      const isOnetime = s.stripeSubscriptionId?.startsWith('onetime_');
      const typeLabel = isManual ? 'Manual' : isOnetime ? 'One-time' : 'Stripe';

      events.push({
        id:       'sub_created_' + s.id,
        type:     'subscription',
        category: 'billing',
        title:    `Subscription ${s.status === 'canceled' ? 'cancelled' : 'created'} (${typeLabel})`,
        detail:   `Status: ${s.status} · Period: ${s.currentPeriodStart ? new Date(s.currentPeriodStart).toLocaleDateString('en-GB') : '?'} – ${s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString('en-GB') : '?'}`,
        timestamp: s.canceledAt || s.createdAt,
        meta: {
          status:       s.status,
          periodEnd:    s.currentPeriodEnd,
          canceledAt:   s.canceledAt,
          subId:        s.stripeSubscriptionId,
        },
      });
    }

    // Sort all events by timestamp, newest first
    events.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    // Per-test score trend (last 20 tests, oldest first, for charting)
    const scoreTrend = [...tests]
      .filter(t => t.percentage !== null)
      .slice(0, 20)
      .reverse()
      .map(t => ({
        date:    t.timestamp,
        level:   t.level,
        section: t.section,
        pct:     Number(t.percentage),
      }));

    // Per-section averages
    const sectionMap: Record<string, { total: number; count: number }> = {};
    for (const t of tests) {
      if (!t.section || t.percentage === null) continue;
      const sec = t.section.toLowerCase();
      if (!sectionMap[sec]) sectionMap[sec] = { total: 0, count: 0 };
      sectionMap[sec].total += Number(t.percentage);
      sectionMap[sec].count += 1;
    }
    const sectionAverages = Object.entries(sectionMap).map(([section, { total, count }]) => ({
      section,
      avgPct:    (total / count).toFixed(1),
      attempts:  count,
    }));

    return NextResponse.json({
      events,
      scoreTrend,
      sectionAverages,
      summary: {
        totalTests:  tests.length,
        totalEmails: emails.length,
        totalPayments: payments.length,
        bestScore:   tests.reduce((best, t) => {
          const pct = t.percentage ? Number(t.percentage) : 0;
          return pct > best ? pct : best;
        }, 0),
        avgScore: tests.length > 0
          ? (tests.reduce((s, t) => s + (t.percentage ? Number(t.percentage) : 0), 0) / tests.length).toFixed(1)
          : null,
        lastTestAt: tests[0]?.timestamp || null,
        joinedAt:   user.createdAt,
      },
    });
  } catch (err: any) {
    console.error('Activity timeline error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load activity' }, { status: 500 });
  }
}
