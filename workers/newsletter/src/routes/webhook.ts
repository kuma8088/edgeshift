import type { Env, ResendWebhookEvent, DeliveryStatus } from '../types';
import { verifyWebhookSignature } from '../lib/webhook';
import { findDeliveryLogByResendId, updateDeliveryStatus } from '../lib/delivery';

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

  console.log(`Received webhook event: ${event.type} for email_id: ${event.data.email_id}`);

  // Find delivery log by resend_id (email_id)
  const deliveryLog = await findDeliveryLogByResendId(env, event.data.email_id);

  if (!deliveryLog) {
    // Not found is OK - might be a test email or already processed
    console.log(`No delivery log found for email_id: ${event.data.email_id}`);
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
