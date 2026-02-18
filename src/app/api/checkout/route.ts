import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email;
    const userId = body.userId;

    // Support both email-based and userId-based lookup
    let user;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
      // Auto-create user if they don't exist yet (signed in via Google on frontend)
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name: body.name || email.split('@')[0],
            role: 'user',
          },
        });
      }
    } else if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found. Please provide email or userId.' }, { status: 400 });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId, updatedAt: new Date() },
      });
    }

    // Create a Stripe Checkout Session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/?payment=success`,
      cancel_url: `${process.env.CLIENT_URL}/?payment=cancel`,
      metadata: { userId: user.id },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
