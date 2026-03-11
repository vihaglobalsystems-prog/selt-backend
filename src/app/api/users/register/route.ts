import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/users/register
// Called on every sign-in (Google OAuth or OTP) to upsert the user in the DB.
// This ensures all signed-in users appear in the admin portal, not just subscribers.
export async function POST(req: NextRequest) {
  try {
    const { email, name, avatarUrl, provider } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        avatarUrl: avatarUrl || null,
        role: 'user',
      },
      update: {
        // Update name and avatar if provided (e.g. Google profile picture changes)
        ...(name && { name }),
        ...(avatarUrl && { avatarUrl }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user, registered: true });
  } catch (err: any) {
    console.error('Register user error:', err);
    return NextResponse.json({ error: err.message || 'Failed to register user' }, { status: 500 });
  }
}
