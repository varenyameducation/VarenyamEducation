# Varenyam Coaching Institute — Phase 2 PRD
## Online Student Test Platform

**Version:** v2.0 — July 2026
**Prerequisite:** Phase 1 fully deployed (Question Bank + Test Paper Generator)
**Status:** DRAFT — awaiting approval before build starts

---

## 1. Scope & Roles

Four user tiers, each with distinct permissions:

| Tier | Role value | Route group | Auth method |
|---|---|---|---|
| Super Admin | `super_admin` | `/(dashboard)/` | Email + Google OAuth |
| Sub-Admin | `admin` | `/(dashboard)/` | Email + Google OAuth |
| Teacher | `teacher` | `/(dashboard)/` | Email + Google OAuth |
| Student | `student` | `/(student)/` | Roll Number + Password |

`/(dashboard)/` is the existing admin/teacher portal — no structural changes.
`/(student)/` is a **completely separate route group** with its own layout, sidebar, and session cookie.

---

## 2. New Database Tables

### 2.1 `batches` — Class/section grouping

```sql
CREATE TABLE batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,        -- e.g. "Class 9 - A", "JEE 2027 Batch"
  course_id     UUID REFERENCES courses(id),
  academic_year TEXT,                 -- '2025-26'
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
```

### 2.2 `students` — Student profiles

```sql
CREATE TABLE students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no       TEXT NOT NULL UNIQUE, -- institute-assigned, e.g. "VAR-9A-001"
  full_name     TEXT NOT NULL,
  batch_id      UUID REFERENCES batches(id),
  email         TEXT,                 -- optional, for notifications
  phone         TEXT,
  parent_phone  TEXT,
  password_hash TEXT NOT NULL,        -- bcrypt
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_students_batch ON students(batch_id);
CREATE INDEX idx_students_roll  ON students(roll_no);
```

### 2.3 `test_attempts` — One row per student per test attempt

```sql
CREATE TABLE test_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id         UUID NOT NULL REFERENCES tests(id),
  student_id      UUID NOT NULL REFERENCES students(id),
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','submitted','auto_submitted','abandoned')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  time_taken_secs INTEGER,            -- actual seconds used
  total_score     NUMERIC(8,2),       -- computed on submit
  max_score       NUMERIC(8,2),       -- total possible marks for this test
  percentage      NUMERIC(5,2),       -- total_score / max_score * 100
  rank_in_batch   SMALLINT,           -- computed after all students submit
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(test_id, student_id)         -- one attempt per test per student (MVP)
);

CREATE INDEX idx_ta_test    ON test_attempts(test_id);
CREATE INDEX idx_ta_student ON test_attempts(student_id);
```

### 2.4 `student_answers` — One row per question per attempt

```sql
CREATE TABLE student_answers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id       UUID NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES questions(id),
  question_type    TEXT NOT NULL,       -- copied from question at attempt-start time
  -- answer storage (one set based on type)
  selected_options TEXT[],             -- MCQ / multi_select: ['A'] or ['A','C']
  numerical_input  NUMERIC,            -- numerical type
  -- evaluation (set on submit)
  is_correct       BOOLEAN,
  is_marked_review BOOLEAN DEFAULT false,
  marks_awarded    NUMERIC(5,2),       -- positive = credit, negative = penalty
  time_taken_secs  INTEGER,            -- seconds spent on this question
  answered_at      TIMESTAMPTZ,
  UNIQUE(attempt_id, question_id)
);

CREATE INDEX idx_sa_attempt ON student_answers(attempt_id);
```

### 2.5 Changes to existing tables

**`tests.assigned_batch`** — column already exists as `UUID`. Add FK to `batches`:
```sql
ALTER TABLE tests
  ADD CONSTRAINT fk_tests_batch FOREIGN KEY (assigned_batch) REFERENCES batches(id);
```

**`users`** — no change. Students are stored in the separate `students` table, not `users`.

---

## 3. Authentication — Student Login

### 3.1 Flow

```
Student → /student/login
  Enter roll_no + password
  POST /api/student/auth/login
  Server: lookup student by roll_no, bcrypt.compare(password, password_hash)
  Success → sign student JWT → set __student_access_token (HTTP-only cookie)
  Redirect → /student/dashboard
```

### 3.2 Student JWT payload

```ts
{
  sub:       "student-uuid",
  roll_no:   "VAR-9A-001",
  name:      "Riya Sharma",
  role:      "student",
  batch_id:  "batch-uuid",
  iat:       1234567890,
  exp:       1234567890 + 86400   // 24h
}
```

### 3.3 Middleware additions

