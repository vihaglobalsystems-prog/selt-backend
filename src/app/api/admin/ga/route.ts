import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAdmin } from '@/lib/admin';

// ─── JWT helpers for Google service account auth ─────────────────────────────
function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const signingInput = `${header}.${payload}`;

  // Sign with RSA-SHA256 using the service account private key
  const privateKey = crypto.createPrivateKey(sa.private_key);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = base64url(sign.sign(privateKey));

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) throw new Error(`Token error: ${tokenData.error}`);
  return tokenData.access_token;
}

// ─── GA4 Data API helper ──────────────────────────────────────────────────────
async function runReport(token: string, propertyId: string, body: object) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  return res.json();
}

async function runRealtimeReport(token: string, propertyId: string, body: object) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  return res.json();
}

// ─── Parse GA4 row helper ─────────────────────────────────────────────────────
function parseRows(report: any): Record<string, string>[] {
  if (!report?.rows) return [];
  const dimHeaders = (report.dimensionHeaders || []).map((h: any) => h.name);
  const metHeaders = (report.metricHeaders || []).map((h: any) => h.name);
  return report.rows.map((row: any) => {
    const obj: Record<string, string> = {};
    (row.dimensionValues || []).forEach((v: any, i: number) => { obj[dimHeaders[i]] = v.value; });
    (row.metricValues || []).forEach((v: any, i: number) => { obj[metHeaders[i]] = v.value; });
    return obj;
  });
}

// ─── GET /api/admin/ga ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = validateAdmin(req);
  if (!auth.valid) return auth.error!;

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    return NextResponse.json({ error: 'GA4_PROPERTY_ID not configured' }, { status: 500 });
  }

  try {
    const token = await getGoogleAccessToken();

    // Run all reports in parallel
    const [
      overviewReport,
      dailyReport,
      trafficSourceReport,
      topPagesReport,
      deviceReport,
      countryReport,
      realtimeReport,
      conversionReport,
    ] = await Promise.all([
      // 30-day overview totals
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViews' },
        ],
      }),

      // Daily sessions + users (last 30 days)
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),

      // Traffic sources
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),

      // Top pages
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),

      // Device category
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),

      // Top countries
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),

      // Real-time active users
      runRealtimeReport(token, propertyId, {
        metrics: [{ name: 'activeUsers' }],
      }),

      // Conversion / payment=success page views (ad conversions)
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        dimensionFilter: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: 'CONTAINS', value: 'payment=success' },
          },
        },
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    ]);

    // Extract overview totals (first row)
    const overviewRow = overviewReport?.rows?.[0];
    const overview = overviewRow ? {
      sessions: overviewRow.metricValues[0].value,
      totalUsers: overviewRow.metricValues[1].value,
      newUsers: overviewRow.metricValues[2].value,
      bounceRate: parseFloat(overviewRow.metricValues[3].value).toFixed(1),
      avgSessionDuration: Math.round(parseFloat(overviewRow.metricValues[4].value)),
      pageViews: overviewRow.metricValues[5].value,
    } : {};

    return NextResponse.json({
      activeUsers: realtimeReport?.rows?.[0]?.metricValues?.[0]?.value ?? '0',
      overview,
      daily: parseRows(dailyReport),
      trafficSources: parseRows(trafficSourceReport),
      topPages: parseRows(topPagesReport),
      devices: parseRows(deviceReport),
      countries: parseRows(countryReport),
      conversions: parseRows(conversionReport),
    });

  } catch (err: any) {
    console.error('GA4 API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
