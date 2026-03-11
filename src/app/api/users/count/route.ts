import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/users/count — public endpoint, returns total registered user count
// Cached for 5 minutes to avoid hammering the DB on every page load
let cache: { count: number; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) {
      return NextResponse.json({ count: cache.count });
    }
    const count = await prisma.user.count();
    cache = { count, at: now };
    return NextResponse.json({ count });
  } catch {
    // Fail silently — frontend will just hide the badge
    return NextResponse.json({ count: 0 });
  }
}
