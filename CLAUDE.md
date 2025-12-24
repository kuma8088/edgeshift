# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EdgeShift Portfolio - Personal portfolio and services website built with Astro and deployed to Cloudflare Pages, with serverless backend on Cloudflare Workers.

**Live Site:** https://edgeshift.tech

## Tech Stack

| Layer | Technology |
|:--|:--|
| Framework | Astro (SSG) + React (islands) |
| Styling | Tailwind CSS v4 |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Email | Resend API |
| Hosting | Cloudflare Pages |
| IaC | Terraform (Cloudflare provider) |

## Development Commands

```bash
# Frontend (Astro)
npm run dev          # Start development server
npm run build        # Build for production
npm run check        # Type check

# Newsletter Worker
cd workers/newsletter
npm run dev          # Start local worker (with D1 local)
npm run deploy       # Deploy to Cloudflare
npm run db:migrate   # Apply schema to local D1
npm run db:migrate:prod  # Apply schema to production D1
npm run test         # Run tests

# Contact Form Worker
cd workers/contact-form
npm run dev
npm run deploy
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Astro (SSG)                                              │  │
│  │  ├── Landing page (/)                                     │  │
│  │  ├── Newsletter signup (/newsletter/*)                    │  │
│  │  └── Admin dashboard (/admin/*)  ← React islands          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                           │
│  ┌────────────────────────┐  ┌────────────────────────────┐    │
│  │  Newsletter Worker     │  │  Contact Form Worker       │    │
│  │  /api/subscribers      │  │  /api/contact              │    │
│  │  /api/campaigns        │  │                            │    │
│  │  /api/sequences        │  │                            │    │
│  │  /api/webhooks/resend  │  │                            │    │
│  └──────────┬─────────────┘  └──────────┬─────────────────┘    │
│             │                            │                      │
│             ▼                            ▼                      │
│  ┌────────────────────────┐  ┌────────────────────────────┐    │
│  │  D1 Database           │  │  Resend API                │    │
│  │  (subscribers,         │  │  (email sending)           │    │
│  │   campaigns,           │  │                            │    │
│  │   sequences, etc.)     │  │                            │    │
│  └────────────────────────┘  └────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Patterns

### Astro + React Islands

Admin pages use React components with Astro's `client:load` directive:

```astro
---
import AdminLayout from '../layouts/AdminLayout.astro';
import MyForm from '../components/admin/MyForm';
---
<AdminLayout>
  <MyForm client:load />
</AdminLayout>
```

**Important:** Do NOT use `<script>` tags with manual `createRoot()` mounting. Use `client:load` instead.

### API Routing (Newsletter Worker)

Routes are defined in `workers/newsletter/src/index.ts` with Hono-like pattern:

```typescript
router.get('/api/campaigns', auth, handleGetCampaigns);
router.post('/api/campaigns', auth, handleCreateCampaign);
```

### D1 Schema Changes

When modifying schema:
1. Update `workers/newsletter/schema.sql`
2. Apply to local: `npm run db:migrate`
3. Apply to prod: `npm run db:migrate:prod` or use ALTER TABLE

## Project Structure

```
edgeshift/
├── src/
│   ├── pages/
│   │   ├── index.astro           # Landing
│   │   ├── newsletter/           # Newsletter signup/confirm
│   │   └── admin/                # Admin dashboard
│   │       ├── campaigns/        # Campaign CRUD
│   │       ├── sequences/        # Sequence CRUD
│   │       └── subscribers/      # Subscriber list
│   ├── components/
│   │   └── admin/                # React components for admin
│   └── utils/
│       └── admin-api.ts          # API client for admin
├── workers/
│   ├── newsletter/               # Newsletter backend
│   │   ├── src/
│   │   │   ├── index.ts          # Entry + routing
│   │   │   ├── routes/           # Route handlers
│   │   │   └── scheduled.ts      # Cron handler
│   │   ├── schema.sql            # D1 schema
│   │   └── wrangler.toml         # Worker config
│   └── contact-form/             # Contact form backend
├── terraform/
│   └── environments/prod/        # Cloudflare IaC
└── package.json
```

## Deployment

- **Pages (Frontend):** Push to `main` → auto-deploy to `edgeshift.tech`
- **Workers:** Manual deploy via `wrangler deploy`

```bash
# Deploy newsletter worker
cd workers/newsletter && npm run deploy

# Deploy pages (if not using CI)
npm run build && npx wrangler pages deploy dist --project-name edgeshift
```

## Environment & Secrets

### Newsletter Worker Secrets (set via `wrangler secret put`)
- `RESEND_API_KEY` - Resend API key
- `ADMIN_API_KEY` - Admin authentication key
- `RESEND_WEBHOOK_SECRET` - Webhook signature verification

### Terraform Variables
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
