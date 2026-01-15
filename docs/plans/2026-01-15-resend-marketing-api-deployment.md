# Resend Marketing API Migration - Deployment Guide

> **Goal:** Migrate from Resend Email API (Transactional) to Marketing API (Broadcast) for newsletter delivery

## Summary of Changes

### New Files Created
- `workers/newsletter/src/lib/resend-marketing.ts` - Resend Marketing API service layer
- `workers/newsletter/src/lib/broadcast-sender.ts` - Campaign and sequence broadcast functions
- `workers/newsletter/src/__tests__/resend-marketing.test.ts` - Service tests (35 tests)
- `workers/newsletter/src/__tests__/broadcast-sender.test.ts` - Broadcast sender tests (16 tests)
- `tests/e2e/specs/broadcast-api-smoke.spec.ts` - E2E smoke tests

### Modified Files
- `workers/newsletter/schema.sql` - Added `resend_contact_id` column to subscribers
- `workers/newsletter/src/types.ts` - Added `RESEND_AUDIENCE_ID`, `USE_BROADCAST_API` env vars and Resend types
- `workers/newsletter/src/__tests__/setup.ts` - Added test environment variables
- `workers/newsletter/src/routes/campaign-send.ts` - Feature flag integration for campaigns
- `workers/newsletter/src/__tests__/campaign-send.test.ts` - Feature flag routing tests
- `workers/newsletter/src/lib/sequence-processor.ts` - Feature flag integration for sequences

## Deployment Steps

### 1. Apply Database Migration

```bash
cd workers/newsletter

# Local (development)
npm run db:migrate

# Production
npx wrangler d1 execute edgeshift-newsletter --remote --file=./schema.sql
```

The migration adds `resend_contact_id TEXT` column to the `subscribers` table.

### 2. Create Resend Audience

1. Go to [Resend Dashboard](https://resend.com/audiences)
2. Create a new Audience (e.g., "EdgeShift Newsletter")
3. Copy the Audience ID

### 3. Set Environment Variables

```bash
cd workers/newsletter

# Set the Resend Audience ID
wrangler secret put RESEND_AUDIENCE_ID
# Paste: aud_xxxxxxxxxxxxx

# Enable Broadcast API (when ready to switch)
# Option A: Via wrangler.toml (for testing)
# [vars]
# USE_BROADCAST_API = "true"

# Option B: Via secret (for production)
wrangler secret put USE_BROADCAST_API
# Enter: true
```

### 4. Deploy Worker

```bash
cd workers/newsletter
npm run deploy
```

### 5. Verify Deployment

1. Check worker logs: `wrangler tail`
2. Send a test campaign
3. Verify delivery logs in admin dashboard

## Feature Flag Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `RESEND_AUDIENCE_ID` | - | Resend Audience ID (required for Broadcast API) |
| `USE_BROADCAST_API` | `'false'` | Set to `'true'` to enable Broadcast API |

**Both variables must be set for Broadcast API to be used.**

## Rollback Procedure

To rollback to Email API:

```bash
# Option 1: Remove USE_BROADCAST_API secret
wrangler secret delete USE_BROADCAST_API

# Option 2: Set to false
wrangler secret put USE_BROADCAST_API
# Enter: false

# Redeploy
npm run deploy
```

## Architecture

### D1 is Master, Resend is Cache

```
┌─────────────────────────────────────────────────────────────────┐
│                    D1 Database (Master)                         │
│  ┌────────────────────────────────────────────────────────────┐│
│  │  subscribers table                                         ││
│  │  - id, email, name, status, ...                           ││
│  │  - resend_contact_id (NULL until first broadcast)         ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Lazy sync on first broadcast
┌─────────────────────────────────────────────────────────────────┐
│                    Resend Marketing API                         │
│  ┌────────────────────────┐  ┌────────────────────────────┐    │
│  │  Contacts (Cache)      │  │  Temp Segments             │    │
│  │  - Created on demand   │  │  - Created per broadcast   │    │
│  │  - Synced from D1      │  │  - Deleted after send      │    │
│  └────────────────────────┘  └────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Broadcast Flow

1. Get target subscribers from D1
2. Ensure each subscriber has a Resend Contact (lazy sync)
3. Create temporary Segment
4. Add contacts to Segment
5. Create & Send Broadcast to Segment
6. Delete temporary Segment (cleanup)
7. Record delivery logs in D1

## Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `resend-marketing.test.ts` | 35 | Service layer functions |
| `broadcast-sender.test.ts` | 16 | Campaign and sequence broadcast |
| `campaign-send.test.ts` | 11 | Feature flag routing |
| `sequence-processor.test.ts` | 19 | Sequence processing |
| **Total** | **466** | Full test suite |

## Monitoring

### Success Indicators
- Delivery logs show `sent` status
- Resend Dashboard shows broadcast deliveries
- No errors in worker logs

### Failure Indicators
- `RESEND_AUDIENCE_ID is not configured` error
- Contact creation failures
- Segment creation failures
- Broadcast send failures

## Contact Pricing Impact

### Before (Email API)
- Per-email pricing
- Each send costs

### After (Broadcast API)
- Contact-based pricing
- 1,000 contacts free, unlimited sends
- More cost-effective for frequent newsletters
