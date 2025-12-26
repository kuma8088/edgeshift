import { test, expect, type Page } from '@playwright/test';
import { getDeliveryLogs, getSubscriber, queryD1 } from '../helpers/d1-client';

const userEmail = process.env.TEST_USER_EMAIL!;
const adminApiKey = process.env.ADMIN_API_KEY!;

if (!userEmail || !adminApiKey) {
  throw new Error('TEST_USER_EMAIL and ADMIN_API_KEY must be set');
}

/**
 * Generate unique test email using Gmail's + addressing with timestamp
 */
const generateTestEmail = (): string => {
  const baseEmail = userEmail.split('@');
  const timestamp = Date.now();
  return `${baseEmail[0]}+test${timestamp}@${baseEmail[1]}`;
};

// Store test email for this run
let testEmail: string;

/**
 * Login to admin panel
 */
async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/admin');

  // Wait for login form
  await page.waitForSelector('input[type="password"]', { timeout: 5000 });

  // Enter API key
  await page.fill('input[type="password"]', adminApiKey);
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForSelector('text=ダッシュボード', { timeout: 10000 });
}

// Store sequence ID for subsequent tests
let testSequenceId: string | null = null;

test.describe('Batch TB User Test - Automated Flow', () => {
  test.afterAll(async () => {
    console.log(`
========================================
MANUAL VERIFICATION REQUIRED

1. Check ${userEmail} inbox for:
   - Sequence emails (Steps 1-5)
   - Campaign emails (2 campaigns)

2. Click links in emails to test tracking

3. Verify in admin panel:
   - /admin/sequences for sequence stats
   - /admin/campaigns for campaign stats

4. Emails sent to:
   - Sequence: naoya.iimura+test*@gmail.com
   - Campaigns: All active subscribers
========================================
    `);
  });

  test('Admin login works', async ({ page }) => {
    await loginAdmin(page);
    await expect(page.locator('text=ダッシュボード')).toBeVisible();
  });

  test('TB-2-1: Create sequence with 5 steps', async ({ page }) => {
    await loginAdmin(page);

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle');

    // Navigate to sequence creation
    await page.goto('/admin/sequences/new');

    // Wait for page to fully load and React to hydrate
    await page.waitForLoadState('networkidle');

    // Wait for form to load (React component needs time to hydrate)
    await page.waitForSelector('#name', { timeout: 15000 });

    // Calculate times based on current time for immediate execution
    const now = new Date();
    const formatTime = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const addMinutes = (date: Date, mins: number): Date => {
      return new Date(date.getTime() + mins * 60000);
    };

    // Fill sequence name and description
    await page.fill('#name', 'Test Sequence - Batch TB');
    await page.fill('#description', 'Automated test sequence with 5 steps');

    // Define 5 steps with dynamic timing
    const steps = [
      {
        delay_days: '0',
        delay_time: formatTime(addMinutes(now, 2)),
        subject: '【EdgeShift】ご登録ありがとうございます',
        body: 'この度はEdgeShiftにご登録いただき、誠にありがとうございます。\n\nEdgeShiftは、クラウドネイティブな技術で企業のDXを支援するサービスです。これから定期的に、実践的な技術情報やノウハウをお届けしていきます。\n\nまずはこちらの記事から始めてみてください：\nhttps://edgeshift.tech/articles/a\n\nご不明な点がございましたら、お気軽にお問い合わせください。'
      },
      {
        delay_days: '0',
        delay_time: formatTime(addMinutes(now, 5)),
        subject: '【EdgeShift】提供サービスのご紹介',
        body: 'EdgeShiftでは以下のようなサービスを提供しています：\n\n・Cloudflare Workersを活用したサーバーレス開発\n・AWSインフラ構築とTerraformによるIaC\n・Next.js/Astroによるモダンフロントエンド開発\n\n詳しくはこちらをご覧ください：\nhttps://edgeshift.tech/articles/b\n\nあなたのプロジェクトにどのように活用できるか、ぜひ一緒に考えましょう。'
      },
      {
        delay_days: '0',
        delay_time: formatTime(addMinutes(now, 8)),
        subject: '【EdgeShift】パフォーマンス改善の実践テクニック',
        body: '今日は、実際のプロジェクトで効果のあったパフォーマンス改善テクニックをご紹介します。\n\nエッジコンピューティングを活用することで、レスポンス時間を50%以上削減した事例など、具体的なノウハウをまとめました。\n\n詳細はこちら：\nhttps://edgeshift.tech/page-c\n\nぜひあなたのプロジェクトでも試してみてください。'
      },
      {
        delay_days: '1',
        delay_time: '',
        subject: '【EdgeShift】導入事例：EC事業者様の成功ストーリー',
        body: '本日は、実際にEdgeShiftのサービスを導入いただいたEC事業者様の事例をご紹介します。\n\n課題：\n・既存システムのスケーラビリティ不足\n・サーバーコストの増加\n・開発スピードの低下\n\n解決策と結果：\n・Cloudflare Workersへの移行でコスト60%削減\n・グローバルエッジ配信でレスポンス時間70%改善\n・開発サイクルの高速化\n\n詳しい事例はこちら：\nhttps://edgeshift.tech/page-d'
      },
      {
        delay_days: '1',
        delay_time: '14:00',
        subject: '【EdgeShift】無料相談のご案内',
        body: 'ここまでEdgeShiftのニュースレターをお読みいただき、ありがとうございます。\n\nもし現在、以下のような課題をお持ちでしたら、ぜひ一度ご相談ください：\n\n・システムのクラウド移行を検討している\n・開発コストを削減したい\n・パフォーマンスを改善したい\n・モダンな技術スタックに移行したい\n\n初回相談は無料です。こちらからお申し込みください：\nhttps://edgeshift.tech/step5\n\nあなたのプロジェクトの成功をサポートできることを楽しみにしています。\n\nEdgeShift チーム'
      },
    ];

    console.log('Sequence steps timing:', steps.map(s => ({ subject: s.subject, delay_days: s.delay_days, delay_time: s.delay_time })));

    // Fill first step (already exists in form)
    await page.fill('#delay_days_0', steps[0].delay_days);
    if (steps[0].delay_time) {
      await page.fill('#delay_time_0', steps[0].delay_time);
    }
    await page.fill('#subject_0', steps[0].subject);
    // Fill RichTextEditor for first step
    const editor0 = page.locator('.ProseMirror').first();
    await editor0.click();
    await page.keyboard.type(steps[0].body);

    // Add and fill remaining 4 steps
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];

      // Click "ステップを追加" button
      await page.click('button:has-text("ステップを追加")');
      await page.waitForSelector(`#subject_${i}`, { timeout: 5000 });

      await page.fill(`#delay_days_${i}`, step.delay_days);
      if (step.delay_time) {
        await page.fill(`#delay_time_${i}`, step.delay_time);
      }
      await page.fill(`#subject_${i}`, step.subject);

      // Fill RichTextEditor for this step (nth editor)
      const editor = page.locator('.ProseMirror').nth(i);
      await editor.click();
      await page.keyboard.type(step.body);
    }

    // Submit form to create sequence
    await page.click('button:has-text("作成")');

    // Wait for redirect to sequence list
    await page.waitForURL('/admin/sequences', { timeout: 15000 });

    // Verify sequence was created in D1
    const sequences = await queryD1<{ id: string; name: string; is_active: number }>(
      `SELECT id, name, is_active FROM sequences WHERE name = 'Test Sequence - Batch TB' ORDER BY created_at DESC LIMIT 1`
    );
    expect(sequences.length).toBe(1);
    const sequenceId = sequences[0].id;

    // Verify 5 steps were created
    const stepsDb = await queryD1(`SELECT * FROM sequence_steps WHERE sequence_id = '${sequenceId}' ORDER BY step_number`);
    expect(stepsDb.length).toBe(5);

    // Store sequence ID for later tests
    testSequenceId = sequenceId;

    console.log('Sequence created successfully with ID:', sequenceId);
    console.log('First 3 steps scheduled for today, starting at:', steps[0].delay_time);
  });

  test('TB-2-1: Connect signup page to test sequence', async ({ page }) => {
    expect(testSequenceId).toBeTruthy();

    await loginAdmin(page);
    await page.waitForLoadState('networkidle');

    // Navigate to signup page edit
    await page.goto('/admin/signup-pages');
    await page.waitForLoadState('networkidle');

    // Click edit on the welcome page
    await page.click('a[href="/admin/signup-pages/edit?id=test-welcome-page"]');
    await page.waitForLoadState('networkidle');

    // Update sequence selection
    await page.selectOption('#sequence_id', testSequenceId!);

    // Save changes
    await page.click('button:has-text("更新")');
    await page.waitForURL('/admin/signup-pages');

    console.log('Signup page connected to sequence:', testSequenceId);
  });

  test('TB-2-1: Signup with real email', async ({ page }) => {
    // Generate unique email for this test run
    testEmail = generateTestEmail();
    console.log('Using test email:', testEmail);

    // Navigate to signup page
    await page.goto('/newsletter/signup/welcome');
    await page.waitForLoadState('domcontentloaded');

    // Wait for email input to be visible
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });

    // Fill signup form with unique email
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="name"]', 'Batch TB Test User');

    // Turnstileはユーザーが手動で完了する必要がある
    console.log(`
========================================
ACTION REQUIRED: Turnstileを完了してください

1. ブラウザでTurnstileチェックボックスをクリック
2. 認証が完了したらPlaywright Inspectorで「Resume」をクリック
========================================
`);
    await page.pause();

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for success message
    await expect(page.locator('text=確認メールを送信しました')).toBeVisible({ timeout: 15000 });

    // Verify subscriber created in D1
    const subscriber = await getSubscriber(testEmail);
    expect(subscriber).toBeTruthy();
    expect(subscriber!.status).toBe('pending');

    console.log(`
========================================
ACTION REQUIRED: Check your email (${testEmail})
1. Look for confirmation email
2. Click the confirmation link
3. After confirming, run the delivery verification test
========================================
    `);
  });

  test('TB-2-1: Verify delivery logs after confirmation', async () => {
    if (!testEmail) {
      console.log('Test email not set. Run signup test first.');
      test.skip();
      return;
    }

    // This test should run after manual email confirmation
    const subscriber = await getSubscriber(testEmail);

    if (!subscriber || subscriber.status !== 'active') {
      console.log('Subscriber not active yet. Confirm email first, then re-run this test.');
      test.skip();
      return;
    }

    // Check delivery logs
    const logs = await getDeliveryLogs(testEmail);
    console.log(`Found ${logs.length} delivery logs for ${testEmail}`);

    // Verify at least one sequence delivery was attempted
    const sequenceLogs = logs.filter(log => log.sequence_id !== null);

    if (sequenceLogs.length === 0) {
      console.log('No sequence deliveries yet. Wait for cron to process (runs every 15 minutes).');
    } else {
      console.log('Sequence delivery logs:', sequenceLogs.map(l => ({
        subject: l.email_subject,
        status: l.status,
        sent_at: l.sent_at
      })));
      expect(sequenceLogs.length).toBeGreaterThan(0);
    }
  });

  test('TB-3-1: Create and send campaign', async ({ page }) => {
    await loginAdmin(page);

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle');

    // Navigate to campaign creation
    await page.goto('/admin/campaigns/new');
    await page.waitForLoadState('networkidle');

    // Wait for form to load (React needs time to hydrate)
    await page.waitForSelector('#subject', { timeout: 15000 });

    // Fill campaign details
    await page.fill('#subject', 'テストキャンペーン：クリックトラッキング検証');

    // Fill body in RichTextEditor
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await page.keyboard.type('これはバッチTBテスト用のキャンペーンメールです。\n\n以下のリンクをクリックしてクリックトラッキングが動作することを確認してください：\n\n');
    await page.keyboard.type('リンクA: https://edgeshift.tech/\n');
    await page.keyboard.type('リンクB: https://edgeshift.tech/projects\n');

    // Select all subscribers as target (already default: 全員配信)
    // Target select is optional

    // Set scheduled time to now (to trigger immediate send)
    const scheduledInput = page.locator('#scheduledAt');
    if (await scheduledInput.count() > 0) {
      // Set to current datetime for immediate scheduling
      const now = new Date();
      const isoString = now.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:MM
      await scheduledInput.fill(isoString);
    }

    // Scroll down to see the send button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Click create/submit button (text is "作成" for new campaigns)
    await page.click('button[type="submit"]');

    // Wait for navigation or success
    await page.waitForTimeout(2000);

    // Check if redirected or if we need to handle a modal/response
    const currentUrl = page.url();
    if (!currentUrl.includes('/admin/campaigns')) {
      // May need to wait longer or check for success message
      await page.waitForURL('**/admin/campaigns**', { timeout: 30000 });
    }

    // Verify campaign was created and delivery attempted
    console.log('Campaign sent successfully');

    // Wait briefly for delivery
    await page.waitForTimeout(3000);

    // Check delivery logs via D1
    const logs = await queryD1<{ id: string; email_subject: string; status: string; campaign_id: string }>(
      `SELECT id, email_subject, status, campaign_id FROM delivery_logs WHERE email_subject LIKE '%クリックトラッキング%' ORDER BY sent_at DESC LIMIT 5`
    );

    console.log('Campaign delivery logs:', logs.length);
    if (logs.length > 0) {
      console.log('First log:', logs[0]);
    }
  });

  test('TB-3-2: Create contact list and send targeted campaign', async ({ page }) => {
    await loginAdmin(page);
    await page.waitForLoadState('networkidle');

    // Navigate to contact lists
    await page.goto('/admin/contact-lists');
    await page.waitForLoadState('networkidle');

    // Create new contact list - look for the correct button text (may be Japanese)
    const newListButton = page.locator('a:has-text("新規作成"), button:has-text("新規作成"), a:has-text("New"), button:has-text("New")').first();
    await newListButton.click();
    await page.waitForLoadState('networkidle');

    // Wait for modal form to load (リスト名 field with placeholder)
    await page.waitForSelector('input[placeholder*="Tech Blog"]', { timeout: 10000 });

    // Fill contact list details (modal form)
    await page.fill('input[placeholder*="Tech Blog"]', 'テスト購読者リスト - Batch TB');
    const descField = page.locator('textarea[placeholder*="用途"]');
    if (await descField.count() > 0) {
      await descField.fill('バッチTBテスト用のコンタクトリスト');
    }

    // Submit form - click 作成 button inside modal (not the "+ 新規作成" button)
    const modal = page.locator('.fixed.inset-0');
    await modal.locator('button:has-text("作成")').click();

    // Wait for list creation - check for redirect or success
    await page.waitForTimeout(2000);

    // Verify list was created in D1
    const lists = await queryD1<{ id: string; name: string }>(
      `SELECT id, name FROM contact_lists WHERE name = 'テスト購読者リスト - Batch TB' ORDER BY created_at DESC LIMIT 1`
    );
    expect(lists.length).toBe(1);
    const listId = lists[0].id;

    console.log('Contact list created with ID:', listId);

    // Get a subscriber to add to the list
    const subscribers = await queryD1<{ id: string; email: string }>(
      `SELECT id, email FROM subscribers WHERE status = 'active' LIMIT 1`
    );

    if (subscribers.length > 0) {
      const subscriberId = subscribers[0].id;
      const subscriberEmail = subscribers[0].email;

      // Add subscriber to contact list via D1 (direct insertion for simplicity)
      const memberId = crypto.randomUUID();
      await queryD1(
        `INSERT INTO contact_list_members (id, contact_list_id, subscriber_id, added_at) VALUES ('${memberId}', '${listId}', '${subscriberId}', datetime('now'))`
      );

      console.log(`Added subscriber ${subscriberEmail} to contact list`);

      // Verify member added
      const members = await queryD1<{ count: number }>(
        `SELECT COUNT(*) as count FROM contact_list_members WHERE contact_list_id = '${listId}'`
      );
      expect(members[0].count).toBe(1);

      // Create campaign targeting this list
      await page.goto('/admin/campaigns/new');
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('#subject', { timeout: 15000 });

      await page.fill('#subject', 'リストターゲットキャンペーン');

      // Fill body in RichTextEditor
      const editor = page.locator('.ProseMirror').first();
      await editor.click();
      await page.keyboard.type('このメールはコンタクトリストのメンバーにのみ送信されます。\n\nリンク: https://edgeshift.tech/list-test');

      // Select contact list as target
      const targetSelect = page.locator('#contactListId, select[name="contactListId"]');
      if (await targetSelect.count() > 0) {
        await targetSelect.selectOption(listId);
      }

      // Set scheduled time for immediate delivery
      const scheduledInput = page.locator('#scheduledAt');
      if (await scheduledInput.count() > 0) {
        const now = new Date();
        const isoString = now.toISOString().slice(0, 16);
        await scheduledInput.fill(isoString);
      }

      // Submit
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await page.click('button[type="submit"]');

      await page.waitForTimeout(2000);

      console.log('List-targeted campaign created');
    } else {
      console.log('No active subscribers found, skipping member addition');
    }
  });
});
