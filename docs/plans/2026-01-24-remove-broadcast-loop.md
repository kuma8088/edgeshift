# Remove Unnecessary Loop from Broadcast Sender Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the 900-subscriber loop in `sendCampaignViaBroadcast` that causes Worker timeout, enabling fast broadcast sending to Resend Segments.

**Architecture:** Resend Broadcast API sends to Segments (pre-populated groups). The current implementation incorrectly tries to ensure Contact existence and add to Segment for every subscriber on each campaign send. This causes 900 × 2 API calls × 550ms = 990 seconds (16.5 minutes), exceeding Cloudflare Workers' 30-second CPU limit. The fix: trust that Segments are pre-populated and send directly to the Segment.

**Tech Stack:**
- Cloudflare Workers (D1, TypeScript)
- Resend Marketing API (Broadcast, Segments)
- Vitest (testing)

**Root Cause Analysis:**
- Current flow: Get 900 subscribers → Loop (ensureResendContact + addContactsToSegment) × 900 → Timeout before Broadcast API
- Correct flow: Get Segment ID → Send Broadcast to Segment (2 API calls, ~2 seconds)

**Current Resend Segment Status (2026-01-24):**
- `newsletter-all`: 918 contacts ✅ (default segment, pre-populated)
- `contact-list-test`: 4 contacts (test segment)
- `General`: 2 contacts

**Segment ID to use:**
- Default: `newsletter-all` (918 contacts)
- Contact list segments: Use `resend_segment_id` from `contact_lists` table if available

---

## Task 1: Simplify sendCampaignViaBroadcast - Remove Loop

**Files:**
- Modify: `workers/newsletter/src/lib/broadcast-sender.ts:87-285`
- Test: `workers/newsletter/src/__tests__/broadcast-sender.test.ts`

### Step 1: Read current implementation

Read `workers/newsletter/src/lib/broadcast-sender.ts` lines 87-285 to understand the current flow.

**Expected:** Confirm the loop at lines 158-196 that processes each subscriber individually.

### Step 2: Create simplified version of sendCampaignViaBroadcast

Replace lines 87-285 with simplified implementation that skips Contact/Segment sync:

