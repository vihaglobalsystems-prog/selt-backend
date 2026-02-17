import { prisma } from './prisma';

type SubscriptionStatus = {
  hasActiveSubscription: boolean;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Check if a user has an active subscription.
 * Call this from any API route to gate premium content.
 *
 * Usage:
 *   const sub = await checkSubscription(userId);
 *   if (!sub.hasActiveSubscription) return 403;
 */
export async function checkSubscription(userId: string): Promise<SubscriptionStatus> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    return {
      hasActiveSubscription: false,
      status: 'none',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    hasActiveSubscription: true,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
  };
}
