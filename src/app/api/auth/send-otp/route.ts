import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

// POST /api/auth/send-otp
// { email: string }
// Generates a 6-digit OTP, stores a hashed copy in email_log, sends via Resend.
// Rate-limited: one request per 60 seconds per email.
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Rate limit: max 1 OTP per 60 seconds ──
    const recent = await prisma.emailLog.findMany({
      where: { emailType: 'otp.pending' },
      orderBy: { sentAt: 'desc' },
      take: 20,
    });
    const recentForEmail = recent.find(
      (r) => (r.metadata as any)?.email === normalizedEmail
    );
    if (recentForEmail?.sentAt) {
      const ageMs = Date.now() - new Date(recentForEmail.sentAt).getTime();
      if (ageMs < 60_000) {
        const retryAfter = Math.ceil((60_000 - ageMs) / 1000);
        return NextResponse.json(
          { error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter },
          { status: 429 }
        );
      }
    }

    // ── Generate OTP ──
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = crypto
      .createHash('sha256')
      .update(otp + normalizedEmail)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // ── Store in email_log ──
    await prisma.emailLog.create({
      data: {
        emailType: 'otp.pending',
        metadata: { email: normalizedEmail, otpHash, expiresAt, attempts: 0 },
      },
    });

    // ── Send email via Resend ──
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: normalizedEmail,
      subject: `${otp} — your SELT Mock Test verification code`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #3b82f6); border-radius: 12px; padding: 12px 20px;">
              <span style="font-size: 24px; font-weight: bold; color: white; letter-spacing: 2px;">SELT</span>
            </div>
          </div>
          <h2 style="color: #06b6d4; margin: 0 0 8px;">Verify your email</h2>
          <p style="color: #94a3b8; margin: 0 0 24px;">Enter this code to continue signing in to SELT Mock Test:</p>
          <div style="background: #1e293b; border: 2px solid #06b6d4; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
            <span style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #06b6d4; font-family: monospace;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">⏱ This code expires in <strong style="color: #94a3b8;">10 minutes</strong>.</p>
          <p style="color: #64748b; font-size: 14px; margin: 0;">🔒 Do not share this code with anyone. SELT will never ask for it.</p>
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;">
          <p style="color: #475569; font-size: 12px; text-align: center;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      text: `Your SELT Mock Test verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nIf you didn't request this, you can safely ignore this email.`,
    });

    console.log(`✓ OTP sent to ${normalizedEmail}`);
    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error('Send OTP error:', err);
    return NextResponse.json({ error: 'Failed to send verification code. Please try again.' }, { status: 500 });
  }
}
