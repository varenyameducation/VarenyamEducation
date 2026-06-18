/**
 * Backend seed: Class 9 CBSE · Maths · Chapter "The World of Numbers".
 *
 * Loads the 100 "Concept Wise Practice" MCQs (Number Systems) from the
 * shared question PDF, filed under the 8 topics named inside that PDF,
 * each with its correct option + worked solution from the answer PDF.
 *
 * All maths is written in LaTeX using the app's delimiters — \( … \) inline
 * and \[ … \] display — so the KaTeX renderer (lib/ui/render-body-html.ts)
 * shows real fractions, roots, exponents and recurring-decimal bars. Every
 * LaTeX span is validated through KaTeX (throwOnError) before any DB write;
 * the run aborts if a single expression fails to parse.
 *
 * Idempotent:
 *   Course/Subject/Chapter — looked up (must already exist via
 *     seed-cbse-chapters.mjs); the script aborts if any is missing.
 *   Topic    — found by (chapter_id, name), created if missing.
 *   Question — every row is tagged 'class9-cbse-won'. On each run the
 *     script first hard-deletes all questions carrying that tag (their
 *     QuestionTaxonomy rows cascade away), then re-inserts fresh, so a
 *     re-run never duplicates and always reflects this file.
 *
 * Run with the same env as the app, from /mnt/d/varenyam:
 *   node --env-file=.env.local scripts/seed-class9-world-of-numbers.mjs
 * (falls back to reading .env.local itself if --env-file is unsupported)
 */

