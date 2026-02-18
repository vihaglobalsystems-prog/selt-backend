import { Resend } from 'resend';
import { prisma } from './prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendBillingReminder(user: { id: string; email: string; name: string }, renewalDate: Date) {
  const formattedDate = renewalDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'SELT Mock Test - Your subscription renews soon',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Subscription Renewal Reminder</h2>
          <p>Hi ${user.name},</p>
          <p>This is a friendly reminder that your <strong>SELT Premium</strong> subscription
          will automatically renew on <strong>${formattedDate}</strong>.</p>
          <p>Your card on file will be charged <strong>£12.99</strong>.</p>
          <p>If you wish to manage your subscription or update your payment method,
          please visit your account on
          <a href="https://seltmocktest.co.uk/account">seltmocktest.co.uk</a>.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            SELT Mock Test | seltmocktest.co.uk
          </p>
        </div>
      `,
    });

    // Log the email so we don't send duplicates
    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'billing_reminder',
        metadata: { renewalDate: formattedDate, amount: 1299 },
      },
    });

    console.log(`✓ Billing reminder sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send reminder to ${user.email}:`, err);
    return false;
  }
}

export async function sendRefundEmail(user: { id: string; email: string; name: string }, amount: number, reason?: string) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'SELT Mock Test - Refund Processed',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Refund Confirmation</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>A refund of <strong>£${(amount / 100).toFixed(2)}</strong> has been processed to your original payment method.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please allow 5-10 business days for the refund to appear on your statement.</p>
          <p>If you have any questions, please contact us at support@seltmocktest.co.uk.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            SELT Mock Test | seltmocktest.co.uk
          </p>
        </div>
      `,
    });

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'refund_confirmation',
        metadata: { amount, reason: reason || '' },
      },
    });

    console.log(`✓ Refund email sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send refund email to ${user.email}:`, err);
    return false;
  }
}

export async function sendCancellationEmail(user: { id: string; email: string; name: string }, immediate: boolean, periodEnd?: Date | null) {
  const endDate = periodEnd ? periodEnd.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'SELT Mock Test - Subscription Cancelled',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Subscription Cancellation</h2>
          <p>Hi ${user.name || 'there'},</p>
          ${immediate
            ? `<p>Your <strong>SELT Premium</strong> subscription has been cancelled and your access has ended immediately.</p>`
            : `<p>Your <strong>SELT Premium</strong> subscription has been set to cancel. You will continue to have premium access until <strong>${endDate}</strong>.</p>`
          }
          <p>You can resubscribe at any time by visiting <a href="https://seltmocktest.co.uk">seltmocktest.co.uk</a>.</p>
          <p>We hope to see you again! If you have any feedback, please reach out to support@seltmocktest.co.uk.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            SELT Mock Test | seltmocktest.co.uk
          </p>
        </div>
      `,
    });

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'subscription_cancelled',
        metadata: { immediate, periodEnd: endDate },
      },
    });

    console.log(`✓ Cancellation email sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send cancellation email to ${user.email}:`, err);
    return false;
  }
}
