import type { Env, Subscriber, ReferralMilestone, ResendMarketingConfig } from '../types';
import { enrollSubscriberInSequences } from '../lib/sequence-processor';
import { sendMilestoneNotifications } from '../lib/milestone-notifications';
import { ensureResendContact, addContactsToSegment } from '../lib/resend-marketing';

/**
 * Generate a unique referral code
 * Uses 8 characters from a reduced alphabet (no O,0,I,1 for readability)
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = '';
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code;
}

/**
 * Check and record milestone achievements for a referrer
 * Returns newly achieved milestones for notification
 */
async function checkMilestoneAchievements(
  db: D1Database,
  referrerId: string,
  newReferralCount: number
): Promise<ReferralMilestone[]> {
  // Get all milestones that are at or below the new referral count
  const milestonesResult = await db.prepare(
    'SELECT * FROM referral_milestones WHERE threshold <= ? ORDER BY threshold ASC'
  ).bind(newReferralCount).all<ReferralMilestone>();

  const milestones = milestonesResult.results || [];

  const now = Math.floor(Date.now() / 1000);
  const newlyAchieved: ReferralMilestone[] = [];

  for (const milestone of milestones) {
    // Try to insert achievement (will fail silently if already exists due to UNIQUE constraint)
    const achievementId = crypto.randomUUID();
    const result = await db.prepare(
      `INSERT OR IGNORE INTO referral_achievements (id, subscriber_id, milestone_id, achieved_at)
       VALUES (?, ?, ?, ?)`
    ).bind(achievementId, referrerId, milestone.id, now).run();

    // If a row was inserted, this is a newly achieved milestone
    if (result.meta.changes > 0) {
      newlyAchieved.push(milestone);
    }
  }

  return newlyAchieved;
}

export async function handleConfirm(
  request: Request,
  env: Env,
  token: string
): Promise<Response> {
  try {
    if (!token) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid confirmation link');
    }

    // Find subscriber by confirm token
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE confirm_token = ?'
    ).bind(token).first<Subscriber>();

    if (!subscriber) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid or expired confirmation link');
    }

    if (subscriber.status === 'active') {
      return redirectWithMessage(env.SITE_URL, 'info', 'Already confirmed');
    }

    // Generate unique referral code for this subscriber
    const referralCode = generateReferralCode();

    // Update subscriber status to active and assign referral code
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      UPDATE subscribers
      SET status = 'active',
          confirm_token = NULL,
          subscribed_at = ?,
          referral_code = ?
      WHERE id = ?
    `).bind(now, referralCode, subscriber.id).run();

    // Sync subscriber to Resend Segment
    // This ensures new subscribers are added to the permanent segment for campaign broadcasts
    const segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
    if (segmentId) {
      try {
        const config: ResendMarketingConfig = {
          apiKey: env.RESEND_API_KEY,
        };

        // Ensure contact exists in Resend
        const contactResult = await ensureResendContact(config, subscriber.email, subscriber.name);

        if (contactResult.success && contactResult.contactId && !contactResult.existed) {
          // Add to segment if this is a new contact
          await addContactsToSegment(config, segmentId, [contactResult.contactId]);
          console.log(`Added new subscriber ${subscriber.email} to Resend segment ${segmentId}`);
        } else if (contactResult.success && contactResult.existed) {
          console.log(`Subscriber ${subscriber.email} already exists in Resend, skipping segment add`);
        } else {
          console.error(`Failed to sync subscriber ${subscriber.email} to Resend:`, contactResult.error);
        }
      } catch (error) {
        // Log but don't fail the confirmation process
        // Subscriber is already active in D1, sync can be retried later
        console.error('Failed to sync subscriber to Resend Segment:', {
          email: subscriber.email,
          segmentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      console.warn('RESEND_SEGMENT_ID not configured, skipping Resend sync for subscriber:', subscriber.email);
    }

    // If this subscriber was referred by someone, update the referrer's count
    if (subscriber.referred_by) {
      // Increment referrer's count
      const updateResult = await env.DB.prepare(`
        UPDATE subscribers
        SET referral_count = referral_count + 1
        WHERE id = ?
        RETURNING referral_count
      `).bind(subscriber.referred_by).first<{ referral_count: number }>();

      if (updateResult) {
        // Check and record milestone achievements
        const newlyAchieved = await checkMilestoneAchievements(
          env.DB,
          subscriber.referred_by,
          updateResult.referral_count
        );

        // Send notifications for newly achieved milestones
        if (newlyAchieved.length > 0) {
          // Get the referrer's details for notification
          const referrer = await env.DB.prepare(
            'SELECT * FROM subscribers WHERE id = ?'
          ).bind(subscriber.referred_by).first<Subscriber>();

          if (referrer && referrer.status === 'active') {
            // Send notifications for each newly achieved milestone
            // (usually just one, but could be multiple if they jumped thresholds)
            // Only send to active subscribers (respect opt-out)
            for (const milestone of newlyAchieved) {
              try {
                await sendMilestoneNotifications(
                  env,
                  referrer,
                  milestone,
                  updateResult.referral_count
                );
              } catch (error) {
                // Log but don't fail the confirmation process
                console.error('Failed to send milestone notification:', error);
              }
            }
          }
        }
      }
    }

    // Enroll in all active sequences
    await enrollSubscriberInSequences(env, subscriber.id);

    // Contact List auto-assignment (Batch 4C)
    if (subscriber.signup_page_slug) {
      const signupPage = await env.DB.prepare(
        'SELECT * FROM signup_pages WHERE slug = ?'
      ).bind(subscriber.signup_page_slug).first();

      if (signupPage?.contact_list_id) {
        const memberId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT OR IGNORE INTO contact_list_members (id, contact_list_id, subscriber_id, added_at)
           VALUES (?, ?, ?, ?)`
        ).bind(memberId, signupPage.contact_list_id, subscriber.id, Math.floor(Date.now() / 1000)).run();
      }
    }

    // Redirect to confirmation page with referral code
    const confirmedUrl = new URL('/newsletter/confirmed', env.SITE_URL);
    confirmedUrl.searchParams.set('ref', referralCode);
    return Response.redirect(confirmedUrl.toString(), 302);
  } catch (error) {
    console.error('Confirm error:', error);
    return redirectWithMessage(env.SITE_URL, 'error', 'An error occurred');
  }
}

function redirectWithMessage(
  siteUrl: string,
  type: 'success' | 'error' | 'info',
  message: string
): Response {
  const url = new URL('/newsletter/confirmed', siteUrl);
  url.searchParams.set('status', type);
  url.searchParams.set('message', message);
  return Response.redirect(url.toString(), 302);
}
