# KV Namespace Setup - Quick Start

## Current Status

✅ **Configuration Complete**
- KV namespace binding added to `wrangler.toml`
- TypeScript types updated in `src/types.ts`
- Rate limiting implemented in `src/routes/subscribe.ts`
- Tests passing (8/8 rate-limiter tests ✓)

⚠️ **Action Required**
- KV namespace IDs are currently placeholders
- Real namespace IDs needed for production deployment

## Quick Setup (5 minutes)

### 1. Create Production Namespace
```bash
cd workers/newsletter
wrangler kv:namespace create RATE_LIMIT_KV --preview false
```

**Copy the `id` from the output.**

### 2. Create Preview Namespace
```bash
wrangler kv:namespace create RATE_LIMIT_KV --preview
```

**Copy the `preview_id` from the output.**

### 3. Update wrangler.toml

Replace lines 79-80 in `wrangler.toml`:

**Before:**
```toml
id = "placeholder_for_prod"
preview_id = "placeholder_for_preview"
```

**After:**
```toml
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"        # Your production ID
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"  # Your preview ID
```

### 4. Deploy

```bash
# Test locally first
npm run dev

# Deploy to production
npm run deploy
```

## What This Enables

**Rate Limiting for `/api/newsletter/subscribe`:**
- 5 requests per 10 minutes per email address
- Prevents spam and abuse
- Automatic cleanup via KV TTL

**Key Format:**
```
ratelimit:subscribe:<email>
```

**Example Value:**
```json
{
  "count": 3,
  "resetAt": 1735116000000
}
```

## Testing

All rate limit tests are passing:

```bash
npm test src/__tests__/rate-limiter.test.ts
```

**Test Coverage:**
✓ Rate limit state storage
✓ Request blocking after limit
✓ Window reset
✓ Email normalization (case-insensitive)

## Management

### Unblock an Email
```bash
wrangler kv:key delete "ratelimit:subscribe:user@example.com" \
  --namespace-id=<production-id>
```

### View All Rate Limited Emails
```bash
wrangler kv:key list --namespace-id=<production-id> \
  --prefix="ratelimit:subscribe:"
```

### Check Rate Limit Status
```bash
wrangler kv:key get "ratelimit:subscribe:user@example.com" \
  --namespace-id=<production-id>
```

## Full Documentation

See `KV_NAMESPACE_SETUP.md` for comprehensive documentation including:
- Detailed setup instructions
- Configuration options
- Monitoring and troubleshooting
- Security considerations
- Integration with Turnstile

## Files Modified (Task 4)

- ✅ `wrangler.toml` - Added KV namespace configuration with documentation
- ✅ `src/types.ts` - Already updated (Task 3)
- ✅ `KV_NAMESPACE_SETUP.md` - Comprehensive setup guide
- ✅ `README_KV_SETUP.md` - This quick start guide

## Next Steps

After creating the KV namespaces:

1. Update `wrangler.toml` with real IDs
2. Test locally: `npm run dev`
3. Run tests: `npm test`
4. Deploy: `npm run deploy`
5. Monitor initial rate limit events in Cloudflare dashboard

---

**Batch S - Security Hardening Complete** ✓
