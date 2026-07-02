import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/user/exam-date
// Body: { email: string, examDate: string (ISO) }
// Saves the user's planned exam date to their profile JSON.
// Frontend calls this when the user fills in the "When's your exam?" prompt.
export async function POST(req: NextRequest) {
  try {
    const { email, examDate } = await req.json();
    if (!email || !examDate) {
      return NextResponse.json({ error: 'email and examDate are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Store in UserProfile.profile JSON (no schema migration needed)
    const existing = await prisma.userProfile.findUnique({ where: { email } });
    const prev = (existing?.profile ?? {}) as Record<string, unknown>;
    // Build a plain JSON-safe object — Prisma requires InputJsonValue, not Record<string,unknown>
    const profileData = { ...prev, examDate } as Parameters<typeof prisma.userProfile.upsert>[0]['create']['profile'];

    await prisma.userProfile.upsert({
      where: { email },
      update: { profile: profileData, updatedAt: new Date() },
      create: { email, userId: user.id, profile: profileData },
    });

    return NextResponse.json({ saved: true });
  } catch (err: any) {
    console.error('Save exam date error:', err);
    return NextResponse.json({ error: 'Failed to save exam date' }, { status: 500 });
  }
}

// GET /api/user/exam-date — fetch stored exam date for a user
export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }
  try {
    const profile = await prisma.userProfile.findUnique({ where: { email } });
    const data = (profile?.profile as Record<string, unknown>) || {};
    return NextResponse.json({ examDate: data.examDate || null });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch exam date' }, { status: 500 });
  }
}
