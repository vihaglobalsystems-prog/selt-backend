import { NextRequest, NextResponse } from 'next/server';

// Validate that the request is from an authorized admin
export function validateAdmin(req: NextRequest): { valid: boolean; email?: string; error?: NextResponse } {
  const adminEmail = req.headers.get('x-admin-email');

  if (!adminEmail) {
    return { valid: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const allowedEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  if (!allowedEmails.includes(adminEmail.toLowerCase())) {
    return { valid: false, error: NextResponse.json({ error: 'Forbidden: not an admin' }, { status: 403 }) };
  }

  return { valid: true, email: adminEmail };
}
