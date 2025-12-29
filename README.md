# EdgeShift Portfolio

> DX でビジネスのエッジを変化させる - Personal portfolio and newsletter platform

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflare)](https://edgeshift.tech)

## Overview

EdgeShift は、クラウドネイティブ開発とサーバーレスアーキテクチャを専門とするフリーランスエンジニアのポートフォリオサイトです。ニュースレター配信システムを内蔵し、購読者管理、メールシーケンス、キャンペーン配信を完全サーバーレスで実現しています。

**Live Site:** [edgeshift.tech](https://edgeshift.tech)

## Tech Stack

| Layer | Technology |
|:--|:--|
| Framework | [Astro](https://astro.build/) (SSG + SSR) |
| UI Components | React (islands architecture) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v4 |
| Language | TypeScript |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Email | [Resend](https://resend.com/) API |
| Hosting | Cloudflare Pages |
| IaC | Terraform + Wrangler |

## Architecture

![EdgeShift Architecture](./architecture.png)

## Project Structure

```
edgeshift/
├── src/
│   ├── pages/
│   │   ├── index.astro              # Landing page
│   │   ├── newsletter/              # Newsletter signup flow
│   │   │   ├── signup/[slug].astro  # Dynamic signup pages (SSR)
│   │   │   ├── embed/[slug].astro   # Embeddable signup forms
│   │   │   ├── archive/             # Newsletter archive (public)
│   │   │   ├── referrals/[code].astro  # Referral landing page
│   │   │   ├── confirm.astro        # Email confirmation
│   │   │   └── feed.xml.ts          # RSS feed
│   │   └── admin/                   # Admin dashboard
│   │       ├── index.astro          # Dashboard home
│   │       ├── campaigns/           # Newsletter (campaign) management
│   │       ├── sequences/           # Email sequence management
│   │       ├── contact-lists/       # Subscriber segmentation
│   │       ├── signup-pages/        # Signup page builder
│   │       ├── brand-settings/      # Brand customization
│   │       ├── referrals/           # Referral program management
│   │       └── analytics/           # Analytics dashboard
│   ├── components/
│   │   ├── admin/                   # React components for admin
│   │   │   ├── Dashboard.tsx
│   │   │   ├── SequenceForm.tsx
│   │   │   ├── RichTextEditor.tsx
│   │   │   ├── TemplateSelector.tsx
│   │   │   ├── BrandSettingsForm.tsx
│   │   │   ├── ReferralDashboard.tsx
│   │   │   └── ...
│   │   └── *.astro                  # Static components
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── AdminLayout.astro
│   └── utils/
│       └── admin-api.ts             # API client for admin
├── workers/
│   ├── newsletter/                  # Newsletter backend
│   │   ├── src/
│   │   │   ├── index.ts             # Entry + routing
│   │   │   ├── types.ts             # TypeScript interfaces
│   │   │   ├── scheduled.ts         # Cron handler (sequence processing)
│   │   │   ├── lib/                 # Utilities
│   │   │   │   ├── auth.ts          # Authentication helpers
│   │   │   │   ├── email.ts         # Email sending with Resend
│   │   │   │   └── templates/       # Email template system
│   │   │   │       ├── index.ts     # Template renderer
│   │   │   │       ├── variables.ts # Variable replacement
│   │   │   │       └── presets/     # 5 template presets
│   │   │   └── routes/              # API handlers
│   │   │       ├── subscribe.ts     # Subscribe/confirm flow
│   │   │       ├── campaigns.ts     # Campaign CRUD
│   │   │       ├── sequences.ts     # Sequence CRUD
│   │   │       ├── templates.ts     # Template management
│   │   │       ├── brand-settings.ts # Brand settings API
│   │   │       ├── archive.ts       # Archive API (public)
│   │   │       ├── referral.ts      # Referral program API
│   │   │       ├── tracking.ts      # Open/click tracking
│   │   │       └── webhook.ts       # Resend webhook handler
│   │   ├── schema.sql               # D1 database schema
│   │   ├── migrations/              # Schema migrations
│   │   └── wrangler.toml
│   └── contact-form/                # Contact form backend
├── terraform/
│   └── environments/prod/
├── tests/
│   └── e2e/                         # Playwright E2E tests
├── docs/
│   └── plans/                       # Implementation plans
├── astro.config.mjs
├── tailwind.config.js
└── package.json
```

## Features

### Portfolio
- **Portfolio Showcase** - Projects, skills, and achievements
- **Contact Form** - Serverless form handling with email notifications
- **SEO Optimized** - OGP, Twitter Card, sitemap, robots.txt
- **Analytics** - Cloudflare Web Analytics

### Newsletter System
- **Subscriber Management** - Double opt-in with email confirmation
- **Email Sequences** - Automated drip campaigns with flexible timing
  - Day-based delays with specific send times
  - Minute-based delays for immediate/quick follow-ups
  - Per-step customization
- **Newsletter Campaigns** - One-time broadcast emails
- **Contact Lists** - Subscriber segmentation for targeted delivery
- **Signup Pages** - Customizable landing pages with Turnstile protection
- **Newsletter Archive** - Public archive for published newsletters with RSS feed
- **Email Templates** - 5 customizable presets (Simple, Newsletter, Announcement, Welcome, Product Update)
- **Brand Settings** - Logo, colors, and footer text customization
- **Embed Forms** - Embeddable signup forms for external sites
- **Referral Program** - Milestone-based referral tracking with rewards
- **Analytics Dashboard** - Open rates, click rates, delivery tracking
- **Webhook Integration** - Real-time delivery status via Resend webhooks

### Admin Dashboard
- **Dashboard** - KPIs for subscribers, newsletters, sequences
- **Rich Text Editor** - TipTap-based email composer
- **Sequence Builder** - Visual step management with timeline preview
- **Template Manager** - Email template selection and live preview
- **Brand Settings** - Centralized brand identity management
- **Referral Dashboard** - Milestone management and referral analytics
- **Real-time Preview** - Email preview before sending with template rendering

## Development

```bash
# Install dependencies
npm install

# Start development server (Astro)
npm run dev

# Build for production
npm run build

# Type check
npm run check
```

### Newsletter Worker

```bash
cd workers/newsletter

# Start local development (with D1 local database)
npm run dev

# Run tests
npm test

# Apply schema to local D1
npm run db:migrate

# Deploy to production
npm run deploy

# Apply schema to production D1
npm run db:migrate:prod
```

### E2E Tests

```bash
cd tests/e2e

# Run all E2E tests
npx playwright test

# Run in headed mode (for manual interaction)
npx playwright test --headed
```

## Deployment

### Cloudflare Pages (Frontend)

Deployment is automated via Cloudflare Pages:

- **Preview:** Push to any branch → `<branch>.edgeshift.pages.dev`
- **Production:** Push to `main` → `edgeshift.tech`

### Cloudflare Workers (Backend)

```bash
# Deploy Newsletter Worker
cd workers/newsletter && npm run deploy

# Deploy Contact Form Worker
cd workers/contact-form && npm run deploy
```

### Database Migrations

```bash
# Apply new migration to production
cd workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --remote --file=./migrations/XXXX_migration.sql
```

## Environment Variables

### Cloudflare Pages

| Variable | Description |
|:--|:--|
| `NODE_VERSION` | Node.js version (20) |
| `PUBLIC_API_BASE_URL` | Newsletter Worker API URL |

### Newsletter Worker Secrets

Set via `wrangler secret put <NAME>`:

| Secret | Description |
|:--|:--|
| `RESEND_API_KEY` | Resend API key for email sending |
| `ADMIN_API_KEY` | Admin dashboard authentication |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile verification |
| `RESEND_WEBHOOK_SECRET` | Webhook signature verification |

### Newsletter Worker Vars

Configured in `wrangler.toml`:

| Variable | Description |
|:--|:--|
| `ALLOWED_ORIGIN` | CORS origin (`https://edgeshift.tech`) |
| `SITE_URL` | Base URL for email links |
| `SENDER_NAME` | Email sender name |
| `SENDER_EMAIL` | Email sender address |

## Database Schema

Key tables in D1:

| Table | Description |
|:--|:--|
| `subscribers` | Email subscribers (status: pending/active/unsubscribed, referral code/count) |
| `campaigns` | Newsletter campaigns with scheduling and archive publish flag |
| `sequences` | Email sequences with step configuration |
| `sequence_steps` | Individual steps with delay settings |
| `sequence_enrollments` | Subscriber enrollment tracking |
| `contact_lists` | Subscriber segmentation lists |
| `contact_list_members` | List membership (many-to-many) |
| `signup_pages` | Dynamic signup page configurations |
| `delivery_logs` | Email delivery tracking (opens, clicks, bounces) |
| `click_events` | URL click tracking |
| `brand_settings` | Brand identity settings (logo, colors, default template) |
| `referral_milestones` | Referral program milestone definitions |
| `referral_achievements` | Milestone achievements by subscribers |

## Infrastructure

Terraform manages the Cloudflare configuration:

```bash
cd terraform/environments/prod
terraform init
terraform plan
terraform apply
```

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|:--|:--|:--|
| POST | `/api/subscribe` | Subscribe to newsletter (with optional ref parameter) |
| GET | `/api/confirm` | Confirm email subscription |
| GET | `/api/unsubscribe` | Unsubscribe from newsletter |
| GET | `/api/t/open/:id` | Track email opens (transparent pixel) |
| GET | `/api/t/click/:id` | Track link clicks (redirect proxy) |
| GET | `/api/archive` | Get published newsletter archive list |
| GET | `/api/archive/:slug` | Get single published newsletter by slug |
| GET | `/api/referral/dashboard/:code` | Get referral dashboard data |

### Admin Endpoints (requires `ADMIN_API_KEY`)

| Method | Path | Description |
|:--|:--|:--|
| GET/POST | `/api/subscribers` | Subscriber management |
| GET/POST | `/api/campaigns` | Newsletter campaigns (CRUD) |
| POST | `/api/campaigns/:id/send` | Send/schedule campaign |
| GET/POST | `/api/sequences` | Email sequences (CRUD) |
| GET/POST | `/api/contact-lists` | Contact list management |
| GET/POST | `/api/signup-pages` | Signup page management |
| GET | `/api/templates` | Get available email templates |
| POST | `/api/templates/preview` | Preview template rendering |
| POST | `/api/templates/test-send` | Send test email with template |
| GET/POST | `/api/brand-settings` | Brand settings management |
| GET/POST/PUT/DELETE | `/api/admin/milestones` | Referral milestone management |
| GET | `/api/admin/referral-stats` | Referral program statistics |
| GET | `/api/dashboard/stats` | Dashboard KPIs |
| GET | `/api/analytics` | Campaign/sequence analytics |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contact

- Website: [edgeshift.tech](https://edgeshift.tech)
- Email: contact@edgeshift.tech
