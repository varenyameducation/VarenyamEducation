// TODO: switch to types/domain.ts once integration/taxonomy-types merges

export type Stream = 'JEE' | 'NEET' | 'School' | 'Board'
export type Subject = 'Physics' | 'Chemistry' | 'Maths' | 'Biology'

export type CourseUI = {
  id: string
  name: string
  grade: number
  stream: Stream | null
  description: string | null
  chapter_count: number
}

export type ChapterUI = {
  id: string
  course_id: string
  name: string
  subject: Subject
  chapter_no: number | null
  topic_count: number
}

export type TopicUI = {
  id: string
  chapter_id: string
  name: string
  topic_no: number | null
}

export const MOCK_COURSES: CourseUI[] = [
  {
    id: 'c-class11-pcm',
    name: 'Class 11 — PCM',
    grade: 11,
    stream: 'School',
    description: 'CBSE Class 11 Physics, Chemistry and Maths foundation track.',
    chapter_count: 3,
  },
  {
    id: 'c-jee-foundation',
    name: 'JEE Foundation',
    grade: 11,
    stream: 'JEE',
    description: 'Two-year JEE Main + Advanced preparation, starting Class 11.',
    chapter_count: 3,
  },
  {
    id: 'c-neet-class12',
    name: 'NEET Class 12',
    grade: 12,
    stream: 'NEET',
    description: 'Final-year NEET drill — Biology heavy, with Physics and Chemistry revision.',
    chapter_count: 2,
  },
]

export const MOCK_CHAPTERS: ChapterUI[] = [
  // Class 11 — PCM
  {
    id: 'ch-c11-kinematics',
    course_id: 'c-class11-pcm',
    name: 'Kinematics',
    subject: 'Physics',
    chapter_no: 1,
    topic_count: 3,
  },
  {
    id: 'ch-c11-some-basic-concepts',
    course_id: 'c-class11-pcm',
    name: 'Some Basic Concepts of Chemistry',
    subject: 'Chemistry',
    chapter_no: 2,
    topic_count: 3,
  },
  {
    id: 'ch-c11-sets',
    course_id: 'c-class11-pcm',
    name: 'Sets and Functions',
    subject: 'Maths',
    chapter_no: 3,
    topic_count: 2,
  },
  // JEE Foundation
  {
    id: 'ch-jee-laws-of-motion',
    course_id: 'c-jee-foundation',
    name: 'Laws of Motion',
    subject: 'Physics',
    chapter_no: 1,
    topic_count: 3,
  },
  {
    id: 'ch-jee-thermodynamics',
    course_id: 'c-jee-foundation',
    name: 'Thermodynamics',
    subject: 'Chemistry',
    chapter_no: 2,
    topic_count: 2,
  },
  {
    id: 'ch-jee-trigonometry',
    course_id: 'c-jee-foundation',
    name: 'Trigonometry',
    subject: 'Maths',
    chapter_no: 3,
    topic_count: 3,
  },
  // NEET Class 12
  {
    id: 'ch-neet-human-physiology',
    course_id: 'c-neet-class12',
    name: 'Human Physiology',
    subject: 'Biology',
    chapter_no: 1,
    topic_count: 3,
  },
  {
    id: 'ch-neet-genetics',
    course_id: 'c-neet-class12',
    name: 'Genetics and Evolution',
    subject: 'Biology',
    chapter_no: 2,
    topic_count: 2,
  },
]

export const MOCK_TOPICS: TopicUI[] = [
  // Kinematics
  { id: 't-kin-displacement', chapter_id: 'ch-c11-kinematics', name: 'Displacement and velocity', topic_no: 1 },
  { id: 't-kin-acceleration', chapter_id: 'ch-c11-kinematics', name: 'Uniform acceleration', topic_no: 2 },
  { id: 't-kin-projectile', chapter_id: 'ch-c11-kinematics', name: 'Projectile motion', topic_no: 3 },
  // Some Basic Concepts of Chemistry
  { id: 't-bc-mole', chapter_id: 'ch-c11-some-basic-concepts', name: 'The mole concept', topic_no: 1 },
  { id: 't-bc-stoich', chapter_id: 'ch-c11-some-basic-concepts', name: 'Stoichiometry', topic_no: 2 },
  { id: 't-bc-empirical', chapter_id: 'ch-c11-some-basic-concepts', name: 'Empirical and molecular formulae', topic_no: 3 },
  // Sets and Functions
  { id: 't-sets-basics', chapter_id: 'ch-c11-sets', name: 'Sets and operations', topic_no: 1 },
  { id: 't-sets-functions', chapter_id: 'ch-c11-sets', name: 'Relations and functions', topic_no: 2 },
  // Laws of Motion
  { id: 't-lom-newton1', chapter_id: 'ch-jee-laws-of-motion', name: "Newton's first law", topic_no: 1 },
  { id: 't-lom-newton2', chapter_id: 'ch-jee-laws-of-motion', name: "Newton's second law", topic_no: 2 },
  { id: 't-lom-friction', chapter_id: 'ch-jee-laws-of-motion', name: 'Friction', topic_no: 3 },
  // Thermodynamics
  { id: 't-thermo-first-law', chapter_id: 'ch-jee-thermodynamics', name: 'First law of thermodynamics', topic_no: 1 },
  { id: 't-thermo-enthalpy', chapter_id: 'ch-jee-thermodynamics', name: 'Enthalpy and Hess law', topic_no: 2 },
  // Trigonometry
  { id: 't-trig-ratios', chapter_id: 'ch-jee-trigonometry', name: 'Trigonometric ratios', topic_no: 1 },
  { id: 't-trig-identities', chapter_id: 'ch-jee-trigonometry', name: 'Identities and equations', topic_no: 2 },
  { id: 't-trig-inverse', chapter_id: 'ch-jee-trigonometry', name: 'Inverse trigonometric functions', topic_no: 3 },
  // Human Physiology
  { id: 't-hp-digestion', chapter_id: 'ch-neet-human-physiology', name: 'Digestion and absorption', topic_no: 1 },
  { id: 't-hp-breathing', chapter_id: 'ch-neet-human-physiology', name: 'Breathing and gas exchange', topic_no: 2 },
  { id: 't-hp-neural', chapter_id: 'ch-neet-human-physiology', name: 'Neural control and coordination', topic_no: 3 },
  // Genetics
  { id: 't-gen-mendel', chapter_id: 'ch-neet-genetics', name: 'Mendelian inheritance', topic_no: 1 },
  { id: 't-gen-molecular', chapter_id: 'ch-neet-genetics', name: 'Molecular basis of inheritance', topic_no: 2 },
]

export const STREAMS: Stream[] = ['JEE', 'NEET', 'School', 'Board']
export const SUBJECTS: Subject[] = ['Physics', 'Chemistry', 'Maths', 'Biology']