- `/student/*` routes → require `__student_access_token` with `role='student'`
- `/api/student/*` routes → same check
- Students hitting any `/(dashboard)/` route → redirect to `/student/login`
- Admin/teacher hitting `/student/*` routes → redirect to `/login`

---

## 4. API Routes

### 4.1 Student auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/student/auth/login` | None | Roll no + password → student JWT |
| POST | `/api/student/auth/logout` | Student | Clear student cookie |
| POST | `/api/student/auth/refresh` | Student | Rotate student access token |
| POST | `/api/student/auth/change-password` | Student | First-login password change |

### 4.2 Batch management (admin / super_admin)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/batches` | Any staff | List batches (filter: course_id, is_active) |
| POST | `/api/batches` | admin+ | Create batch |
| PATCH | `/api/batches/:id` | admin+ | Update batch name / course / year |
| DELETE | `/api/batches/:id` | admin+ | Soft delete |

### 4.3 Student management (admin / super_admin)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/students` | admin+ | List students (filter: batch_id, search) |
| POST | `/api/students` | admin+ | Create single student |
| PATCH | `/api/students/:id` | admin+ | Update student details |
| DELETE | `/api/students/:id` | admin+ | Deactivate student (soft delete) |
| POST | `/api/students/bulk-import` | admin+ | Bulk create from Excel |
| POST | `/api/students/:id/reset-password` | admin+ | Set new temp password |

**Bulk import Excel columns:** `roll_no`, `full_name`, `batch_name`, `email` (opt), `phone` (opt), `temp_password`

### 4.4 Test publishing (teacher / admin)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| PATCH | `/api/tests/:id/publish` | Teacher+ | Set published: assign batch, schedule, shuffle |
| PATCH | `/api/tests/:id/unpublish` | Teacher+ | Revert to `status='final'` |

### 4.5 Student test-taking

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/student/tests` | Student | Tests available to student's batch (within time window) |
| POST | `/api/student/tests/:testId/start` | Student | Create attempt row, return question list |
| GET | `/api/student/attempts/:attemptId` | Student | Resume attempt — questions + saved answers |
| PUT | `/api/student/attempts/:attemptId/answer` | Student | Save / update one answer |
| POST | `/api/student/attempts/:attemptId/submit` | Student | Final submit, compute score |

### 4.6 Results & analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/student/results` | Student | Own past attempts + scores |
| GET | `/api/student/results/:attemptId` | Student | Full per-question breakdown |
| GET | `/api/results/test/:testId` | Teacher+ | All student scores for a test |
| GET | `/api/results/test/:testId/leaderboard` | Teacher+ | Ranked list |
| GET | `/api/results/student/:studentId` | admin+ | All attempts by a student |

---

## 5. UI Route Structure

### 5.1 `/(student)/` — Student portal (new)

```
app/
└── (student)/
    ├── layout.tsx                    ← student shell: logo, name, logout only
    └── student/
        ├── login/
        │   └── page.tsx              ← Roll no + password form
        ├── dashboard/
        │   └── page.tsx              ← Upcoming tests + recent scores summary
        ├── tests/
        │   ├── page.tsx              ← Available tests list
        │   └── [testId]/
        │       ├── instructions/
        │       │   └── page.tsx      ← Rules, marks, duration → Start button
        │       └── attempt/
        │           └── page.tsx      ← ONLINE TEST SCREEN (core feature)
        └── results/
            ├── page.tsx              ← All past results list
            └── [attemptId]/
                └── page.tsx          ← Score + per-question answer review
```

### 5.2 Admin additions to `/(dashboard)/` (new pages)

```
app/(dashboard)/
├── batches/
│   └── page.tsx                      ← Batch list, create/edit/delete
├── students/
│   ├── page.tsx                      ← Student list + bulk import
│   └── [id]/
│       └── page.tsx                  ← Student profile + test history
└── results/
    ├── page.tsx                      ← Pick a test to view results
    └── [testId]/
        └── page.tsx                  ← Leaderboard + per-student breakdown
```

### 5.3 Changes to existing admin pages

- **`tests/[id]/edit`** — add "Publish" section at bottom: batch picker, schedule window, shuffle toggle, publish button
- **`tests/page.tsx`** — add `Published` status badge and "N students attempted" count column

---

## 6. Online Test Screen — Detailed UX Spec

