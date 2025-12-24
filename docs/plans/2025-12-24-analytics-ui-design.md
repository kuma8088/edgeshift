# Analytics UI Design - Batch 3E

> Created: 2025-12-24
> Status: Approved

---

## Overview

**Purpose:** Effect measurement - analyze which content is effective and improve future campaigns.

**Key Metrics:**
- Open rate (subject line effectiveness)
- Click rate (content appeal)
- Subscriber engagement (identify active readers)

**Visualization:** Simple charts using Tailwind (progress bars, percentage displays) - no external library.

---

## Page Structure

### New Pages

| Path | Description |
|:--|:--|
| `/admin/analytics` | Overall analytics dashboard |
| `/admin/campaigns/[id]` | Campaign detail with tracking |
| `/admin/sequences/[id]` | Sequence detail with step analysis |

### Data Sources (Batch 3C APIs)

- `GET /api/campaigns/:id/tracking` - Campaign statistics
- `GET /api/campaigns/:id/clicks` - Click details
- `GET /api/subscribers/:id/engagement` - Subscriber engagement

### New APIs Required

- `GET /api/sequences/:id/stats` - Step-by-step statistics
- `GET /api/analytics/overview` - Aggregated dashboard data

---

## Campaign Detail Page

**Path:** `/admin/campaigns/[id].astro`

**Component:** `CampaignDetail.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Campaign: [Subject]                     [Back]  │
├─────────────────────────────────────────────────┤
│ Status: sent  Sent: 2025-12-24 10:00           │
├─────────────────────────────────────────────────┤
│ Delivery Statistics                             │
│ ┌──────────┬──────────┬──────────┬──────────┐  │
│ │ Sent 100 │ Dlvd 98  │ Opened   │ Clicked  │  │
│ │          │          │ 45 ███░  │ 12 ██░   │  │
│ │          │          │ 46%      │ 27%      │  │
│ └──────────┴──────────┴──────────┴──────────┘  │
├─────────────────────────────────────────────────┤
│ Click Details                                   │
│ ┌─────────────────────────────────┬─────┬────┐ │
│ │ URL                             │Count│Uniq│ │
│ ├─────────────────────────────────┼─────┼────┤ │
│ │ https://example.com/article-1   │  18 │ 10 │ │
│ │ https://example.com/article-2   │   5 │  4 │ │
│ └─────────────────────────────────┴─────┴────┘ │
└─────────────────────────────────────────────────┘
```

**API Calls:**
- `GET /api/campaigns/:id` - Basic info
- `GET /api/campaigns/:id/tracking` - Statistics
- `GET /api/campaigns/:id/clicks` - Click details

---

## Sequence Detail Page

**Path:** `/admin/sequences/[id].astro`

**Component:** `SequenceDetail.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Sequence: [Name]                        [Back]  │
├─────────────────────────────────────────────────┤
│ Overall Statistics                              │
│ Enrolled: 50  Completed: 32 (64%)  Active: 18  │
├─────────────────────────────────────────────────┤
│ Step Analysis                                   │
│ ┌────┬──────────┬────────┬────────┬──────────┐ │
│ │ #  │ Subject  │ Reach  │ Open   │ Click    │ │
│ ├────┼──────────┼────────┼────────┼──────────┤ │
│ │ 1  │ Welcome  │ 100%   │ 72% ██ │ 45% █░   │ │
│ │ 2  │ How to   │  92%   │ 58% █░ │ 32% █░   │ │
│ │ 3  │ Tips     │  78%   │ 51% █░ │ 28% ░░   │ │
│ └────┴──────────┴────────┴────────┴──────────┘ │
├─────────────────────────────────────────────────┤
│ Enrolled Subscribers                            │
│ ┌──────────────────┬────────┬────────────────┐ │
│ │ Email            │ Step   │ Status         │ │
│ ├──────────────────┼────────┼────────────────┤ │
│ │ user@example.com │ Step 2 │ In Progress    │ │
│ │ test@example.com │ Step 3 │ Completed      │ │
│ └──────────────────┴────────┴────────────────┘ │
└─────────────────────────────────────────────────┘
```

