// TODO: replace with real /api/questions once backend lands.

import type {
  QuestionTypeValue,
  DifficultyValue,
  ExamTypeValue,
  SubjectValue,
} from '@/lib/validation/question'

export interface QuestionListItem {
  id: string
  course_id: string
  chapter_id: string
  topic_id: string
  subject: SubjectValue
  question_type: QuestionTypeValue
  difficulty: DifficultyValue
  exam_type: ExamTypeValue
  marks_correct: number
  marks_negative: number
  question_body: string
  is_verified: boolean
  created_at: string
}

export const MOCK_QUESTIONS: QuestionListItem[] = [
  {
    id: 'q-001',
    course_id: 'c-jee-foundation',
    chapter_id: 'ch-jee-laws-of-motion',
    topic_id: 't-lom-newton2',
    subject: 'Physics',
    question_type: 'mcq',
    difficulty: 'medium',
    exam_type: 'jee',
    marks_correct: 4,
    marks_negative: 1,
    question_body:
      'A block of mass $m$ is placed on a frictionless inclined plane at angle $\\theta$. Acceleration along the slope is:',
    is_verified: true,
    created_at: '2026-05-09T10:11:00+05:30',
  },
  {
    id: 'q-002',
    course_id: 'c-jee-foundation',
    chapter_id: 'ch-jee-trigonometry',
    topic_id: 't-trig-identities',
    subject: 'Maths',
    question_type: 'numerical',
    difficulty: 'hard',
    exam_type: 'jee',
    marks_correct: 4,
    marks_negative: 0,
    question_body:
      'If $\\sin\\theta + \\cos\\theta = 1.2$, find $\\sin 2\\theta$ (to 2 decimal places).',
    is_verified: false,
    created_at: '2026-05-09T11:30:00+05:30',
  },
  {
    id: 'q-003',
    course_id: 'c-class11-pcm',
    chapter_id: 'ch-c11-kinematics',
    topic_id: 't-kin-projectile',
    subject: 'Physics',
    question_type: 'multi_select',
    difficulty: 'easy',
    exam_type: 'school',
    marks_correct: 2,
    marks_negative: 0,
    question_body:
      'Which of the following statements about projectile motion are TRUE?',
    is_verified: true,
    created_at: '2026-05-08T16:00:00+05:30',
  },
  {
    id: 'q-004',
    course_id: 'c-neet-class12',
    chapter_id: 'ch-neet-human-physiology',
    topic_id: 't-hp-digestion',
    subject: 'Biology',
    question_type: 'matrix_match',
    difficulty: 'advanced',
    exam_type: 'neet',
    marks_correct: 4,
    marks_negative: 1,
    question_body: 'Match the digestive enzyme (Column I) with its substrate (Column II).',
    is_verified: false,
    created_at: '2026-05-07T09:20:00+05:30',
  },
]
