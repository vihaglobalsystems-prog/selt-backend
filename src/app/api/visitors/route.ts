import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Cache for 60 seconds to avoid hitting GA4 on every page load
let cache: { count: number; at: number } | null = null;
const CACHE_MS = 60 * 1000;

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken(): Promise<string> {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = base64url(sign.sign(crypto.createPrivateKey(sa.private_key)));
  const jwt = `${signingInput}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Failed to get token');
  return data.access_token;
}

// GET /api/visitors — public, returns active users on site right now from GA4 realtime
export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) {
      return NextResponse.json({ count: cache.count });
    }

    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({ count: 0 });
    }

    const token = await getGoogleAccessToken();
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: [{ name: 'activeUsers' }] }),
      }
    );
    const data = await res.json() as any;
    const count = parseInt(data?.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
    cache = { count, at: now };
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
