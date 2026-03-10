import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAdmin } from '@/lib/admin';

// POST /api/admin/purge
// Protected by admin email header.
// Pass ?confirm=true to actually delete; omit for a dry-run preview.
//
// Deletion order (respects FK constraints):
//   Refunds → Payments → EmailLogs → Users
//   (Subscriptions, TestResults, UserProfiles cascade from Users)

export async function POST(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  const url = new URL(req.url);
  const confirm = url.searchParams.get('confirm') === 'true';

  try {
    // Count what exists before touching anything
    const [
      userCount,
      subscriptionCount,
      paymentCount,
      refundCount,
      testResultCount,
      emailLogCount,
      userProfileCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count(),
      prisma.payment.count(),
      prisma.refund.count(),
      prisma.testResult.count(),
      prisma.emailLog.count(),
      prisma.userProfile.count(),
    ]);

    const preview = {
      users: userCount,
      subscriptions: subscriptionCount,
      payments: paymentCount,
      refunds: refundCount,
      testResults: testResultCount,
      emailLogs: emailLogCount,
      userProfiles: userProfileCount,
    };

    if (!confirm) {
      return NextResponse.json({
        dryRun: true,
        message: 'Add ?confirm=true to permanently delete all records below.',
        willDelete: preview,
      });
    }

    // Delete in FK-safe order
    await prisma.refund.deleteMany({});
    await prisma.emailLog.deleteMany({});
    await prisma.payment.deleteMany({});
    // Subscriptions, TestResults, UserProfiles cascade when Users are deleted
    await prisma.user.deleteMany({});

    return NextResponse.json({
      success: true,
      message: 'All test data purged successfully.',
      deleted: preview,
    });
  } catch (err: any) {
    console.error('Purge error:', err);
    return NextResponse.json({ error: err.message || 'Purge failed' }, { status: 500 });
  }
}
