# Sequence Time Specification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add time specification to sequence emails so they send at specific times (e.g., "3 days after signup at 10:00 JST")

**Architecture:** Add `default_send_time` to sequences table (required), `delay_time` to sequence_steps (optional override). Modify sequence-processor to calculate JST-based scheduled time. Update UI with time inputs, drag-and-drop reordering, and timeline preview.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), React, @dnd-kit/core, TypeScript

---

## Task 1: Update Database Schema

**Files:**
- Modify: `workers/newsletter/schema.sql`

**Step 1: Add columns to schema.sql**

Add after existing `sequences` table definition:

```sql
-- Add to sequences table (for new installs)
-- default_send_time TEXT NOT NULL DEFAULT '10:00'

-- Add to sequence_steps table (for new installs)
-- delay_time TEXT
```

Update the CREATE TABLE statements:

```sql
-- Sequences table (for step emails)
CREATE TABLE IF NOT EXISTS sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_send_time TEXT NOT NULL DEFAULT '10:00',
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);
```

```sql
-- Sequence steps table
CREATE TABLE IF NOT EXISTS sequence_steps (
  id TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL,
  delay_time TEXT,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
);
```

**Step 2: Create migration file**

Create: `workers/newsletter/migrations/0002_add_time_specification.sql`

```sql
-- Migration: Add time specification to sequences
-- Run: wrangler d1 execute edgeshift-newsletter --local --file=migrations/0002_add_time_specification.sql

ALTER TABLE sequences ADD COLUMN default_send_time TEXT NOT NULL DEFAULT '10:00';
ALTER TABLE sequence_steps ADD COLUMN delay_time TEXT;
```

**Step 3: Apply migration to local D1**

Run: `cd workers/newsletter && npx wrangler d1 execute edgeshift-newsletter --local --file=migrations/0002_add_time_specification.sql`

Expected: Success message

**Step 4: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/migrations/
git commit -m "feat: add time specification columns to sequences schema"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Update Sequence interface**

Find `Sequence` interface and add `default_send_time`:

```typescript
export interface Sequence {
  id: string;
  name: string;
  description?: string;
  default_send_time: string; // "HH:MM" format, JST
  is_active: number;
  created_at: number;
}
```

**Step 2: Update SequenceStep interface**

Find `SequenceStep` interface and add `delay_time`:

```typescript
export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  delay_time?: string; // "HH:MM" format, JST (optional override)
  subject: string;
  content: string;
  created_at: number;
}
```

**Step 3: Update CreateSequenceRequest interface**

```typescript
export interface CreateSequenceRequest {
  name: string;
  description?: string;
  default_send_time: string; // Required, "HH:MM" format
  steps: {
    delay_days: number;
    delay_time?: string; // Optional, "HH:MM" format
    subject: string;
    content: string;
  }[];
}
```

**Step 4: Update UpdateSequenceRequest interface**

```typescript
export interface UpdateSequenceRequest {
  name?: string;
  description?: string;
  default_send_time?: string;
  is_active?: number;
}
```

