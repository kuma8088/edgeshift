# EdgeShift Portfolio

> DX でビジネスのエッジを変化させる - Personal portfolio and services website

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflare)](https://edgeshift.tech)

## Overview

EdgeShift は、クラウドネイティブ開発とサーバーレスアーキテクチャを専門とするフリーランスエンジニアのポートフォリオサイトです。

**Live Site:** [edgeshift.tech](https://edgeshift.tech)

## Tech Stack

| Layer | Technology |
|:--|:--|
| Framework | [Astro](https://astro.build/) (SSG) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v4 |
| Language | TypeScript |
| Hosting | Cloudflare Pages |
| Contact Form | Cloudflare Workers + [Resend](https://resend.com/) |
| IaC | Terraform (Cloudflare Provider) |

## Project Structure

```
edgeshift/
├── src/
│   ├── pages/
│   │   └── index.astro        # Landing page
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── ContactForm.astro
│   ├── layouts/
│   │   └── BaseLayout.astro   # SEO, OGP meta tags
│   └── styles/
│       └── global.css
├── public/
│   ├── favicon.svg
│   ├── og-image.png           # OGP image
│   └── robots.txt
├── workers/
│   └── contact-form/          # Contact form Worker
├── terraform/
│   ├── environments/prod/
│   └── modules/cloudflare-pages/
├── documents/                  # Internal docs (gitignored)
├── astro.config.mjs
├── tailwind.config.js
└── package.json
```

## Features

- **Portfolio Showcase** - Projects, skills, and achievements
- **Contact Form** - Serverless form handling with email notifications
- **SEO Optimized** - OGP, Twitter Card, sitemap, robots.txt
- **Analytics** - Cloudflare Web Analytics
- **Responsive Design** - Mobile-first approach

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run check
```

## Deployment

Deployment is automated via Cloudflare Pages:

- **Preview:** Push to any branch → `<branch>.edgeshift.pages.dev`
- **Production:** Push to `main` → `edgeshift.tech`

### Manual Deployment

```bash
# Build
npm run build

# Deploy via Wrangler (optional)
npx wrangler pages deploy dist
```

## Environment Variables

### Cloudflare Pages

| Variable | Description |
|:--|:--|
| `NODE_VERSION` | Node.js version (20) |

### Contact Form Worker

| Secret | Description |
|:--|:--|
| `RESEND_API_KEY` | Resend API key for email sending |

## Infrastructure

Terraform manages the Cloudflare Pages configuration:

```bash
cd terraform/environments/prod
terraform init
terraform plan
terraform apply
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contact

- Website: [edgeshift.tech](https://edgeshift.tech)
- Email: contact@edgeshift.tech