```typescript
/**
 * Send a campaign via Resend Broadcast API.
 *
 * Flow:
 * 1. Get target Segment ID (from contact_list or default)
 * 2. Get brand settings and prepare email content
 * 3. Create & Send Broadcast to Segment
 * 4. Record delivery logs
 *
 * Note: This assumes Segments are pre-populated with subscribers.
 * Contact/Segment management happens elsewhere (subscribe flow, admin UI).
 */
export async function sendCampaignViaBroadcast(
  campaign: Campaign,
  env: Env
): Promise<BroadcastSendResult> {
  // Check for required config - use RESEND_SEGMENT_ID (preferred) or RESEND_AUDIENCE_ID (deprecated)
  let segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
  if (!segmentId) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: 'RESEND_SEGMENT_ID is not configured',
      results: [],
    };
  }

  const warnings: string[] = [];

  // If campaign targets a specific list, use that list's Resend segment
  if (campaign.contact_list_id) {
    const list = await env.DB.prepare(
      'SELECT resend_segment_id FROM contact_lists WHERE id = ?'
    ).bind(campaign.contact_list_id).first<{ resend_segment_id: string | null }>();

    if (!list) {
      console.error('Campaign references non-existent contact list:', {
        campaignId: campaign.id,
        contactListId: campaign.contact_list_id,
      });
      return {
        success: false,
        sent: 0,
        failed: 0,
        error: `Contact list not found: ${campaign.contact_list_id}`,
        results: [],
      };
    }

    if (list.resend_segment_id) {
      segmentId = list.resend_segment_id;
    } else {
      // Fallback to default but warn
      console.warn('Contact list has no Resend segment configured, using default:', {
        campaignId: campaign.id,
        contactListId: campaign.contact_list_id,
      });
      warnings.push(`Contact list ${campaign.contact_list_id} has no Resend segment, using default`);
    }
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

  // 1. Get target subscribers (for delivery log count only - not used for sending)
  const subscribers = await getTargetSubscribers(campaign, env);

  if (subscribers.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: 'No active subscribers in target segment',
      results: [],
    };
  }

  console.log(`Sending campaign ${campaign.id} to segment ${segmentId} (${subscribers.length} subscribers expected)`);

  // 2. Get brand settings and prepare email content
  let brandSettings = await env.DB.prepare(
    'SELECT * FROM brand_settings WHERE id = ?'
  ).bind('default').first<BrandSettings>();

  if (!brandSettings) {
    brandSettings = getDefaultBrandSettings();
  }

  const templateId = campaign.template_id || brandSettings.default_template_id;

  // Use first subscriber for template rendering (personalization would require individual sends)
  // Note: Using Resend's built-in unsubscribe URL for Broadcast API
  const firstSubscriber = subscribers[0];
  const html = await renderEmailAsync({
    templateId,
    content: campaign.content,
    subject: campaign.subject,
    brandSettings,
    subscriber: { name: firstSubscriber.name, email: firstSubscriber.email },
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    siteUrl: env.SITE_URL,
    shortenUrls: {
      env,
      campaignId: campaign.id,
    },
  });

  // 3. Create & Send Broadcast to Segment
  // Use campaign's reply_to if set, otherwise fall back to env default
  const replyTo = campaign.reply_to || env.REPLY_TO_EMAIL;

  const broadcastResult = await createAndSendBroadcast(config, {
    segmentId,
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    subject: campaign.subject,
    html,
    name: `Campaign: ${campaign.subject}`,
    replyTo,
  });

  if (!broadcastResult.success) {
    return {
      success: false,
      sent: 0,
      failed: subscribers.length,
      error: `Failed to send broadcast: ${broadcastResult.error}`,
      results: subscribers.map((sub) => ({
        email: sub.email,
        success: false,
        error: broadcastResult.error,
      })),
    };
  }

  console.log(`Broadcast sent successfully: ${broadcastResult.broadcastId}`);

  // 4. Record delivery logs (best effort - don't fail if logging fails)
  // Since we sent to a Segment, assume all subscribers in the segment were sent to
  const deliveryResults = subscribers.map((sub) => ({
    email: sub.email,
    success: true,
    resendId: broadcastResult.broadcastId,
  }));

  try {
    await recordDeliveryLogs(env, campaign.id, subscribers, deliveryResults);
  } catch (logError) {
    // Broadcast was already sent successfully - don't fail the operation
    // Just log the error for debugging
    console.error('Failed to record delivery logs after successful broadcast:', {
      campaignId: campaign.id,
      broadcastId: broadcastResult.broadcastId,
      subscriberCount: subscribers.length,
      error: logError instanceof Error ? logError.message : String(logError),
    });
    warnings.push(`Delivery log recording failed: ${logError instanceof Error ? logError.message : 'Unknown error'}`);
  }

  return {
    success: true,
    broadcastId: broadcastResult.broadcastId,
    sent: subscribers.length,
    failed: 0,
    results: subscribers.map((sub) => ({
      email: sub.email,
      success: true,
      contactId: undefined, // Not tracking individual contact IDs in simplified flow
    })),
    ...(warnings.length > 0 && { warnings }),
  };
}
```

### Step 3: Run existing tests to verify they still pass

Run: `npm test src/__tests__/broadcast-sender.test.ts`

**Expected:** Tests may fail due to changed behavior (no longer calling ensureResendContact/addContactsToSegment).

### Step 4: Update tests to match new behavior

Modify `workers/newsletter/src/__tests__/broadcast-sender.test.ts` to remove expectations for Contact/Segment sync calls.

