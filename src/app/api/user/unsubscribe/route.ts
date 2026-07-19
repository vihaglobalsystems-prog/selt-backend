import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const CLIENT_URL = process.env.CLIENT_URL || 'https://seltmocktest.co.uk';

// GET /api/user/unsubscribe?email=xxx          → opt OUT (unsubscribe)
// GET /api/user/unsubscribe?email=xxx&resubscribe=1 → opt BACK IN
// No auth required (link is sent in email, must work without login)
export async function GET(req: NextRequest) {
  const params      = new URL(req.url).searchParams;
  const email       = params.get('email');
  const resubscribe = params.get('resubscribe') === '1';

  if (!email) {
    return new NextResponse(html('Missing email address.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { userProfile: true } });

    if (!user) {
      // Return success anyway to avoid email enumeration
      return new NextResponse(html(email, true), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const prev    = (user.userProfile?.profile ?? {}) as Record<string, unknown>;
    const updated = { ...prev, emailOptOut: !resubscribe };

    await prisma.userProfile.upsert({
      where:  { email },
      update: { profile: updated, updatedAt: new Date() },
      create: { email, userId: user.id, profile: updated },
    });

    return new NextResponse(html(email, true, resubscribe), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return new NextResponse(html('Something went wrong. Please email support@seltmocktest.co.uk.', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// POST /api/user/unsubscribe  — programmatic opt-in/out
// Body: { email: string, optOut?: boolean }  (default optOut = true)
export async function POST(req: NextRequest) {
  const body        = await req.json().catch(() => ({}));
  const email       = body.email || new URL(req.url).searchParams.get('email');
  const emailOptOut = body.optOut !== false; // default true unless explicitly false

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { userProfile: true } });
    if (user) {
      const prev = (user.userProfile?.profile ?? {}) as Record<string, unknown>;
      await prisma.userProfile.upsert({
        where:  { email },
        update: { profile: { ...prev, emailOptOut }, updatedAt: new Date() },
        create: { email, userId: user.id, profile: { ...prev, emailOptOut } },
      });
    }
    return NextResponse.json({ success: true, emailOptOut });
  } catch (err) {
    console.error('Unsubscribe POST error:', err);
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }
}

function html(emailOrMsg: string, success: boolean, resubscribed = false) {
  const title   = !success ? 'Error' : resubscribed ? 'Resubscribed' : 'Unsubscribed';
  const icon    = !success ? '❌' : resubscribed ? '✅' : '🔕';
  const heading = !success ? 'Something went wrong'
    : resubscribed ? 'You\'re back on the list'
    : 'You\'ve been unsubscribed';
  const body    = !success ? emailOrMsg
    : resubscribed
    ? `<strong>${emailOrMsg}</strong> will now receive helpful reminders and tips from SELT Mock Test again.`
    : `<strong>${emailOrMsg}</strong> will no longer receive nudge and reminder emails from SELT Mock Test. You can still log in and use the platform normally.`;

  const resubLink = !success || resubscribed ? '' :
    `<p style="margin:0 0 16px;"><a href="https://selt-backend.netlify.app/api/user/unsubscribe?email=${encodeURIComponent(emailOrMsg)}&resubscribe=1" style="color:#94a3b8;font-size:13px;">Changed your mind? Re-subscribe</a></p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} – SELT Mock Test</title>
  <style>
    body{margin:0;background:#0f172a;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:40px;max-width:420px;text-align:center;}
    .icon{font-size:48px;margin-bottom:16px;}
    h1{color:#f1f5f9;font-size:22px;margin:0 0 12px;}
    p{color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px;}
    a.btn{display:inline-block;padding:10px 24px;background:#06b6d4;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    ${resubLink}
    <a class="btn" href="https://seltmocktest.co.uk">Back to SELT Mock Test</a>
  </div>
</body>
</html>`;
}
