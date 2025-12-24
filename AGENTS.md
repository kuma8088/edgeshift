# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Astro site, including pages (`src/pages`), layouts (`src/layouts`), and shared components (`src/components`). Admin UI lives under `src/pages/admin` and uses React islands.
- `public/` holds static assets (favicons, images, robots.txt).
- `workers/` contains Cloudflare Workers backends: `workers/newsletter` and `workers/contact-form`.
- `terraform/` manages Cloudflare infrastructure for production.
- `docs/` and `documents/` hold internal planning notes (some content may be gitignored).

## Build, Test, and Development Commands
- `npm run dev` runs the Astro dev server.
- `npm run build` builds the production site to `dist/`.
- `npm run preview` serves the production build locally.
- `npm run check` runs `astro check` (type checking).
- `npm run lint` runs ESLint for `src` (`.ts` and `.astro`).
- `npm run format` formats with Prettier.
- `cd workers/newsletter && npm run dev` runs the newsletter worker locally.
- `cd workers/newsletter && npm run test` runs Vitest tests.
- `cd workers/newsletter && npm run db:migrate` applies D1 schema locally.
- `cd workers/contact-form && npm run dev` runs the contact form worker locally.

## Coding Style & Naming Conventions
- Use 2-space indentation and single quotes in JS/TS/Astro.
- Keep Astro frontmatter at the top of `.astro` files and use semicolons for JS/TS.
- Prefer Tailwind utilities and shared styles in `src/styles/global.css`.
- For admin pages, use `client:load` islands instead of manual `createRoot()` mounting.

## Testing Guidelines
- Worker tests live in `workers/newsletter/src/__tests__/` and follow `*.test.ts` naming.
- Use `npm run test` (Vitest). No explicit coverage thresholds are defined.
- For UI changes, consider a quick manual pass on `/` and `/admin/*`.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Keep subjects short and imperative; add a scope when useful (e.g., `feat(worker): ...`).
- PRs should include a clear summary, linked issues (if any), and screenshots for UI changes. Note test results or why tests were skipped.

## Security & Configuration Tips
- Worker secrets are managed via `wrangler secret put` (e.g., `RESEND_API_KEY`, `ADMIN_API_KEY`).
- Cloudflare Pages uses `PUBLIC_` prefixed vars for client-side exposure (e.g., `PUBLIC_TURNSTILE_SITE_KEY`).
- Terraform requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