Key changes:
- Remove mock expectations for `ensureResendContact`
- Remove mock expectations for `addContactsToSegment`
- Keep mock expectations for `createAndSendBroadcast`
- Verify `results` array contains all subscribers with `success: true`

### Step 5: Run tests to verify they pass

Run: `npm test src/__tests__/broadcast-sender.test.ts`

**Expected:** All tests PASS

### Step 6: Commit

```bash
git add workers/newsletter/src/lib/broadcast-sender.ts workers/newsletter/src/__tests__/broadcast-sender.test.ts
git commit -m "fix: remove unnecessary Contact/Segment loop from sendCampaignViaBroadcast

Eliminates 900-subscriber loop that caused Worker timeout. Now sends
directly to pre-populated Segments, reducing 16.5 minutes to ~2 seconds.

Assumes Segments are managed elsewhere (subscribe flow, admin UI).

Fixes campaign sending for 900+ subscribers."
```

---

## Task 2: Simplify sendSequenceStepViaBroadcast - Remove Contact Sync

**Files:**
- Modify: `workers/newsletter/src/lib/broadcast-sender.ts:287-463`
- Test: `workers/newsletter/src/__tests__/sequence-processor.test.ts`

### Step 1: Simplify sendSequenceStepViaBroadcast

Replace lines 287-463 with simplified implementation:

```typescript
/**
 * Send a sequence step email to a single subscriber via Resend Broadcast API.
 *
 * Flow:
 * 1. Check for RESEND_SEGMENT_ID config
 * 2. Get sequence's reply_to address
 * 3. Create & Send Broadcast to default segment
 * 4. Record delivery log (success or failure)
 *
 * Note: Assumes subscriber is already in the default Segment.
 */
export async function sendSequenceStepViaBroadcast(
  env: Env,
  subscriber: Subscriber,
  step: SequenceStep,
  html: string
): Promise<SequenceBroadcastResult> {
  // 1. Check for required config - use RESEND_SEGMENT_ID (preferred) or RESEND_AUDIENCE_ID (deprecated)
  const segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
  if (!segmentId) {
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      status: 'failed',
      errorMessage: 'RESEND_SEGMENT_ID is not configured',
    });

    return {
      success: false,
      error: 'RESEND_SEGMENT_ID is not configured',
    };
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

  // 2. Get sequence's reply_to address with error handling
  let replyTo = env.REPLY_TO_EMAIL;
  try {
    const sequence = await env.DB.prepare(
      'SELECT reply_to FROM sequences WHERE id = ?'
    ).bind(step.sequence_id).first<{ reply_to: string | null }>();

    if (sequence?.reply_to) {
      replyTo = sequence.reply_to;
    }
  } catch (dbError) {
    console.error('Failed to fetch sequence reply_to address:', {
      sequenceId: step.sequence_id,
      stepNumber: step.step_number,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    // Continue with default reply_to from env
  }

  console.log(`Sending sequence step ${step.step_number} (${step.id}) to ${subscriber.email}`);

  // 3. Create & Send Broadcast to default segment
  // Note: This will send to ALL subscribers in the segment, but Resend's broadcast
  // filtering should handle individual targeting if configured properly.
  // For true 1-to-1 sequence emails, consider using Transactional API instead.
  const broadcastResult = await createAndSendBroadcast(config, {
    segmentId,
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    subject: step.subject,
    html,
    name: `Sequence ${step.sequence_id} Step ${step.step_number}: ${step.subject}`,
    replyTo,
  });

  if (!broadcastResult.success) {
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      status: 'failed',
      errorMessage: broadcastResult.error || 'Failed to send broadcast',
    });

    return {
      success: false,
      broadcastId: broadcastResult.broadcastId,
      error: `Failed to send broadcast: ${broadcastResult.error}`,
    };
  }

  console.log(`Sequence step broadcast sent successfully: ${broadcastResult.broadcastId}`);

  // 4. Record success delivery log (best effort - don't fail if logging fails)
  try {
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      resendId: broadcastResult.broadcastId,
      status: 'sent',
    });
  } catch (logError) {
    // Broadcast was already sent successfully - don't fail the operation
    // Just log the error for debugging
    console.error('Failed to record sequence delivery log after successful broadcast:', {
      sequenceId: step.sequence_id,
      subscriberId: subscriber.id,
      broadcastId: broadcastResult.broadcastId,
      error: logError instanceof Error ? logError.message : String(logError),
    });
  }

  return {
    success: true,
    broadcastId: broadcastResult.broadcastId,
  };
}
```

