// Regression test for the Option-D bleed reported on
// 65-S-1_Mathematics-7.docx. The CBSE PDF text-extraction collapses
// question boundaries (newline before "8." becomes whitespace), so the
// option cluster of Q7 used to absorb Q8/Q9 body content into Option D.
//
// After fix: findOptionsCluster takes a currentQuestionNo and bounds D
// at the next-question-number marker (or 300 chars hard cap), so Q7's
// Option D is just "– 2 3" — and the leftover paragraphs Q8/Q9/Q10 each
// yield their own blocks with non-empty bodies.
//
// Run:  npx tsx scripts/test-parser-bleed-regression.mjs

import { parseQuestionsFromParagraphs } from '../lib/integrations/document/parse-questions-text.ts'

let pass = 0
let fail = 0

function check(label, actual, expected) {
  if (actual === expected) {
    pass += 1
    console.log(`  ok   ${label}`)
  } else {
    fail += 1
    console.log(`  FAIL ${label}`)
    console.log(`        expected : ${JSON.stringify(expected)}`)
    console.log(`        actual   : ${JSON.stringify(actual)}`)
  }
}

function checkTrue(label, cond, hint = '') {
  if (cond) {
    pass += 1
    console.log(`  ok   ${label}`)
  } else {
    fail += 1
    console.log(`  FAIL ${label}  ${hint}`)
  }
}

console.log('# Case A: clean per-paragraph separation (mock)')
{
  const paragraphs = [
    // Earlier Qs to satisfy the first-question monotonicity rule (n ≤ 5).
    '1. Two plus two equals what?',
    '(A) 3',
    '(B) 4',
    '(C) 5',
    '(D) 6',
    '7. If x = t3 and y = t2, then 2 2 dy dx at t = 1 is :',
    '(A) 3 2',
    '(B) – 2 9',
    '(C) – 3 2',
    '(D) – 2 3',
    '8. The area bounded by the parabola x2 = y and the line y = 1 is :',
    '(A) 2 3 sq unit',
    '(B) 1 3 sq unit',
    '(C) 4 3 sq units',
    '(D) 2 sq units',
    '9. If the rate of change of volume of a sphere is twice the rate of change of its radius, then the surface area of the sphere is :',
    '(A) 1 sq unit',
    '(B) 2 sq units',
    '(C) 3 sq units',
    '(D) 4 sq units',
    '10. Some other body for question 10',
  ]
  const r = parseQuestionsFromParagraphs(paragraphs)
  checkTrue(
    'parses at least 5 questions (Q1 plus Q7-Q10)',
    r.questions.length >= 5,
    `got ${r.questions.length}`,
  )
  const q7 = r.questions.find((q) => q.question_no === 7)
  const q8 = r.questions.find((q) => q.question_no === 8)
  const q9 = r.questions.find((q) => q.question_no === 9)
  const q10 = r.questions.find((q) => q.question_no === 10)
  checkTrue('Q7 exists', !!q7)
  checkTrue('Q8 exists', !!q8)
  checkTrue('Q9 exists', !!q9)
  checkTrue('Q10 exists', !!q10)
  if (q7 && q7.kind === 'mcq') {
    check('Q7 Option D bounded', q7.option_d, '– 2 3')
  }
  if (q8 && q8.kind === 'mcq') {
    check('Q8 Option D bounded', q8.option_d, '2 sq units')
  }
  if (q9 && q9.kind === 'mcq') {
    check('Q9 Option D bounded', q9.option_d, '4 sq units')
  }
  if (q10) {
    checkTrue(
      'Q10 has body',
      q10.question_body.length > 0,
      `body=${JSON.stringify(q10.question_body)}`,
    )
  }
}

console.log('\n# Case B: text-extraction collapsed Q7 D + Q8 onto one paragraph')
{
  // This is what pdf-parse actually does in the user-reported PDF — the
  // newline between "(D) – 2 3" and "8. The area..." becomes a space, so
  // both end up on the same paragraph. iterateBlocks doesn't recognize
  // "8." mid-paragraph as a new Q start; without the option-D bound, the
  // findOptionsCluster pass treats everything from "(D)" to end-of-block
  // as Option D content.
  const paragraphs = [
    '1. Warm-up question to seed monotonicity.',
    '(A) 1 (B) 2 (C) 3 (D) 4',
    '7. If x = t3 and y = t2, then 2 2 dy dx at t = 1 is :',
    '(A) 3 2 (B) – 2 9 (C) – 3 2 (D) – 2 3 8. The area bounded by the parabola x2 = y and the line y = 1 is :',
  ]
  const r = parseQuestionsFromParagraphs(paragraphs)
  // iterateBlocks puts the trailing bleed in Q7's block (Q8 isn't a
  // paragraph of its own). Option-D bound trims D so it stops at "8.".
  const q7 = r.questions.find((q) => q.question_no === 7)
  checkTrue('Q7 exists', !!q7)
  if (q7 && q7.kind === 'mcq') {
    check('Q7 Option D does not include "8."', q7.option_d, '– 2 3')
    checkTrue(
      'Q7 Option D length < 30',
      q7.option_d.length < 30,
      `length=${q7.option_d.length}`,
    )
  }
}

console.log('\n# Case C: 300-char hard cap when no next-Q marker exists')
{
  // Pathological — Option D is a long blob with no following "N." marker.
  // The hard cap kicks in at 300 chars rather than running to end of text.
  const longOptionD =
    'something something '.repeat(20) +
    'that goes on for several hundreds of characters with no question marker following at all.'
  const paragraphs = [
    '1. Pick the right answer.',
    `(A) opt a (B) opt b (C) opt c (D) ${longOptionD}`,
  ]
  const r = parseQuestionsFromParagraphs(paragraphs)
  if (r.questions[0] && r.questions[0].kind === 'mcq') {
    checkTrue(
      'Option D capped',
      r.questions[0].option_d.length <= 300,
      `length=${r.questions[0].option_d.length}`,
    )
  }
}

console.log('')
console.log(`# Result: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
