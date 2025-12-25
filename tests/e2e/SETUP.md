# E2E Test Setup

## Prerequisites

### 1. Install Dependencies

```bash
npm install
npx playwright install
```

### 2. Setup Environment Variables

Create `.env.local` in the project root:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your ADMIN_API_KEY:

```env
ADMIN_API_KEY=your-actual-admin-api-key-here
```

**Getting the ADMIN_API_KEY:**

The ADMIN_API_KEY is stored as a Wrangler secret. To retrieve it or reset it:

```bash
# In workers/newsletter directory
cd workers/newsletter

# Set new key (if you want to create a new one)
npx wrangler secret put ADMIN_API_KEY

# Or check if it exists
npx wrangler secret list
```

### 3. Authenticate with Wrangler

The tests use Wrangler CLI to query D1 database:

```bash
npx wrangler login
```

### 4. Verify Setup

Test D1 connection:

```bash
cd workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --remote --command "SELECT COUNT(*) as count FROM subscribers"
```

Expected output: JSON with count value

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test
npx playwright test tests/e2e/specs/01-signup-sequence.spec.ts

# Run with UI
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug
```

## Important Notes

- Tests run against **production environment** (edgeshift.tech)
- Test emails use pattern: `test+<timestamp>@edgeshift.tech`
- Cleanup script should be run periodically: `npm run test:e2e:cleanup`
- Turnstile verification is automatically skipped for test emails
