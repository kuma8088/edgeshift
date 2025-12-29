# A/B Testing Feature Design

> Created: 2025-12-30
> Status: Approved

## Overview

A/B testing for email campaigns, supporting subject line and sender name variations with automatic winner determination.

## Requirements Summary

| Item | Decision |
|:-----|:---------|
| Test targets | Subject + Sender name |
| Flow | Auto test delivery, calculated backwards from scheduled time |
| Wait time | Selectable: 1h / 2h / 4h |
| Test ratio | Auto-adjust by subscriber count (< 100: 50%, 100-500: 20%, 500+: 10%) |
| Winner criteria | Weighted score (Open rate 70% + Click rate 30%) |
| Tie-breaker | Variant A wins |
| Settings UI | Toggle in campaign creation form |
| Results display | Integrated in campaign detail page |

---

## Database Schema

```sql
-- Add columns to campaigns table
ALTER TABLE campaigns ADD COLUMN ab_test_enabled INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN ab_subject_b TEXT;
ALTER TABLE campaigns ADD COLUMN ab_from_name_b TEXT;
ALTER TABLE campaigns ADD COLUMN ab_wait_hours INTEGER DEFAULT 4;
ALTER TABLE campaigns ADD COLUMN ab_test_sent_at TEXT;
ALTER TABLE campaigns ADD COLUMN ab_winner TEXT; -- 'A' or 'B' or NULL

-- Add column to delivery_logs table
ALTER TABLE delivery_logs ADD COLUMN ab_variant TEXT; -- 'A' or 'B'
```

---

## Campaign Status Flow

```
Normal campaign:
  draft → scheduled → sent

A/B test campaign:
  draft → scheduled → ab_testing → sent
```

**New status `ab_testing`:**
- Test delivery completed, waiting for winner determination
- Collecting open/click data during this period

---

## Cron Execution Flow

| Timing | Action |
|:-------|:-------|
| scheduled_at - wait_hours | Execute test delivery, set status to `ab_testing` |
| scheduled_at | Determine winner → Send to remaining, set status to `sent` |

Example: 18:00 delivery with 4-hour wait
- 14:00 → Test delivery (A/B each 10%)
- 18:00 → Winner determination → Deliver to remaining 80%

---

## API Changes

### POST /api/campaigns (Extended)

```typescript
{
  subject: "Subject A",
  content: "...",
  scheduled_at: "2025-01-05T18:00:00Z",
  // A/B test fields
  ab_test_enabled: true,
  ab_subject_b: "Subject B",
  ab_from_name_b: "Sender Name B",
  ab_wait_hours: 4
}
```

### GET /api/campaigns/:id (Extended response)

```typescript
{
  ...campaign,
  ab_stats: {
    variant_a: { sent: 50, opened: 25, clicked: 10, score: 0.41 },
    variant_b: { sent: 50, opened: 20, clicked: 8, score: 0.33 },
    winner: "A"
  }
}
```

### New Cron Handlers (scheduled.ts)

- `processAbTestCampaigns()` - Execute test delivery
- `processAbTestWinners()` - Determine winner + send to remaining

---

## A/B Test Sending Logic

### Test Delivery (at scheduled_at - wait_hours)

```typescript
async function sendAbTest(campaign, subscribers) {
  // 1. Calculate test ratio
  const ratio = getTestRatio(subscribers.length);
  // < 100: 50%, 100-500: 20%, 500+: 10%

  const testCount = Math.floor(subscribers.length * ratio);
  const halfTest = Math.floor(testCount / 2);

  // 2. Shuffle and split
  const shuffled = shuffle(subscribers);
  const groupA = shuffled.slice(0, halfTest);
  const groupB = shuffled.slice(halfTest, testCount);
  const remaining = shuffled.slice(testCount); // For main delivery

  // 3. Send A/B batches
  await sendBatch(groupA, campaign.subject, campaign.from_name, 'A');
  await sendBatch(groupB, campaign.ab_subject_b, campaign.ab_from_name_b, 'B');

  // 4. Update status
  campaign.status = 'ab_testing';
  campaign.ab_test_sent_at = now();
}
```

### Winner Determination (at scheduled_at)

```typescript
async function determineWinner(campaign) {
  const stats = await getAbStats(campaign.id);

  // Score: Open rate 70% + Click rate 30%
  const scoreA = stats.a.openRate * 0.7 + stats.a.clickRate * 0.3;
  const scoreB = stats.b.openRate * 0.7 + stats.b.clickRate * 0.3;

  const winner = scoreA >= scoreB ? 'A' : 'B'; // A wins on tie

  // Send to remaining subscribers with winner pattern
  await sendToRemaining(campaign, winner);
}
```

---

## Admin UI

### Campaign Creation Form

```
┌─────────────────────────────────────────┐
│ Subject: [                           ]  │
│ Sender Name: [                       ]  │
│ Scheduled: [2025-01-05 18:00       ▼]  │
│                                         │
│ ☑ Enable A/B Testing                   │
│ ┌─────────────────────────────────────┐ │
│ │ Subject B: [                      ] │ │
│ │ Sender Name B: [                  ] │ │
│ │ Wait Time: ○1h ○2h ●4h            │ │
│ │                                     │ │
│ │ ℹ️ Test at 14:00 → Main at 18:00    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Content: [                           ]  │
└─────────────────────────────────────────┘
```

### Campaign Detail Page

```
┌─────────────────────────────────────────┐
│ A/B Test Results               [Active] │
├──────────────────┬──────────────────────┤
│ Variant A        │ Variant B            │
│ Subject: "..."   │ Subject: "..."       │
├──────────────────┼──────────────────────┤
│ Sent: 50         │ Sent: 50             │
│ Open Rate: 50.0% │ Open Rate: 40.0%     │
│ Click Rate: 20%  │ Click Rate: 16%      │
│ Score: 0.41 🏆   │ Score: 0.33          │
└──────────────────┴──────────────────────┘
```

---

## Error Handling

| Case | Response |
|:-----|:---------|
| Partial test delivery failure | Continue with successful sends, log failures |
| Zero opens at winner determination | A wins by default |
| Created after scheduled time | Disable A/B test, warn and use normal delivery |
| Less than 10 subscribers | Show warning (execution still allowed) |

---

## Test Cases

### Unit Tests
- `getTestRatio()`: Ratio calculation by subscriber count
- `calculateAbScore()`: Score calculation (open 70% + click 30%)
- `determineWinner()`: A priority on tie

### Integration Tests
- Full flow: A/B creation → test delivery → winner determination → main delivery
- Verify `ab_variant` correctly recorded in delivery_logs
- Verify A/B stats displayed on campaign detail

### E2E Tests
- Admin UI: Configure A/B test → Save → Verify on detail page