**Step 5: Commit**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat: add time specification types"
```

---

## Task 3: Update Sequence Processor with Time Logic

**Files:**
- Modify: `workers/newsletter/src/lib/sequence-processor.ts`
- Test: `workers/newsletter/src/__tests__/sequence-processor.test.ts`

**Step 1: Write failing test for time-based scheduling**

Add to `sequence-processor.test.ts`:

```typescript
describe('Time-based scheduling', () => {
  it('should not send email before scheduled time', async () => {
    // Setup: subscriber enrolled at 2024-01-01 15:00 JST
    // Step: delay_days=1, delay_time=10:00
    // Current time: 2024-01-02 09:00 JST (before 10:00)
    // Expected: No email sent

    const enrolledAt = Date.UTC(2024, 0, 1, 6, 0, 0) / 1000; // 15:00 JST = 06:00 UTC
    const currentTime = Date.UTC(2024, 0, 2, 0, 0, 0) / 1000; // 09:00 JST = 00:00 UTC

    // Insert test data with default_send_time and delay_time
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, default_send_time, is_active)
      VALUES ('seq-1', 'Test Sequence', '10:00', 1)
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
      VALUES ('step-1', 'seq-1', 1, 1, NULL, 'Test Subject', 'Test Content')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'active', 'token-1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES ('ss-1', 'sub-1', 'seq-1', 0, ?)
    `).bind(enrolledAt).run();

    // Mock Date.now to return currentTime
    vi.spyOn(Date, 'now').mockReturnValue(currentTime * 1000);

    await processSequenceEmails(env);

    // Verify no email was sent
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should send email at or after scheduled time', async () => {
    // Setup: subscriber enrolled at 2024-01-01 15:00 JST
    // Step: delay_days=1, default_send_time=10:00
    // Current time: 2024-01-02 10:30 JST (after 10:00)
    // Expected: Email sent

    const enrolledAt = Date.UTC(2024, 0, 1, 6, 0, 0) / 1000; // 15:00 JST = 06:00 UTC
    const currentTime = Date.UTC(2024, 0, 2, 1, 30, 0) / 1000; // 10:30 JST = 01:30 UTC

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, default_send_time, is_active)
      VALUES ('seq-1', 'Test Sequence', '10:00', 1)
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
      VALUES ('step-1', 'seq-1', 1, 1, NULL, 'Test Subject', 'Test Content')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'active', 'token-1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES ('ss-1', 'sub-1', 'seq-1', 0, ?)
    `).bind(enrolledAt).run();

    vi.spyOn(Date, 'now').mockReturnValue(currentTime * 1000);

    await processSequenceEmails(env);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('should use step delay_time over sequence default_send_time', async () => {
    // Step has delay_time=18:30, sequence has default_send_time=10:00
    // Current time: 2024-01-02 12:00 JST
    // Expected: No email (18:30 not reached yet)

    const enrolledAt = Date.UTC(2024, 0, 1, 6, 0, 0) / 1000;
    const currentTime = Date.UTC(2024, 0, 2, 3, 0, 0) / 1000; // 12:00 JST = 03:00 UTC

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, default_send_time, is_active)
      VALUES ('seq-1', 'Test Sequence', '10:00', 1)
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
      VALUES ('step-1', 'seq-1', 1, 1, '18:30', 'Test Subject', 'Test Content')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'active', 'token-1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES ('ss-1', 'sub-1', 'seq-1', 0, ?)
    `).bind(enrolledAt).run();

    vi.spyOn(Date, 'now').mockReturnValue(currentTime * 1000);

    await processSequenceEmails(env);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test -- --grep "Time-based scheduling"`

Expected: FAIL (columns don't exist yet in test DB, or logic not implemented)

**Step 3: Update PendingSequenceEmail interface**

In `sequence-processor.ts`, update the interface:

```typescript
interface PendingSequenceEmail {
  subscriber_sequence_id: string;
  subscriber_id: string;
  email: string;
  name: string | null;
  unsubscribe_token: string;
  subject: string;
  content: string;
  step_number: number;
  sequence_id: string;
  current_step: number;
  started_at: number;
  default_send_time: string;
  delay_time: string | null;
}
```

**Step 4: Add time calculation helper**

Add at top of `sequence-processor.ts`:

```typescript
const JST_OFFSET_SECONDS = 9 * 60 * 60; // +9 hours in seconds

/**
 * Calculate the scheduled send time in Unix timestamp
 * @param startedAt - When the subscriber enrolled (Unix timestamp)
 * @param delayDays - Days to wait
 * @param sendTime - Time to send in "HH:MM" format (JST)
 * @returns Unix timestamp of scheduled send time
 */
function calculateScheduledTime(
  startedAt: number,
  delayDays: number,
  sendTime: string
): number {
  // Calculate the target date (started_at + delay_days)
  const targetDateUtc = startedAt + delayDays * 86400;

  // Convert to JST midnight of that day
  // 1. Add JST offset to get JST time
  // 2. Floor to day boundary
  // 3. Subtract JST offset to get back to UTC
  const jstTime = targetDateUtc + JST_OFFSET_SECONDS;
  const jstMidnight = Math.floor(jstTime / 86400) * 86400;
  const utcMidnightOfJstDay = jstMidnight - JST_OFFSET_SECONDS;

  // Parse send time
  const [hours, minutes] = sendTime.split(':').map(Number);

  // Add send time (in seconds) - this is JST time, so we add it directly
  // Then subtract JST offset to convert to UTC
  const scheduledTime = utcMidnightOfJstDay + hours * 3600 + minutes * 60;

  return scheduledTime;
}
```

**Step 5: Update the query to include time fields**

Update the SQL query in `processSequenceEmails`:

```typescript
const pendingEmails = await env.DB.prepare(`
  SELECT
    ss.id as subscriber_sequence_id,
    ss.subscriber_id,
    ss.current_step,
    ss.started_at,
    s.email,
    s.name,
    s.unsubscribe_token,
    step.subject,
    step.content,
    step.step_number,
    step.sequence_id,
    step.delay_days,
    step.delay_time,
    seq.default_send_time
  FROM subscriber_sequences ss
  JOIN subscribers s ON s.id = ss.subscriber_id
  JOIN sequences seq ON seq.id = ss.sequence_id
  JOIN sequence_steps step ON step.sequence_id = ss.sequence_id
  WHERE ss.completed_at IS NULL
  AND s.status = 'active'
  AND seq.is_active = 1
  AND step.step_number = ss.current_step + 1
`).all<PendingSequenceEmail & { delay_days: number }>();
```

**Step 6: Add time-based filtering in the loop**

Replace the for loop with time-based filtering:

```typescript
const pending = pendingEmails.results || [];
const now = Math.floor(Date.now() / 1000);

console.log(`Found ${pending.length} potential sequence email(s), checking scheduled times...`);

for (const email of pending) {
  // Calculate scheduled send time
  const sendTime = email.delay_time ?? email.default_send_time;
  const scheduledAt = calculateScheduledTime(
    email.started_at,
    email.delay_days,
    sendTime
  );

  // Skip if not yet time to send
  if (now < scheduledAt) {
    console.log(`Skipping ${email.email} step ${email.step_number}: scheduled for ${new Date(scheduledAt * 1000).toISOString()}`);
    continue;
  }

  console.log(`Sending sequence email to ${email.email}, step ${email.step_number}`);
  // ... rest of existing send logic
}
```

**Step 7: Run tests to verify they pass**

Run: `cd workers/newsletter && npm test`

Expected: All tests PASS

**Step 8: Commit**

```bash
git add workers/newsletter/src/lib/sequence-processor.ts workers/newsletter/src/__tests__/sequence-processor.test.ts
git commit -m "feat: implement time-based sequence email scheduling"
```

---

## Task 4: Update Sequences API

**Files:**
- Modify: `workers/newsletter/src/routes/sequences.ts`
- Test: `workers/newsletter/src/__tests__/sequences.test.ts`

**Step 1: Write failing test for default_send_time**

Add to `sequences.test.ts`:

```typescript
describe('Sequence with time specification', () => {
  it('should create sequence with default_send_time', async () => {
    const response = await createSequence(mockRequest({
      name: 'Test Sequence',
      default_send_time: '09:30',
      steps: [
        { delay_days: 0, subject: 'Welcome', content: 'Hello!' }
      ]
    }), env);

    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.data.default_send_time).toBe('09:30');
  });

  it('should reject sequence without default_send_time', async () => {
    const response = await createSequence(mockRequest({
      name: 'Test Sequence',
      steps: [
        { delay_days: 0, subject: 'Welcome', content: 'Hello!' }
      ]
    }), env);

    expect(response.status).toBe(400);
  });

  it('should create step with delay_time override', async () => {
    const response = await createSequence(mockRequest({
      name: 'Test Sequence',
      default_send_time: '10:00',
      steps: [
        { delay_days: 0, subject: 'Welcome', content: 'Hello!' },
        { delay_days: 3, delay_time: '18:30', subject: 'Follow-up', content: 'Hi again!' }
      ]
    }), env);

    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.data.steps[1].delay_time).toBe('18:30');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test -- --grep "time specification"`

Expected: FAIL

**Step 3: Update createSequence function**

In `sequences.ts`, update validation:

```typescript
export async function createSequence(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateSequenceRequest>();
    const { name, description, default_send_time, steps } = body;

    if (!name || !steps || steps.length === 0) {
      return errorResponse('Name and at least one step are required', 400);
    }

    if (!default_send_time || !/^\d{2}:\d{2}$/.test(default_send_time)) {
      return errorResponse('default_send_time is required in HH:MM format', 400);
    }

    const sequenceId = crypto.randomUUID();

    // Create sequence with default_send_time
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, description, default_send_time)
      VALUES (?, ?, ?, ?)
    `).bind(sequenceId, name, description || null, default_send_time).run();

    // Create steps with optional delay_time
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = crypto.randomUUID();

      // Validate delay_time format if provided
      if (step.delay_time && !/^\d{2}:\d{2}$/.test(step.delay_time)) {
        return errorResponse(`Step ${i + 1}: delay_time must be in HH:MM format`, 400);
      }

      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, i + 1, step.delay_days, step.delay_time || null, step.subject, step.content).run();
    }

    const sequence = await getSequenceWithSteps(env, sequenceId);

    return jsonResponse<ApiResponse>({
      success: true,
      data: sequence,
    }, 201);
  } catch (error) {
    console.error('Create sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Update updateSequence function**

Add `default_send_time` to updateable fields:

```typescript
if (body.default_send_time !== undefined) {
  if (!/^\d{2}:\d{2}$/.test(body.default_send_time)) {
    return errorResponse('default_send_time must be in HH:MM format', 400);
  }
  updates.push('default_send_time = ?');
  bindings.push(body.default_send_time);
}
```

**Step 5: Run tests to verify they pass**

Run: `cd workers/newsletter && npm test`

Expected: All tests PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/sequences.ts workers/newsletter/src/__tests__/sequences.test.ts
git commit -m "feat: add time specification to sequences API"
```

---

## Task 5: Install @dnd-kit/core for Frontend

**Files:**
- Modify: `package.json`

**Step 1: Install dependencies**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

Expected: Packages installed successfully

**Step 2: Verify installation**

Run: `npm ls @dnd-kit/core`

Expected: Shows installed version

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for drag-and-drop functionality"
```

---

## Task 6: Update SequenceForm with Time Input

**Files:**
- Modify: `src/components/admin/SequenceForm.tsx`

**Step 1: Add default_send_time state**

Add to component state:

```typescript
const [defaultSendTime, setDefaultSendTime] = useState(sequence?.default_send_time || '10:00');
```

**Step 2: Add time input field after description**

Add JSX after the description textarea:

```tsx
<div>
  <label htmlFor="default_send_time" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
    デフォルト送信時刻 <span className="text-red-500">*</span>
  </label>
  <input
    type="time"
    id="default_send_time"
    value={defaultSendTime}
    onChange={(e) => setDefaultSendTime(e.target.value)}
    className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
    required
  />
  <p className="text-xs text-[var(--color-text-muted)] mt-1">
    各ステップで個別に指定しない場合、この時刻に送信されます（日本時間）
  </p>
</div>
```

**Step 3: Update SequenceStep interface and form data**

Update interface:

```typescript
interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}
```

Update handleSubmit data:

```typescript
const data = {
  name: name.trim(),
  description: description.trim() || undefined,
  default_send_time: defaultSendTime,
  steps: steps.map(step => ({
    delay_days: step.delay_days,
    delay_time: step.delay_time || undefined,
    subject: step.subject.trim(),
    content: step.content.trim(),
  })),
};
```

**Step 4: Commit**

```bash
git add src/components/admin/SequenceForm.tsx
git commit -m "feat: add default_send_time input to sequence form"
```

---

## Task 7: Update SequenceStepEditor with Time and Drag-and-Drop

**Files:**
- Modify: `src/components/admin/SequenceStepEditor.tsx`

**Step 1: Add imports for dnd-kit**

```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

**Step 2: Update SequenceStep interface**

```typescript
interface SequenceStep {
  id?: string;
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}
```

**Step 3: Create SortableStep component**

```typescript
interface SortableStepProps {
  step: SequenceStep;
  index: number;
  onUpdate: (index: number, field: keyof SequenceStep, value: string | number) => void;
  onRemove: (index: number) => void;
}

function SortableStep({ step, index, onUpdate, onRemove }: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: step.id || `step-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-[var(--color-border)] rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            {...attributes}
            {...listeners}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          <h4 className="text-sm font-medium text-[var(--color-text)]">
            ステップ {index + 1}
          </h4>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          削除
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            送信までの日数 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={step.delay_days}
            onChange={(e) => onUpdate(index, 'delay_days', parseInt(e.target.value) || 0)}
            min="0"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            送信時刻（オプション）
          </label>
          <input
            type="time"
            value={step.delay_time || ''}
            onChange={(e) => onUpdate(index, 'delay_time', e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            空欄の場合、デフォルト時刻を使用
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          件名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={step.subject}
          onChange={(e) => onUpdate(index, 'subject', e.target.value)}
          placeholder="メールの件名を入力"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          本文 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={step.content}
          onChange={(e) => onUpdate(index, 'content', e.target.value)}
          placeholder="メール本文を入力"
          rows={6}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all font-mono text-sm"
          required
        />
      </div>
    </div>
  );
}
```

**Step 4: Update main component with DndContext**

```typescript
export function SequenceStepEditor({ steps, onChange }: SequenceStepEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ensure each step has an id for dnd-kit
  const stepsWithIds = steps.map((step, index) => ({
    ...step,
    id: step.id || `temp-${index}`,
  }));

  const addStep = () => {
    onChange([...steps, { delay_days: 0, subject: '', content: '' }]);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    onChange(newSteps);
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      [field]: value,
    };
    onChange(newSteps);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stepsWithIds.findIndex((s) => s.id === active.id);
      const newIndex = stepsWithIds.findIndex((s) => s.id === over.id);
      onChange(arrayMove(steps, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stepsWithIds.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {stepsWithIds.map((step, index) => (
            <SortableStep
              key={step.id}
              step={step}
              index={index}
              onUpdate={updateStep}
              onRemove={removeStep}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addStep}
        className="w-full py-3 border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
      >
        + ステップを追加
      </button>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add src/components/admin/SequenceStepEditor.tsx
git commit -m "feat: add drag-and-drop reordering and delay_time input to steps"
```

---

## Task 8: Add Timeline Preview Component

**Files:**
- Create: `src/components/admin/SequenceTimelinePreview.tsx`
- Modify: `src/components/admin/SequenceForm.tsx`

**Step 1: Create timeline preview component**

```typescript
'use client';

interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  subject: string;
}

interface SequenceTimelinePreviewProps {
  defaultSendTime: string;
  steps: SequenceStep[];
}

export function SequenceTimelinePreview({ defaultSendTime, steps }: SequenceTimelinePreviewProps) {
  if (steps.length === 0) {
    return null;
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
      <h4 className="text-sm font-medium text-[var(--color-text)] mb-4">
        送信タイムライン（プレビュー）
      </h4>
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-[var(--color-border)]" />

        {/* Registration point */}
        <div className="relative mb-4">
          <div className="absolute left-[-18px] w-3 h-3 rounded-full bg-[var(--color-accent)] border-2 border-white" />
          <span className="text-xs text-[var(--color-text-muted)]">購読登録</span>
        </div>

        {/* Steps */}
        {steps.map((step, index) => {
          const sendTime = step.delay_time || defaultSendTime;
          const dayLabel = step.delay_days === 0
            ? '即時'
            : `${step.delay_days}日後`;

          return (
            <div key={index} className="relative mb-4 last:mb-0">
              <div className="absolute left-[-18px] w-3 h-3 rounded-full bg-[var(--color-bg)] border-2 border-[var(--color-accent)]" />
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-[var(--color-accent)] min-w-[60px]">
                  {dayLabel} ({formatTime(sendTime)})
                </span>
                <span className="text-sm text-[var(--color-text)]">
                  {step.subject || `ステップ ${index + 1}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Add timeline preview to SequenceForm**

Import and add after steps:

```typescript
import { SequenceTimelinePreview } from './SequenceTimelinePreview';

// In the JSX, after SequenceStepEditor:
{steps.length > 0 && steps[0].subject && (
  <SequenceTimelinePreview
    defaultSendTime={defaultSendTime}
    steps={steps}
  />
)}
```

**Step 3: Commit**

```bash
git add src/components/admin/SequenceTimelinePreview.tsx src/components/admin/SequenceForm.tsx
git commit -m "feat: add timeline preview for sequence emails"
```

---

## Task 9: Update Admin API Client

**Files:**
- Modify: `src/utils/admin-api.ts`

**Step 1: Update createSequence function**

Find and update the interface and function:

```typescript
interface CreateSequenceData {
  name: string;
  description?: string;
  default_send_time: string;
  steps: {
    delay_days: number;
    delay_time?: string;
    subject: string;
    content: string;
  }[];
}

export async function createSequence(data: CreateSequenceData): Promise<ApiResult> {
  // ... existing implementation
}
```

**Step 2: Commit**

```bash
git add src/utils/admin-api.ts
git commit -m "feat: update admin API client for time specification"
```

---

## Task 10: Run Full Test Suite and Type Check

**Step 1: Run backend tests**

Run: `cd workers/newsletter && npm test`

Expected: All tests pass

**Step 2: Run frontend type check**

Run: `npm run check`

Expected: No type errors

**Step 3: Run build**

Run: `npm run build`

Expected: Build succeeds

**Step 4: Commit any fixes if needed**

---

## Task 11: Apply Migration to Production and Deploy

**Step 1: Apply migration to production D1**

Run: `cd workers/newsletter && npx wrangler d1 execute edgeshift-newsletter --remote --file=migrations/0002_add_time_specification.sql`

Expected: Success

**Step 2: Deploy newsletter worker**

Run: `cd workers/newsletter && npm run deploy`

Expected: Deployment successful

**Step 3: Deploy frontend**

Run: `npm run build && npx wrangler pages deploy dist --project-name edgeshift`

Expected: Deployment successful

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete sequence time specification implementation"
git push origin feat/sequence-time-specification
```

---

## Summary

| Task | Description | Est. Time |
|:--|:--|:--|
| 1 | Update database schema | 10 min |
| 2 | Update TypeScript types | 5 min |
| 3 | Update sequence processor with time logic | 30 min |
| 4 | Update sequences API | 20 min |
| 5 | Install @dnd-kit/core | 5 min |
| 6 | Update SequenceForm with time input | 15 min |
| 7 | Update SequenceStepEditor with drag-and-drop | 30 min |
| 8 | Add timeline preview component | 20 min |
| 9 | Update admin API client | 5 min |
| 10 | Run tests and type check | 10 min |
| 11 | Deploy to production | 15 min |
| **Total** | | **~2.5 hours** |
