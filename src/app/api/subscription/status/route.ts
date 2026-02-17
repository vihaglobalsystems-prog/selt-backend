import { NextRequest, NextResponse } from 'next/server';
import { checkSubscription } from '@/lib/subscription';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 401 });
  }

  const status = await checkSubscription(userId);
  return NextResponse.json(status);
}
