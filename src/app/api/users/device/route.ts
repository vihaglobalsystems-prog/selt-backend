import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/users/device
// Called from the frontend after every login to capture browser/IP/OS/location info.
//  1. Updates user_profiles.profile._device with the latest snapshot.
//  2. Appends a 'user.login' row to email_log for full login history.
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

    const normalizedEmail = email.trim().toLowerCase();

    // ── 1. Update user_profiles: keep latest device snapshot ──
    const existing = await prisma.userProfile.findUnique({ where: { email: normalizedEmail } });
    const currentProfile: Record<string, unknown> =
      existing?.profile && typeof existing.profile === 'object' && !Array.isArray(existing.profile)
        ? (existing.profile as Record<string, unknown>)
        : {};

    await prisma.userProfile.upsert({
      where: { email: normalizedEmail },
      update: {
        profile: { ...currentProfile, _device: deviceInfo },
        updatedAt: new Date(),
      },
      create: {
        email: normalizedEmail,
        profile: { _device: deviceInfo },
      },
    });

    // ── 2. Log to email_log for full login history ──
    // Try to resolve the user's DB id for the FK (optional — new users may not exist yet)
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    await prisma.emailLog.create({
      data: {
        ...(user?.id ? { userId: user.id } : {}),
        emailType: 'user.login',
        metadata: { ...deviceInfo, email: normalizedEmail },
      },
    });

    console.log(`✓ Login logged for ${normalizedEmail}: ${deviceInfo.browser} / ${deviceInfo.os} / IP ${deviceInfo.ip}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Device info error:', err);
    return NextResponse.json({ error: 'Failed to save device info' }, { status: 500 });
  }
}
