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
  const firstName = user.name ? user.name.split(' ')[0] : 'there';

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: `Heads up: your SELT subscription renews on ${renewalDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #0891b2, #1d4ed8); padding: 28px 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 18px; margin-bottom: 8px;">
              <span style="font-size: 22px; font-weight: 800; color: white; letter-spacing: 2px;">SELT</span>
            </div>
            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Mock Test Platform</p>
          </div>
          <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #0f172a; margin: 0 0 8px;">Hi ${firstName},</p>
            <p style="color: #334155; margin: 0 0 20px;">Just a heads-up — your <strong>SELT Mock Test Premium</strong> subscription renews on:</p>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 16px 20px; margin: 0 0 20px; text-align: center;">
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0369a1;">📅 ${formattedDate}</p>
              <p style="margin: 6px 0 0; font-size: 13px; color: #0891b2;">£0.99 will be charged to your payment method</p>
            </div>
            <p style="color: #334155; margin: 0 0 16px;">Your subscription gives you unlimited access to all SELT mock tests across every CEFR level — keep practising to make sure you're ready for the real exam.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://seltmocktest.co.uk" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
                Continue Practising →
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px; margin: 0 0 4px;">You can cancel anytime from your <strong>Profile page</strong> before the renewal date — no fees, no hassle.</p>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Questions? Email us at <a href="mailto:support@seltmocktest.co.uk" style="color: #0891b2;">support@seltmocktest.co.uk</a>.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">SELT Mock Test · seltmocktest.co.uk</p>
          </div>
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
  const firstName = user.name ? user.name.split(' ')[0] : 'there';
  const amountFormatted = `£${(amount / 100).toFixed(2)}`;
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: `Your SELT refund of ${amountFormatted} has been processed`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #0891b2, #1d4ed8); padding: 28px 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 18px; margin-bottom: 8px;">
              <span style="font-size: 22px; font-weight: 800; color: white; letter-spacing: 2px;">SELT</span>
            </div>
            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Mock Test Platform</p>
          </div>
          <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #0f172a; margin: 0 0 8px;">Hi ${firstName},</p>
            <p style="color: #334155; margin: 0 0 20px;">Your refund has been successfully processed.</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 20px; margin: 0 0 20px; text-align: center;">
              <p style="margin: 0; font-size: 22px; font-weight: 800; color: #15803d;">✅ ${amountFormatted} Refunded</p>
              <p style="margin: 6px 0 0; font-size: 13px; color: #16a34a;">To your original payment method</p>
            </div>
            ${reason ? `<p style="color: #64748b; font-size: 13px; margin: 0 0 16px;"><strong>Reason:</strong> ${reason}</p>` : ''}
            <p style="color: #334155; margin: 0 0 16px;">Please allow <strong>5–10 business days</strong> for the refund to appear on your statement, depending on your bank.</p>
            <p style="color: #334155; margin: 0 0 20px;">If you change your mind, you're always welcome to resubscribe at <a href="https://seltmocktest.co.uk" style="color: #0891b2;">seltmocktest.co.uk</a> — your 2 free tests remain available.</p>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Questions? Email us at <a href="mailto:support@seltmocktest.co.uk" style="color: #0891b2;">support@seltmocktest.co.uk</a>.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">SELT Mock Test · seltmocktest.co.uk</p>
          </div>
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
  const firstName = user.name ? user.name.split(' ')[0] : 'there';
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'Welcome to SELT Mock Test Premium 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #0891b2, #1d4ed8); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 800;">SELT Mock Test</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Premium Subscription Confirmed</p>
          </div>
          <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p>Hi ${firstName},</p>
            <p>Thank you for subscribing to <strong>SELT Mock Test Premium</strong> at <strong>£0.99/month</strong>. You now have full unlimited access to all mock tests across every CEFR level.</p>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 700; color: #0369a1;">Your Premium subscription includes:</p>
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
            <p style="color: #64748b; font-size: 13px;">Your subscription renews monthly at £0.99. You can cancel anytime from your Profile page. If you have any questions, contact us at support@seltmocktest.co.uk.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">SELT Mock Test | seltmocktest.co.uk</p>
          </div>
        </div>
      `,
    });

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'subscription_confirmation',
        metadata: { amount: 99 },
      },
    });

    console.log(`✓ Subscription confirmation sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to send subscription confirmation to ${user.email}:`, err);
    return false;
  }
}

