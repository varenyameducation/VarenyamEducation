// TODO: replace with real /api/tests once backend lands.

import type { TestStatus } from '@/lib/validation/test'
import type { SubjectValue, ExamTypeValue } from '@/lib/validation/question'

export interface TestListItem {
  id: string
  title: string
  course_id: string
  subjects: SubjectValue[]
  exam_type: ExamTypeValue
  duration_minutes: number
  status: TestStatus
  question_count: number
  total_marks: number
  created_at: string
  updated_at: string
}

export const MOCK_TESTS: TestListItem[] = [
  {
    id: 't-001',
    title: 'JEE Foundation — Kinematics Drill #1',
    course_id: 'c-jee-foundation',
    subjects: ['Physics'],
    exam_type: 'jee',
    duration_minutes: 90,
    status: 'draft',
    question_count: 12,
    total_marks: 48,
    created_at: '2026-05-01T10:00:00+05:30',
    updated_at: '2026-05-02T15:30:00+05:30',
  },
  {
    id: 't-002',
    title: 'Class 11 PCM — Mid-term mock',
    course_id: 'c-class11-pcm',
    subjects: ['Physics', 'Chemistry', 'Maths'],
    exam_type: 'school',
    duration_minutes: 180,
    status: 'final',
    question_count: 30,
    total_marks: 100,
    created_at: '2026-04-25T09:00:00+05:30',
    updated_at: '2026-05-04T18:00:00+05:30',
  },
  {
    id: 't-003',
    title: 'NEET Biology — Human Physiology revision',
    course_id: 'c-neet-class12',
    subjects: ['Biology'],
    exam_type: 'neet',
    duration_minutes: 120,
    status: 'published',
    question_count: 25,
    total_marks: 100,
    created_at: '2026-04-15T08:00:00+05:30',
    updated_at: '2026-04-30T12:00:00+05:30',
  },
]
