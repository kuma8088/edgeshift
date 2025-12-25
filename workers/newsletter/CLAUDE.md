# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Newsletter Worker - Cloudflare Worker providing the backend API for the EdgeShift newsletter system. Handles subscriber management, campaign delivery, email sequences, and contact list segmentation.

## Commands

```bash
npm run dev          # Start local worker with D1 local database
npm run deploy       # Deploy to Cloudflare production
npm run db:migrate   # Apply schema.sql to local D1
npm run db:migrate:prod  # Apply schema.sql to production D1 (add --remote for actual prod)
npm test             # Run all tests with Vitest
npm test src/__tests__/campaigns.test.ts  # Run single test file
```

**Production DB migration:**
```bash
npx wrangler d1 execute edgeshift-newsletter --remote --file=./schema.sql
```

## Architecture

```
src/
├── index.ts          # Entry point + route matching (string-based URL pattern matching)
├── types.ts          # All TypeScript interfaces and types
├── scheduled.ts      # Cron handler for sequence processing (*/15 * * * *)
├── lib/              # Shared utilities (auth, response helpers)
└── routes/           # Route handlers (one file per domain)
    ├── subscribe.ts      # Public subscribe/confirm flow
    ├── campaigns.ts      # Campaign CRUD
    ├── campaign-send.ts  # Campaign delivery logic
    ├── sequences.ts      # Sequence CRUD + enrollment
    ├── contact-lists.ts  # Contact list management (dual-perspective API)
    ├── signup-pages.ts   # Signup page generation
    ├── tracking.ts       # Open/click tracking + analytics
    └── webhook.ts        # Resend webhook handler
```

## Key Patterns

### Route Registration

Routes use string-based pattern matching in `index.ts`. Order matters for overlapping patterns:

```typescript
// More specific patterns first
if (path.match(/^\/api\/contact-lists\/[^\/]+\/members$/)) {
  // Handle /api/contact-lists/:id/members
} else if (path.match(/^\/api\/contact-lists\/[^\/]+$/)) {
  // Handle /api/contact-lists/:id
}
```

### Authentication

All admin endpoints require `Authorization: Bearer <ADMIN_API_KEY>` header. Check via `isAuthorized(request, env)` from `lib/auth.ts`.

### Database Queries

Uses Cloudflare D1 (SQLite) with parameterized queries:

```typescript
const result = await env.DB.prepare(
  'SELECT * FROM subscribers WHERE id = ?'
).bind(subscriberId).first<Subscriber>();
```

### Dual-Perspective API (Contact Lists)

Contact list member management provides both perspectives:
- **List-centric:** `/api/contact-lists/:listId/members` - manage members of a list
- **Subscriber-centric:** `/api/subscribers/:subscriberId/lists` - manage lists for a subscriber

### Soft Delete Pattern

- `is_active` flag for signup_pages and sequences
- `is_enabled` flag for sequence_steps
- Contact list members use CASCADE DELETE (actual deletion)

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| subscribers | Email subscribers with status (pending/active/unsubscribed) |
| campaigns | Email campaigns with scheduling support |
| sequences | Step email sequences with delay configuration |
| sequence_steps | Individual steps within sequences |
| contact_lists | Subscriber segmentation lists |
| contact_list_members | Many-to-many join table |
| delivery_logs | Email delivery tracking (opens, clicks, bounces) |
| click_events | Individual URL click records |
| signup_pages | Dynamic signup page configurations |

## Testing

Tests use `@cloudflare/vitest-pool-workers` for D1 mocking. Test setup in `src/__tests__/setup.ts` creates fresh tables for each test.

```typescript
// Pattern: describe blocks for route, nested for specific function
describe('Contact Lists API', () => {
  describe('createContactList', () => {
    it('should create a contact list', async () => {
      // Arrange, Act, Assert
    });
  });
});
```

## Environment Variables

Configured in `wrangler.toml` (vars) and secrets (via `wrangler secret put`):

| Variable | Type | Purpose |
|----------|------|---------|
| DB | Binding | D1 database connection |
| RESEND_API_KEY | Secret | Email sending via Resend |
| ADMIN_API_KEY | Secret | Admin endpoint authentication |
| TURNSTILE_SECRET_KEY | Secret | Cloudflare Turnstile verification |
| RESEND_WEBHOOK_SECRET | Secret | Webhook signature verification |
| ALLOWED_ORIGIN | Var | CORS origin (https://edgeshift.tech) |
| SITE_URL | Var | Base URL for email links |

## Common Tasks

### Adding a New API Endpoint

1. Create handler function in appropriate `routes/*.ts` file
2. Add TypeScript interfaces to `types.ts` if needed
3. Register route in `index.ts` (watch for pattern ordering)
4. Add tests in `src/__tests__/*.test.ts`
5. Run `npm test` to verify

### Schema Changes

1. Update `schema.sql` with new table/column (use `IF NOT EXISTS`)
2. Apply locally: `npm run db:migrate`
3. Apply to prod: `npx wrangler d1 execute edgeshift-newsletter --remote --file=./schema.sql`
4. For existing columns, use ALTER TABLE manually

### Debugging Production

```bash
# View recent logs
wrangler tail

# Check D1 data
npx wrangler d1 execute edgeshift-newsletter --remote --command="SELECT * FROM subscribers LIMIT 10"
```