export async function sendAdminNewSubscription(user: { id: string; email: string; name: string }) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  if (adminEmails.length === 0) return false;

  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: adminEmails,
      subject: `💳 New Subscription: ${user.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">New Subscription Started</h2>
          <p>A new user has subscribed to SELT Mock Test Premium (£0.99/month).</p>
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

    await prisma.emailLog.create({
      data: {
        userId: user.id,
        emailType: 'admin_new_subscription',
        metadata: { notifiedEmails: adminEmails.length },
      },
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
    subject = 'Unlock unlimited SELT practice for just £0.99/month';
    ctaText = 'Unlock Full Access — £0.99/month';
    bodyIntro = `<p>You’ve completed both your free SELT mock tests — great work!</p>
       <p>To keep practising and sit unlimited full mock tests across all CEFR levels (A1–C2), unlock full access for just <strong>£0.99 per month</strong>. Cancel anytime — no lock-in, no hassle.</p>`;
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
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Prepare for your UK Secure English Language Test</p>
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
            <p>${testsTaken >= 2 ? 'Just £0.99/month — cancel anytime from your Profile page.' : 'After your test, you\'ll get a detailed score breakdown and SWOT analysis to help you focus your preparation.'}</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://seltmocktest.co.uk" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
                ${ctaText} →
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px;">The test takes about 45–60 minutes. Make sure you're in a quiet place with a working microphone for the Speaking section.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              SELT Mock Test | seltmocktest.co.uk<br>
              <a href="mailto:support@seltmocktest.co.uk?subject=Unsubscribe%20from%20SELT%20emails" style="color: #94a3b8;">Unsubscribe</a>
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
  const firstName = user.name ? user.name.split(' ')[0] : 'there';
  const endDate = periodEnd ? periodEnd.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@seltmocktest.co.uk',
      to: user.email,
      subject: 'Your SELT Mock Test subscription has been cancelled',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #0891b2, #1d4ed8); padding: 28px 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 18px; margin-bottom: 8px;">
              <span style="font-size: 22px; font-weight: 800; color: white; letter-spacing: 2px;">SELT</span>
            </div>
            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Mock Test Platform</p>
          </div>
          <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #0f172a; margin: 0 0 8px;">Hi ${firstName},</p>
            ${immediate
              ? `<p style="color: #334155; margin: 0 0 16px;">Your <strong>SELT Mock Test Premium</strong> subscription has been cancelled and access has ended.</p>
                 <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 16px 20px; margin: 0 0 20px;">
                   <p style="margin: 0; color: #9a3412; font-size: 14px;">⚠️ Your premium access has ended immediately. Your account is now on the free plan.</p>
                 </div>`
              : `<p style="color: #334155; margin: 0 0 16px;">Your <strong>SELT Mock Test Premium</strong> subscription has been cancelled. You keep full access until your billing period ends.</p>
                 <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 16px 20px; margin: 0 0 20px; text-align: center;">
                   <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0369a1;">📅 Access continues until ${endDate}</p>
                   <p style="margin: 6px 0 0; font-size: 13px; color: #0891b2;">After this date your account reverts to the free plan</p>
                 </div>`
            }
            <p style="color: #334155; margin: 0 0 16px;">We're sorry to see you go. If you're still preparing for your SELT exam, you can resubscribe anytime — your progress and history are saved.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://seltmocktest.co.uk" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
                Resubscribe Anytime →
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px; margin: 0;">If this was a mistake or you have questions, email us at <a href="mailto:support@seltmocktest.co.uk" style="color: #0891b2;">support@seltmocktest.co.uk</a>.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">SELT Mock Test · seltmocktest.co.uk</p>
          </div>
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