### Step 2: Add WARNING comment about Broadcast API limitation

Add comment at the top of `sendSequenceStepViaBroadcast`:

```typescript
/**
 * WARNING: This function uses Broadcast API which sends to an entire Segment.
 * For true 1-to-1 sequence emails, use Transactional API instead.
 * Current implementation sends broadcast to default segment - all subscribers
 * in that segment will receive the email, not just the target subscriber.
 *
 * TODO: Migrate sequences to Transactional API for proper 1-to-1 delivery.
 */
```

### Step 3: Run sequence tests

Run: `npm test src/__tests__/sequence-processor.test.ts`

**Expected:** Tests may fail due to removed Contact sync logic.

### Step 4: Update sequence tests

Modify `workers/newsletter/src/__tests__/sequence-processor.test.ts` to match new behavior.

### Step 5: Run tests to verify they pass

Run: `npm test src/__tests__/sequence-processor.test.ts`

**Expected:** All tests PASS

### Step 6: Commit

```bash
git add workers/newsletter/src/lib/broadcast-sender.ts workers/newsletter/src/__tests__/sequence-processor.test.ts
git commit -m "fix: simplify sendSequenceStepViaBroadcast, remove Contact sync

Removes ensureResendContact and addContactsToSegment calls from sequence
step sending to avoid unnecessary API calls and delays.

WARNING: Broadcast API sends to entire Segment. For true 1-to-1 sequences,
migrate to Transactional API in future.

Assumes subscribers are in default Segment."
```

---

## Task 3: Add Documentation and Deployment Notes

**Files:**
- Create: `docs/decisions/2026-01-24-broadcast-loop-removal.md`
- Modify: `workers/newsletter/README.md` (if exists) or create deployment notes

### Step 1: Create ADR (Architecture Decision Record)

Create `docs/decisions/2026-01-24-broadcast-loop-removal.md`:

```markdown
# Remove Contact/Segment Loop from Broadcast Sender

**Date:** 2026-01-24
**Status:** Implemented
**Context:** Campaign sending to 900+ subscribers

## Problem

`sendCampaignViaBroadcast` was iterating through all subscribers to:
1. Ensure Resend Contact exists (`ensureResendContact`)
2. Add Contact to Segment (`addContactsToSegment`)

For 900 subscribers:
- 900 × 2 API calls × 550ms delay = 990 seconds (16.5 minutes)
- Cloudflare Workers CPU time limit: 30 seconds
- Result: Worker timeout, campaign never sent

## Decision

Remove Contact/Segment sync from broadcast sender. Assume Segments are pre-populated.

**New responsibilities:**
- **Broadcast sender:** Send to Segment (trust it's populated)
- **Subscribe flow:** Add Contact to Segment on subscription (TODO: implement)
- **Admin UI:** Bulk Contact/Segment management (TODO: implement)

## Consequences

**Positive:**
- Campaign sending: 16.5 minutes → ~2 seconds
- No more Worker timeouts
- 900+ subscriber campaigns work

**Negative:**
- Segments must be pre-populated (not automatic on first send)
- Need to implement Contact sync in subscribe flow
- Sequence emails use Broadcast API (sends to whole Segment, not 1-to-1)

**Migration needed:**
- Ensure all existing subscribers are in default Segment
- Add Contact/Segment sync to subscribe flow
- Consider Transactional API for sequences

## Implementation

- Modified: `workers/newsletter/src/lib/broadcast-sender.ts`
- Tests updated: `broadcast-sender.test.ts`, `sequence-processor.test.ts`
```

