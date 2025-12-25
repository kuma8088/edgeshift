# Batch TB: User Test Plan

> Newsletter System MVP のユーザーテスト計画

*Created: 2025-12-26*
*Status: Ready for Execution*

---

## Overview

### Purpose

Newsletter System MVP の実装が「実用的で使いやすいか」を検証するセルフテスト。

### Test Scope

| Task | Content | Status |
|------|---------|--------|
| TB-1 | Test Scenario Creation | This document |
| TB-2 | Subscriber Perspective Flow | Sequence + Embed Form |
| TB-3 | Admin Perspective Operations | Campaign + Contact List + Analytics |
| TB-4 | Mobile Support | **Out of Scope** |
| TB-5 | Feedback Collection & Improvement | Hybrid Approach |
| Extra | mail-tester.com Evaluation | Email Deliverability Check |

### Test Conditions

| Item | Value |
|------|-------|
| Tester | Self (Owner) |
| Environment | Production (edgeshift.tech) |
| Email | Personal email address |
| Timing | Start registration at 08:00 JST |

---

## Test Scenarios

### TB-2: Subscriber Perspective Flow

#### 2-1: Sequence Email Test (5 Steps)

**Purpose:** Verify delay_days/delay_time scheduling and click tracking.

**Test Sequence Configuration:**

| Step | delay_days | delay_time | Expected Send Time |
|------|-----------|------------|-------------------|
| 1 | 0 | 09:00 | Registration day JST 09:00 |
| 2 | 0 | 09:15 | Registration day JST 09:15 |
| 3 | 0 | 09:30 | Registration day JST 09:30 |
| 4 | 1 | NULL | Next day default time (09:00) |
| 5 | 1 | 14:00 | Next day JST 14:00 |

**Test Email Content:**

```
[Step 1] Subject: "Step 1: Welcome"
---
This is Step 1 (scheduled for 09:00).

Article A: https://edgeshift.tech/articles/a (Link A)
Article B: https://edgeshift.tech/articles/b (Link B)
---

[Step 2] Subject: "Step 2: Sample"
---
This is Step 2 (scheduled for 09:15).

Page C: https://edgeshift.tech/page-c (Link C)
---

[Step 3] Subject: "Step 3: Check"
---
This is Step 3 (scheduled for 09:30).

Page D: https://edgeshift.tech/page-d (Link D)
---

[Step 4] Subject: "Step 4: Default Time"
---
This is Step 4. Sent at default time (09:00) the next day.

Link: https://edgeshift.tech/step4 (Link E)
---

[Step 5] Subject: "Step 5: Specified Time"
---
This is Step 5. Sent at specified time (14:00) the next day.

Link: https://edgeshift.tech/step5 (Link F)
---
```

**Test Procedure:**

1. Create sequence in admin panel with above configuration
2. Add formatting (bold, links) using Tiptap editor
3. Register at 08:00 JST using personal email
4. Confirm Steps 1-3 arrive at 09:00, 09:15, 09:30 same day
5. Confirm Step 4 arrives at 09:00 next day
6. Confirm Step 5 arrives at 14:00 next day
7. Click all links (A-F) and verify in analytics UI

**Verification Points:**

- [ ] delay_days=0 sends multiple emails on same JST date
- [ ] delay_time creates time differences between steps
- [ ] delay_days=1 sends correctly on next day
- [ ] Default time vs specified time works correctly
- [ ] Click tracking records each link separately
- [ ] Batch 3D scheduling features are not disabled

#### 2-2: Embed Form Test

**Purpose:** Verify embed form functionality and theme/size options.

**Test Page Configuration:**

```
Page Type: embed
Slug: test-embed
Theme: light / dark (test both)
Size: compact / full (test both)
```

**Test Procedure:**

1. Create embed page at `/admin/signup-pages/new` with `page_type: embed`
2. Customize form labels, placeholders, button text
3. Access `/newsletter/embed/test-embed` directly
4. Test query parameter combinations:
   - `?theme=light&size=full`
   - `?theme=dark&size=compact`
5. Submit subscription through embed form
6. Verify Double Opt-in email received and confirmation works
7. Check embed code generator in admin panel

**Verification Points:**

- [ ] page_type branching (landing/embed) works correctly
- [ ] Theme switching (light/dark) reflects properly
- [ ] Size switching (compact/full) reflects properly
- [ ] Subscription via embed form completes successfully
- [ ] Embed code generator UI works correctly

---

### TB-3: Admin Perspective Operations

#### 3-1: Campaign Delivery Test

**Purpose:** Verify campaign creation, delivery, and tracking.

**Test Campaign Content:**

```
Subject: "Test Campaign: Click Tracking Verification"

Body:
---
Hello,

This is a test email for campaign delivery.

Please click the following links to verify tracking functionality:

1. Top Page: https://edgeshift.tech/ (Link A)
2. Projects: https://edgeshift.tech/projects (Link B)
3. Contact: https://edgeshift.tech/contact (Link C)
4. External Link: https://github.com/kuma8088 (Link D)

After testing, verify the following in admin panel:
- Delivery logs are recorded
- Open tracking works
- Click counts are accurate for each link

Thank you.
---
```

**Test Procedure:**

1. Create campaign in admin panel with above content
2. Add formatting using Tiptap editor (bold, links)
3. Select Contact List (or all subscribers)
4. Use preview function to verify display
5. Execute immediate delivery or schedule 5 minutes ahead
6. Receive email and click multiple links (A-D)
7. Click same link multiple times (verify duplicate count handling)
8. Check statistics at `/admin/campaigns/detail?id=xxx`

**Verification Points:**

