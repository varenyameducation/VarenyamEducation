
VARENYAM COACHING INSTITUTE
EdTech Platform — Phase 1


TECHNICAL PRODUCT REQUIREMENTS DOCUMENT
Question Bank + Course Taxonomy + Test Paper Generator

Document Type
Technical PRD — Development Reference
Version
v1.0 — May 2026
Phase
Phase 1 — Question Bank & Test Paper Generator
Stack
Next.js 14 · PostgreSQL · Supabase · JWT · OAuth 2.0
Prepared For
Varenyam Coaching Institute
Classification
Confidential — Development Team

This document is the authoritative technical specification for Phase 1 development. It defines system architecture, database schema, API contracts, authentication flows, module logic, and acceptance criteria. All development decisions must align with this document.

# 1. System Overview & Architecture

The Varenyam platform is a multi-tenant EdTech application built as a monorepo using Next.js 14 App Router. Phase 1 delivers two primary modules: the Course/Chapter/Topic Taxonomy Manager and the Question Bank with a branded Test Paper Generator.

## 1.1 High-Level Architecture

┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Browser)                   │
│   Next.js 14 App Router  ·  React Server Components         │
│   Tailwind CSS  ·  shadcn/ui  ·  KaTeX  ·  TanStack Query  │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS / REST + Server Actions
┌────────────────────────▼────────────────────────────────────┐
│                   API / SERVER LAYER                        │
│   Next.js API Routes (/app/api/*)                           │
│   Server Actions (mutations)                                │
│   JWT Middleware (route protection)                         │
│   Zod (request validation)                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   DATA LAYER                                 │
│   PostgreSQL (Supabase)  ·  Supabase Storage (images)       │
│   Supabase Auth (session management)                        │
│   Redis (optional — rate limiting, future test state)       │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                OUTPUT SERVICES                               │
│   Puppeteer (PDF generation)  ·  docx npm (DOCX export)    │
│   KaTeX server-side render (equation → image for DOCX)      │
└─────────────────────────────────────────────────────────────┘

## 1.2 Rendering Strategy
Route Type
Rendering
Reason
Dashboard pages (SSR)
React Server Components + SSR
User-specific data, no layout shift
Question editor
Client Component
Live LaTeX preview requires browser DOM
Test preview
Server Component + hydration
Initial render fast, interactive after load
API routes (/api/*)
Edge / Node.js runtime
Auth checks, DB queries, file generation
PDF / DOCX export
Node.js runtime (Puppeteer)
Headless Chrome needs Node — not Edge

# 2. Technology Stack — Complete Specification


Layer
Technology
Version
Purpose
Framework
Next.js
14.x (App Router)
Full-stack React framework — SSR, API routes, Server Actions
Language
TypeScript
5.x
Type safety across frontend and backend
UI Library
Tailwind CSS
3.x
Utility-first styling
Components
shadcn/ui
Latest
Pre-built accessible components
State Management
TanStack Query
v5
Server state, caching, background refetch
Forms
React Hook Form + Zod
Latest
Form state + schema validation
Math Rendering
KaTeX
0.16.x
LaTeX → HTML rendering in browser
Rich Input
CodeMirror 6
Latest
LaTeX editor with syntax highlighting
Drag & Drop
@dnd-kit/core
Latest
Question reordering in test builder
Auth
Supabase Auth + custom JWT
Latest
See Section 3 for full auth spec
OAuth Provider
Google OAuth 2.0
—
Social login for teachers/admins
Database
PostgreSQL via Supabase
15.x
Relational data — questions, tests, users
ORM
Prisma
5.x
Type-safe DB queries, migrations
File Storage
Supabase Storage
—
Question images, diagrams
PDF Generation
Puppeteer
21.x
Headless Chrome — renders KaTeX to PDF
DOCX Generation
docx (npm)
9.x
Generates editable Word documents
KaTeX → Image
node-canvas + katex
—
Renders equations as PNG for DOCX embedding
Email / OTP
Supabase Auth (SMTP)
—
OTP delivery for login
Hosting
Vercel Pro
—
Next.js optimised deployment, CDN, SSL
Database Host
Supabase Pro
—
Managed PostgreSQL, Auth, Storage
Version Control
GitHub
—
Monorepo, PR-based workflow
CI/CD
GitHub Actions + Vercel
—
Auto deploy on merge to main
Linting
ESLint + Prettier
—
Code quality and formatting
Testing
Vitest + Playwright
—
Unit tests + E2E browser tests

# 3. Authentication & Authorisation

The platform supports two authentication methods: Email/Password with OTP verification, and Google OAuth 2.0. Session management uses JWT stored in HTTP-only cookies. Supabase Auth handles token issuance; custom middleware enforces route-level RBAC.

## 3.1 Auth Methods
Method
Flow
Used By
Email + Password
User registers → Supabase creates account → Email OTP verification → Login → JWT issued
All roles (Admin, Teacher)
Email + OTP (passwordless)
Enter email → OTP sent → Enter OTP → JWT issued
Quick login option for teachers
Google OAuth 2.0
Click 'Sign in with Google' → Google consent → Callback → Supabase links account → JWT issued
Optional for all roles
Roll Number + Password
Student-specific login (Phase 2) — Admin creates student account with roll number
Students only (Phase 2)

## 3.2 JWT Token Specification
// JWT Payload Structure
{
  "sub":     "uuid-of-user",           // Supabase user ID
  "email":   "teacher@varenyam.com",
  "role":    "teacher",                 // super_admin | admin | teacher
  "inst_id": "varenyam-institute-uuid", // For future multi-tenant support
  "iat":     1714550400,                // Issued at
  "exp":     1714636800                 // Expires in 24 hours
}

// Refresh token stored in HTTP-only cookie: __refresh_token
// Access token stored in HTTP-only cookie: __access_token
// Token rotation: refresh 15 min before expiry via middleware

## 3.3 Role-Based Access Control (RBAC)
Permission
Super Admin
Admin
Teacher
Student (Phase 2)
Create Course/Chapter/Topic
✅
✅
❌
❌
Edit Course/Chapter/Topic
✅
✅
❌
❌
Add Questions (own subject)
✅
✅
✅
❌
Edit any question
✅
✅
❌
❌
Edit own questions only
✅
✅
✅
❌
Delete questions
✅
✅
❌
❌
Bulk import questions
✅
✅
✅
❌
Create test paper
✅
✅
✅
❌
Download test PDF/DOCX
✅
✅
✅
❌
Manage institute branding
✅
❌
❌
❌
Manage users (create/deactivate)
✅
✅
❌
❌
View all teachers' questions
✅
✅
❌
❌

## 3.4 Middleware — Route Protection
// middleware.ts — runs on every request
export async function middleware(request: NextRequest) {
  const token = request.cookies.get('__access_token')?.value;

  // Public routes — no auth required
  const publicRoutes = ['/login', '/auth/callback', '/auth/google'];
  if (publicRoutes.includes(request.nextUrl.pathname)) return NextResponse.next();

  // Verify JWT
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  const payload = await verifyJWT(token);
  if (!payload) return NextResponse.redirect(new URL('/login', request.url));

  // Role-based route guards
  if (request.nextUrl.pathname.startsWith('/admin') && payload.role !== 'super_admin')
    return NextResponse.redirect(new URL('/dashboard', request.url));

  // Attach user to request headers for Server Components
  const headers = new Headers(request.headers);
  headers.set('x-user-id', payload.sub);
  headers.set('x-user-role', payload.role);
  return NextResponse.next({ request: { headers } });
}

# 4. Database Schema — PostgreSQL

All tables use UUIDs as primary keys (gen_random_uuid()). Row-level security (RLS) policies are enabled on all tables. Timestamps use TIMESTAMPTZ. Soft deletes via deleted_at column.

Key Design Decision (from client feedback):  Course → Chapter → Topic hierarchy must be created FIRST. Questions are then tagged to a specific Topic within a Chapter within a Course. This taxonomy drives all dropdown menus in the question input form.

## 4.1 Core Taxonomy Tables
-- ── COURSES (top-level: e.g. 'Class 11 PCM', 'JEE Foundation') ──────────
CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                    -- e.g. 'Class 11 — PCM'
  grade       SMALLINT NOT NULL,                -- 5 to 12
  stream      TEXT,                             -- 'JEE' | 'NEET' | 'School' | 'Board'
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ                       -- soft delete
);

-- ── CHAPTERS (belongs to a course) ──────────────────────────────────────
CREATE TABLE chapters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                    -- e.g. 'Laws of Motion'
  subject     TEXT NOT NULL,                    -- 'Physics' | 'Chemistry' | 'Maths' | 'Biology'
  chapter_no  SMALLINT,                         -- ordering within course
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ── TOPICS (belongs to a chapter) ───────────────────────────────────────
CREATE TABLE topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id  UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                    -- e.g. 'Newton's Third Law'
  topic_no    SMALLINT,                         -- ordering within chapter
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- Index for fast cascading lookups
CREATE INDEX idx_chapters_course   ON chapters(course_id);
CREATE INDEX idx_topics_chapter    ON topics(chapter_id);

## 4.2 Users Table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid  UUID UNIQUE NOT NULL,           -- links to Supabase Auth
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL                   -- 'super_admin' | 'admin' | 'teacher'
                CHECK (role IN ('super_admin','admin','teacher')),
  subject       TEXT[],                         -- subjects this teacher handles
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

## 4.3 Questions Table
CREATE TABLE questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Taxonomy (Course → Chapter → Topic) ────────────────────────────
  course_id        UUID REFERENCES courses(id),
  chapter_id       UUID REFERENCES chapters(id),
  topic_id         UUID REFERENCES topics(id),

  -- ── Classification ──────────────────────────────────────────────────
  subject          TEXT NOT NULL,
  question_type    TEXT NOT NULL
                   CHECK (question_type IN ('mcq','numerical','matrix_match','multi_select')),
  difficulty       TEXT NOT NULL
                   CHECK (difficulty IN ('easy','medium','hard','advanced')),
  exam_type        TEXT NOT NULL
                   CHECK (exam_type IN ('school','board','jee','neet')),

  -- ── Marks ───────────────────────────────────────────────────────────
  marks_correct    NUMERIC(5,2) NOT NULL DEFAULT 4,
  marks_negative   NUMERIC(5,2) NOT NULL DEFAULT 0,  -- store as positive, apply as -ve
  marks_partial    NUMERIC(5,2) DEFAULT 0,           -- for multi-select partial credit

  -- ── Content (stored as LaTeX strings) ───────────────────────────────
  question_body    TEXT NOT NULL,                    -- LaTeX or plain text
  option_a         TEXT,                             -- MCQ / multi_select
  option_b         TEXT,
  option_c         TEXT,
  option_d         TEXT,
  correct_option   TEXT[],                           -- ['a'] or ['a','c'] for multi
  numerical_answer NUMERIC,                          -- for numerical type
  numerical_range  NUMRANGE,                         -- acceptable answer range
  matrix_left      JSONB,                            -- [{label:'A', text:'...'}, ...]
  matrix_right     JSONB,                            -- [{label:'p', text:'...'}, ...]
  matrix_answer    JSONB,                            -- [{'A':['p','q']}, ...]

  -- ── Supporting content ───────────────────────────────────────────────
  solution         TEXT,                             -- step-by-step solution (LaTeX)
  explanation      TEXT,                             -- conceptual explanation
  hint             TEXT,                             -- optional hint
  image_urls       TEXT[],                           -- Supabase Storage URLs

  -- ── Meta ─────────────────────────────────────────────────────────────
  created_by       UUID REFERENCES users(id),
  is_verified      BOOLEAN DEFAULT false,            -- admin-approved flag
  times_used       INTEGER DEFAULT 0,                -- incremented on test inclusion
  tags             TEXT[],                           -- free-form additional tags
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX idx_q_topic       ON questions(topic_id);
CREATE INDEX idx_q_chapter     ON questions(chapter_id);
CREATE INDEX idx_q_course      ON questions(course_id);
CREATE INDEX idx_q_subject     ON questions(subject);
CREATE INDEX idx_q_type        ON questions(question_type);
CREATE INDEX idx_q_difficulty  ON questions(difficulty);
CREATE INDEX idx_q_exam_type   ON questions(exam_type);
CREATE INDEX idx_q_deleted     ON questions(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_q_fulltext    ON questions USING gin(to_tsvector('english', question_body));

## 4.4 Tests & Test Questions Tables
-- ── TESTS (the generated paper) ─────────────────────────────────────
CREATE TABLE tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  course_id        UUID REFERENCES courses(id),
  subject          TEXT,                             -- null = multi-subject
  exam_type        TEXT CHECK (exam_type IN ('school','board','jee','neet','custom')),
  total_marks      NUMERIC(7,2) GENERATED ALWAYS AS (
                     -- computed from test_questions rows
                   ) STORED,
  duration_minutes INTEGER NOT NULL DEFAULT 180,
  instructions     TEXT,                            -- shown on paper header
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','final','published','archived')),

  -- Phase 2 fields (stored now, used in Phase 2)
  scheduled_start  TIMESTAMPTZ,
  scheduled_end    TIMESTAMPTZ,
  assigned_batch   UUID,                            -- Phase 2: batch reference
  allow_resume     BOOLEAN DEFAULT true,
  shuffle_questions BOOLEAN DEFAULT false,

  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- ── TEST QUESTIONS (ordered questions in a test) ─────────────────────
CREATE TABLE test_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id          UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES questions(id),
  position         SMALLINT NOT NULL,               -- display order
  section_label    TEXT,                            -- 'Section A', 'Part 1', etc.
  marks_override   NUMERIC(5,2),                    -- overrides question default if set
  negative_override NUMERIC(5,2),                   -- overrides question default if set
  UNIQUE(test_id, position)
);

CREATE INDEX idx_tq_test_id ON test_questions(test_id);

## 4.5 Institute Branding Table
CREATE TABLE institute_branding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inst_name       TEXT NOT NULL DEFAULT 'Varenyam Coaching Institute',
  tagline         TEXT,
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  logo_url        TEXT,                            -- Supabase Storage URL
  brand_color_hex TEXT DEFAULT '1B3A6B',           -- header bg colour
  logo_position   TEXT DEFAULT 'left'
                  CHECK (logo_position IN ('left','center','right')),
  paper_font      TEXT DEFAULT 'formal',
  footer_text     TEXT DEFAULT 'Confidential — For Student Use Only',
  show_address    BOOLEAN DEFAULT true,
  show_phone      BOOLEAN DEFAULT true,
  show_website    BOOLEAN DEFAULT false,
  updated_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

## 4.6 Audit Log Table
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,     -- 'question.create' | 'test.download_pdf' | etc.
  entity_type TEXT,              -- 'question' | 'test' | 'course'
  entity_id   UUID,
  meta        JSONB,             -- additional context
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_user   ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);

# 5. Project File Structure

varenyam/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── auth/callback/route.ts   # OAuth callback handler
│   ├── (dashboard)/              # Protected route group
│   │   ├── layout.tsx            # Dashboard shell, sidebar, header
│   │   ├── page.tsx              # Dashboard home
│   │   ├── taxonomy/             # Course → Chapter → Topic manager
│   │   │   ├── page.tsx
│   │   │   └── [courseId]/
│   │   │       ├── chapters/page.tsx
│   │   │       └── [chapterId]/topics/page.tsx
│   │   ├── questions/            # Question Bank module
│   │   │   ├── page.tsx          # Question pool list + filters
│   │   │   ├── new/page.tsx      # Add question form
│   │   │   ├── [id]/edit/page.tsx
│   │   │   └── import/page.tsx   # Bulk import
│   │   ├── tests/                # Test Paper Generator
│   │   │   ├── page.tsx          # Saved tests list
│   │   │   ├── new/page.tsx      # Test builder
│   │   │   └── [id]/
│   │   │       ├── preview/page.tsx
│   │   │       └── edit/page.tsx
│   │   └── settings/             # Institute branding, user management
│   │       ├── branding/page.tsx
│   │       └── users/page.tsx
│   ├── api/                      # API Routes
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   ├── refresh/route.ts
│   │   │   └── google/route.ts
│   │   ├── taxonomy/
│   │   │   ├── courses/route.ts
│   │   │   ├── chapters/route.ts
│   │   │   └── topics/route.ts
│   │   ├── questions/
│   │   │   ├── route.ts          # GET (list) + POST (create)
│   │   │   ├── [id]/route.ts     # GET + PUT + DELETE
│   │   │   └── import/route.ts   # Bulk Excel import
│   │   ├── tests/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   ├── [id]/export/pdf/route.ts
│   │   │   └── [id]/export/docx/route.ts
│   │   └── upload/route.ts       # Image upload to Supabase Storage
├── components/
│   ├── ui/                       # shadcn/ui base components
│   ├── auth/                     # LoginForm, OTPInput, GoogleButton
│   ├── taxonomy/                 # CourseCard, ChapterTree, TopicList
│   ├── questions/
│   │   ├── QuestionForm.tsx      # Main add/edit form
│   │   ├── LaTeXEditor.tsx       # CodeMirror + KaTeX live preview
│   │   ├── QuestionCard.tsx      # Rendered question display
│   │   └── ImportWizard.tsx      # Bulk import stepper
│   ├── tests/
│   │   ├── TestBuilder.tsx       # Full test builder interface
│   │   ├── QuestionSelector.tsx  # Filter + select questions panel
│   │   ├── QuestionSorter.tsx    # dnd-kit drag-to-reorder
│   │   └── TestPreview.tsx       # Full paper preview
│   └── shared/
│       ├── KaTeXRenderer.tsx     # Reusable LaTeX render component
│       ├── ImageUploader.tsx
│       └── DataTable.tsx         # Sortable, filterable table
├── lib/
│   ├── db/
│   │   ├── prisma.ts             # Prisma client singleton
│   │   └── queries/              # Typed query helpers
│   ├── auth/
│   │   ├── jwt.ts                # sign, verify, decode helpers
│   │   └── session.ts            # cookie management
│   ├── export/
│   │   ├── pdf.ts                # Puppeteer PDF generation
│   │   └── docx.ts               # DOCX generation logic
│   ├── latex/
│   │   └── render.ts             # Server-side KaTeX → PNG (for DOCX)
│   └── validators/               # Zod schemas for all entities
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── middleware.ts                 # JWT route protection
├── .env.local                    # Environment variables
└── next.config.ts

# 6. API Contracts

All API routes follow RESTful conventions. All responses use a consistent envelope: { success, data, error, meta }. All routes except /api/auth/* require a valid JWT in the __access_token cookie.

## 6.1 Response Envelope
// Success
{ success: true,  data: T,    meta?: { total, page, limit } }

// Error
{ success: false, error: { code: string, message: string, details?: unknown } }

// HTTP Status Codes
// 200 — OK          201 — Created     204 — No Content
// 400 — Bad Request  401 — Unauthorised 403 — Forbidden
// 404 — Not Found    409 — Conflict     500 — Server Error

## 6.2 Taxonomy Endpoints
Method
Endpoint
Auth Required
Description
GET
/api/taxonomy/courses
Any authenticated
List all active courses (with grade, stream)
POST
/api/taxonomy/courses
admin, super_admin
Create a new course
PUT
/api/taxonomy/courses/:id
admin, super_admin
Update course name / grade / stream
DELETE
/api/taxonomy/courses/:id
super_admin
Soft delete course (cascades to chapters/topics)
GET
/api/taxonomy/chapters?course_id
Any authenticated
List chapters for a course
POST
/api/taxonomy/chapters
admin, super_admin
Create chapter under a course
PUT
/api/taxonomy/chapters/:id
admin, super_admin
Update chapter
DELETE
/api/taxonomy/chapters/:id
super_admin
Soft delete chapter
GET
/api/taxonomy/topics?chapter_id
Any authenticated
List topics for a chapter
POST
/api/taxonomy/topics
admin, super_admin
Create topic under a chapter
PUT
/api/taxonomy/topics/:id
admin, super_admin
Update topic
DELETE
/api/taxonomy/topics/:id
super_admin
Soft delete topic

## 6.3 Questions Endpoints
Method
Endpoint
Auth Required
Description
GET
/api/questions
Any authenticated
List questions — supports filters: course_id, chapter_id, topic_id, subject, type, difficulty, exam_type, search. Pagination: ?page=1&limit=20
POST
/api/questions
Any authenticated
Create a new question. Body: full question object per schema.
GET
/api/questions/:id
Any authenticated
Get single question with all fields rendered
PUT
/api/questions/:id
Creator or admin
Update question. Partial updates supported.
DELETE
/api/questions/:id
admin / super_admin
Soft delete question
POST
/api/questions/import
Any authenticated
Bulk import — accepts multipart/form-data with Excel file. Returns { imported: N, errors: [{row, reason}] }
GET
/api/questions/:id/usage
admin / super_admin
List all tests this question has appeared in

## 6.4 Tests & Export Endpoints
Method
Endpoint
Auth Required
Description
GET
/api/tests
Any authenticated
List tests created by current user (or all for admin)
POST
/api/tests
Any authenticated
Create test with metadata. Returns test ID.
GET
/api/tests/:id
Any authenticated
Get full test with ordered questions
PUT
/api/tests/:id
Creator or admin
Update test metadata, question list, or status
DELETE
/api/tests/:id
Creator or admin
Soft delete test
POST
/api/tests/:id/questions
Creator
Add / reorder questions in test. Body: [{question_id, position, section_label}]
GET
/api/tests/:id/export/pdf
Creator or admin
Trigger PDF generation. Returns binary PDF stream. Content-Type: application/pdf
GET
/api/tests/:id/export/docx
Creator or admin
Trigger DOCX generation. Returns binary DOCX stream.

# 7. Module-by-Module Specification

## 7.1 Module: Course / Chapter / Topic Taxonomy Manager
Admin and Super Admin only. This is the first thing that must be set up before any questions can be added — all question tagging depends on the taxonomy tree being populated.

UI Screens
Taxonomy Home — card grid of all Courses, each showing grade, stream, chapter count
Course Detail — list of Chapters with subject badge and topic count per chapter
Chapter Detail — list of Topics with drag-to-reorder to set display order
Add/Edit modals for Course, Chapter, Topic — inline, no page navigation

Business Rules
A Chapter must belong to exactly one Course
A Topic must belong to exactly one Chapter
Deleting a Course soft-deletes all its Chapters and Topics
Deleting a Chapter soft-deletes all its Topics
If a Topic has questions attached, it cannot be deleted — must be archived instead
Chapter and Topic ordering is manual (drag-to-reorder). Order stored in chapter_no / topic_no columns

## 7.2 Module: Question Bank
Question Input Form — Field-by-Field Spec
Field
Component
Validation
Notes
Course
Select (searchable)
Required
Drives Chapter dropdown
Chapter
Select (dependent)
Required — after Course
Filtered by selected Course
Topic
Select (dependent)
Required — after Chapter
Filtered by selected Chapter
Subject
Auto-filled from Chapter
—
Read-only, derived from Chapter.subject
Question Type
Radio group
Required
Changes form layout dynamically
Difficulty
Radio group (4 options)
Required
Easy / Medium / Hard / Advanced
Exam Type
Select
Required
school / board / jee / neet
Marks (correct)
Number input
Required, >0
Default: 4 for JEE/NEET, 1 for school
Negative marking
Number input
≥0
Default: 1 for JEE/NEET, 0 for school
Question Body
LaTeXEditor component
Required, min 10 chars
Live KaTeX preview beside input
Options A–D
LaTeXEditor × 4
Required for MCQ/multi_select
Each option has live preview
Correct Option
Radio / Checkbox
Required for MCQ/multi_select
Radio=MCQ, Checkbox=multi_select
Numerical Answer
Number input
Required for numerical
Accept range: min–max fields
Matrix Left/Right
Dynamic pair fields
Required for matrix_match
Add/remove row buttons
Solution
LaTeXEditor (collapsible)
Optional
Step-by-step
Explanation
Textarea (LaTeX optional)
Optional
Conceptual reason
Images
Multi-file upload
Optional, max 5MB each
Stored in Supabase Storage

LaTeX Editor Component — Behaviour
Left pane: CodeMirror 6 editor with LaTeX syntax highlighting
Right pane: KaTeX live render — updates debounced at 300ms after keystroke
Error state: if KaTeX parse fails, show red border + error message in preview pane
Toolbar shortcuts: fraction, square root, integral, summation, superscript, subscript
Plain text detection: if no LaTeX tokens found, render as plain text (no error)
Mobile: stacked layout (editor top, preview bottom)

Bulk Import Specification
Accepted format: .xlsx only
Template columns (in order): course_name, chapter_name, topic_name, subject, question_type, difficulty, exam_type, marks_correct, marks_negative, question_body, option_a, option_b, option_c, option_d, correct_option, numerical_answer, solution, explanation, image_filename
Processing: parse with SheetJS → validate each row with Zod → resolve taxonomy IDs by name → batch insert valid rows
Error report: downloadable CSV listing failed rows with reason column
Image import: images referenced by filename in the Excel, uploaded separately as ZIP — system matches by filename
Duplicate detection: if question_body is >90% similar to an existing question, flag for review (do not auto-reject)

## 7.3 Module: Test Paper Generator
Test Builder — Step-by-Step UX Flow
Step
Screen
Technical Behaviour
1
Test Setup Modal
Capture: title, course, subject(s), exam_type, duration, instructions. Create test record with status='draft'. Return test ID.
2
Question Filter Panel
Left sidebar — filter controls: course, chapter(s), topic(s), question_type, difficulty, exam_type. Fires GET /api/questions with params on every filter change. Debounced 400ms.
3
Question Results List
Right panel — paginated list of matching questions (rendered KaTeX). Checkbox to select. Running total: '12 questions selected · 48 marks' sticky footer.
4
Selected Questions (Sorter)
Bottom sheet / split panel — shows selected questions. @dnd-kit drag handles for reorder. Inline section label editor. Individual marks override field. Remove button.
5
Preview
Full-page modal — renders complete paper exactly as PDF will look. Branded header, all questions rendered, page breaks estimated. Scrollable.
6
Save / Download
Save: PATCH /api/tests/:id with question array and status. PDF: GET /api/tests/:id/export/pdf → triggers Puppeteer. DOCX: GET /api/tests/:id/export/docx → triggers docx library.

PDF Generation — Technical Flow
// lib/export/pdf.ts
export async function generateTestPDF(testId: string): Promise<Buffer> {
  // 1. Fetch full test + questions + branding from DB
  const test     = await getTestWithQuestions(testId);
  const branding = await getInstituteBranding();

  // 2. Render to HTML string using React renderToStaticMarkup
  //    This HTML includes: KaTeX CSS, institute branding, all questions
  const html = renderToStaticMarkup(<TestPaperDocument test={test} branding={branding} />);

  // 3. Launch Puppeteer with full HTML
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page    = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // 4. Inject KaTeX CSS (bundled — no network call in Puppeteer)
  await page.addStyleTag({ path: 'node_modules/katex/dist/katex.min.css' });

  // 5. Generate PDF
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: buildHeaderTemplate(branding),   // institute branding
    footerTemplate: buildFooterTemplate(branding),   // page X of Y + institute name
  });

  await browser.close();
  return Buffer.from(pdf);
}

DOCX Generation — LaTeX Handling
KaTeX equations rendered server-side to SVG using katex.renderToString()
SVG converted to PNG buffer using sharp (image processing library)
PNG embedded as inline image in DOCX using docx InlineImage
Plain text portions rendered as normal TextRun elements
Branded header/footer applied using docx Header/Footer classes (same approach as PRD docs)
Output: well-structured Word document, editable, compatible with Word 2016+

# 8. Environment Variables

# .env.local — never commit to Git

# ── Supabase ─────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # public — safe in browser
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # secret — server only

# ── Database (Prisma direct connection) ──────────────────────
DATABASE_URL=postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres

# ── JWT ──────────────────────────────────────────────────────
JWT_SECRET=minimum-32-character-random-secret
JWT_EXPIRES_IN=86400                           # 24 hours in seconds
JWT_REFRESH_EXPIRES_IN=604800                  # 7 days

# ── Google OAuth ─────────────────────────────────────────────
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/callback

# ── App ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://portal.varenyam.com
NODE_ENV=production

# 9. Security Requirements


Security Area
Implementation
JWT Storage
HTTP-only, Secure, SameSite=Strict cookies. Never localStorage. XSS cannot access HTTP-only cookies.
Password Hashing
Handled by Supabase Auth (bcrypt). Minimum 8 characters enforced client + server side.
Input Validation
All API inputs validated with Zod schemas before any DB operation. SQL injection impossible via Prisma parameterised queries.
CORS
Next.js default same-origin policy. API routes only accept requests from NEXT_PUBLIC_APP_URL.
Rate Limiting
Login endpoint: max 5 attempts per IP per 15 minutes (middleware + Supabase built-in). API routes: 100 req/min per user.
Row-Level Security (RLS)
Supabase RLS policies ensure teachers can only read/write their own questions via service role. All admin overrides go through SUPABASE_SERVICE_ROLE_KEY on server only.
File Upload Security
Image uploads validated: mime type whitelist (jpeg, png, webp, svg), max 5MB, virus scan not in Phase 1 scope.
HTTPS
Enforced by Vercel. All HTTP redirected to HTTPS. HSTS header set.
Secrets Management
All secrets in .env.local, never committed. Production secrets in Vercel environment variables dashboard.
Audit Logging
All create/update/delete/download actions logged to audit_log table with user ID and IP.

# 10. Acceptance Criteria

Each module must pass these acceptance criteria before being marked as complete. These are the definition of done.

## 10.1 Authentication
User can register with email + password and receive OTP verification email
User can log in with email + password — JWT set in HTTP-only cookie
User can log in via Google OAuth — account linked if email matches existing user
Invalid credentials return 401 with generic message (no email enumeration)
Protected routes redirect to /login when accessed without valid JWT
Token refresh works transparently — user not logged out mid-session
Super Admin can create teacher accounts; teachers cannot self-register

## 10.2 Taxonomy Manager
Admin can create a Course with name, grade, and stream
Admin can add Chapters under a Course, assign subject and chapter number
Admin can add Topics under a Chapter
Dropdown menus in question form correctly cascade: select Course → Chapter dropdown populates → select Chapter → Topic dropdown populates
Reordering chapters/topics persists correctly after page reload
Soft-deleting a Course hides it and all its Chapters/Topics from all dropdowns

## 10.3 Question Bank
Teacher can submit a complete MCQ with all fields — record created in DB
LaTeX equation in question body renders correctly in live preview (test with: \frac{d}{dx}x^2 = 2x)
Images upload to Supabase Storage and display correctly in question preview
Question search by keyword returns relevant results within 500ms
Filter by topic + difficulty returns only questions matching both criteria
Bulk Excel import of 100 questions completes within 30 seconds
Import error report correctly identifies and describes rows with missing required fields
Teacher cannot edit or delete another teacher's questions

## 10.4 Test Paper Generator
Teacher can create a test, select 20 questions across 3 topics, reorder them, and save
Running marks total updates correctly as questions are added/removed
PDF export: institute logo appears in header, all questions render with correct numbering, LaTeX equations display correctly (no raw code visible)
PDF footer shows page X of Y and institute name on every page
DOCX export opens correctly in Microsoft Word — branding present, text editable
Saved test loads correctly on next login — all questions and order preserved
Test with status='final' is retrievable by Phase 2 digital test system without modification

## 10.5 Performance Benchmarks
Operation
Target
Measurement Method
Page load — dashboard (SSR)
< 1.5 seconds (LCP)
Lighthouse / Vercel Analytics
Question search (1000 questions in DB)
< 500ms response
API route timing log
Question filter change → results update
< 400ms UI update
Browser performance panel
PDF generation (20 questions)
< 8 seconds
Server-side timer log
DOCX generation (20 questions)
< 5 seconds
Server-side timer log
Bulk import (100 questions)
< 30 seconds
Client progress indicator
Login (email + password)
< 1 second
Network tab timing

# 11. Development Timeline — Phase 1


Week(s)
Milestone
Tasks
1–2
Setup & Foundation
Repo setup, Supabase project init, Prisma schema, all DB migrations, auth (JWT + OAuth), middleware, base layout, shadcn/ui config, CI/CD pipeline
3
Taxonomy Manager
Course/Chapter/Topic CRUD APIs, Admin UI — cascading management screens, dropdown components, reorder logic
4–5
Question Input Form
LaTeXEditor with KaTeX live preview, all question type variants (MCQ, NVQ, matrix, multi-select), image upload, form validation (Zod), save to DB
6
Question Pool — List & Search
Filterable/searchable question list, filter sidebar, question card with rendered LaTeX, edit/archive/delete actions, RLS enforcement
7
Bulk Import Tool
Excel template generation, SheetJS parser, validation pipeline, error CSV export, import wizard UI with progress
8–9
Test Builder
Test metadata form, question filter + select panel, running marks counter, @dnd-kit reorder, section labels, marks override, save draft/final
10–11
PDF & DOCX Export
Puppeteer setup on Vercel, branded paper HTML template, KaTeX CSS bundling, header/footer templates, DOCX with equation-as-image, file stream responses
12
Branding Settings & Polish
Institute branding settings screen, logo upload, all branding fields wired to PDF/DOCX output, mobile responsiveness pass, loading states
13
QA, Testing & Deployment
Vitest unit tests, Playwright E2E tests, cross-browser checks, LaTeX edge cases, performance benchmarks, production deployment, client demo

Total Duration:  13 weeks from project kickoff to production deployment and client handover.

# 12. Phase 2 Readiness Checklist

These are the technical decisions made in Phase 1 specifically to ensure Phase 2 (Online Test Platform + Student Dashboard) can be built with zero rework to the existing codebase.

Phase 1 Decision
Phase 2 Benefit
tests.status column includes 'published'
Phase 2 simply flips status — no schema change needed
tests.scheduled_start / scheduled_end stored
Test availability window already in DB — Phase 2 reads it
tests.shuffle_questions boolean stored
Phase 2 test engine reads this flag to randomise question order per student
tests.assigned_batch column present
Phase 2 batch assignment works without migration
test_questions.position stored
Phase 2 serves questions in exact order without re-querying
marks_correct / marks_negative per question
Phase 2 score engine reads directly — no recalculation needed
users.role includes 'student' as valid value
Add student records without schema change in Phase 2
JWT payload includes role
Phase 2 student routes protected by same middleware — just add student role check
questions.times_used counter
Phase 2 can track question performance across digital tests
All question content as LaTeX strings
Phase 2 test UI uses same KaTeX renderer — no content reformatting

— End of Technical PRD — Phase 1 —
Varenyam Coaching Institute  |  Technical PRD  |  Phase 1  |  May 2026  |  Confidential
