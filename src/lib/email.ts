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

export async function sendPaymentConfirmation(user: { id: string; email: string; name: string }) {
  const firstName = user.name ? user.name.split(' ')[0] : 'there';
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'You now have full access to SELT Mock Test 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #0891b2, #1d4ed8); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 800;">SELT Mock Test</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Full Access Confirmed</p>
          </div>
          <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p>Hi ${firstName},</p>
            <p>Thank you for your payment of <strong>£4.99</strong>. You now have <strong>lifetime full access</strong> to SELT Mock Test — no renewals, no monthly charges, ever.</p>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 700; color: #0369a1;">Your full access includes:</p>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
                <li>Unlimited mock tests for all CEFR levels (A1–C2)</li>
                <li>AI-powered speaking and writing analysis</li>
                <li>Detailed SWOT feedback after every test</li>
                <li>Full progress tracking and score history</li>
              </ul>
            </div>
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://seltmocktest.co.uk" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
                Start Practising Now →
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px;">If you have any questions, reply to this email or contact us at support@seltmocktest.co.uk.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">SELT Mock Test | seltmocktest.co.uk</p>
          </div>
        </div>
      `,
    });

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'payment_confirmation',
        metadata: { amount: 499 },
      },
    });

    console.log(`✓ Payment confirmation sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send payment confirmation to ${user.email}:`, err);
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

export async function sendEngagementNudge(user: { id: string; email: string; name: string }, testsTaken: number) {
  const firstName = user.name ? user.name.split(' ')[0] : 'there';

  let subject: string;
  let ctaText: string;
  let bodyIntro: string;

  if (testsTaken === 0) {
    subject = 'Your free SELT mock test is waiting — take it now';
    ctaText = 'Start Your Free Test Now';
    bodyIntro = `<p>You signed up for SELT Mock Test but haven't taken your first free practice exam yet.</p>
       <p>Your <strong>2 free full mock tests</strong> are ready and waiting — no payment needed. Each test covers all 4 sections: Listening, Reading, Writing, and Speaking, just like the real SELT exam.</p>`;
  } else if (testsTaken === 1) {
    subject = 'You have 1 more free test left on SELT Mock Test';
    ctaText = 'Take Your 2nd Free Test';
    bodyIntro = `<p>Great news — you've already completed your first free SELT mock test!</p>
       <p>You still have <strong>1 more free full test</strong> available. Use it to track your progress and see which areas need more practice before the real exam.</p>`;
  } else {
    subject = 'Unlock unlimited SELT practice for just £4.99 — one-time payment';
    ctaText = 'Unlock Full Access — £4.99';
    bodyIntro = `<p>You've completed both your free SELT mock tests — great work!</p>
       <p>To keep practising and sit unlimited full mock tests across all CEFR levels (A1–C2), unlock full access for a <strong>one-time payment of just £4.99</strong>. No subscription, no monthly charges — pay once and practise as much as you need.</p>`;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #0891b2, #1d4ed8); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 800;">SELT Mock Test</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Practice for the Skills for English Language Test</p>
          </div>
          <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p>Hi ${firstName},</p>
            ${bodyIntro}
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 700; color: #0369a1;">${testsTaken >= 2 ? 'Full access includes:' : 'What\'s included in each free test:'}</p>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
                <li>🎧 Listening — audio comprehension questions</li>
                <li>📖 Reading — passage understanding</li>
                <li>✍️ Writing — structured response tasks</li>
                <li>🎤 Speaking — recorded oral responses</li>
                ${testsTaken >= 2 ? '<li>📊 Unlimited tests across all CEFR levels (A1–C2)</li><li>🔍 Detailed SWOT analysis after every test</li>' : ''}
              </ul>
            </div>
            <p>${testsTaken >= 2 ? 'One payment of £4.99 — no subscription, no recurring charges.' : 'After your test, you\'ll get a detailed score breakdown and SWOT analysis to help you focus your preparation.'}</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://seltmocktest.co.uk" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
                ${ctaText} →
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px;">The test takes about 45–60 minutes. Make sure you're in a quiet place with a working microphone for the Speaking section.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              SELT Mock Test | seltmocktest.co.uk<br>
              <a href="https://seltmocktest.co.uk" style="color: #94a3b8;">Unsubscribe</a>
            </p>
          </div>
        </div>
      `,
    });

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'engagement_nudge',
        metadata: { testsTaken },
      },
    });

    console.log(`✓ Engagement nudge sent to ${user.email} (tests taken: ${testsTaken})`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send engagement nudge to ${user.email}:`, err);
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
