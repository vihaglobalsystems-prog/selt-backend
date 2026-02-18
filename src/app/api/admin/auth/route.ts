import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email, name, picture } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const allowedEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);

    if (!allowedEmails.includes(email.toLowerCase())) {
      return NextResponse.json({ error: 'Access denied. This email is not authorized.' }, { status: 403 });
    }

    return NextResponse.json({
      authenticated: true,
      email,
      name,
      picture,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Auth failed' }, { status: 500 });
  }
}