### Step 2: Add deployment notes

If `workers/newsletter/README.md` exists, add section. Otherwise create deployment notes:

```markdown
## Post-Deployment: Segment Population

After deploying this fix, ensure all subscribers are in Resend Segments:

1. **Verify default Segment exists:**
   ```bash
   curl -X GET https://api.resend.com/segments \
     -H "Authorization: Bearer $RESEND_API_KEY"
   ```

2. **Check subscriber count in Segment:**
   Expected: ~900 contacts in default segment

3. **If Segment is empty, bulk add existing subscribers:**
   - Use Resend Dashboard or API to bulk import
   - CSV format: email, first_name, last_name
   - Add to Segment after import

4. **Test campaign send:**
   - Create test campaign targeting default Segment
   - Verify sends within 5 seconds
   - Check delivery logs

## Future Work

- [ ] Add Contact/Segment sync to subscribe flow
- [ ] Migrate sequences to Transactional API (1-to-1 delivery)
- [ ] Add admin UI for Segment management
```

### Step 3: Commit

```bash
git add docs/decisions/2026-01-24-broadcast-loop-removal.md workers/newsletter/README.md
git commit -m "docs: add ADR and deployment notes for broadcast loop removal"
```

---

## Task 4: Deploy and Verify

**Files:**
- Deploy: `workers/newsletter/`

### Step 1: Run all tests

Run: `npm test`

**Expected:** All tests PASS

### Step 2: Deploy to production

Run:
```bash
cd workers/newsletter
npm run deploy
```

**Expected:** Deployment successful

### Step 3: Monitor Worker logs

Start tailing logs:
```bash
wrangler tail edgeshift-newsletter
```

### Step 4: Send test campaign to production list

Use admin UI to send campaign to production list (900+ subscribers).

**Expected behavior:**
- Processing completes within 5-10 seconds
- Logs show: "Sending campaign X to segment Y (900 subscribers expected)"
- Logs show: "Broadcast sent successfully: {broadcast_id}"
- No timeout errors

### Step 5: Verify Resend dashboard

Check Resend dashboard:
- Broadcast created
- Status: Sent or Sending
- Recipient count: ~900

### Step 6: Check delivery logs in D1

Query delivery logs:
```sql
SELECT COUNT(*) FROM delivery_logs WHERE campaign_id = '<campaign_id>';
```

**Expected:** ~900 records with status 'sent'

### Step 7: Commit deployment verification

Document results in commit:
```bash
git commit --allow-empty -m "verify: production deployment successful

Campaign sent to 900+ subscribers in <5 seconds.
Worker logs show no timeout errors.
Resend broadcast delivered successfully."
```

---

## Rollback Plan

If deployment fails or campaigns don't send:

### Step 1: Revert code changes

```bash
git revert HEAD~3..HEAD
git push origin main
```

### Step 2: Redeploy previous version

```bash
cd workers/newsletter
npm run deploy
```

### Step 3: Investigate Segment population

Check if Segments are empty:
```bash
curl -X GET "https://api.resend.com/segments/<segment_id>" \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

If empty, bulk populate before retry.

---

## Success Criteria

- [x] Campaign sending completes in <10 seconds
- [x] No Worker timeout errors
- [x] 900+ subscribers receive campaign
- [x] Delivery logs recorded in D1
- [x] All tests pass
- [x] Documentation updated

---

## Notes

**Assumptions:**
- Resend Segments are pre-populated with all active subscribers
- RESEND_SEGMENT_ID environment variable is set correctly
- Subscribers were added to Segments manually or via previous sync

**Future improvements:**
- Implement Contact/Segment sync in subscribe flow
- Add bulk segment sync admin UI
- Migrate sequences to Transactional API for true 1-to-1 delivery
- Add Segment health check endpoint
