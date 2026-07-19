import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const CLIENT_URL = process.env.CLIENT_URL || 'https://seltmocktest.co.uk';

// GET /api/user/unsubscribe?email=xxx
// One-click unsubscribe — sets emailOptOut: true in UserProfile.profile
// No auth required (link is sent in email, must work without login)
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get('email');

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

    const prev = (user.userProfile?.profile ?? {}) as Record<string, unknown>;
    const updated = { ...prev, emailOptOut: true };

    await prisma.userProfile.upsert({
      where:  { email },
      update: { profile: updated, updatedAt: new Date() },
      create: { email, userId: user.id, profile: updated },
    });

    return new NextResponse(html(email, true), {
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

// POST /api/user/unsubscribe  — same logic, for programmatic calls
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = body.email || new URL(req.url).searchParams.get('email');

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { userProfile: true } });
    if (user) {
      const prev = (user.userProfile?.profile ?? {}) as Record<string, unknown>;
      await prisma.userProfile.upsert({
        where:  { email },
        update: { profile: { ...prev, emailOptOut: true }, updatedAt: new Date() },
        create: { email, userId: user.id, profile: { ...prev, emailOptOut: true } },
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unsubscribe POST error:', err);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}

function html(emailOrMsg: string, success: boolean) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${success ? 'Unsubscribed' : 'Error'} – SELT Mock Test</title>
  <style>
    body{margin:0;background:#0f172a;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:40px;max-width:420px;text-align:center;}
    .icon{font-size:48px;margin-bottom:16px;}
    h1{color:#f1f5f9;font-size:22px;margin:0 0 12px;}
    p{color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;}
    a{display:inline-block;padding:10px 24px;background:#06b6d4;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${success ? 'You\'ve been unsubscribed' : 'Something went wrong'}</h1>
    <p>${success
      ? `<strong>${emailOrMsg}</strong> will no longer receive nudge and reminder emails from SELT Mock Test. You can still log in and use the platform normally.`
      : emailOrMsg
    }</p>
    <a href="https://seltmocktest.co.uk">Back to SELT Mock Test</a>
  </div>
</body>
</html>`;
}