import { PrismaClient } from '@prisma/client'
import katex from 'katex'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  let text
  try {
    text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const prisma = new PrismaClient()

const COURSE_NAME = 'CBSE-Grade-9'
const COURSE_GRADE = 9
const SUBJECT_NAME = 'Maths'
const CHAPTER_NAME = 'The World of Numbers'
const EXAM_TYPE = 'school'
const IMPORT_TAG = 'class9-cbse-won'

// 8 topics, in the order and wording used in the question PDF.
const TOPICS = [
  { no: 1, name: 'Introduction to Number Systems', from: 1, to: 5 },
  {
    no: 2,
    name: 'Rational Number, Representation of Rational Numbers on line and Operations on Rational Numbers',
    from: 6,
    to: 19,
  },
  {
    no: 3,
    name: 'Rational Numbers between two Rational Numbers, Properties and Absolute value',
    from: 20,
    to: 34,
  },
  { no: 4, name: 'Decimal Expansion of Rational Numbers', from: 35, to: 46 },
  {
    no: 5,
    name: 'Irrational Numbers and Their Decimal Expansion, Representation of Irrational Numbers on Number Line, Properties of Irrational Numbers',
    from: 47,
    to: 60,
  },
  { no: 6, name: 'Real Numbers and Their Properties, Surds & Radicals', from: 61, to: 77 },
  { no: 7, name: 'Rationalization and Rationalizing Factor', from: 78, to: 88 },
  { no: 8, name: 'Imaginary Numbers', from: 89, to: 100 },
]

// n, body, options a–d, correct answer letter, optional solution.
// Maths is LaTeX inside \( … \). Prose stays plain text.
const Q = [
  // ── Topic 1: Introduction to Number Systems ──
  { n: 1, body: 'Which of the following is the smallest whole number?', a: '\\(1\\)', b: '\\(0\\)', c: '\\(-1\\)', d: '\\(2\\)', ans: 'B' },
  { n: 2, body: 'The set of natural numbers including 0 is called the set of:', a: 'Integers', b: 'Whole numbers', c: 'Prime numbers', d: 'Rational numbers', ans: 'B' },
  { n: 3, body: 'How many factors does a prime number have?', a: 'Exactly one', b: 'Exactly two', c: 'More than two', d: 'Three', ans: 'B' },
  { n: 4, body: 'Two numbers are said to be co-prime if their H.C.F. is:', a: '\\(0\\)', b: '\\(2\\)', c: '\\(1\\)', d: 'The smaller number', ans: 'C' },
  { n: 5, body: 'Which of the following is a composite number?', a: '\\(7\\)', b: '\\(11\\)', c: '\\(9\\)', d: '\\(13\\)', ans: 'C' },

  // ── Topic 2: Rational Number, Representation & Operations ──
  { n: 6, body: 'Which of the following are rational number?', a: 'Integers', b: 'Fractions', c: 'Whole numbers', d: 'All of these', ans: 'D' },
  { n: 7, body: 'A rational number can be represented in the form of:', a: '\\(\\frac{p}{q}\\)', b: '\\(pq\\)', c: '\\(p + q\\)', d: '\\(p - q\\)', ans: 'A' },
  { n: 8, body: 'Which of the following rational numbers is in the standard form?', a: '\\(\\frac{1}{3}\\)', b: '\\(\\frac{26}{78}\\)', c: '\\(-\\frac{14}{16}\\)', d: '\\(\\frac{48}{-96}\\)', ans: 'A' },
  { n: 9, body: 'Which of the following rational numbers is in the standard form?', a: '\\(-\\frac{12}{26}\\)', b: '\\(-\\frac{49}{91}\\)', c: '\\(-\\frac{9}{16}\\)', d: '\\(-\\frac{28}{105}\\)', ans: 'C' },
  { n: 10, body: 'To represent the rational number \\(\\frac{3}{5}\\) on a number line, the unit length between 0 and 1 must be divided into:', a: '3 equal parts', b: '5 equal parts', c: '8 equal parts', d: '15 equal parts', ans: 'B' },
  { n: 11, body: 'The rational number \\(-\\frac{7}{4}\\) lies between which two consecutive integers on the number line?', a: '0 and 1', b: '\\(-1\\) and \\(-2\\)', c: '\\(-2\\) and \\(-3\\)', d: '1 and 2', ans: 'C' },
  { n: 12, body: 'Between two rational numbers', a: 'There is no rational number.', b: 'There is exactly one rational number.', c: 'There are infinitely many rational numbers.', d: 'There are only rational numbers and no irrational numbers.', ans: 'C', sol: 'Consider two rational numbers 3 and 4. Between them there are many rational numbers like \\(3.1, 3.2, 3.22, 3.223, \\ldots\\) Therefore, there are infinitely many rational numbers.' },
  { n: 13, body: '\\(\\frac{3}{7}\\) lies between the fractions ________.', a: '\\(\\frac{4}{9},\\ \\frac{5}{9}\\)', b: '\\(\\frac{43}{99},\\ \\frac{4}{9}\\)', c: '\\(\\frac{42}{99},\\ \\frac{4}{9}\\)', d: '\\(\\frac{41}{99},\\ \\frac{42}{99}\\)', ans: 'C', sol: '\\(\\frac{3}{7}=0.\\overline{428571}\\). Comparing decimals, \\(\\frac{42}{99}=0.\\overline{42}\\) and \\(\\frac{4}{9}=0.\\overline{4}\\), and \\(0.424242\\ldots < 0.428571\\ldots < 0.4444\\ldots\\)' },
  { n: 14, body: 'What number should be added to \\(\\frac{7}{12}\\) to get \\(\\frac{4}{15}\\)?', a: '\\(-\\frac{19}{60}\\)', b: '\\(-\\frac{11}{30}\\)', c: '\\(\\frac{51}{60}\\)', d: '\\(\\frac{1}{20}\\)', ans: 'A', sol: '\\(\\frac{4}{15} - \\frac{7}{12} = \\frac{16-35}{60} = -\\frac{19}{60}\\).' },
  { n: 15, body: 'What should be subtracted from \\(\\left(\\frac{3}{4} - \\frac{2}{3}\\right)\\) to get \\(-\\frac{1}{6}\\) ?', a: '\\(\\frac{1}{32}\\)', b: '\\(\\frac{1}{16}\\)', c: '\\(\\frac{1}{8}\\)', d: '\\(\\frac{1}{4}\\)', ans: 'D', sol: '\\(\\frac{3}{4}-\\frac{2}{3}=\\frac{1}{12}\\). Then \\(\\frac{1}{12}-x=-\\frac{1}{6} \\Rightarrow x=\\frac{1}{12}+\\frac{1}{6}=\\frac{3}{12}=\\frac{1}{4}\\).' },
  { n: 16, body: 'Product of two rational number is \\(-15\\). If one number is 9, find the other number.', a: '\\(-\\frac{3}{5}\\)', b: '\\(-\\frac{5}{3}\\)', c: '\\(\\frac{3}{5}\\)', d: '\\(\\frac{5}{3}\\)', ans: 'B', sol: '\\(-15 \\div 9 = -\\frac{5}{3}\\).' },
  { n: 17, body: 'The sum of the rational numbers \\(-\\frac{8}{19}\\) and \\(-\\frac{4}{57}\\) is ____', a: '\\(-\\frac{5}{57}\\)', b: '\\(\\frac{7}{22}\\)', c: '\\(-\\frac{28}{57}\\)', d: '\\(\\frac{4}{27}\\)', ans: 'C', sol: '\\(-\\frac{8}{19}=-\\frac{24}{57}\\); \\(-\\frac{24}{57}-\\frac{4}{57}=-\\frac{28}{57}\\).' },
  { n: 18, body: 'A water tank is being filled by a pipe that pours in \\(\\frac{3}{4}\\) litre of water every minute. How much water will be in the tank after \\(8\\frac{2}{3}\\) minutes?', a: '\\(6\\frac{1}{2}\\) litres', b: '\\(6\\frac{1}{4}\\) litres', c: '7 litres', d: '\\(5\\frac{3}{4}\\) litres', ans: 'A', sol: '\\(\\frac{3}{4}\\times\\frac{26}{3}=\\frac{78}{12}=\\frac{13}{2}=6\\frac{1}{2}\\) litres.' },
  { n: 19, body: 'A car travels \\(12\\frac{3}{5}\\) km on one litre of petrol. How far will it travel on \\(2\\frac{1}{2}\\) litres of petrol?', a: '30 km', b: '\\(31\\frac{1}{2}\\) km', c: '32 km', d: '\\(28\\frac{1}{4}\\) km', ans: 'B', sol: '\\(\\frac{63}{5}\\times\\frac{5}{2}=\\frac{315}{10}=\\frac{63}{2}=31\\frac{1}{2}\\) km.' },

  // ── Topic 3: Rational Numbers between two Rational Numbers, Properties & Absolute value ──
  { n: 20, body: 'Find six rational numbers between 3 and 4.', a: '\\(\\frac{31}{10}, \\frac{32}{10}, \\frac{35}{10}, \\frac{36}{10}, \\frac{37}{10}, \\frac{39}{10}\\)', b: '\\(\\frac{1}{10}, \\frac{2}{10}, \\frac{3}{10}, \\frac{4}{10}, \\frac{5}{10}, \\frac{6}{10}\\)', c: '\\(\\frac{21}{5}, \\frac{22}{5}, \\frac{25}{5}, \\frac{26}{5}, \\frac{27}{5}, \\frac{29}{5}\\)', d: '\\(\\frac{9}{10}, \\frac{11}{10}, \\frac{12}{10}, \\frac{13}{10}, \\frac{14}{10}, \\frac{16}{10}\\)', ans: 'A' },
  { n: 21, body: 'Find five rational numbers between \\(\\frac{3}{5}\\) and \\(\\frac{4}{5}\\).', a: '\\(\\frac{16}{25}, \\frac{17}{25}, \\frac{18}{25}, \\frac{19}{25}, \\frac{20}{25}\\)', b: '\\(\\frac{19}{30}, \\frac{20}{30}, \\frac{21}{30}, \\frac{22}{30}, \\frac{23}{30}\\)', c: '\\(\\frac{9}{12}, \\frac{10}{12}, \\frac{11}{12}, \\frac{13}{12}, \\frac{14}{12}\\)', d: '\\(\\frac{22}{30}, \\frac{23}{30}, \\frac{24}{30}, \\frac{25}{30}, \\frac{26}{30}\\)', ans: 'B' },
  { n: 22, body: 'Which of the rational numbers \\(\\frac{14}{9}, \\frac{5}{2}\\) is the greatest?', a: '\\(\\frac{5}{2}\\)', b: '\\(\\frac{14}{9}\\)', c: 'equal', d: 'none', ans: 'A' },
  { n: 23, body: 'Which of the rational numbers \\(-\\frac{4}{9}, \\frac{5}{-12}, \\frac{7}{-18}, \\frac{2}{-3}\\) is the greatest?', a: '\\(\\frac{7}{-18}\\)', b: '\\(-\\frac{4}{9}\\)', c: '\\(\\frac{2}{-3}\\)', d: '\\(\\frac{5}{-12}\\)', ans: 'A' },
  { n: 24, body: 'Which of the following forms a pair of equivalent rational numbers?', a: '\\(\\frac{24}{40}\\) and \\(\\frac{35}{5}\\)', b: '\\(-\\frac{25}{35}\\) and \\(\\frac{55}{-77}\\)', c: '\\(-\\frac{8}{15}\\) and \\(-\\frac{24}{48}\\)', d: '\\(\\frac{9}{72}\\) and \\(-\\frac{3}{21}\\)', ans: 'B', sol: '\\(-\\frac{25}{35}=-\\frac{5}{7}\\) and \\(\\frac{55}{-77}=-\\frac{5}{7}\\), so they are equivalent.' },
  { n: 25, body: 'Which of the following rational numbers lies between \\(\\frac{3}{5}\\) and \\(\\frac{4}{7}\\) ?', a: '\\(\\frac{41}{70}\\)', b: '\\(\\frac{1}{2}\\)', c: '\\(\\frac{5}{7}\\)', d: '\\(\\frac{41}{35}\\)', ans: 'A', sol: 'Mean \\(= \\left(\\frac{3}{5}+\\frac{4}{7}\\right)\\div 2 = \\frac{41}{70}\\approx 0.586\\), which lies between 0.571 and 0.6.' },
  { n: 26, body: 'Which of the following does NOT lie between \\(-\\frac{2}{3}\\) and \\(\\frac{1}{4}\\) ?', a: '\\(-\\frac{1}{2}\\)', b: '\\(0\\)', c: '\\(\\frac{1}{5}\\)', d: '\\(-\\frac{3}{4}\\)', ans: 'D', sol: 'Range is \\(-0.667\\) to \\(0.25\\); \\(-\\frac{3}{4}=-0.75\\) falls outside it.' },
  { n: 27, body: 'The multiplicative inverse of \\(\\left(-\\frac{5}{9}\\right)\\) is:', a: '\\(\\frac{5}{9}\\)', b: '\\(\\frac{9}{5}\\)', c: '\\(-\\frac{9}{5}\\)', d: '\\(-\\frac{5}{9}\\)', ans: 'C', sol: 'Inverse of \\(-\\frac{5}{9}\\) is \\(-\\frac{9}{5}\\), since \\(\\left(-\\frac{5}{9}\\right)\\times\\left(-\\frac{9}{5}\\right)=1\\).' },
  { n: 28, body: 'Which of the following statements is true for rational numbers?', a: 'They are closed under division', b: 'Subtraction is commutative', c: 'They are closed under subtraction', d: 'Every rational number has a multiplicative inverse', ans: 'C', sol: 'Difference of two rationals is always rational; the others fail (division by zero, non-commutativity, 0 has no inverse).' },
  { n: 29, body: 'The value of \\(\\left|-\\frac{3}{4}\\right| + \\left|\\frac{5}{8}\\right| - \\left|-\\frac{1}{2}\\right|\\) is:', a: '\\(\\frac{1}{8}\\)', b: '\\(\\frac{7}{8}\\)', c: '\\(\\frac{9}{8}\\)', d: '\\(\\frac{11}{8}\\)', ans: 'B', sol: '\\(\\frac{3}{4}+\\frac{5}{8}-\\frac{1}{2}=\\frac{6}{8}+\\frac{5}{8}-\\frac{4}{8}=\\frac{7}{8}\\).' },
  { n: 30, body: 'Which property is shown in the following:  \\(\\frac{1}{2} + \\left(\\frac{1}{4} + \\frac{2}{3}\\right) = \\left(\\frac{1}{2} + \\frac{1}{4}\\right) + \\frac{2}{3}\\)', a: 'associativity', b: 'distributivity', c: 'commutativity', d: 'none of these', ans: 'A' },
  { n: 31, body: 'Which of the following is commutative for rational numbers?', a: 'Addition and subtraction', b: 'Addition and multiplication', c: 'Multiplication and division', d: 'Subtraction and division', ans: 'B' },
  { n: 32, body: 'Using appropriate properties evaluate: \\(\\left(\\frac{13}{7}\\times\\frac{11}{26}\\right) - \\left(-\\frac{4}{7}\\times\\frac{5}{8}\\right)\\) is equal to', a: '\\(\\frac{249}{126}\\)', b: '\\(\\frac{8}{7}\\)', c: '\\(\\frac{29}{126}\\)', d: '\\(\\frac{26}{9}\\)', ans: 'B' },
  { n: 33, body: 'The reciprocal of a negative rational number', a: 'Is a positive.', b: 'Is a negative.', c: 'Can be either positive or negative.', d: 'Does not exist.', ans: 'B' },
  { n: 34, body: 'Which of the following statements is false?', a: '\\(\\left|-\\frac{5}{3}\\right|\\) lies on the right of 0 on the number line.', b: '\\(-|-x| = x\\) for all rational numbers.', c: '\\(-\\frac{7}{17}\\) lies on the left of 0 on the number line', d: 'Every whole number is a rational number.', ans: 'B' },

  // ── Topic 4: Decimal Expansion of Rational Numbers ──
  { n: 35, body: 'A rational number \\(\\frac{p}{q}\\) (in lowest terms) has a terminating decimal expansion only when the prime factorisation of \\(q\\) is of the form:', a: '\\(2^{n} \\times 5^{m}\\)', b: '\\(2^{n} \\times 3^{m}\\)', c: '\\(3^{n} \\times 5^{m}\\)', d: 'any prime factors', ans: 'A' },
  { n: 36, body: 'Which of the following rational numbers has a non-terminating but recurring decimal expansion?', a: '\\(\\frac{13}{40}\\)', b: '\\(\\frac{7}{8}\\)', c: '\\(\\frac{5}{12}\\)', d: '\\(\\frac{17}{25}\\)', ans: 'C' },
  { n: 37, body: 'The decimal expansion of \\(\\frac{2}{11}\\) is:', a: '\\(0.18\\)', b: '\\(0.\\overline{18}\\)', c: '\\(0.1\\overline{8}\\)', d: '\\(0.2\\)', ans: 'B', sol: '\\(\\frac{2}{11}=0.181818\\ldots = 0.\\overline{18}\\), i.e. the block 18 repeats.' },
  { n: 38, body: 'The value of \\(1.999\\ldots\\) in the form of \\(\\frac{p}{q}\\), where \\(p\\) and \\(q\\) are integers and \\(q \\neq 0\\), is', a: '\\(\\frac{19}{10}\\)', b: '\\(\\frac{1999}{1000}\\)', c: '\\(2\\)', d: '\\(\\frac{1}{9}\\)', ans: 'C' },
  { n: 39, body: 'Which of the following is fraction form of \\(0.535353\\ldots\\)?', a: '\\(\\frac{53}{100}\\)', b: '\\(\\frac{53}{99}\\)', c: '\\(\\frac{53}{101}\\)', d: '\\(\\frac{54}{100}\\)', ans: 'B' },
  { n: 40, body: 'Which of the following is the fraction form of \\(0.275275275\\ldots\\)?', a: '\\(\\frac{275}{999}\\)', b: '\\(\\frac{27}{99}\\)', c: '\\(\\frac{275}{99}\\)', d: '\\(\\frac{2752}{999}\\)', ans: 'A' },
  { n: 41, body: 'Express \\(0.404040\\ldots\\) in the form \\(\\frac{p}{q}\\).', a: '\\(\\frac{40}{99}\\)', b: '\\(\\frac{45}{99}\\)', c: '\\(\\frac{24}{99}\\)', d: '\\(\\frac{60}{99}\\)', ans: 'A', sol: 'Let \\(x=0.\\overline{40}\\Rightarrow 100x=40.\\overline{40}=40+x\\Rightarrow 99x=40\\Rightarrow x=\\frac{40}{99}\\).' },
  { n: 42, body: 'Express \\(1.272727\\ldots = 1.\\overline{27}\\) in the form \\(\\frac{p}{q}\\).', a: '\\(\\frac{40}{11}\\)', b: '\\(\\frac{18}{11}\\)', c: '\\(\\frac{8}{11}\\)', d: '\\(\\frac{14}{11}\\)', ans: 'D', sol: 'Let \\(x=1.\\overline{27}\\); \\(100x=127.\\overline{27}\\); subtracting, \\(99x=126\\Rightarrow x=\\frac{126}{99}=\\frac{14}{11}\\).' },
  { n: 43, body: 'Find the value of:  \\(3.\\overline{2} + 2.\\overline{3}\\)  (\\(3.222\\ldots + 2.333\\ldots\\))', a: '\\(5.555\\ldots\\)', b: '\\(4.555\\ldots\\)', c: '\\(3.535353\\ldots\\)', d: '\\(1.515151\\ldots\\)', ans: 'A' },
  { n: 44, body: 'Find the value of:  \\(0.999\\ldots - 0.444\\ldots\\)', a: '\\(0.555\\ldots\\)', b: '\\(1.555\\ldots\\)', c: '\\(6.15131513153\\ldots\\)', d: '\\(1.651651651\\ldots\\)', ans: 'A' },
  { n: 45, body: 'Find the value of:  \\(2.\\overline{12} + 1.\\overline{21}\\)  (\\(2.121212\\ldots + 1.212121\\ldots\\))', a: '\\(0.666\\ldots\\)', b: '\\(1.8888\\ldots\\)', c: '\\(3.3333\\ldots\\)', d: '\\(1.6161\\ldots\\)', ans: 'C' },
  { n: 46, body: 'Find the value of:  \\(4.\\overline{13} - 2.\\overline{05}\\)  (\\(4.131313\\ldots - 2.050505\\ldots\\))', a: '\\(2.0707\\ldots\\)', b: '\\(0.121212\\ldots\\)', c: '\\(9.343434\\ldots\\)', d: 'none', ans: 'D' },

  // ── Topic 5: Irrational Numbers and Their Decimal Expansion … ──
  { n: 47, body: 'The decimal expansion of an irrational number is:', a: 'Terminating', b: 'Non-terminating and recurring', c: 'Non-terminating and non-recurring', d: 'Either terminating or recurring', ans: 'C' },
  { n: 48, body: 'Which of the following is an irrational number?', a: '\\(\\sqrt{16}\\)', b: '\\(\\sqrt{0.04}\\)', c: '\\(\\sqrt{7}\\)', d: '\\(0.666\\ldots\\)', ans: 'C', sol: '\\(\\sqrt{7}=2.64575131106\\ldots\\) is non-terminating, non-repeating, hence irrational. (\\(\\sqrt{16}=4\\), \\(\\sqrt{0.04}=0.2\\), \\(0.666\\ldots=\\frac{2}{3}\\) are rational.)' },
  { n: 49, body: 'To represent the number \\(\\sqrt{5}\\) on the number line, it is taken as the hypotenuse of a right triangle whose legs are:', a: '1 and 1', b: '2 and 1', c: '2 and 2', d: '5 and 1', ans: 'B', sol: '\\(2^2+1^2=5\\), so the hypotenuse is \\(\\sqrt{5}\\).' },
  { n: 50, body: 'The number \\(0.10110111011110\\ldots\\) is:', a: 'Rational', b: 'Irrational', c: 'An integer', d: 'A terminating decimal', ans: 'B' },
  { n: 51, body: 'In the square-root spiral construction starting from a unit length, the number \\(\\sqrt{3}\\) is obtained as the hypotenuse of a right triangle whose legs are:', a: '\\(\\sqrt{1}\\) and \\(\\sqrt{1}\\)', b: '\\(\\sqrt{2}\\) and \\(1\\)', c: '\\(\\sqrt{3}\\) and \\(1\\)', d: '\\(\\sqrt{4}\\) and \\(1\\)', ans: 'B', sol: '\\((\\sqrt{2})^2+1^2=2+1=3\\), so the hypotenuse is \\(\\sqrt{3}\\).' },
  { n: 52, body: 'Which of the following is irrational?', a: '\\(\\sqrt{\\frac{4}{9}}\\)', b: '\\(\\frac{\\sqrt{12}}{\\sqrt{3}}\\)', c: '\\(\\sqrt{7}\\)', d: '\\(\\sqrt{81}\\)', ans: 'C', sol: '\\(\\sqrt{\\frac{4}{9}}=\\frac{2}{3}\\), \\(\\frac{\\sqrt{12}}{\\sqrt{3}}=2\\), \\(\\sqrt{81}=9\\) are rational; \\(\\sqrt{7}=2.645751\\ldots\\) is non-terminating non-repeating, hence irrational.' },
  { n: 53, body: 'Which of the following is irrational?', a: '\\(0.14\\)', b: '\\(0.14\\overline{16}\\)', c: '\\(0.\\overline{1416}\\)', d: '\\(0.4014001400014\\ldots\\)', ans: 'D', sol: 'An irrational number is non-terminating non-recurring: \\(0.4014001400014\\ldots\\). \\(0.14\\) is terminating; \\(0.14\\overline{16}\\) and \\(0.\\overline{1416}\\) are non-terminating but recurring.' },
  { n: 54, body: 'Which of the following is not irrational?', a: '\\((3+\\sqrt{7})\\)', b: '\\((3-\\sqrt{7})\\)', c: '\\((3+\\sqrt{7})(3-\\sqrt{7})\\)', d: '\\(3\\sqrt{7}\\)', ans: 'C', sol: 'Using \\((a+b)(a-b)=a^2-b^2\\): \\((3+\\sqrt{7})(3-\\sqrt{7})=3^2-(\\sqrt{7})^2=9-7=2\\), which is rational.' },
  { n: 55, body: 'The decimal expansion of the number \\(\\sqrt{2}\\) is', a: 'a finite decimal', b: '\\(1.41421\\)', c: 'non-terminating recurring', d: 'non-terminating non-recurring', ans: 'D' },
  { n: 56, body: 'Classify the following numbers as irrational.', a: '\\(-\\sqrt{0.4}\\)', b: '\\(\\frac{\\sqrt{12}}{\\sqrt{75}}\\)', c: '\\(0.5918\\)', d: '\\((1+\\sqrt{5})-(4+\\sqrt{5})\\)', ans: 'A', sol: '\\(-\\sqrt{0.4}\\) is irrational. (\\(\\frac{\\sqrt{12}}{\\sqrt{75}}=\\frac{2}{5}\\), \\(0.5918\\) is rational, and \\((1+\\sqrt{5})-(4+\\sqrt{5})=-3\\).)' },
  { n: 57, body: 'Classify the following numbers as irrational.', a: '\\(\\sqrt{196}\\)', b: '\\(3\\sqrt{18}\\)', c: '\\(\\sqrt{\\frac{3}{27}}\\)', d: '\\(\\frac{\\sqrt{28}}{\\sqrt{343}}\\)', ans: 'B', sol: '\\(3\\sqrt{18}=9\\sqrt{2}\\) is irrational. (\\(\\sqrt{196}=14\\), \\(\\sqrt{\\frac{3}{27}}=\\frac{1}{3}\\), \\(\\frac{\\sqrt{28}}{\\sqrt{343}}=\\frac{2}{7}\\) are rational.)' },
  { n: 58, body: 'The product of any two irrational numbers is', a: 'always an irrational number', b: 'always a rational number', c: 'always an integer', d: 'sometimes rational, sometimes irrational', ans: 'D' },
  { n: 59, body: 'In the following equation, find which variables \\(x, y, z\\) and \\(u\\) etc. represent irrational numbers:  (i) \\(x^2 = 5\\)  (ii) \\(y^2 = 9\\)  (iii) \\(z^2 = 0.04\\)  (iv) \\(u^2 = \\frac{17}{4}\\)', a: '\\(x, u\\)', b: '\\(y, z\\)', c: '\\(z, u\\)', d: 'none', ans: 'A', sol: '\\(x=\\sqrt{5}\\) and \\(u=\\frac{\\sqrt{17}}{2}\\) are irrational; \\(y=3\\) and \\(z=0.2\\) are rational.' },
  { n: 60, body: 'A rational number between \\(\\sqrt{2}\\) and \\(\\sqrt{3}\\) is', a: '\\(\\frac{\\sqrt{2}+\\sqrt{3}}{2}\\)', b: '\\(\\frac{\\sqrt{2}\\cdot\\sqrt{3}}{2}\\)', c: '\\(1.5\\)', d: '\\(1.8\\)', ans: 'C', sol: '\\(\\sqrt{2}\\approx 1.414\\) and \\(\\sqrt{3}\\approx 1.732\\); \\(1.5\\) is rational and lies between them.' },

  // ── Topic 6: Real Numbers and Their Properties, Surds & Radicals ──
  { n: 61, body: 'Consider the operation \\(3 + (\\sqrt{5} + 7)\\) regrouped as \\((3 + 7) + \\sqrt{5}\\). This regrouping uses:', a: 'Only the associative property', b: 'Only the commutative property', c: 'The commutative and associative properties together', d: 'The distributive property', ans: 'B' },
  { n: 62, body: 'Which one of the following gives a rational result?', a: '\\((2 + \\sqrt{3}) + (5 - \\sqrt{3})\\)', b: '\\((2 + \\sqrt{3}) + (5 + \\sqrt{3})\\)', c: '\\(\\sqrt{3} \\times \\sqrt{5}\\)', d: '\\((1 + \\sqrt{2}) \\times \\sqrt{2}\\)', ans: 'A', sol: '\\((2 + \\sqrt{3}) + (5 - \\sqrt{3}) = 7\\), which is rational.' },
  { n: 63, body: 'A student claims: "Since the real numbers are closed under addition and multiplication, the same must be true for the irrational numbers." Which pair of examples best shows the claim is false?', a: '\\(\\sqrt{2} + \\sqrt{2} = 2\\sqrt{2}\\) and \\(\\sqrt{2} \\times \\sqrt{8} = 4\\)', b: '\\(\\sqrt{2} + (-\\sqrt{2}) = 0\\) and \\(\\sqrt{2} \\times \\sqrt{2} = 2\\)', c: '\\(\\sqrt{3} + \\sqrt{3} = 2\\sqrt{3}\\) and \\(\\sqrt{3} \\times \\sqrt{3} = 3\\)', d: '\\((\\sqrt{2} + 1) + (\\sqrt{2} - 1) = 2\\sqrt{2}\\) and \\(\\sqrt{5} \\times \\sqrt{5} = 5\\)', ans: 'C' },
  { n: 64, body: 'By simplifying \\((5)^{\\frac{3}{8}}\\), we get ________', a: '\\(\\frac{(5)^3}{5^8}\\)', b: '\\((125)^{\\frac{1}{8}}\\)', c: '\\(\\frac{(5)^8}{(5)^3}\\)', d: '\\(5^{24}\\)', ans: 'B' },
  { n: 65, body: 'When simplified \\(\\left(-\\frac{1}{27}\\right)^{-\\frac{2}{3}}\\)', a: '\\(9\\)', b: '\\(-9\\)', c: '\\(\\frac{1}{9}\\)', d: '\\(-\\frac{1}{9}\\)', ans: 'A', sol: '\\(\\left(-\\frac{1}{27}\\right)^{-\\frac{2}{3}} = \\left[\\left(-\\frac{1}{3}\\right)^3\\right]^{-\\frac{2}{3}} = \\left(-\\frac{1}{3}\\right)^{-2} = (-3)^2 = 9\\).' },
  { n: 66, body: 'The value of \\(\\left\\{(23 + 2^2)^{\\frac{2}{3}} + (150 - 29)^{\\frac{1}{2}}\\right\\}^2\\) is', a: '\\(196\\)', b: '\\(289\\)', c: '\\(324\\)', d: '\\(400\\)', ans: 'D', sol: '\\(= \\left[27^{\\frac{2}{3}} + 121^{\\frac{1}{2}}\\right]^2 = [9 + 11]^2 = 20^2 = 400\\).' },
  { n: 67, body: 'If \\(g = t^{\\frac{2}{3}} + 4t^{-\\frac{1}{2}}\\), what is the value of \\(g\\) when \\(t = 64\\) ?', a: '\\(\\frac{31}{2}\\)', b: '\\(\\frac{33}{2}\\)', c: '\\(16\\)', d: '\\(\\frac{257}{16}\\)', ans: 'B', sol: '\\(64^{\\frac{2}{3}} = 16\\) and \\(4 \\times 64^{-\\frac{1}{2}} = 4 \\times \\frac{1}{8} = \\frac{1}{2}\\); \\(g = 16 + \\frac{1}{2} = \\frac{33}{2}\\).' },
  { n: 68, body: 'Every surd is a/an', a: 'irrational number', b: 'rational number', c: 'equation', d: 'coefficient', ans: 'A', sol: 'A surd is an irrational root of a rational number, e.g. \\(\\sqrt{2}\\); so every surd is irrational.' },
  { n: 69, body: 'An irrational radical with rational radicand is called', a: 'surd', b: 'rational number', c: 'equation', d: 'coefficient', ans: 'A' },
  { n: 70, body: '\\(2\\sqrt{3} + \\sqrt{3}\\) is equal to', a: '\\(2\\sqrt{6}\\)', b: '\\(6\\)', c: '\\(3\\sqrt{3}\\)', d: '\\(4\\sqrt{6}\\)', ans: 'C', sol: '\\(2\\sqrt{3} + \\sqrt{3} = \\sqrt{3}(2 + 1) = 3\\sqrt{3}\\).' },
  { n: 71, body: '\\(\\sqrt{10} \\times \\sqrt{15}\\) is equal to', a: '\\(6\\sqrt{5}\\)', b: '\\(5\\sqrt{6}\\)', c: '\\(\\sqrt{25}\\)', d: '\\(10\\sqrt{5}\\)', ans: 'B', sol: '\\(\\sqrt{10} \\times \\sqrt{15} = (\\sqrt{2}\\cdot\\sqrt{3}) \\times (\\sqrt{5}\\cdot\\sqrt{5}) = 5\\sqrt{6}\\).' },
  { n: 72, body: '\\(3\\sqrt{12} - 3\\sqrt{27} + 2\\sqrt{48} =\\)', a: '\\(3\\sqrt{3}\\)', b: '\\(4\\sqrt{3}\\)', c: '\\(5\\sqrt{3}\\)', d: '\\(6\\sqrt{3}\\)', ans: 'C', sol: '\\(= 3(2\\sqrt{3}) - 3(3\\sqrt{3}) + 2(4\\sqrt{3}) = 6\\sqrt{3} - 9\\sqrt{3} + 8\\sqrt{3} = 5\\sqrt{3}\\).' },
  { n: 73, body: 'On dividing \\(6\\sqrt{27}\\) by \\(2\\sqrt{3}\\), we get', a: '\\(3\\sqrt{9}\\)', b: '\\(6\\)', c: '\\(9\\)', d: '\\(2\\)', ans: 'C', sol: '\\(6\\sqrt{27} \\div 2\\sqrt{3} = 18\\sqrt{3} \\div 2\\sqrt{3} = 9\\).' },
  { n: 74, body: 'If \\(\\sqrt[x]{3} \\times \\sqrt[y]{5} = 10125\\), then \\(12xy =\\) ________.', a: '\\(1\\)', b: '\\(\\frac{1}{3}\\)', c: '\\(2\\)', d: '\\(\\frac{1}{2}\\)', ans: 'A', sol: '\\(3^{\\frac{1}{x}}\\cdot 5^{\\frac{1}{y}} = 3^4 \\times 5^3 \\Rightarrow \\frac{1}{x}=4,\\ \\frac{1}{y}=3 \\Rightarrow 4x=1,\\ 3y=1 \\Rightarrow 12xy=1\\).' },
  { n: 75, body: 'The value of \\(\\dfrac{(25)^{\\frac{5}{2}} \\times (243)^{\\frac{2}{5}}}{(16)^{\\frac{3}{4}} \\times (8)^{\\frac{5}{3}}}\\) is', a: '\\(\\frac{5625}{128}\\)', b: '\\(\\frac{5615}{256}\\)', c: '\\(\\frac{5625}{256}\\)', d: 'None', ans: 'D', sol: '\\(= \\frac{5^5 \\times 3^2}{2^3 \\times 2^5} = \\frac{3125 \\times 9}{8 \\times 32} = \\frac{28125}{256}\\), which is none of the options.' },
  { n: 76, body: '\\(\\sqrt{7 + 2\\sqrt{6}} + \\sqrt{7 - 2\\sqrt{6}} =\\)', a: '\\(14\\)', b: '\\(\\sqrt{6}\\)', c: '\\(2\\sqrt{6}\\)', d: '\\(7\\)', ans: 'C', sol: '\\(= \\sqrt{(\\sqrt{6}+1)^2} + \\sqrt{(\\sqrt{6}-1)^2} = (\\sqrt{6}+1) + (\\sqrt{6}-1) = 2\\sqrt{6}\\).' },
  { n: 77, body: '\\(\\sqrt{3^2 \\cdot \\sqrt{9^2 \\cdot \\sqrt{(81)^2 \\cdot \\sqrt{16^{16}}}}} =\\)', a: '\\(6 \\times 2^4\\)', b: '\\(3^3 \\times 2\\)', c: '\\(6^3 \\times 2^3\\)', d: '\\(6^3 \\times 2\\)', ans: 'D', sol: '\\(= (3^2)^{\\frac{1}{2}} \\times (9^2)^{\\frac{1}{4}} \\times [(81)^2]^{\\frac{1}{8}} \\times [(16)^{16}]^{\\frac{1}{16}} = 3 \\times 3 \\times 3 \\times 16 = 6^3 \\times 2\\).' },

  // ── Topic 7: Rationalization and Rationalizing Factor ──
  { n: 78, body: 'Rationalise the denominator of  \\(\\frac{\\sqrt{40}}{\\sqrt{3}}\\)', a: '\\(\\frac{2}{3}\\sqrt{5}\\)', b: '\\(\\frac{4}{3}\\sqrt{30}\\)', c: '\\(\\frac{2}{3}\\sqrt{30}\\)', d: '\\(2\\sqrt{5}\\)', ans: 'C', sol: '\\(\\frac{\\sqrt{40}}{\\sqrt{3}} \\times \\frac{\\sqrt{3}}{\\sqrt{3}} = \\frac{\\sqrt{120}}{3} = \\frac{2\\sqrt{30}}{3} = \\frac{2}{3}\\sqrt{30}\\).' },
  { n: 79, body: 'The rationalisation factor of \\(2 + \\sqrt{3}\\) is', a: '\\(2 - \\sqrt{3}\\)', b: '\\(2 + \\sqrt{3}\\)', c: '\\(\\sqrt{2} - 3\\)', d: '\\(\\sqrt{3} - 2\\)', ans: 'A' },
  { n: 80, body: '\\(\\frac{1}{\\sqrt{9} - \\sqrt{8}}\\) is equal to', a: '\\(\\frac{1}{2}(3 - 2\\sqrt{2})\\)', b: '\\(\\frac{1}{3 + 2\\sqrt{2}}\\)', c: '\\(3 - 2\\sqrt{2}\\)', d: '\\(3 + 2\\sqrt{2}\\)', ans: 'D', sol: 'Since \\(\\sqrt{8} = 2\\sqrt{2}\\), \\(\\frac{1}{3 - 2\\sqrt{2}} \\times \\frac{3 + 2\\sqrt{2}}{3 + 2\\sqrt{2}} = \\frac{3 + 2\\sqrt{2}}{9 - 8} = 3 + 2\\sqrt{2}\\).' },
  { n: 81, body: 'If \\(x = \\sqrt{5} + 2\\), then \\(x - \\frac{1}{x}\\) equals', a: '\\(2\\sqrt{5}\\)', b: '\\(4\\)', c: '\\(2\\)', d: '\\(\\sqrt{5}\\)', ans: 'B', sol: '\\(\\frac{1}{x} = \\frac{1}{\\sqrt{5} + 2} = \\sqrt{5} - 2\\); so \\(x - \\frac{1}{x} = (\\sqrt{5} + 2) - (\\sqrt{5} - 2) = 4\\).' },
  { n: 82, body: 'If \\(x = \\frac{2}{\\sqrt{3} - \\sqrt{5}}\\) and \\(y = \\frac{2}{\\sqrt{3} + \\sqrt{5}}\\), then \\(x + y =\\) ________.', a: '\\(3\\)', b: '\\(4\\sqrt{3}\\)', c: '\\(-2\\sqrt{3}\\)', d: '\\(6\\)', ans: 'C', sol: '\\(x + y = \\frac{2\\sqrt{3} + 2\\sqrt{5} + 2\\sqrt{3} - 2\\sqrt{5}}{3 - 5} = \\frac{4\\sqrt{3}}{-2} = -2\\sqrt{3}\\).' },
  { n: 83, body: 'If \\(\\frac{\\sqrt{3} - 1}{\\sqrt{3} + 1} = a - b\\sqrt{3}\\), then', a: '\\(a = 2,\\ b = 1\\)', b: '\\(a = 2,\\ b = -1\\)', c: '\\(a = -2,\\ b = 1\\)', d: '\\(a = b = 1\\)', ans: 'A', sol: 'Rationalising, \\(\\frac{(\\sqrt{3} - 1)^2}{(\\sqrt{3})^2 - 1^2} = \\frac{4 - 2\\sqrt{3}}{2} = 2 - \\sqrt{3}\\); comparing with \\(a - b\\sqrt{3}\\) gives \\(a = 2,\\ b = 1\\).' },
  { n: 84, body: 'Rationalise the denominator of  \\(\\frac{3 + 2\\sqrt{2}}{3 - \\sqrt{2}}\\)', a: '\\(\\frac{26 + 9\\sqrt{2}}{7}\\)', b: '\\(\\frac{13 + 9\\sqrt{2}}{9}\\)', c: '\\(\\frac{26 + 12\\sqrt{2}}{7}\\)', d: '\\(\\frac{13 + 9\\sqrt{2}}{7}\\)', ans: 'D', sol: 'Multiply by \\(\\frac{3 + \\sqrt{2}}{3 + \\sqrt{2}}\\): \\(\\frac{(3 + 2\\sqrt{2})(3 + \\sqrt{2})}{9 - 2} = \\frac{13 + 9\\sqrt{2}}{7}\\).' },
  { n: 85, body: 'Find the value of \\(a\\) and \\(b\\) if  \\(\\frac{\\sqrt{2} + 1}{\\sqrt{2} - 1} = a + b\\sqrt{2}\\).', a: '\\(a = -3,\\ b = -2\\)', b: '\\(a = 3,\\ b = 2\\)', c: '\\(a = -3,\\ b = 1\\)', d: '\\(a = b = 3\\)', ans: 'B', sol: '\\(\\frac{(\\sqrt{2} + 1)^2}{2 - 1} = \\frac{3 + 2\\sqrt{2}}{1} = 3 + 2\\sqrt{2}\\); comparing, \\(a = 3,\\ b = 2\\).' },
  { n: 86, body: 'If \\(p = 7 - 4\\sqrt{3}\\), then \\(\\frac{p^2 + 1}{7p} =\\)', a: '\\(2\\)', b: '\\(1\\)', c: '\\(7\\)', d: '\\(\\sqrt{3}\\)', ans: 'A', sol: '\\(\\frac{1}{p} = 7 + 4\\sqrt{3}\\), so \\(p + \\frac{1}{p} = (7 - 4\\sqrt{3}) + (7 + 4\\sqrt{3}) = 14\\); \\(\\frac{p^2 + 1}{7p} = \\frac{p + \\frac{1}{p}}{7} = \\frac{14}{7} = 2\\).' },
  { n: 87, body: '\\(\\frac{1}{\\sqrt{8 + 2\\sqrt{15}}} =\\)', a: '\\(\\frac{1}{2}(\\sqrt{5} + \\sqrt{3})\\)', b: '\\(\\frac{1}{2}(\\sqrt{5} - \\sqrt{3})\\)', c: '\\(\\frac{1}{2}(\\sqrt{5} + 1)\\)', d: '\\(\\frac{1}{2}(\\sqrt{5} - 1)\\)', ans: 'B', sol: '\\(8 + 2\\sqrt{15} = (\\sqrt{5} + \\sqrt{3})^2\\); so \\(\\frac{1}{\\sqrt{5} + \\sqrt{3}} = \\frac{\\sqrt{5} - \\sqrt{3}}{(\\sqrt{5})^2 - (\\sqrt{3})^2} = \\frac{1}{2}(\\sqrt{5} - \\sqrt{3})\\).' },
  { n: 88, body: '\\(\\frac{4}{\\sqrt{10 - 2\\sqrt{21}}} =\\)', a: '\\(\\frac{1}{4}(\\sqrt{7} + \\sqrt{3})\\)', b: '\\(\\frac{1}{4}(\\sqrt{7} - \\sqrt{3})\\)', c: '\\(\\sqrt{7} + \\sqrt{3}\\)', d: '\\(\\sqrt{7} - \\sqrt{3}\\)', ans: 'C', sol: '\\(10 - 2\\sqrt{21} = (\\sqrt{7} - \\sqrt{3})^2\\); \\(\\frac{4}{\\sqrt{7} - \\sqrt{3}} = \\frac{4(\\sqrt{7} + \\sqrt{3})}{(\\sqrt{7})^2 - (\\sqrt{3})^2} = \\frac{4(\\sqrt{7} + \\sqrt{3})}{4} = \\sqrt{7} + \\sqrt{3}\\).' },

  // ── Topic 8: Imaginary Numbers ──
  { n: 89, body: 'Value of \\(i\\) (iota) is', a: '\\(-1\\)', b: '\\(1\\)', c: '\\((-1)^{\\frac{1}{2}}\\)', d: '\\((-1)^{\\frac{1}{4}}\\)', ans: 'C', sol: '\\(i = \\sqrt{-1} = (-1)^{\\frac{1}{2}}\\); squaring gives \\(i^2 = -1\\).' },
  { n: 90, body: 'In \\(z = 4 + i\\), what is the real part?', a: '\\(4\\)', b: '\\(i\\)', c: '\\(1\\)', d: '\\(4 + i\\)', ans: 'A', sol: 'In \\(z = a + bi\\), \\(a\\) is the real part; here \\(a = 4\\).' },
  { n: 91, body: 'In \\(z = 4 + i\\), what is imaginary part?', a: '\\(4\\)', b: '\\(i\\)', c: '\\(1\\)', d: '\\(4 + i\\)', ans: 'C', sol: 'In \\(z = a + bi\\), \\(b\\) is the imaginary part; here \\(b = 1\\).' },
  { n: 92, body: 'The value of \\(\\sqrt{-16}\\) is', a: '\\(-4i\\)', b: '\\(4i\\)', c: '\\(-2i\\)', d: '\\(2i\\)', ans: 'B', sol: '\\(\\sqrt{-16} = \\sqrt{(-1)(16)} = 4\\sqrt{-1} = 4i\\).' },
  { n: 93, body: 'The value of \\(\\sqrt{-144}\\) is', a: '\\(12i\\)', b: '\\(-12i\\)', c: '\\(\\pm 12i\\)', d: 'None of these', ans: 'A', sol: '\\(\\sqrt{-144} = \\sqrt{(-1)(144)} = 12\\sqrt{-1} = 12i\\).' },
  { n: 94, body: 'If \\(z_1 = 2 + 3i\\) and \\(z_2 = 5 + 2i\\), then find the sum of two complex numbers.', a: '\\(4 + 8i\\)', b: '\\(3 - i\\)', c: '\\(7 + 5i\\)', d: '\\(7 - 5i\\)', ans: 'C', sol: 'Add real and imaginary parts separately: \\((2 + 5) + (3 + 2)i = 7 + 5i\\).' },
  { n: 95, body: '\\((x + 3) + i(y - 2) = 5 + i2\\), find the values of \\(x\\) and \\(y\\)', a: '\\(x = 8\\) and \\(y = 4\\)', b: '\\(x = 2\\) and \\(y = 4\\)', c: '\\(x = 2\\) and \\(y = 0\\)', d: '\\(x = 8\\) and \\(y = 0\\)', ans: 'B', sol: 'Equating parts: \\(x + 3 = 5 \\Rightarrow x = 2\\); \\(y - 2 = 2 \\Rightarrow y = 4\\).' },
  { n: 96, body: 'If \\((1 + i)(x + iy) = 2 + 4i\\) then \\(5x\\) is', a: '\\(11\\)', b: '\\(13\\)', c: '\\(14\\)', d: '\\(15\\)', ans: 'D', sol: '\\((x - y) + i(x + y) = 2 + 4i \\Rightarrow x - y = 2,\\ x + y = 4 \\Rightarrow x = 3;\\ 5x = 15\\).' },
  { n: 97, body: 'Find the multiplicative inverse of \\(1 + i\\) ?', a: '\\(0\\)', b: '\\(1 + i\\)', c: '\\(\\frac{1 - i}{2}\\)', d: '\\(\\frac{1 + i}{2}\\)', ans: 'C', sol: '\\(\\frac{1}{1 + i} \\times \\frac{1 - i}{1 - i} = \\frac{1 - i}{1^2 - i^2} = \\frac{1 - i}{2}\\).' },
  { n: 98, body: 'The value of \\(i^{-999}\\) is', a: '\\(1\\)', b: '\\(-1\\)', c: '\\(i\\)', d: '\\(-i\\)', ans: 'C', sol: '\\(i^{-999} = (i^2)^{-499} \\times i^{-1} = (-1)^{-499} \\times \\frac{1}{i} = -\\frac{1}{i} = -\\frac{i}{i^2} = i\\).' },
  { n: 99, body: 'Evaluate \\((1 + i)^4\\).', a: '\\(4\\)', b: '\\(-3\\)', c: '\\(3\\)', d: '\\(-4\\)', ans: 'D', sol: '\\((1 + i)^4 = [(1 + i)^2]^2 = [1 + i^2 + 2i]^2 = [2i]^2 = 4i^2 = -4\\).' },
  { n: 100, body: 'If \\(\\left(\\frac{1 + i}{1 - i}\\right)^3 - \\left(\\frac{1 - i}{1 + i}\\right)^3 = x + iy\\), then find \\((x, y)\\).', a: '\\(0, -2\\)', b: '\\(-2, 0\\)', c: '\\(1, 0\\)', d: '\\(0, -1\\)', ans: 'A' },
]

function topicOf(n) {
  return TOPICS.find((t) => n >= t.from && n <= t.to)
}

// Extract every LaTeX span ( \( … \), \[ … \], $$ … $$, $ … $ ) and parse it
// with KaTeX in throwOnError mode. Returns an array of error strings.
function latexErrors(label, text) {
  if (!text) return []
  const re = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  const errs = []
  let m
  while ((m = re.exec(text))) {
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4]
    const display = m[1] != null || m[3] != null
    try {
      katex.renderToString(tex, { throwOnError: true, displayMode: display, strict: 'ignore' })
    } catch (e) {
      errs.push(`${label}: «${tex}» → ${e.message.split('\n')[0]}`)
    }
  }
  return errs
}

