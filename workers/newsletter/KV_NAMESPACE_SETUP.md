# KV Namespace Setup Guide

## Overview

This document describes how to set up the Cloudflare KV namespace for rate limiting in the newsletter worker.

**Purpose:** Store rate limit state for the `/api/newsletter/subscribe` endpoint to prevent abuse.

**Default Configuration:**
- Window: 10 minutes (600 seconds)
- Max attempts: 5 per IP address
- Key format: `rate:subscribe:<ip>`

## Prerequisites

1. Cloudflare account with Workers enabled
2. `wrangler` CLI installed and authenticated
3. Access to the EdgeShift Cloudflare account

## Setup Steps

### 1. Create Production KV Namespace

```bash
cd workers/newsletter
wrangler kv:namespace create RATE_LIMIT_KV --preview false
```

**Expected output:**
```
⛅️ wrangler 3.x.x
-------------------
🌀 Creating namespace with title "edgeshift-newsletter-RATE_LIMIT_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "RATE_LIMIT_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

Copy the `id` value from the output.

### 2. Create Preview KV Namespace

```bash
wrangler kv:namespace create RATE_LIMIT_KV --preview
```

**Expected output:**
```
⛅️ wrangler 3.x.x
-------------------
🌀 Creating namespace with title "edgeshift-newsletter-RATE_LIMIT_KV_preview"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "RATE_LIMIT_KV", preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" }
```

Copy the `preview_id` value from the output.

### 3. Update wrangler.toml

Open `wrangler.toml` and replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"        # Replace with production ID
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"  # Replace with preview ID
```

### 4. Verify Configuration

```bash
# Check syntax
wrangler deploy --dry-run

# Test locally with preview namespace
npm run dev

# Deploy to production
npm run deploy
```

## Management Commands

### View All Keys

```bash
# Production
wrangler kv:key list --namespace-id=<production-id>

# Preview
wrangler kv:key list --namespace-id=<preview-id>
```

### Get a Specific Key

```bash
wrangler kv:key get "rate:subscribe:192.168.1.100" --namespace-id=<id>
```

### Delete a Specific Key (Unblock an IP Address)

```bash
wrangler kv:key delete "rate:subscribe:192.168.1.100" --namespace-id=<id>
```

### Bulk Delete

```bash
wrangler kv:bulk delete \
  "rate:subscribe:192.168.1.100" \
  "rate:subscribe:203.0.113.45" \
  --namespace-id=<id>
```

## Rate Limit Configuration

The rate limit logic is implemented in `src/routes/subscribe.ts`:

```typescript
const RATE_LIMIT_WINDOW = 600;  // 10 minutes in seconds
const RATE_LIMIT_MAX_ATTEMPTS = 5;
```

To change these values:

1. Edit the constants in `src/routes/subscribe.ts`
2. Test locally: `npm run dev`
3. Run tests: `npm test`
4. Deploy: `npm run deploy`

## Monitoring

### Check Rate Limit Status for an IP Address

```bash
wrangler kv:key get "rate:subscribe:192.168.1.100" --namespace-id=<id>
```

**Example output:**
```json
{
  "count": 3,
  "resetAt": 1735116000000
}
```

- `count`: Number of attempts in current window
- `resetAt`: Unix timestamp (ms) when the window resets

### List All Rate Limited IP Addresses

```bash
wrangler kv:key list --namespace-id=<id> --prefix="rate:subscribe:"
```

## Troubleshooting

### Issue: "KV namespace not found"

**Solution:** Ensure you've created the namespace and updated `wrangler.toml` with the correct IDs.

### Issue: Rate limit not working locally

**Cause:** Local development uses the preview namespace, which is separate from production.

**Solution:** Test with the preview namespace:
```bash
npm run dev
# Make requests to http://localhost:8787/api/newsletter/subscribe
```

### Issue: Need to unblock an IP address immediately

**Solution:**
```bash
# Get the namespace ID from wrangler.toml
wrangler kv:key delete "rate:subscribe:<ip>" --namespace-id=<id>
```

### Issue: KV keys not expiring

**Cause:** KV TTL (time-to-live) is set at write time, not read time.

**Verification:**
Check the KV write in `src/routes/subscribe.ts`:
```typescript
await env.RATE_LIMIT_KV.put(key, JSON.stringify(data), {
  expirationTtl: RATE_LIMIT_WINDOW,
});
```

The key should automatically expire after 600 seconds (10 minutes).

## Security Considerations

1. **Key Format:** Always use consistent prefix `rate:subscribe:` for easy management
2. **IP-Based Limiting:** Rate limits are applied per IP address to prevent abuse from multiple email addresses from the same source
3. **Window Reset:** The window resets automatically via KV TTL, no manual cleanup needed
4. **Abuse Prevention:** 5 attempts per 10 minutes is a reasonable limit for legitimate users while preventing abuse

## Testing

The rate limit functionality is tested in `src/__tests__/subscribe.test.ts`:

```bash
npm test src/__tests__/subscribe.test.ts
```

Tests verify:
- Rate limit state is correctly stored in KV
- Requests are blocked after exceeding the limit
- Window reset works correctly
- IP-based rate limiting (per client IP)

## Integration with Turnstile

The rate limiter works in conjunction with Cloudflare Turnstile:

1. **First line of defense:** Turnstile verifies the request is from a human
2. **Second line of defense:** KV rate limiter prevents repeated submissions

Both checks must pass for a subscription to be processed.

## References

- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [Wrangler KV Commands](https://developers.cloudflare.com/workers/wrangler/commands/#kv)
- Rate limit implementation: `src/routes/subscribe.ts`
- Rate limit tests: `src/__tests__/subscribe.test.ts`
