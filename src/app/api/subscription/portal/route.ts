import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

// POST /api/subscription/portal
// Creates a Stripe Customer Portal session so the user can manage their subscription
// (view billing details, update payment method, cancel, etc.)
export async function POST(req: NextRequest) {
  const email = req.headers.get('x-user-email');

  if (!email) {
    return NextResponse.json({ error: 'x-user-email header required' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found for this user' }, { status: 404 });
    }

    const returnUrl = process.env.CLIENT_URL
      ? `${process.env.CLIENT_URL}/?portal=return`
      : 'https://seltmocktest.netlify.app/?portal=return';

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Portal session error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
