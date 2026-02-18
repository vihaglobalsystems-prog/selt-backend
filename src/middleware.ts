import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = process.env.CLIENT_URL || '*';

  // Handle CORS preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-user-id, x-user-email, x-admin-email, x-cron-secret',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Add CORS headers to all API responses
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-user-id, x-user-email, x-admin-email, x-cron-secret');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