**API Calls:**
- `GET /api/sequences/:id` - Basic info + steps
- `GET /api/sequences/:id/subscribers` - Enrolled subscribers
- `GET /api/sequences/:id/stats` - Step statistics (NEW)

---

## Analytics Dashboard

**Path:** `/admin/analytics/index.astro`

**Component:** `AnalyticsDashboard.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Analytics Dashboard                             │
├─────────────────────────────────────────────────┤
│ Campaign Performance (Recent 10)                │
│ ┌──────────────┬──────┬────────┬────────┬────┐ │
│ │ Subject      │ Sent │ Open   │ CTR    │Date│ │
│ ├──────────────┼──────┼────────┼────────┼────┤ │
│ │ December     │  100 │ 46% ██ │ 12% █░ │12/24│
│ │ November     │   95 │ 52% ██ │ 18% █░ │11/20│
│ └──────────────┴──────┴────────┴────────┴────┘ │
├─────────────────────────────────────────────────┤
│ Sequence Performance                            │
│ ┌──────────────┬──────┬────────┬──────────────┐ │
│ │ Name         │Enroll│Complete│ Avg Open     │ │
│ ├──────────────┼──────┼────────┼──────────────┤ │
│ │ Welcome      │   50 │ 64% ██ │ 58%          │ │
│ │ Onboarding   │   30 │ 40% █░ │ 42%          │ │
│ └──────────────┴──────┴────────┴──────────────┘ │
├─────────────────────────────────────────────────┤
│ Top Engaged Subscribers                         │
│ ┌──────────────────────┬──────┬──────┬───────┐ │
│ │ Subscriber           │ Open │ Click│ Score │ │
│ ├──────────────────────┼──────┼──────┼───────┤ │
│ │ active@example.com   │  12  │   8  │ High  │ │
│ │ engaged@example.com  │  10  │   5  │ Medium│ │
│ └──────────────────────┴──────┴──────┴───────┘ │
└─────────────────────────────────────────────────┘
```

**API Calls:**
- `GET /api/analytics/overview` (NEW)

---

## New API Specifications

### GET /api/sequences/:id/stats

**Response:**
```json
{
  "sequence_id": "uuid",
  "total_enrolled": 50,
  "completed": 32,
  "in_progress": 18,
  "steps": [
    {
      "step_number": 1,
      "subject": "Welcome",
      "sent": 50,
      "delivered": 49,
      "opened": 36,
      "clicked": 22,
      "open_rate": 73.5,
      "click_rate": 44.9
    }
  ]
}
```

### GET /api/analytics/overview

**Response:**
```json
{
  "campaigns": [
    {
      "id": "uuid",
      "subject": "December Newsletter",
      "sent_at": 1703404800,
      "recipient_count": 100,
      "open_rate": 46.0,
      "click_rate": 12.0
    }
  ],
  "sequences": [
    {
      "id": "uuid",
      "name": "Welcome",
      "enrolled": 50,
      "completion_rate": 64.0,
      "avg_open_rate": 58.0
    }
  ],
  "top_subscribers": [
    {
      "id": "uuid",
      "email": "active@example.com",
      "open_count": 12,
      "click_count": 8
    }
  ]
}
```

---

## Implementation Tasks

1. **API: Sequence Stats** - `GET /api/sequences/:id/stats`
2. **API: Analytics Overview** - `GET /api/analytics/overview`
3. **UI: Campaign Detail Page** - `/admin/campaigns/[id]`
4. **UI: Sequence Detail Page** - `/admin/sequences/[id]`
5. **UI: Analytics Dashboard** - `/admin/analytics`
6. **Admin API Client** - Add new endpoints to `admin-api.ts`

---

## Tech Stack

- **Pages:** Astro + React islands (`client:load`)
- **Styling:** Tailwind CSS v4
- **Charts:** Tailwind progress bars (no external library)
- **API:** Cloudflare Workers + D1
