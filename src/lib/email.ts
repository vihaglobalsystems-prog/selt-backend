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
          <p>Your card on file will be charged <strong>£4.99</strong>.</p>
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
        metadata: { renewalDate: formattedDate, amount: 499 },
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

export async function sendSubscriptionConfirmation(user: { id: string; email: string; name: string }) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'Welcome to SELT Mock Test Premium! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">You're now a Premium member!</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Thank you for subscribing to <strong>SELT Mock Test Premium</strong>. Your account has been upgraded and you now have full access to:</p>
          <ul>
            <li>Unlimited practice tests for all CEFR levels (A1–C2)</li>
            <li>AI-powered speaking and writing analysis</li>
            <li>Detailed SWOT feedback after every test</li>
            <li>Full progress tracking and score history</li>
          </ul>
          <p>Your subscription is <strong>£4.99/month</strong> and will renew automatically. You'll receive a reminder 7 days before each renewal.</p>
          <p style="margin-top: 24px;">
            <a href="https://seltmocktest.co.uk" style="background: #1e40af; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Start Practising Now →
            </a>
          </p>
          <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
            If you have any questions, reply to this email or contact us at support@seltmocktest.co.uk.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">SELT Mock Test | seltmocktest.co.uk</p>
        </div>
      `,
    });

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'subscription_confirmation',
        metadata: {},
      },
    });

    console.log(`✓ Subscription confirmation sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send subscription confirmation to ${user.email}:`, err);
    return false;
  }
}

export async function sendAdminNewSubscription(user: { email: string; name: string }) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  if (adminEmails.length === 0) return false;

  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: adminEmails,
      subject: `💳 New Premium subscriber: ${user.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">New Premium Subscription</h2>
          <p>A new user has subscribed to SELT Mock Test Premium.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Name</td>
              <td style="padding: 8px 12px; font-weight: bold;">${user.name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Email</td>
              <td style="padding: 8px 12px;">${user.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Time</td>
              <td style="padding: 8px 12px;">${now} (London)</td>
            </tr>
          </table>
          <p style="color: #6b7280; font-size: 13px;">
            View all subscribers in your
            <a href="https://selt-backend.netlify.app/admin">admin dashboard</a>
            or in the <a href="https://dashboard.stripe.com">Stripe dashboard</a>.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">SELT Mock Test | automated notification</p>
        </div>
      `,
    });

    console.log(`✓ Admin notified of new subscription from ${user.email}`);
    return true;
  } catch (err) {
    console.error('✗ Failed to send admin subscription notification:', err);
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
