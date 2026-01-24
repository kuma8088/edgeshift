import type { Env, ResendWebhookEvent, DeliveryStatus } from '../types';
import { RESEND_UNSUBSCRIBE_HOSTNAME } from '../types';
import { verifyWebhookSignature } from '../lib/webhook';
import { findDeliveryLogByResendId, findDeliveryLogByBroadcastAndEmail, updateDeliveryStatus, recordClickEvent } from '../lib/delivery';

/**
 * Check if a URL is a Resend-managed unsubscribe link.
 * Uses hostname-based validation to avoid false positives from substring matching.
 */
function isResendUnsubscribeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === RESEND_UNSUBSCRIBE_HOSTNAME;
  } catch {
    // Invalid URLs are treated as normal URLs (to be recorded)
    return false;
  }
}

/**
 * Handle contact.updated event from Resend.
 * When a contact is unsubscribed via Resend's built-in unsubscribe link,
 * update the subscriber status in D1.
 */
async function handleContactUpdated(env: Env, data: { email?: string; unsubscribed?: boolean }): Promise<void> {
  if (!data.email || !data.unsubscribed) {
    return;
  }

  // Update subscriber status to unsubscribed
  await env.DB.prepare(
    `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE email = ? AND status = 'active'`
  ).bind(Date.now(), data.email.toLowerCase()).run();

  console.log(`Subscriber ${data.email} unsubscribed via Resend`);
}

export async function handleResendWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // Get signature headers
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response(JSON.stringify({ error: 'Missing signature headers' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get raw body
  const payload = await request.text();

  // Verify signature
  const isValid = await verifyWebhookSignature(
    payload,
    {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    },
    env.RESEND_WEBHOOK_SECRET
  );

  if (!isValid) {
    console.error('Webhook signature verification failed');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse event
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`Received webhook event: ${event.type}`, { data: event.data });

  // Handle contact events (no email_id)
  if (event.type === 'contact.updated') {
    await handleContactUpdated(env, event.data as { email?: string; unsubscribed?: boolean });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find delivery log - try email_id first (Transactional API), then broadcast_id + email (Broadcast API)
  let deliveryLog = await findDeliveryLogByResendId(env, event.data.email_id);

  // If not found by email_id, try broadcast_id + email (Broadcast API case)
  if (!deliveryLog && event.data.broadcast_id && event.data.to?.[0]) {
    deliveryLog = await findDeliveryLogByBroadcastAndEmail(
      env,
      event.data.broadcast_id,
      event.data.to[0]
    );
    if (deliveryLog) {
      console.log(`Found delivery log via broadcast_id: ${event.data.broadcast_id}, email: ${event.data.to[0]}`);
    }
  }

  if (!deliveryLog) {
    // Not found is OK - might be a test email or already processed
    console.log(`No delivery log found for email_id: ${event.data.email_id}, broadcast_id: ${event.data.broadcast_id || 'none'}`);
    return new Response(JSON.stringify({ success: true, message: 'No matching delivery log' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Map event type to delivery status
  let newStatus: DeliveryStatus | null = null;
  let errorMessage: string | undefined;

  switch (event.type) {
    case 'email.delivered':
      newStatus = 'delivered';
      break;
    case 'email.opened':
      newStatus = 'opened';
      break;
    case 'email.clicked':
      newStatus = 'clicked';
      // Record click event if link is present
      const clickedUrl = event.data.click?.link?.trim();
      if (clickedUrl) {
        // Filter out Resend-generated unsubscribe URLs from tracking
        // These are handled by Resend's webhook (contact.updated event)
        if (!isResendUnsubscribeUrl(clickedUrl)) {
          try {
            await recordClickEvent(env, {
              deliveryLogId: deliveryLog.id,
              subscriberId: deliveryLog.subscriber_id,
              clickedUrl: clickedUrl,
            });
            console.log(`Recorded click event for ${deliveryLog.id}: ${clickedUrl}`);
          } catch (error) {
            // Log error but don't fail the webhook
            console.error('Failed to record click event:', error);
          }
        } else {
          console.log(`Ignoring Resend unsubscribe URL click from webhook: ${clickedUrl}`);
        }
      }
      break;
    case 'email.bounced':
      newStatus = 'bounced';
      errorMessage = event.data.bounce?.message;
      break;
    case 'email.complained':
      newStatus = 'failed';
      errorMessage = 'Spam complaint received';
      break;
    default:
      // Ignore other events
      break;
  }

  if (newStatus) {
    await updateDeliveryStatus(env, deliveryLog.id, newStatus, errorMessage);
    console.log(`Updated delivery log ${deliveryLog.id} to status: ${newStatus}`);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
