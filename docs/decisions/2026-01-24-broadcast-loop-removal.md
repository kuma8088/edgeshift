# Remove Contact/Segment Loop from Broadcast Sender

**Date:** 2026-01-24
**Status:** Implemented
**Context:** Campaign sending to 900+ subscribers was timing out

## Problem

`sendCampaignViaBroadcast` was iterating through all subscribers to:
1. Ensure Resend Contact exists (`ensureResendContact`)
2. Add Contact to Segment (`addContactsToSegment`)

For 900 subscribers:
- 900 × 2 API calls × 550ms delay = 990 seconds (16.5 minutes)
- Cloudflare Workers CPU time limit: 30 seconds
- Result: Worker timeout, campaign never sent

## Decision

**Remove Contact/Segment sync from broadcast sender and move to subscribe flow.**

### Architecture Change

**Before:**
```
Subscribe → D1 only
Campaign Send → Sync 900 contacts → Add to Segment → Broadcast (timeout)
```

**After:**
```
Subscribe → Confirm → Sync to contact list's Resend Segment → D1
Campaign Send → Broadcast to pre-populated Segment (< 2 seconds)
```

### New Responsibilities

- **Subscribe/Confirm flow (`routes/confirm.ts`):**
  - Get signup page's contact_list_id
  - Add subscriber to D1 contact_list_members
  - Sync to contact list's resend_segment_id (if exists)
  - One sync per subscriber (on confirmation)

- **Broadcast sender (`lib/broadcast-sender.ts`):**
  - Get campaign's contact_list resend_segment_id
  - Send to pre-populated Segment
  - No Contact/Segment sync

- **Sequence sender (`lib/broadcast-sender.ts`):**
  - Simplified to remove Contact/Segment sync
  - Uses default RESEND_SEGMENT_ID
  - Note: Sequences rarely used, will migrate to SES in future

## Consequences

**Positive:**
- Campaign sending: 16.5 minutes → ~2 seconds (99% improvement)
- No more Worker timeouts
- 900+ subscriber campaigns work
- Correct architecture: sync once per subscriber, not per campaign
- Proper segmentation: each contact list has its own Resend Segment

**Negative:**
- Segments must be pre-populated (no longer automatic on first send)
- Contact lists without resend_segment_id skip Resend sync (D1 only)
- Sequences use Broadcast API (not ideal for 1-to-1, but rarely used)

**Migration Path:**
- **Sequences:** Migrate to SES (Amazon Simple Email Service) for 1-to-1 delivery
- **Contact Lists:** Admin UI should allow setting resend_segment_id for new lists

## Implementation

**Files Modified:**
- `workers/newsletter/src/routes/confirm.ts` - Added Contact/Segment sync to subscribe flow
- `workers/newsletter/src/lib/broadcast-sender.ts` - Removed loops from campaign and sequence sending
- `workers/newsletter/src/__tests__/subscribe-confirm.test.ts` - Added sync tests
- `workers/newsletter/src/__tests__/broadcast-sender.test.ts` - Updated campaign tests
- `workers/newsletter/src/__tests__/sequence-processor.test.ts` - Updated sequence tests

**Test Results:**
- All tests passing (28/28 total)
- Subscribe flow: 4/4
- Campaign sending: 4/4
- Sequence sending: 20/20

**Commits:**
- 0962166: Subscribe flow sync to contact list's Resend Segment
- d9ff28d: Remove campaign Contact/Segment loop
- d7ffb65: Remove sequence Contact/Segment sync
