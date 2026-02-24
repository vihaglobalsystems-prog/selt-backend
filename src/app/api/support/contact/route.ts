import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// POST /api/support/contact
// { name: string, email: string, subject: string, message: string }
// Sends message to support@seltmocktest.com and a confirmation to the user.
export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const safeName    = String(name).trim().slice(0, 120);
    const safeSubject = String(subject).trim().slice(0, 200);
    const safeMessage = String(message).trim().slice(0, 4000);

    // ── 1. Forward to support inbox ──
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: 'support@seltmocktest.com',
      replyTo: normalizedEmail,
      subject: `[Support] ${safeSubject}`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #3b82f6); border-radius: 12px; padding: 12px 20px;">
              <span style="font-size: 24px; font-weight: bold; color: white; letter-spacing: 2px;">SELT</span>
            </div>
          </div>
          <h2 style="color: #f97316; margin: 0 0 4px;">New Support Request</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">Submitted via the chat widget on seltmocktest.com</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 12px; background: #1e293b; border-radius: 8px 0 0 0; color: #94a3b8; font-size: 13px; width: 100px;">Name</td>
              <td style="padding: 8px 12px; background: #1e293b; border-radius: 0 8px 0 0; color: #e2e8f0;">${safeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #172033; color: #94a3b8; font-size: 13px;">Email</td>
              <td style="padding: 8px 12px; background: #172033; color: #06b6d4;"><a href="mailto:${normalizedEmail}" style="color: #06b6d4;">${normalizedEmail}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #1e293b; border-radius: 0 0 0 8px; color: #94a3b8; font-size: 13px;">Subject</td>
              <td style="padding: 8px 12px; background: #1e293b; border-radius: 0 0 8px 0; color: #e2e8f0;">${safeSubject}</td>
            </tr>
          </table>
          <div style="background: #1e293b; border-left: 3px solid #06b6d4; border-radius: 0 8px 8px 0; padding: 16px; white-space: pre-wrap; color: #cbd5e1; line-height: 1.6;">
${safeMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </div>
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;">
          <p style="color: #475569; font-size: 12px; text-align: center;">Reply directly to this email to respond to ${safeName}.</p>
        </div>
      `,
    });

    // ── 2. Confirmation email to user ──
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: normalizedEmail,
      subject: 'We received your message — SELT Mock Test Support',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #3b82f6); border-radius: 12px; padding: 12px 20px;">
              <span style="font-size: 24px; font-weight: bold; color: white; letter-spacing: 2px;">SELT</span>
            </div>
          </div>
          <h2 style="color: #06b6d4; margin: 0 0 8px;">Thanks, ${safeName}!</h2>
          <p style="color: #94a3b8; margin: 0 0 16px;">We've received your support request and will get back to you within <strong style="color: #e2e8f0;">24–48 working hours</strong>.</p>
          <div style="background: #1e293b; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 6px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your message</p>
            <p style="margin: 0; color: #94a3b8; font-size: 13px; font-weight: 600;">${safeSubject}</p>
          </div>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">In the meantime, you can continue practising on <a href="https://seltmocktest.com" style="color: #06b6d4;">seltmocktest.com</a>.</p>
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;">
          <p style="color: #475569; font-size: 12px; text-align: center;">SELT Mock Test · support@seltmocktest.com</p>
        </div>
      `,
    });

    // ── 3. Log in email_log for audit ──
    try {
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      await prisma.emailLog.create({
        data: {
          ...(user?.id ? { userId: user.id } : {}),
          emailType: 'support.contact',
          metadata: { name: safeName, email: normalizedEmail, subject: safeSubject, messageLength: safeMessage.length },
        },
      });
    } catch (_) {
      // non-fatal — don't fail the request if audit logging fails
    }

    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error('Support contact error:', err);
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 });
  }
}