- [ ] Tiptap editor allows editing
- [ ] Preview function works
- [ ] Immediate/scheduled delivery works
- [ ] Open tracking is recorded
- [ ] Click tracking records each link separately
- [ ] Analytics UI displays statistics accurately

#### 3-2: Contact List Test

**Purpose:** Verify Contact List CRUD and list-based delivery.

**Test List Configuration:**

```
List Name: "Test Subscriber List"
Description: "Test list for user testing"
```

**Test Procedure:**

1. Create new list at `/admin/contact-lists`
2. Enter name and description
3. Add personal email (subscriber) to the list
4. Verify member display in list detail
5. Create campaign with "Test Subscriber List" selected
6. Execute delivery and confirm only list members receive it
7. Check member count in list detail
8. Verify list-based delivery results in campaign statistics

**Verification Points:**

- [ ] List create/edit/delete works
- [ ] Member add/remove works
- [ ] List-based delivery reaches correct recipients
- [ ] List detail screen displays accurately

---

### Extra: mail-tester.com Evaluation

**Purpose:** Evaluate email deliverability and spam score.

**Test Procedure:**

1. Access mail-tester.com and obtain temporary test email address
2. Create dedicated campaign with realistic newsletter content (see below)
3. Send to mail-tester address
4. Check evaluation results

**Test Email Content (Realistic Newsletter Format):**

```
Subject: "EdgeShift Newsletter: Building Serverless APIs with Cloudflare Workers"

Body:
---
Hello,

Thank you for subscribing to the EdgeShift Newsletter.

In this issue, we explore how to build scalable, cost-effective APIs using Cloudflare Workers. As edge computing continues to reshape the landscape of web development, understanding serverless architecture has become essential for modern developers.

Cloudflare Workers provide a unique approach to serverless computing by running your code at the edge, closer to your users. This results in significantly reduced latency and improved user experience, especially for globally distributed applications.

In this article, we will cover:

1. Setting up your first Cloudflare Worker
2. Connecting to Cloudflare D1 for database operations
3. Implementing authentication and rate limiting
4. Best practices for production deployment

The combination of Workers, D1, and KV storage creates a powerful platform for building full-stack applications without managing traditional server infrastructure.

Read the full article here:
https://edgeshift.tech/articles/cloudflare-workers-guide

If you have any questions or feedback, feel free to reach out. I would love to hear about your experiences with serverless architecture.

Best regards,
EdgeShift Team

---
EdgeShift - Building at the Edge
https://edgeshift.tech
---
```

**Verification Points:**

- [ ] Spam score (target: 8+ out of 10)
- [ ] SPF / DKIM / DMARC configured correctly
- [ ] HTML structure has no issues
- [ ] Not on any blacklists
- [ ] If issues found, record for TB-5 improvement

---

### TB-5: Feedback Collection & Improvement

**Purpose:** Collect UX feedback and address issues.

**Approach:** Hybrid

| Issue Size | Action |
|------------|--------|
| Minor (< 15 min fix) | Fix immediately, note in log |
| Major (> 15 min fix) | Record only, create separate task |

**Evaluation Criteria:**

1. **Edit UX (Tiptap, Forms)**
   - Is the toolbar intuitive?
   - Are there too many settings?
   - Is preview functionality sufficient?

2. **View Content (Analytics, Statistics)**
   - Are the displayed metrics useful for decision-making?
   - Is the granularity of click details appropriate?
   - Are sequence statistics practical?

**Recording Method:**

1. Note findings immediately in Obsidian daily note
   - Issue description
   - Why it bothered me
   - Improvement idea
   - Screenshot if applicable

2. Mark as "Fixed" if addressed immediately

3. At end of TB-5, review notes and:
   - Create GitHub Issues for remaining items
   - Or document in newsletter_system_expansion.md

---

## Known Limitations

### Immediate Send After Registration

**Current Status:** Not implemented

**Behavior:**
- `delay_days=0` means "specified time on the same JST date", not "immediately after registration"
- If registered at 14:00 JST with `delay_days=0, delay_time="09:00"`, the email will NOT be sent (09:00 has passed)

**Workaround for Testing:**
- Register before the first step's delay_time (e.g., register at 08:00 for 09:00 send)

**Future Development:**
- Add `delay_minutes` column or `send_immediately` flag
- Recorded in newsletter_system_mvp.md as MVP enhancement

---

## Test Schedule

| Day | Time | Activity |
|-----|------|----------|
| Day 1 | 07:30 | Prepare test sequence and campaign in admin |
| Day 1 | 08:00 | Register with personal email |
| Day 1 | 09:00-09:30 | Receive Steps 1-3, click links |
| Day 1 | 10:00 | Verify analytics, test embed form |
| Day 1 | 11:00 | Test Contact List and campaign delivery |
| Day 1 | 14:00 | mail-tester.com evaluation |
| Day 2 | 09:00 | Receive Step 4, verify default time |
| Day 2 | 14:00 | Receive Step 5, verify specified time |
| Day 2 | 15:00 | TB-5: Review findings, address issues |

---

## Success Criteria

- [ ] All sequence steps delivered at correct times
- [ ] Click tracking accurately records all link clicks
- [ ] Campaign delivery works with Contact List selection
- [ ] Embed form functions with all theme/size combinations
- [ ] mail-tester.com score >= 8/10
- [ ] No critical bugs discovered
- [ ] UX issues documented for future improvement

---

## References

- [newsletter_system_mvp.md](../portfolio_site/newsletter_system/newsletter_system_mvp.md) - MVP specification
- [newsletter_system_expansion.md](../portfolio_site/newsletter_system/newsletter_system_expansion.md) - Future phases

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-26 | v1.0 | Initial test plan created |
