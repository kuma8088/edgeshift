# TODO: ADMIN_API_KEY Required for E2E Tests

## Status
The E2E test implementation is complete but requires the ADMIN_API_KEY to be set in `.env.local`.

## Action Required

1. Retrieve or create ADMIN_API_KEY:
   ```bash
   cd workers/newsletter
   npx wrangler secret put ADMIN_API_KEY
   # Enter your admin API key when prompted
   ```

2. Add to `.env.local`:
   ```bash
   echo "ADMIN_API_KEY=<your-key-here>" > .env.local
   ```

3. Run the test:
   ```bash
   npm run test:e2e
   ```

## Why It's Needed
The E2E test needs to trigger the cron job manually to process sequences immediately instead of waiting for the 15-minute schedule. This requires authentication via the ADMIN_API_KEY.

## Alternative (Without Manual Cron Trigger)
If you want to run a basic test without the sequence delivery verification:
- The test will pass up to Step 7 (subscriber confirmation)
- Step 8-9 (sequence delivery) will timeout without the ADMIN_API_KEY
- You can wait for the natural cron schedule (every 15 minutes) to process sequences