function validateAll() {
  const errs = []
  const seen = new Set()
  for (const q of Q) {
    if (seen.has(q.n)) errs.push(`duplicate question number ${q.n}`)
    seen.add(q.n)
    if (!['A', 'B', 'C', 'D'].includes(q.ans)) errs.push(`Q${q.n}: bad answer "${q.ans}"`)
    if (!topicOf(q.n)) errs.push(`Q${q.n}: no topic covers it`)
    for (const [k, v] of [['body', q.body], ['a', q.a], ['b', q.b], ['c', q.c], ['d', q.d], ['sol', q.sol]]) {
      errs.push(...latexErrors(`Q${q.n}.${k}`, v))
    }
  }
  if (Q.length !== 100) errs.push(`expected 100 questions, have ${Q.length}`)
  return errs
}

async function main() {
  const errs = validateAll()
  if (errs.length) {
    console.error(`Aborting — ${errs.length} validation error(s):`)
    for (const e of errs) console.error('  - ' + e)
    throw new Error('LaTeX/validation check failed; nothing was written.')
  }
  console.log('LaTeX validation passed for all 100 questions.')

  // Resolve the existing taxonomy (must already be seeded).
  const course = await prisma.course.findFirst({ where: { name: COURSE_NAME, grade: COURSE_GRADE } })
  if (!course) throw new Error(`Course "${COURSE_NAME}" (grade ${COURSE_GRADE}) not found — run seed-cbse-chapters.mjs first.`)
  const subject = await prisma.subject.findFirst({ where: { course_id: course.id, name: SUBJECT_NAME } })
  if (!subject) throw new Error(`Subject "${SUBJECT_NAME}" not found under ${COURSE_NAME}.`)
  const chapter = await prisma.chapter.findFirst({ where: { subject_id: subject.id, name: CHAPTER_NAME } })
  if (!chapter) throw new Error(`Chapter "${CHAPTER_NAME}" not found under ${SUBJECT_NAME}.`)
  console.log(`Course=${course.id}  Subject=${subject.id}  Chapter=${chapter.id}`)

  // Topics: find or create, keyed by (chapter_id, name).
  const topicId = {}
  for (const t of TOPICS) {
    let row = await prisma.topic.findFirst({ where: { chapter_id: chapter.id, name: t.name } })
    if (!row) {
      row = await prisma.topic.create({ data: { chapter_id: chapter.id, name: t.name, topic_no: t.no } })
      console.log(`  + topic created: [${t.no}] ${t.name}`)
    } else {
      if (row.topic_no !== t.no) {
        row = await prisma.topic.update({ where: { id: row.id }, data: { topic_no: t.no } })
      }
      console.log(`  = topic exists:  [${t.no}] ${t.name}`)
    }
    topicId[t.no] = row.id
  }

  // Clear any previous run of this import (cascade removes taxonomies).
  const del = await prisma.question.deleteMany({ where: { tags: { has: IMPORT_TAG } } })
  if (del.count) console.log(`Cleared ${del.count} previously imported question(s).`)

  // Insert all 100 questions + their taxonomy link.
  let created = 0
  for (const q of Q) {
    const t = topicOf(q.n)
    await prisma.question.create({
      data: {
        subject: SUBJECT_NAME,
        question_type: 'mcq',
        difficulty: 'medium',
        marks_correct: 1,
        marks_negative: 0,
        question_body: q.body,
        option_a: q.a,
        option_b: q.b,
        option_c: q.c,
        option_d: q.d,
        correct_option: [q.ans],
        solution: q.sol ?? null,
        is_verified: true,
        tags: [IMPORT_TAG, `won-q${q.n}`],
        question_taxonomies: {
          create: {
            course_id: course.id,
            subject_id: subject.id,
            chapter_id: chapter.id,
            topic_id: topicId[t.no],
            exam_type: EXAM_TYPE,
          },
        },
      },
    })
    created++
    if (created % 20 === 0) console.log(`  … ${created}/100 inserted`)
  }

  console.log(`\nDone. Inserted ${created} questions across ${TOPICS.length} topics under "${CHAPTER_NAME}".`)
  for (const t of TOPICS) {
    const c = await prisma.questionTaxonomy.count({ where: { topic_id: topicId[t.no] } })
    console.log(`  [${t.no}] ${c.toString().padStart(3)}  ${t.name}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