**File:** `app/(student)/student/tests/[testId]/attempt/page.tsx`

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Test Title                   [Timer: 01:23:45]   [Submit Test] │  ← sticky header
├─────────────────────┬───────────────────────────────────────────┤
│  Question Nav Panel │  Question Display Area                    │
│                     │                                           │
│  1   2   3   4   5  │  Q.12  [MCQ]  [medium]                   │
│  6   7  ⭐8  ✓9  10  │                                           │
│  11 ✓12 13  14  15  │  In the figure, AB = CD. If angle         │
│                     │  AOB = (4x + 10)° and angle               │
│  Legend:            │  COD = (6x - 20)°, find x.               │
│  □ Unanswered       │                                           │
│  ✓ Answered         │  [figure image, if any]                   │
│  ⭐ Marked review    │                                           │
│  ◑ Answered+review  │  ○  (A)  x = 10                          │
│                     │  ●  (B)  x = 15     ← selected           │
│  Answered:    9     │  ○  (C)  x = 20                          │
│  Unanswered:  5     │  ○  (D)  x = 25                          │
│  Marked:      1     │                                           │
│                     │  [Clear Response]  [Mark for Review]      │
│                     │                                           │
│                     │  [← Previous]              [Next →]      │
└─────────────────────┴───────────────────────────────────────────┘
```

### 6.2 Question navigation panel

- Grid of numbered buttons, colour-coded:
  - **Grey** — unanswered
  - **Green** — answered
  - **Yellow/star** — marked for review (no answer)
  - **Orange** — answered + marked for review
- Clicking any number jumps directly to that question
- Summary counts below the grid

### 6.3 Answer persistence (auto-save)

- Every answer selection → immediate local state update
- Auto-save to `PUT /api/student/attempts/:id/answer` on every question navigation change + every 30 seconds
- On page load / browser refresh → `GET /api/student/attempts/:id` restores all saved answers + recomputes remaining timer from `started_at`
- No answer is ever lost if `allow_resume = true` on the test

### 6.4 Timer

- Countdown from `test.duration_minutes * 60` seconds
- Client computes remaining = `duration_secs - (Date.now()/1000 - started_at_unix)`
- At 10 min remaining: amber warning banner
- At 2 min remaining: red warning + subtle pulse animation
- At 0: auto-submit fires automatically
- Server validates on submit: if `now() > started_at + duration_interval`, the submit is still accepted but time is capped — browser clock manipulation does not extend the test

### 6.5 Submit flow

1. Student clicks "Submit Test"
2. Confirmation dialog: shows unanswered count — "You have 5 unanswered questions. Are you sure you want to submit?"
3. On confirm → `POST /api/student/attempts/:id/submit`
4. Server: mark attempt `submitted`, run score computation, save results
5. Redirect to `/student/results/:attemptId`

### 6.6 Score computation (server-side, on submit)

```ts
for each question in the test:
  const answer = student_answers.find(a => a.question_id === q.id)

  if (!answer || answer.selected_options.length === 0):
    marks_awarded = 0   // skipped

  else if q.question_type === 'mcq':
    correct = answer.selected_options[0] === q.correct_option[0]
    marks_awarded = correct ? q.marks_correct : -q.marks_negative

  else if q.question_type === 'multi_select':
    // partial credit
    correct_set   = new Set(q.correct_option)
    selected_set  = new Set(answer.selected_options)
    right_count   = intersect(correct_set, selected_set).size
    wrong_count   = selected_set.size - right_count
    marks_awarded = (q.marks_correct * right_count / correct_set.size)
                    - (q.marks_negative * wrong_count)

  else if q.question_type === 'numerical':
    in_range = q.numerical_range
      ? answer.numerical_input within q.numerical_range
      : answer.numerical_input === q.numerical_answer
    marks_awarded = in_range ? q.marks_correct : -q.marks_negative

