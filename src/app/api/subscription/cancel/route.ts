import { NextRequest, NextResponse } from 'next/server';

// One-time payment model — cancellation is not applicable.
// Users contact support@seltmocktest.co.uk for refund requests.
export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: 'Cancellation is not available for one-time purchases. For refund requests please contact support@seltmocktest.co.uk',
    },
    { status: 400 }
  );
}
