import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/users/device
// Called from the frontend after login to capture browser/IP/OS/location info.
// Stores device info as `_device` key inside user_profiles.profile JSON.
// No auth required – data is harmless browser metadata; email is the identifier.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, deviceInfo } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }
    if (!deviceInfo || typeof deviceInfo !== 'object') {
      return NextResponse.json({ error: 'Missing deviceInfo' }, { status: 400 });
    }

    // Fetch existing profile so we can merge, not overwrite
    const existing = await prisma.userProfile.findUnique({ where: { email } });
    const currentProfile: Record<string, unknown> =
      existing?.profile && typeof existing.profile === 'object' && !Array.isArray(existing.profile)
        ? (existing.profile as Record<string, unknown>)
        : {};

    // Merge _device key into profile
    const updatedProfile = { ...currentProfile, _device: deviceInfo };

    await prisma.userProfile.upsert({
      where: { email },
      update: {
        profile: updatedProfile,
        updatedAt: new Date(),
      },
      create: {
        email,
        profile: { _device: deviceInfo },
      },
    });

    console.log(`✓ Device info captured for ${email}: ${deviceInfo.browser} / ${deviceInfo.os} / IP ${deviceInfo.ip}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Device info error:', err);
    return NextResponse.json({ error: 'Failed to save device info' }, { status: 500 });
  }
}
