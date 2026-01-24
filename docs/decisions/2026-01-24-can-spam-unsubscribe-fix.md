# CAN-SPAM Compliance: Fix Unsubscribe URL Shortening

**Date:** 2026-01-24
**Status:** Implemented
**Context:** URL shortener was breaking Resend's one-click unsubscribe placeholder

## Problem

The newsletter system's URL shortener was converting `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder into shortened redirect URLs, breaking CAN-SPAM compliance:

1. **One-click unsubscribe broken:** Shortened URLs redirected to our `/r/:code` endpoint, not Resend's unsubscribe handler
2. **List-Unsubscribe-Post header invalidated:** Email clients couldn't process one-click unsubscribe
3. **2 affected users:** Clicked shortened unsubscribe links but were NOT unsubscribed

### CAN-SPAM Act Requirements

- **One-click unsubscribe (List-Unsubscribe-Post):** Must work without user input
- **Unsubscribe processing:** Must honor within 10 business days
- **Penalties:** Up to $50,120 per non-compliant email

## Decision

**Multi-layer fix to ensure unsubscribe always works:**

### Layer 1: URL Shortener Exclusion

Exclude Resend unsubscribe placeholder from shortening:

```typescript
// url-shortener.ts
function isExcludedUrl(url: string): boolean {
  // CAN-SPAM: Never shorten unsubscribe URLs
  if (url.includes('RESEND_UNSUBSCRIBE_URL')) {
    return true;
  }
  // ...existing exclusions
}
```

### Layer 2: Resend API Sync

Sync unsubscribe status to Resend when users unsubscribe via our system:

```typescript
// unsubscribe.ts
// After D1 update, sync to Resend (best-effort, non-blocking)
await updateContactUnsubscribe(resendConfig, subscriber.email);
```

### Layer 3: Auto-Unsubscribe Safeguard

For users who already received shortened unsubscribe links, auto-unsubscribe when they click:

```typescript
// redirect.ts
async function autoUnsubscribe(env, subscriber, shortUrl) {
  // Check if target URL is an unsubscribe URL
  if (isUnsubscribeUrl(shortUrl.original_url)) {
    // Auto-unsubscribe in D1 + Resend
    await unsubscribeUser(env, subscriber.id);
  }
}
```

### Layer 4: Click Tracking Filter

Exclude unsubscribe URL clicks from analytics (but record all clicks for troubleshooting):

```sql
-- Analytics query excludes unsubscribe clicks
WHERE ce.clicked_url NOT LIKE '%unsubscribe%'
  AND ce.clicked_url NOT LIKE '%RESEND_UNSUBSCRIBE%'
```

## Architecture

```
[Email Template]
     |
     v
[URL Shortener] --exclude--> {{{RESEND_UNSUBSCRIBE_URL}}} (preserved)
     |
     v
[Resend Broadcast] --> Replaces placeholder with real unsubscribe URL
     |
     v
[User clicks unsubscribe]
     |
     +--> [Resend handler] --> User unsubscribed in Resend
     |
     +--> [Webhook] --> D1 status updated
```

**Safeguard for already-shortened links:**

```
[User clicks shortened unsubscribe]
     |
     v
[/r/:code redirect]
     |
     v
[isUnsubscribeUrl check] --> Auto-unsubscribe in D1 + Resend
     |
     v
[Redirect to original URL]
```

## Consequences

**Positive:**
- CAN-SPAM compliant: One-click unsubscribe preserved
- Resend sync: D1 and Resend stay in sync
- Safeguard: Past shortened links still work
- Analytics: Unsubscribe clicks excluded from engagement metrics

**Negative:**
- Additional complexity in redirect handler
- Best-effort Resend sync (failures logged, not blocking)

## Implementation

**Files Modified:**
- `workers/newsletter/src/lib/url-shortener.ts` - Exclude Resend placeholder
- `workers/newsletter/src/lib/resend-marketing.ts` - Add updateContactUnsubscribe()
- `workers/newsletter/src/routes/unsubscribe.ts` - Sync to Resend on unsubscribe
- `workers/newsletter/src/routes/redirect.ts` - Auto-unsubscribe safeguard
- `workers/newsletter/src/routes/webhook.ts` - Record all clicks (filter in analytics)
- `workers/newsletter/src/routes/tracking.ts` - Filter unsubscribe from analytics

**Rescued Users:**
- mag@kuma8088.com - Manually unsubscribed
- info@kuma8088.com - Manually unsubscribed

**PR:** #142 - CAN-SPAM compliance and campaign stats improvements
