# EdgeShift Portfolio - PRD (Product Requirements Document)

## Overview

| Item | Value |
|:-----|:------|
| **Project** | EdgeShift Portfolio |
| **Type** | Static Site |
| **Status** | Phase 1 (MVP) |
| **Created** | 2025-12-20 |

## Goals

1. **Portfolio showcase** - Display projects, skills, achievements
2. **Brand homepage** - EdgeShift introduction, services overview
3. **Social hub** - Links to X, Zenn, GitHub, LinkedIn
4. **Contact point** - Contact form (Phase 2)

## Target Users

- Potential clients looking for cloud/AI solutions
- Recruiters evaluating technical skills
- Technical community (blog readers)

## Core Features

### Phase 1 (MVP) - Current

| Feature | Description | Priority |
|:--------|:------------|:---------|
| Landing Page | Hero section, featured projects, tech stack | High |
| About Page | Profile, expertise, certifications | High |
| Portfolio List | Project cards with tags | High |
| Blog Links | External links to Zenn, Note | Medium |
| Social Links | X, GitHub, LinkedIn, Zenn | High |

### Phase 2 (Polish)

| Feature | Description | Priority |
|:--------|:------------|:---------|
| Custom Domain | edgeshift.dev | High |
| Contact Form | Formspree or CF Workers | Medium |
| SEO/OGP | Meta tags, sitemap, robots.txt | Medium |
| Analytics | Cloudflare Web Analytics | Low |

## Non-Functional Requirements

| Requirement | Target |
|:------------|:-------|
| Performance | Lighthouse Score 90+ |
| Accessibility | WCAG 2.1 AA |
| Mobile | Responsive design |
| Build Time | < 30 seconds |

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| Framework | Astro (SSG) |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |
| Hosting | Cloudflare Pages |
| IaC | Terraform |
| CI/CD | GitHub Actions |

## Success Metrics

- [ ] Site deployed and accessible
- [ ] All pages render correctly
- [ ] Mobile responsive
- [ ] Lighthouse performance 90+
- [ ] 3+ portfolio projects displayed

## References

- Platform Overview: `docs/EdgeVault/10_Projects/30_Freelance/10_Platform/platform-overview.md`
- Portfolio Spec: `docs/EdgeVault/10_Projects/30_Freelance/10_Platform/services/01_portfolio.md`