total_score = sum(marks_awarded)  // can be negative (capped at 0 for display)
max_score   = sum(q.marks_correct for all questions)
percentage  = total_score / max_score * 100
```

### 6.7 Result page (`/student/results/[attemptId]`)

- **Score card** — score / max, percentage, rank in batch, time taken
- **Section-wise accuracy** — if sections exist on the test
- **Per-question review table:**
  - Question body rendered with KaTeX + figure image
  - Student's answer (highlighted green = correct, red = wrong, grey = skipped)
  - Correct answer shown
  - Solution + solution images shown if `question.solution` is non-empty

---

## 7. Admin: Test Publishing Workflow

### 7.1 Publish form fields (on `tests/[id]/edit`)

| Field | Type | Notes |
|---|---|---|
| Assign to batch | Dropdown | Required. Only active batches shown |
| Test window — start | DateTime picker | When test becomes available |
| Test window — end | DateTime picker | After this: test locked, no new attempts |
| Shuffle questions | Toggle | Randomises question order per student |
| Allow resume | Toggle | On by default — student can close + return |

On "Publish": `PATCH /api/tests/:id/publish` sets:
- `status = 'published'`
- `assigned_batch = batch_id`
- `scheduled_start`, `scheduled_end`
- `shuffle_questions`

Only tests currently at `status = 'final'` can be published. Draft tests must be finalised first.

### 7.2 Admin results view (`/results/[testId]`)

Table: **Rank | Student Name | Roll No | Score | Percentage | Time Taken | Submitted At | [View Detail]**

"View Detail" opens per-student answer breakdown (same as student result page but read-only for admin).

---

## 8. Security

| Area | Implementation |
|---|---|
| Student session | Separate cookie `__student_access_token`. Middleware rejects student tokens on any `/(dashboard)/` route and vice versa |
| Passwords | bcrypt, 12 rounds. Admin sets initial password; student must change on first login |
| Attempt integrity | Server computes remaining time from `started_at`; client cannot extend test by manipulating clock |
| Answer immutability | `student_answers` only writable while `attempt.status = 'in_progress'`; submitted attempts are read-only at DB level |
| Test content timing | Questions not returned until `POST /start` is called; `POST /start` rejected if outside `scheduled_start`–`scheduled_end` window |
| Rate limiting | Student login: 5 attempts / 15 min per IP (same middleware as teacher login) |

---

## 9. Acceptance Criteria

### 9.1 Student auth
- [ ] Student logs in with roll number + password → lands on `/student/dashboard`
- [ ] Wrong credentials return 401; no field-level hint (no email enumeration equivalent)
- [ ] Student cannot access any `/(dashboard)/` route
- [ ] Admin can create a student; student is prompted to change password on first login
- [ ] Admin can bulk-import students from Excel

### 9.2 Test taking
- [ ] Student sees only tests assigned to their batch within the schedule window
- [ ] Starting a test creates `test_attempt`; questions served in correct order (or shuffled)
- [ ] Selecting answer → navigating away → returning → answer is still selected
- [ ] Browser refresh mid-test → all answers restored, timer continues from correct remaining time
- [ ] Timer auto-submits at zero with all saved answers
- [ ] Submitted attempt is immutable — cannot re-answer after submit

### 9.3 Scoring
- [ ] MCQ correct → marks_correct credited
- [ ] MCQ wrong → marks_negative deducted
- [ ] MCQ skipped → 0
- [ ] Total score, percentage, and rank correct on result page
- [ ] Multi-select partial credit computed correctly
- [ ] Numerical range check works (answer within range = correct)

### 9.4 Admin workflow
- [ ] Admin creates batch, adds students to it
- [ ] Admin publishes a test: selects batch + schedule window + shuffle toggle
- [ ] Published test appears on student dashboard only within the time window
- [ ] Admin can view all student scores for a test, sorted by rank
- [ ] Admin can view individual student's answer breakdown

---

## 10. Open Questions — Confirm Before Build Starts

1. **Student login URL** — `/student/login` (separate from staff `/login`) — OK, or use same `/login` with a role toggle?
2. **Re-attempts** — one attempt per student per test (MVP), or allow admin to reset and re-open?
3. **Roll number format** — free text (admin-defined), or enforce a pattern (e.g. `VAR-9A-001`)?
4. **Password change on first login** — forced redirect, or just a banner prompt?
5. **Batch per student** — one batch only (MVP), or can a student belong to multiple batches?
6. **Result visibility** — student sees full answer review immediately after submit, or admin controls a "release results" toggle?
7. **Matrix match questions** — include in online test screen for MVP, or skip (display as image only)?

---

## 11. Out of Scope for Phase 2 MVP (defer to Phase 3)

- Multiple attempts / re-test per student
- Subjective / essay questions online
- Live proctoring / tab-switch detection
- Parent portal or SMS notifications
- Per-student custom test assignments (Phase 2 assigns whole batch)
- Analytics charts and score distribution graphs
- Certificate / report card generation
- Mobile app

---

## 12. Phase 2 DB Migration Summary

New tables (in order of creation to satisfy FK dependencies):

```
1. batches
2. students              (FK → batches)
3. test_attempts         (FK → tests, students)
4. student_answers       (FK → test_attempts, questions)
```

FK addition on existing table:
```
5. ALTER TABLE tests ADD CONSTRAINT fk_tests_batch FOREIGN KEY (assigned_batch) REFERENCES batches(id)
```

All new tables follow existing conventions: UUID PKs, `deleted_at` soft delete, `created_at`/`updated_at` timestamps.

---

*Varenyam Coaching Institute | Phase 2 PRD | July 2026 | Confidential*
