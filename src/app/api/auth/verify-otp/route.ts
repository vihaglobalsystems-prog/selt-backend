import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// POST /api/auth/verify-otp
// { email: string, otp: string }
// Checks the OTP against the stored hash. Enforces expiry and max 3 attempts.
// Deletes the OTP record on success (single-use).
export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpClean = String(otp).trim();

    // ── Find the most recent pending OTP for this email ──
    const records = await prisma.emailLog.findMany({
      where: { emailType: 'otp.pending' },
      orderBy: { sentAt: 'desc' },
      take: 30,
    });

    const record = records.find(
      (r) => (r.metadata as any)?.email === normalizedEmail
    );

    if (!record) {
      return NextResponse.json(
        { error: 'No verification code found. Please request a new one.' },
        { status: 400 }
      );
    }

    const meta = record.metadata as any;

    // ── Check expiry ──
    if (new Date(meta.expiresAt) < new Date()) {
      await prisma.emailLog.delete({ where: { id: record.id } }).catch(() => {});
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // ── Check attempts ──
    if ((meta.attempts || 0) >= 5) {
      await prisma.emailLog.delete({ where: { id: record.id } }).catch(() => {});
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Please request a new code.' },
        { status: 400 }
      );
    }

    // ── Verify OTP hash ──
    const expectedHash = crypto
      .createHash('sha256')
      .update(otpClean + normalizedEmail)
      .digest('hex');

    if (expectedHash !== meta.otpHash) {
      // Increment failed attempts
      await prisma.emailLog.update({
        where: { id: record.id },
        data: {
          metadata: { ...meta, attempts: (meta.attempts || 0) + 1 },
        },
      });
      const remaining = 5 - ((meta.attempts || 0) + 1);
      return NextResponse.json(
        { error: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` },
        { status: 400 }
      );
    }

    // ── Success: delete OTP (single-use) ──
    await prisma.emailLog.delete({ where: { id: record.id } });

    console.log(`✓ OTP verified for ${normalizedEmail}`);
    return NextResponse.json({ verified: true });
  } catch (err: any) {
    console.error('Verify OTP error:', err);
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
