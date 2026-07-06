# Varenyam Platform — Phase 2
## Student Online Test Platform
### Product Overview for Client Review

**Prepared for:** Varenyam Coaching Institute
**Date:** July 2026
**Status:** Awaiting Client Approval

---

## What We Are Building

Phase 1 gave your institute a powerful backend tool — your teachers can now build question banks, create test papers, and download them as PDF or Word documents to print and distribute physically.

Phase 2 takes that same content and makes it **live and interactive**. Students will be able to log in to the Varenyam platform, see tests assigned to them by their teachers, and give those tests entirely on screen — just like JEE Mock Test portals or any competitive exam platform. Their scores are calculated automatically the moment they submit, and both students and teachers can see the results instantly.

No printing. No manual checking. No waiting.

---

## Who Uses What

The platform will have four types of users, each with their own separate area:

### Super Admin
The institute owner or head. Has complete control over everything — can manage teachers, create batches, see all results, and configure the entire platform.

### Sub-Admin
A senior staff member or coordinator. Can manage students and batches, publish tests, and view results. Cannot change platform settings.

### Teacher
Creates questions and builds test papers (same as today). In Phase 2, teachers can also **publish** a test to a specific batch of students with a set time window — for example, "Class 9 - A must complete this test between Saturday 10 AM and 12 PM."

### Student
A completely separate login. Students never see the teacher/admin side at all. They log in with their **roll number and password**, see their upcoming tests, give tests on screen, and view their results and scores.

---

## How the Student Experience Works

### Step 1 — Student Logs In
The student goes to the Varenyam website and logs in using their **roll number** and a password (set by the admin). On their first login, they are asked to set a new personal password.

### Step 2 — Student Sees Upcoming Tests
After logging in, the student sees their personal dashboard showing:
- Tests that are currently available to take
- Tests coming up soon (not yet open)
- Past tests with their scores

### Step 3 — Reading Instructions
Before starting a test, the student sees a screen with:
- Test name and subject
- Total marks and duration
- Any special instructions from the teacher
- A "Start Test" button

The test only opens if it is within the scheduled time window. If the window has not started yet, the button is disabled.

### Step 4 — Taking the Test (The Main Screen)
Once started, the student sees a clean test-taking screen:

**Left side** — A grid of question numbers (like Q1, Q2, Q3...) that the student can click to jump to any question directly. Each number is colour coded:
- Grey = not yet answered
- Green = answered
- Yellow = answered but marked for review
- Star = flagged for review without an answer

**Right side** — The current question is displayed. For Maths/Science questions, all equations and diagrams render exactly as they would on a printed paper. The student selects their answer (or types a number for numerical questions).

**Top bar** — Shows the test name, a live countdown timer, and a Submit button.

### Step 5 — Auto-Save (Nothing Is Lost)
Every time the student moves to the next question, their answer is automatically saved. If the internet cuts out or the browser is accidentally closed, the student can reopen the test and all their answers will still be there, exactly as they left them. The timer also continues correctly — it cannot be cheated by refreshing the page.

### Step 6 — Submitting
When the student is done, they click "Submit Test." They see a confirmation that shows how many questions are still unanswered, giving them a chance to go back. Once they confirm, the test is submitted.

If the student runs out of time, the test is submitted automatically.

### Step 7 — Instant Result
The moment the test is submitted, the student sees their result:
- Total score and percentage
- Their rank among all students in the batch who took the same test
- A question-by-question breakdown showing what they answered, what was correct, and the solution/explanation for each question

---

## How the Teacher/Admin Experience Changes

Teachers already know how to create tests. Phase 2 adds one new step — **Publishing**.

After a test is built and finalised, the teacher clicks "Publish" and fills in:
- **Which batch** gets this test (e.g. "Class 9 - A")
- **When the test opens** (e.g. Saturday, 10:00 AM)
- **When the test closes** (e.g. Saturday, 12:00 PM)
- **Should questions be shuffled?** (so each student gets questions in a different order — reduces copying)

That is all the teacher needs to do. The test automatically appears on every student in that batch's dashboard at the right time.

### Viewing Results
Once students start submitting, teachers and admins can view:
- A ranked list of all students showing their score, percentage, and time taken
- A per-student breakdown showing exactly what each student answered for each question
- Who submitted, who did not attempt, and who is still in progress

---

## Managing Students and Batches

### Batches
A batch is simply a group of students — for example "Class 9 - A", "Class 10 PCM", or "JEE 2027 Group B." Each batch is linked to a course. Tests are assigned to batches, not to individual students.

### Adding Students
The admin can add students one at a time or **bulk upload an Excel sheet** with all student details — roll number, name, batch, and a temporary password. The system creates all student accounts in one go.

### Student Management
Admins can:
- See all students in any batch
- Reset a student's password if they forget it
- Deactivate a student who has left the institute
- View a student's full test history and scores across all tests

---

## What Stays the Same from Phase 1

Everything built in Phase 1 continues to work exactly as before:
- Teachers still add questions and import from PDFs/DOCX
- Test papers can still be downloaded as PDF or Word documents for physical exams
- All existing question bank data, taxonomy, and branding settings remain unchanged

Phase 2 simply adds a new way to **deliver and take** those same tests — on screen.

---

## What This Looks Like in Numbers

| Feature | Phase 1 | Phase 2 |
|---|---|---|
| Test delivery | Print and hand out | Print + Online on Varenyam |
| Answer checking | Manual | Automatic (instant) |
| Results | Manual calculation | Instant, with rank and breakdown |
| Student data | Not maintained | Full history, scores, attempts |
| Exam security | Physical invigilation only | Shuffled questions per student |

---

## What We Are Not Building in Phase 2

To keep this phase focused and deliver quickly, the following are intentionally left for a future phase:

- **Mobile app** — the student portal will work on mobile browsers but there is no dedicated app yet
- **Live proctoring** — no webcam or tab-switch detection in this phase
- **Multiple attempts** — each student gets one attempt per test (admin can manually reset if needed)
- **Parent portal** — parents cannot log in yet; results are visible to students and admins only
- **SMS or email notifications** — no automated alerts when a test is published
- **Custom assignments** — tests are assigned to a whole batch, not to individual students
- **Detailed analytics charts** — results are shown as a table; graphs and trend analysis come later

---

## Questions We Need Your Answers To

Before we start building, please confirm the following:

1. **Student login page** — Should the student login be at a separate address (e.g. `varenyam.com/student/login`) or on the same login page as teachers with a toggle to switch between the two?

2. **Re-attempts** — If a student submits a test and wants to redo it, should the admin be able to reset their attempt and allow them to try again? Or is one attempt final?

3. **Roll number format** — Do you have a specific format for roll numbers (e.g. VAR-9A-001) or should admins be free to use any format they choose?

4. **First-time password** — When a student logs in for the first time with the admin-set password, should the system force them to set a new password immediately, or just show a reminder banner?

5. **Batch membership** — Can a student belong to more than one batch? For example, can a student be in "Class 9 - A" for Maths and "JEE Foundation" for Physics? Or is each student in exactly one batch?

6. **Result visibility** — As soon as a student submits, they see their full result and correct answers. Is that fine, or would you like the admin to control when results are released (for example, hold results until all students have submitted)?

7. **Matrix match questions online** — For questions with a match-the-column format, should we show them as interactive on screen, or display them as an image (simpler to build) and let the student type their answer?

---

*Please review and share your answers to the questions above. Once approved, we will begin development.*

*Varenyam Coaching Institute | Phase 2 Client Brief | July 2026*
