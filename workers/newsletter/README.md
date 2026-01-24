# Newsletter Worker

Cloudflare Worker for managing newsletters, campaigns, and email sequences.

## Architecture

### Subscribe Flow

```
Signup Page → Subscribe → Confirm → Contact List Segment Sync
                                  ↓
                                  D1 Database
```

New subscribers are automatically synced to their contact list's Resend Segment on confirmation.

### Campaign Sending

```
Campaign → Get Contact List → Get Resend Segment → Broadcast to Segment
```

Campaigns send to pre-populated Resend Segments (no per-campaign sync).

### Sequence Sending

```
Sequence Step → Broadcast to Default Segment
```

Sequences use the default `RESEND_SEGMENT_ID` for delivery.

**Note:** Sequences are rarely used and will be migrated to SES (Amazon Simple Email Service) for proper 1-to-1 delivery in the future.

## Post-Deployment Checklist

### 1. Verify Contact List Segments

After deploying this fix, ensure contact lists have Resend Segments configured:

```bash
# Check existing contact lists
curl -X GET https://edgeshift.tech/api/contact-lists \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

Expected: Each contact list should have a `resend_segment_id` if it requires email campaigns.

### 2. Verify Segment Population

Check that Resend Segments contain expected subscribers:

```bash
curl -X GET https://api.resend.com/segments \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

Expected output: List of segments with subscriber counts.

### 3. Test Campaign Send

Create a test campaign to verify the fix:

1. Create campaign targeting a contact list
2. Send campaign
3. Check logs: Should complete within 5 seconds
4. Verify delivery logs in D1

```bash
# Monitor Worker logs
wrangler tail edgeshift-newsletter
```

Expected log output:
```
Sending campaign <id> to segment <seg_id> (<count> subscribers expected)
Broadcast sent successfully: <broadcast_id>
```

### 4. Test Subscribe Flow

Verify new subscribers are synced to Resend:

1. Subscribe via a signup page
2. Confirm subscription
3. Check logs for Resend sync confirmation

Expected log output:
```
Added subscriber <email> to Resend segment <seg_id> (contact list: <list_id>)
```

## Future Work

- [ ] Admin UI: Allow setting resend_segment_id when creating contact lists
- [ ] Migrate sequences to SES for proper 1-to-1 delivery (low priority - rarely used)
- [ ] Add bulk Resend sync admin tool for existing subscribers

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Deploy to production
wrangler deploy
```

## Related Documentation

- [ADR: Broadcast Loop Removal](/docs/decisions/2026-01-24-broadcast-loop-removal.md)
