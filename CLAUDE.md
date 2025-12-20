# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EdgeShift Portfolio - Personal portfolio and services website built with Astro and deployed to Cloudflare Pages.

## Tech Stack

- **Framework**: Astro (SSG mode)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Hosting**: Cloudflare Pages
- **IaC**: Terraform (Cloudflare provider)

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run check
```

## Project Structure

```
src/
├── pages/           # Route pages (.astro files)
│   ├── index.astro  # Landing page
│   ├── about.astro  # About page
│   ├── portfolio/   # Portfolio section
│   └── blog/        # Blog links
├── components/      # Reusable components
│   ├── Header.astro
│   └── Footer.astro
├── layouts/         # Page layouts
│   └── BaseLayout.astro
├── content/         # Markdown content (Content Collections)
│   └── portfolio/   # Portfolio project descriptions
└── styles/
    └── global.css   # Tailwind imports

terraform/           # Infrastructure as Code
├── environments/    # dev, prod configurations
└── modules/         # Reusable modules

docs/                # Project documentation
```

## Portfolio Content Source

Reference these projects for portfolio descriptions:
- `../../prod/mealmgtsystem/` - Meal Management System (AWS Lambda + DynamoDB)
- `../../prod/inquiry-system/` - Inquiry System (AWS Step Functions)

## Deployment

- **Preview**: PR branches → `pr-{number}.edgeshift.pages.dev`
- **Production**: `main` branch → `edgeshift.pages.dev` (→ `edgeshift.dev` after domain setup)

## Key Conventions

- Pages use `.astro` extension
- Components are in `src/components/`
- Content Collections for portfolio items in `src/content/portfolio/`
- Tailwind v4 syntax (use `@import "tailwindcss"` not `@tailwind` directives)

## Phase Roadmap

| Phase | Focus | Status |
|:------|:------|:-------|
| Phase 1 | MVP Portfolio | Current |
| Phase 2 | Custom domain, Contact form, SEO | Planned |
| Phase 3 | Blog integration | Future |
