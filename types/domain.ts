export type {
  Course,
  Chapter,
  Topic,
  User,
  Question,
  Test,
  TestQuestion,
  InstituteBranding,
  AuditLog,
} from '@prisma/client'

export type Role = 'super_admin' | 'admin' | 'teacher'

export type Stream = 'JEE' | 'NEET' | 'School' | 'Board'

export type Subject = 'Physics' | 'Chemistry' | 'Maths' | 'Biology'

export type QuestionType = 'mcq' | 'numerical' | 'matrix_match' | 'multi_select'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'advanced'

export type ExamType = 'school' | 'board' | 'jee' | 'neet'
