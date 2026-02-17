import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — Fetch user profile (replaces cloudSyncProfile)
export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  try {
    const profile = await prisma.userProfile.findUnique({
      where: { email },
    });

    if (!profile) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({ profile: profile.profile });
  } catch (err: any) {
    console.error('Sync profile error:', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// POST — Save user profile (replaces cloudSaveProfile)
export async function POST(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  try {
    const body = await req.json();

    // Remove avatar (same as Firebase — don't store base64 images)
    const profileData = { ...body };
    delete profileData.avatar;

    // Find user by email (optional)
    const user = await prisma.user.findUnique({ where: { email } });

    await prisma.userProfile.upsert({
      where: { email },
      create: {
        email,
        userId: user?.id,
        profile: profileData,
      },
      update: {
        profile: profileData,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ saved: true });
  } catch (err: any) {
    console.error('Save profile error:', err);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
