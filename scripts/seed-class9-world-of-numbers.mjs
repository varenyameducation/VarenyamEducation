/**
 * Backend seed: Class 9 CBSE · Maths · Chapter "The World of Numbers".
 *
 * Loads the 100 "Concept Wise Practice" MCQs (Number Systems) from the
 * shared question PDF, filed under the 8 topics named inside that PDF,
 * each with its correct option + worked solution from the answer PDF.
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
const Q = [
  // ── Topic 1: Introduction to Number Systems ──
  { n: 1, body: 'Which of the following is the smallest whole number?', a: '1', b: '0', c: '−1', d: '2', ans: 'B' },
  { n: 2, body: 'The set of natural numbers including 0 is called the set of:', a: 'Integers', b: 'Whole numbers', c: 'Prime numbers', d: 'Rational numbers', ans: 'B' },
  { n: 3, body: 'How many factors does a prime number have?', a: 'Exactly one', b: 'Exactly two', c: 'More than two', d: 'Three', ans: 'B' },
  { n: 4, body: 'Two numbers are said to be co-prime if their H.C.F. is:', a: '0', b: '2', c: '1', d: 'The smaller number', ans: 'C' },
  { n: 5, body: 'Which of the following is a composite number?', a: '7', b: '11', c: '9', d: '13', ans: 'C' },

  // ── Topic 2: Rational Number, Representation & Operations ──
  { n: 6, body: 'Which of the following are rational number?', a: 'Integers', b: 'Fractions', c: 'Whole numbers', d: 'All of these', ans: 'D' },
  { n: 7, body: 'A rational number can be represented in the form of:', a: 'p/q', b: 'pq', c: 'p + q', d: 'p − q', ans: 'A' },
  { n: 8, body: 'Which of the following rational numbers is in the standard form?', a: '1/3', b: '26/78', c: '−14/16', d: '48/−96', ans: 'A' },
  { n: 9, body: 'Which of the following rational numbers is in the standard form?', a: '−12/26', b: '−49/91', c: '−9/16', d: '−28/105', ans: 'C' },
  { n: 10, body: 'To represent the rational number 3/5 on a number line, the unit length between 0 and 1 must be divided into:', a: '3 equal parts', b: '5 equal parts', c: '8 equal parts', d: '15 equal parts', ans: 'B' },
  { n: 11, body: 'The rational number −7/4 lies between which two consecutive integers on the number line?', a: '0 and 1', b: '−1 and −2', c: '−2 and −3', d: '1 and 2', ans: 'C' },
  { n: 12, body: 'Between two rational numbers', a: 'There is no rational number.', b: 'There is exactly one rational number.', c: 'There are infinitely many rational numbers.', d: 'There are only rational numbers and no irrational numbers.', ans: 'C', sol: 'Consider two rational numbers 3 and 4. Between them there are many rational numbers like 3.1, 3.2, 3.22, 3.223, … Therefore, there are infinitely many rational numbers.' },
  { n: 13, body: '3/7 lies between the fractions ________.', a: '4/9, 5/9', b: '43/99, 4/9', c: '42/99, 4/9', d: '41/99, 42/99', ans: 'C', sol: '3/7 = 0.428571…  Comparing decimal values: 42/99 = 0.424242… and 4/9 = 0.4444…, and 0.424242… < 0.428571… < 0.4444…' },
  { n: 14, body: 'What number should be added to 7/12 to get 4/15?', a: '−19/60', b: '−11/30', c: '51/60', d: '1/20', ans: 'A', sol: '4/15 − 7/12 = (16 − 35)/60 = −19/60.' },
  { n: 15, body: 'What should be subtracted from (3/4 − 2/3) to get −1/6 ?', a: '1/32', b: '1/16', c: '1/8', d: '1/4', ans: 'D', sol: '3/4 − 2/3 = 1/12. Then 1/12 − x = −1/6 ⇒ x = 1/12 + 1/6 = 3/12 = 1/4.' },
  { n: 16, body: 'Product of two rational number is −15. If one number is 9, find the other number.', a: '−3/5', b: '−5/3', c: '3/5', d: '5/3', ans: 'B', sol: '−15 ÷ 9 = −5/3.' },
  { n: 17, body: 'The sum of the rational numbers −8/19 and −4/57 is ____', a: '−5/57', b: '7/22', c: '−28/57', d: '4/27', ans: 'C', sol: '−8/19 = −24/57; −24/57 − 4/57 = −28/57.' },
  { n: 18, body: 'A water tank is being filled by a pipe that pours in 3/4 litre of water every minute. How much water will be in the tank after 8 2/3 minutes?', a: '6 1/2 litres', b: '6 1/4 litres', c: '7 litres', d: '5 3/4 litres', ans: 'A', sol: '3/4 × 26/3 = 78/12 = 13/2 = 6 1/2 litres.' },
  { n: 19, body: 'A car travels 12 3/5 km on one litre of petrol. How far will it travel on 2 1/2 litres of petrol?', a: '30 km', b: '31 1/2 km', c: '32 km', d: '28 1/4 km', ans: 'B', sol: '63/5 × 5/2 = 315/10 = 63/2 = 31 1/2 km.' },

  // ── Topic 3: Rational Numbers between two Rational Numbers, Properties & Absolute value ──
  { n: 20, body: 'Find six rational numbers between 3 and 4.', a: '31/10, 32/10, 35/10, 36/10, 37/10, 39/10', b: '1/10, 2/10, 3/10, 4/10, 5/10, 6/10', c: '21/5, 22/5, 25/5, 26/5, 27/5, 29/5', d: '9/10, 11/10, 12/10, 13/10, 14/10, 16/10', ans: 'A' },
  { n: 21, body: 'Find five rational numbers between 3/5 and 4/5.', a: '16/25, 17/25, 18/25, 19/25, 20/25', b: '19/30, 20/30, 21/30, 22/30, 23/30', c: '9/12, 10/12, 11/12, 13/12, 14/12', d: '22/30, 23/30, 24/30, 25/30, 26/30', ans: 'B' },
  { n: 22, body: 'Which of the rational numbers 14/9, 5/2 is the greatest?', a: '5/2', b: '14/9', c: 'equal', d: 'none', ans: 'A' },
  { n: 23, body: 'Which of the rational numbers −4/9, 5/−12, 7/−18, 2/−3 is the greatest?', a: '7/−18', b: '−4/9', c: '2/−3', d: '5/−12', ans: 'A' },
  { n: 24, body: 'Which of the following forms a pair of equivalent rational numbers?', a: '24/40 and 35/5', b: '−25/35 and 55/−77', c: '−8/15 and −24/48', d: '9/72 and −3/21', ans: 'B', sol: '−25/35 = −5/7 and 55/−77 = −5/7, so they are equivalent.' },
  { n: 25, body: 'Which of the following rational numbers lies between 3/5 and 4/7 ?', a: '41/70', b: '1/2', c: '5/7', d: '41/35', ans: 'A', sol: 'Mean = (3/5 + 4/7) ÷ 2 = 41/70 ≈ 0.586, which lies between 0.571 and 0.6.' },
  { n: 26, body: 'Which of the following does NOT lie between −2/3 and 1/4 ?', a: '−1/2', b: '0', c: '1/5', d: '−3/4', ans: 'D', sol: 'Range is −0.667 to 0.25; −3/4 = −0.75 falls outside it.' },
  { n: 27, body: 'The multiplicative inverse of (−5/9) is:', a: '5/9', b: '9/5', c: '−9/5', d: '−5/9', ans: 'C', sol: 'Inverse of −5/9 is −9/5, since (−5/9) × (−9/5) = 1.' },
  { n: 28, body: 'Which of the following statements is true for rational numbers?', a: 'They are closed under division', b: 'Subtraction is commutative', c: 'They are closed under subtraction', d: 'Every rational number has a multiplicative inverse', ans: 'C', sol: 'Difference of two rationals is always rational; the others fail (division by zero, non-commutativity, 0 has no inverse).' },
  { n: 29, body: 'The value of |−3/4| + |5/8| − |−1/2| is:', a: '1/8', b: '7/8', c: '9/8', d: '11/8', ans: 'B', sol: '3/4 + 5/8 − 1/2 = 6/8 + 5/8 − 4/8 = 7/8.' },
  { n: 30, body: 'Which property is shown in the following:  1/2 + (1/4 + 2/3) = (1/2 + 1/4) + 2/3', a: 'associativity', b: 'distributivity', c: 'commutativity', d: 'none of these', ans: 'A' },
  { n: 31, body: 'Which of the following is commutative for rational numbers?', a: 'Addition and subtraction', b: 'Addition and multiplication', c: 'Multiplication and division', d: 'Subtraction and division', ans: 'B' },
  { n: 32, body: 'Using appropriate properties evaluate: (13/7 × 11/26) − (−4/7 × 5/8) is equal to', a: '249/126', b: '8/7', c: '29/126', d: '26/9', ans: 'B' },
  { n: 33, body: 'The reciprocal of a negative rational number', a: 'Is a positive.', b: 'Is a negative.', c: 'Can be either positive or negative.', d: 'Does not exist.', ans: 'B' },
  { n: 34, body: 'Which of the following statements is false?', a: '|−5/3| lies on the right of 0 on the number line.', b: '−|−x| = x for all rational numbers.', c: '−7/17 lies on the left of 0 on the number line', d: 'Every whole number is a rational number.', ans: 'B' },

  // ── Topic 4: Decimal Expansion of Rational Numbers ──
  { n: 35, body: 'A rational number p/q (in lowest terms) has a terminating decimal expansion only when the prime factorisation of q is of the form:', a: '2ⁿ × 5ᵐ', b: '2ⁿ × 3ᵐ', c: '3ⁿ × 5ᵐ', d: 'any prime factors', ans: 'A' },
  { n: 36, body: 'Which of the following rational numbers has a non-terminating but recurring decimal expansion?', a: '13/40', b: '7/8', c: '5/12', d: '17/25', ans: 'C' },
  { n: 37, body: 'The decimal expansion of 2/11 is:', a: '0.18', b: '0.18 (= 0.181818…, both digits recurring)', c: '0.18 (= 0.18888…, only 8 recurring)', d: '0.2', ans: 'B', sol: '2/11 = 0.181818… , i.e. the block 18 repeats.' },
  { n: 38, body: 'The value of 1.999... in the form of p/q, where p and q are integers and q ≠ 0, is', a: '19/10', b: '1999/1000', c: '2', d: '1/9', ans: 'C' },
  { n: 39, body: 'Which of the following is fraction form of 0.535353......?', a: '53/100', b: '53/99', c: '53/101', d: '54/100', ans: 'B' },
  { n: 40, body: 'Which of the following is the fraction form of 0.275275275......?', a: '275/999', b: '27/99', c: '275/99', d: '2752/999', ans: 'A' },
  { n: 41, body: 'Express 0.404040 .... in the form p/q.', a: '40/99', b: '45/99', c: '24/99', d: '60/99', ans: 'A', sol: 'Let x = 0.404040… ⇒ 100x = 40.4040… = 40 + x ⇒ 99x = 40 ⇒ x = 40/99.' },
  { n: 42, body: 'Express 1.272727… = 1.27̄ in the form p/q.', a: '40/11', b: '18/11', c: '8/11', d: '14/11', ans: 'D', sol: 'Let x = 1.272727…; 100x = 127.2727…; subtracting, 99x = 126 ⇒ x = 126/99 = 14/11.' },
  { n: 43, body: 'Find the value of:  3.2̄ + 2.3̄  (3.222… + 2.333…)', a: '5.555...', b: '4.555...', c: '3.535353...', d: '1.515151...', ans: 'A' },
  { n: 44, body: 'Find the value of:  0.999... − 0.444...', a: '0.555...', b: '1.555...', c: '6.15131513153...', d: '1.651651651...', ans: 'A' },
  { n: 45, body: 'Find the value of:  2.12̄ + 1.21̄  (2.121212… + 1.212121…)', a: '0.666...', b: '1.8888...', c: '3.3333...', d: '1.6161...', ans: 'C' },
  { n: 46, body: 'Find the value of:  4.13̄ − 2.05̄  (4.131313… − 2.050505…)', a: '2.0707...', b: '0.121212...', c: '9.343434...', d: 'none', ans: 'D' },

  // ── Topic 5: Irrational Numbers and Their Decimal Expansion … ──
  { n: 47, body: 'The decimal expansion of an irrational number is:', a: 'Terminating', b: 'Non-terminating and recurring', c: 'Non-terminating and non-recurring', d: 'Either terminating or recurring', ans: 'C' },
  { n: 48, body: 'Which of the following is an irrational number?', a: '√16', b: '√0.04', c: '√7', d: '0.666…', ans: 'C', sol: '√7 = 2.64575131106… is a non-terminating, non-repeating decimal, hence irrational. (√16 = 4, √0.04 = 0.2, 0.666… = 2/3 are rational.)' },
  { n: 49, body: 'To represent the number √5 on the number line, it is taken as the hypotenuse of a right triangle whose legs are:', a: '1 and 1', b: '2 and 1', c: '2 and 2', d: '5 and 1', ans: 'B', sol: '2² + 1² = 5, so the hypotenuse is √5.' },
  { n: 50, body: 'The number 0.10110111011110… is:', a: 'Rational', b: 'Irrational', c: 'An integer', d: 'A terminating decimal', ans: 'B' },
  { n: 51, body: 'In the square-root spiral construction starting from a unit length, the number √3 is obtained as the hypotenuse of a right triangle whose legs are:', a: '√1 and √1', b: '√2 and 1', c: '√3 and 1', d: '√4 and 1', ans: 'B', sol: '(√2)² + 1² = 2 + 1 = 3, so the hypotenuse is √3.' },
  { n: 52, body: 'Which of the following is irrational?', a: '√(4/9)', b: '√12/√3', c: '√7', d: '√81', ans: 'C', sol: '√(4/9) = 2/3, √12/√3 = 2, √81 = 9 are rational; √7 = 2.645751… is non-terminating non-repeating, hence irrational.' },
  { n: 53, body: 'Which of the following is irrational?', a: '0.14', b: '0.1416̄  (0.14161616…)', c: '0.1416̄  (0.141614161416…, block 1416 recurring)', d: '0.4014001400014 …', ans: 'D', sol: 'An irrational number is non-terminating non-recurring, which is 0.4014001400014… 0.14 is terminating; the 1416-bar forms are non-terminating but recurring.' },
  { n: 54, body: 'Which of the following is not irrational?', a: '(3 + √7)', b: '(3 − √7)', c: '(3 + √7)(3 − √7)', d: '3√7', ans: 'C', sol: 'Using (a + b)(a − b) = a² − b²: (3 + √7)(3 − √7) = 3² − (√7)² = 9 − 7 = 2, which is rational.' },
  { n: 55, body: 'The decimal expansion of the number √2 is', a: 'a finite decimal', b: '1.41421', c: 'non-terminating recurring', d: 'non-terminating non-recurring', ans: 'D' },
  { n: 56, body: 'Classify the following numbers as irrational.', a: '−√0.4', b: '√12/√75', c: '0.5918', d: '(1 + √5) − (4 + √5)', ans: 'A', sol: '−√0.4 is irrational. (√12/√75 = 2/5, 0.5918 is rational, and (1+√5) − (4+√5) = −3.)' },
  { n: 57, body: 'Classify the following numbers as irrational.', a: '√196', b: '3√18', c: '√(3/27)', d: '√28/√343', ans: 'B', sol: '3√18 = 9√2 is irrational. (√196 = 14, √(3/27) = 1/3, √28/√343 = 2/7 are rational.)' },
  { n: 58, body: 'The product of any two irrational numbers is', a: 'always an irrational number', b: 'always a rational number', c: 'always an integer', d: 'sometimes rational, sometimes irrational', ans: 'D' },
  { n: 59, body: 'In the following equation, find which variables x, y, z and u etc. represent irrational numbers:  (i) x² = 5  (ii) y² = 9  (iii) z² = 0.04  (iv) u² = 17/4', a: 'x, u', b: 'y, z', c: 'z, u', d: 'none', ans: 'A', sol: 'x = √5 and u = √17/2 are irrational; y = 3 and z = 0.2 are rational.' },
  { n: 60, body: 'A rational number between √2 and √3 is', a: '(√2 + √3)/2', b: '(√2 · √3)/2', c: '1.5', d: '1.8', ans: 'C', sol: '√2 ≈ 1.414 and √3 ≈ 1.732; 1.5 is rational and lies between them.' },

  // ── Topic 6: Real Numbers and Their Properties, Surds & Radicals ──
  { n: 61, body: 'Consider the operation 3 + (√5 + 7) regrouped as (3 + 7) + √5. This regrouping uses:', a: 'Only the associative property', b: 'Only the commutative property', c: 'The commutative and associative properties together', d: 'The distributive property', ans: 'B' },
  { n: 62, body: 'Which one of the following gives a rational result?', a: '(2 + √3) + (5 − √3)', b: '(2 + √3) + (5 + √3)', c: '√3 × √5', d: '(1 + √2) × √2', ans: 'A', sol: '(2 + √3) + (5 − √3) = 7, which is rational.' },
  { n: 63, body: 'A student claims: "Since the real numbers are closed under addition and multiplication, the same must be true for the irrational numbers." Which pair of examples best shows the claim is false?', a: '√2 + √2 = 2√2 and √2 × √8 = 4', b: '√2 + (−√2) = 0 and √2 × √2 = 2', c: '√3 + √3 = 2√3 and √3 × √3 = 3', d: '(√2 + 1) + (√2 − 1) = 2√2 and √5 × √5 = 5', ans: 'C' },
  { n: 64, body: 'By simplifying (5)^(3/8), we get ________', a: '(5)³ / 5⁸', b: '(125)^(1/8)', c: '(5)⁸ / (5)³', d: '5²⁴', ans: 'B' },
  { n: 65, body: 'When simplified (−1/27)^(−2/3)', a: '9', b: '−9', c: '1/9', d: '−1/9', ans: 'A', sol: '(−1/27)^(−2/3) = [(−1/3)³]^(−2/3) = (−1/3)^(−2) = (−3)² = 9.' },
  { n: 66, body: 'The value of { (23 + 2²)^(2/3) + (150 − 29)^(1/2) }² is', a: '196', b: '289', c: '324', d: '400', ans: 'D', sol: '= [27^(2/3) + 121^(1/2)]² = [9 + 11]² = 20² = 400.' },
  { n: 67, body: 'If g = t^(2/3) + 4t^(−1/2), what is the value of g when t = 64 ?', a: '31/2', b: '33/2', c: '16', d: '257/16', ans: 'B', sol: '64^(2/3) = 16 and 4 × 64^(−1/2) = 4 × 1/8 = 1/2; g = 16 + 1/2 = 33/2.' },
  { n: 68, body: 'Every surd is a/an', a: 'irrational number', b: 'rational number', c: 'equation', d: 'coefficient', ans: 'A', sol: 'A surd is an irrational root of a rational number, e.g. √2; so every surd is irrational.' },
  { n: 69, body: 'An irrational radical with rational radicand is called', a: 'surd', b: 'rational number', c: 'equation', d: 'coefficient', ans: 'A' },
  { n: 70, body: '2√3 + √3 is equal to', a: '2√6', b: '6', c: '3√3', d: '4√6', ans: 'C', sol: '2√3 + √3 = √3(2 + 1) = 3√3.' },
  { n: 71, body: '√10 × √15 is equal to', a: '6√5', b: '5√6', c: '√25', d: '10√5', ans: 'B', sol: '√10 × √15 = (√2·√3) × (√5·√5) = 5√6.' },
  { n: 72, body: '3√12 − 3√27 + 2√48 =', a: '3√3', b: '4√3', c: '5√3', d: '6√3', ans: 'C', sol: '= 3(2√3) − 3(3√3) + 2(4√3) = 6√3 − 9√3 + 8√3 = 5√3.' },
  { n: 73, body: 'On dividing 6√27 by 2√3, we get', a: '3√9', b: '6', c: '9', d: '2', ans: 'C', sol: '6√27 ÷ 2√3 = 18√3 ÷ 2√3 = 9.' },
  { n: 74, body: 'If ˣ√3 × ʸ√5 = 10125, then 12xy = ________.', a: '1', b: '1/3', c: '2', d: '1/2', ans: 'A', sol: '3^(1/x) · 5^(1/y) = 3⁴ × 5³ ⇒ 1/x = 4, 1/y = 3 ⇒ 4x = 1, 3y = 1 ⇒ 12xy = 1.' },
  { n: 75, body: 'The value of [ (25)^(5/2) × (243)^(2/5) ] / [ (16)^(3/4) × (8)^(5/3) ] is', a: '5625/128', b: '5615/256', c: '5625/256', d: 'None', ans: 'D', sol: '= (5⁵ × 3²) / (2³ × 2⁵) = (3125 × 9) / (8 × 32) = 28125/256, which is none of the options.' },
  { n: 76, body: '√(7 + 2√6) + √(7 − 2√6) =', a: '14', b: '√6', c: '2√6', d: '7', ans: 'C', sol: '= √((√6 + 1)²) + √((√6 − 1)²) = (√6 + 1) + (√6 − 1) = 2√6.' },
  { n: 77, body: '√( 3² · √( 9² · √( (81)² · √(16¹⁶) ) ) ) =', a: '6 × 2⁴', b: '3³ × 2', c: '6³ × 2³', d: '6³ × 2', ans: 'D', sol: '= (3²)^(1/2) × (9²)^(1/4) × [(81)²]^(1/8) × [(16)¹⁶]^(1/16) = 3 × 3 × 3 × 16 = 6³ × 2.' },

  // ── Topic 7: Rationalization and Rationalizing Factor ──
  { n: 78, body: 'Rationalise the denominator of  √40 / √3', a: '(2/3)√5', b: '(4/3)√30', c: '(2/3)√30', d: '2√5', ans: 'C', sol: '(√40/√3) × (√3/√3) = √120/3 = (2√30)/3 = (2/3)√30.' },
  { n: 79, body: 'The rationalisation factor of 2 + √3 is', a: '2 − √3', b: '2 + √3', c: '√2 − 3', d: '√3 − 2', ans: 'A' },
  { n: 80, body: '1 / (√9 − √8) is equal to', a: '(1/2)(3 − 2√2)', b: '1/(3 + 2√2)', c: '3 − 2√2', d: '3 + 2√2', ans: 'D', sol: 'Since √8 = 2√2, 1/(3 − 2√2) × (3 + 2√2)/(3 + 2√2) = (3 + 2√2)/(9 − 8) = 3 + 2√2.' },
  { n: 81, body: 'If x = √5 + 2, then x − 1/x equals', a: '2√5', b: '4', c: '2', d: '√5', ans: 'B', sol: '1/x = 1/(√5 + 2) = √5 − 2; so x − 1/x = (√5 + 2) − (√5 − 2) = 4.' },
  { n: 82, body: 'If x = 2/(√3 − √5) and y = 2/(√3 + √5), then x + y = ________.', a: '3', b: '4√3', c: '−2√3', d: '6', ans: 'C', sol: 'x + y = (2√3 + 2√5 + 2√3 − 2√5)/(3 − 5) = 4√3 / (−2) = −2√3.' },
  { n: 83, body: 'If (√3 − 1)/(√3 + 1) = a − b√3, then', a: 'a = 2, b = 1', b: 'a = 2, b = −1', c: 'a = −2, b = 1', d: 'a = b = 1', ans: 'A', sol: 'Rationalising, (√3 − 1)²/((√3)² − 1²) = (4 − 2√3)/2 = 2 − √3; comparing with a − b√3 gives a = 2, b = 1.' },
  { n: 84, body: 'Rationalise the denominator of  (3 + 2√2) / (3 − √2)', a: '(26 + 9√2)/7', b: '(13 + 9√2)/9', c: '(26 + 12√2)/7', d: '(13 + 9√2)/7', ans: 'D', sol: 'Multiply by (3 + √2)/(3 + √2): (3 + 2√2)(3 + √2)/(9 − 2) = (13 + 9√2)/7.' },
  { n: 85, body: 'Find the value of a and b if  (√2 + 1)/(√2 − 1) = a + b√2.', a: 'a = −3, b = −2', b: 'a = 3, b = 2', c: 'a = −3, b = 1', d: 'a = b = 3', ans: 'B', sol: '(√2 + 1)²/(2 − 1) = (3 + 2√2)/1 = 3 + 2√2; comparing, a = 3, b = 2.' },
  { n: 86, body: 'If p = 7 − 4√3, then (p² + 1)/7p =', a: '2', b: '1', c: '7', d: '√3', ans: 'A', sol: '1/p = 7 + 4√3, so p + 1/p = (7 − 4√3) + (7 + 4√3) = 14; (p² + 1)/7p = (p + 1/p)/7 = 14/7 = 2.' },
  { n: 87, body: '1 / √(8 + 2√15) =', a: '(1/2)(√5 + √3)', b: '(1/2)(√5 − √3)', c: '(1/2)(√5 + 1)', d: '(1/2)(√5 − 1)', ans: 'B', sol: '8 + 2√15 = (√5 + √3)²; so 1/(√5 + √3) = (√5 − √3)/((√5)² − (√3)²) = (1/2)(√5 − √3).' },
  { n: 88, body: '4 / √(10 − 2√21) =', a: '(1/4)(√7 + √3)', b: '(1/4)(√7 − √3)', c: '√7 + √3', d: '√7 − √3', ans: 'C', sol: '10 − 2√21 = (√7 − √3)²; 4/(√7 − √3) = 4(√7 + √3)/((√7)² − (√3)²) = 4(√7 + √3)/4 = √7 + √3.' },

  // ── Topic 8: Imaginary Numbers ──
  { n: 89, body: 'Value of i (iota) is', a: '−1', b: '1', c: '(−1)^(1/2)', d: '(−1)^(1/4)', ans: 'C', sol: 'i = √(−1) = (−1)^(1/2); squaring gives i² = −1.' },
  { n: 90, body: 'In z = 4 + i, what is the real part?', a: '4', b: 'i', c: '1', d: '4 + i', ans: 'A', sol: 'In z = a + bi, a is the real part; here a = 4.' },
  { n: 91, body: 'In z = 4 + i, what is imaginary part?', a: '4', b: 'i', c: '1', d: '4 + i', ans: 'C', sol: 'In z = a + bi, b is the imaginary part; here b = 1.' },
  { n: 92, body: 'The value of √(−16) is', a: '−4i', b: '4i', c: '−2i', d: '2i', ans: 'B', sol: '√(−16) = √((−1)(16)) = 4√(−1) = 4i.' },
  { n: 93, body: 'The value of √(−144) is', a: '12i', b: '−12i', c: '±12i', d: 'None of these', ans: 'A', sol: '√(−144) = √((−1)(144)) = 12√(−1) = 12i.' },
  { n: 94, body: 'If z₁ = 2 + 3i and z₂ = 5 + 2i, then find the sum of two complex numbers.', a: '4 + 8i', b: '3 − i', c: '7 + 5i', d: '7 − 5i', ans: 'C', sol: 'Add real and imaginary parts separately: (2 + 5) + (3 + 2)i = 7 + 5i.' },
  { n: 95, body: '(x + 3) + i(y − 2) = 5 + i2, find the values of x and y', a: 'x = 8 and y = 4', b: 'x = 2 and y = 4', c: 'x = 2 and y = 0', d: 'x = 8 and y = 0', ans: 'B', sol: 'Equating parts: x + 3 = 5 ⇒ x = 2; y − 2 = 2 ⇒ y = 4.' },
  { n: 96, body: 'If (1 + i)(x + iy) = 2 + 4i then "5x" is', a: '11', b: '13', c: '14', d: '15', ans: 'D', sol: '(x − y) + i(x + y) = 2 + 4i ⇒ x − y = 2, x + y = 4 ⇒ x = 3; 5x = 15.' },
  { n: 97, body: 'Find the multiplicative inverse of 1 + i ?', a: '0', b: '1 + i', c: '(1 − i)/2', d: '(1 + i)/2', ans: 'C', sol: '1/(1 + i) × (1 − i)/(1 − i) = (1 − i)/(1² − i²) = (1 − i)/2.' },
  { n: 98, body: 'The value of i^(−999) is', a: '1', b: '−1', c: 'i', d: '−i', ans: 'C', sol: 'i^(−999) = (i²)^(−499) × i^(−1) = (−1)^(−499) × 1/i = −1/i = −i/i² = i.' },
  { n: 99, body: 'Evaluate (1 + i)⁴.', a: '4', b: '−3', c: '3', d: '−4', ans: 'D', sol: '(1 + i)⁴ = [(1 + i)²]² = [1 + i² + 2i]² = [2i]² = 4i² = −4.' },
  { n: 100, body: 'If ((1 + i)/(1 − i))³ − ((1 − i)/(1 + i))³ = x + iy, then find (x, y).', a: '0, −2', b: '−2, 0', c: '1, 0', d: '0, −1', ans: 'A' },
]

function topicOf(n) {
  return TOPICS.find((t) => n >= t.from && n <= t.to)
}

async function main() {
  if (Q.length !== 100) throw new Error(`expected 100 questions, have ${Q.length}`)
  const seen = new Set()
  for (const q of Q) {
    if (seen.has(q.n)) throw new Error(`duplicate question number ${q.n}`)
    seen.add(q.n)
    if (!['A', 'B', 'C', 'D'].includes(q.ans)) throw new Error(`bad answer for Q${q.n}`)
    if (!topicOf(q.n)) throw new Error(`no topic covers Q${q.n}`)
  }

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
    const question = await prisma.question.create({
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
  // Per-topic tally for a quick visual check.
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
