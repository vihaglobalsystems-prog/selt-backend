import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend Inbound Webhook
// Receives emails sent to support@seltmocktest.co.uk and forwards them
// to the admin inbox using Resend's send API.
//
// Setup:
//  1. Add MX record: inbound.resend.com (priority 10) for seltmocktest.co.uk
//  2. In Resend dashboard → Inbound → Create route:
//     Match: support@seltmocktest.co.uk
//     Webhook URL: https://selt-backend.netlify.app/api/email/inbound

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Resend inbound webhook structure:
    // { type: "email.received", data: { from, to, subject, text, html, ... } }
    const data = payload?.data ?? payload;

    const from: string  = data?.from   ?? 'unknown@unknown.com';
    const subject: string = data?.subject ?? '(no subject)';
    const textBody: string = data?.text  ?? '';
    const htmlBody: string = data?.html  ?? '';

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e: string) => e.trim())
      .filter(Boolean);

    if (adminEmails.length === 0) {
      console.error('No ADMIN_EMAILS configured — cannot forward inbound email');
      return NextResponse.json({ error: 'No admin emails configured' }, { status: 500 });
    }

    // Forward the email to admin
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: adminEmails,
      reply_to: from,
      subject: `[Inbound] ${subject}`,
      html: htmlBody
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto;">
            <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;
                        font-size: 13px; color: #374151;">
              <strong>From:</strong> ${escapeHtml(from)}<br>
              <strong>Subject:</strong> ${escapeHtml(subject)}
            </div>
            <div style="border-left: 3px solid #1e40af; padding-left: 16px;">
              ${htmlBody}
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #9ca3af; font-size: 12px;">
              Forwarded via SELT Inbound · Reply directly to respond to the sender.
            </p>
          </div>
        `
        : undefined,
      text: textBody
        ? `From: ${from}\nSubject: ${subject}\n\n---\n\n${textBody}\n\n---\nForwarded via SELT Inbound`
        : `From: ${from}\nSubject: ${subject}\n\n(no body)\n\n---\nForwarded via SELT Inbound`,
    });

    console.log(`✓ Inbound email from ${from} forwarded to admin`);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Inbound email handler error:', err);
    return NextResponse.json({ error: 'Failed to process inbound email' }, { status: 500 });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
