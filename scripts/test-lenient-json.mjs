// Unit-level test for lib/integrations/ai/json-utils.ts -> lenientJsonParse.
// Exercises the documented scenarios:
//   1. Correctly-escaped JSON parses unchanged (regression).
//   2. Gemini's unescaped-backslash LaTeX parses after backslash-doubling.
//   3. Mixed-escape (the P0 hotfix case) — proper `\\` pairs survive
//      alongside lone `\` repairs.
//   4. Real-world Gemini response shape from the live import smoke
//      ("If \( x = t^3 \) and \( y = t^2 \), then \( \\frac{...} \)").
//   5. Truly malformed JSON (missing value) rethrows the ORIGINAL error.
//
// Run: npx tsx scripts/test-lenient-json.mjs
// Exits non-zero on any assertion failure.

import { lenientJsonParse } from '../lib/integrations/ai/json-utils.ts'

let failures = 0
function check(label, cond, info = '') {
  if (cond) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.log(`  FAIL ${label}${info ? ` — ${info}` : ''}`)
  }
}

console.log('# 1. Correctly-escaped JSON parses unchanged')
{
  // JS source `'"\\\\frac{1}{2}"'` is the 4-char JSON string `\\frac{1}{2}`
  // — already valid; strict JSON.parse succeeds without ever entering
  // the repair branch. Decoded value is a single backslash + "frac{1}{2}".
  const a = lenientJsonParse('{"q":"\\\\frac{1}{2}"}')
  check('parses without throwing', a && typeof a === 'object')
  check('q value is the LaTeX with a single literal backslash', a.q === '\\frac{1}{2}', `got ${JSON.stringify(a.q)}`)
}

console.log('# 2. Gemini broken output (unescaped backslashes) parses after repair')
{
  // JS source `'"\\(x = t^3\\)"'` is the JSON string `\(x = t^3\)` —
  // invalid because `\(` is not a recognized JSON escape. The repair
  // doubles each lone backslash → valid JSON encoding decoded as
  // `\(x = t^3\)` (single backslashes, ready for the LaTeX renderer).
  const b = lenientJsonParse('{"q":"\\(x = t^3\\)"}')
  check('parses without throwing', b && typeof b === 'object')
  check('q value contains the inline-math LaTeX', b.q === '\\(x = t^3\\)', `got ${JSON.stringify(b.q)}`)
}

console.log('# 3. Mixed escape (lone \\( next to proper \\\\frac) — P0 hotfix case')
{
  // JS source `'{"q": "\\\\( \\\\\\\\frac{1}{2} \\\\)"}'` is the JSON
  // bytes `{"q": "\( \\frac{1}{2} \)"}`. Strict parse fails on the lone
  // `\(`. Pre-hotfix behavior: the naive regex doubled the second `\` of
  // `\\frac` → produced `\\\frac` which decodes to `\` + form-feed + `rac`.
  // Hotfix protect-restore: `\\` pair preserved, `\(` and `\)` doubled,
  // resulting decoded LaTeX matches Gemini's intent: `\( \frac{1}{2} \)`
  // (one backslash at each command start).
  const c = lenientJsonParse('{"q": "\\( \\\\frac{1}{2} \\)"}')
  check('parses without throwing', c && typeof c === 'object')
  check('q is exactly the intended LaTeX', c.q === '\\( \\frac{1}{2} \\)', `got ${JSON.stringify(c.q)}`)
  check('q does NOT contain form-feed (pre-hotfix bug signature)', typeof c.q === 'string' && !c.q.includes(''), `got ${JSON.stringify(c.q)}`)
}

console.log('# 4. Real-world Gemini response shape (regression for the user-blocking 502)')
{
  // The user hit BAD_RESPONSE on this exact response from the CBSE PDF
  // smoke run. The body contains FOUR lone `\(` / `\)` pairs alongside
  // ONE properly-escaped `\\frac`. After the fix, the LaTeX should
  // round-trip with single backslashes everywhere (Gemini's intent).
  const realLike = '{"questions":[{"question_body":"If \\( x = t^3 \\) and \\( y = t^2 \\), then \\( \\\\frac{d^2y}{dx^2} \\) at \\( t = 1 \\) is :","question_type":"mcq","options":["\\( \\\\frac{3}{2} \\)","\\( \\\\frac{2}{3} \\)","\\( 1 \\)","\\( 0 \\)"],"correct_option":[]}]}'
  const d = lenientJsonParse(realLike)
  check('parses without throwing', d && typeof d === 'object')
  check('questions array has 1 item', Array.isArray(d?.questions) && d.questions.length === 1)
  const q0 = d?.questions?.[0]
  check('question_body has the right inline-math wrapping', typeof q0?.question_body === 'string' && q0.question_body.includes('\\( x = t^3 \\)'), `got ${JSON.stringify(q0?.question_body)}`)
  check('question_body has \\frac with a single backslash (Gemini intent)', typeof q0?.question_body === 'string' && q0.question_body.includes('\\frac{d^2y}{dx^2}'), `got ${JSON.stringify(q0?.question_body)}`)
  check('question_body has NO form-feed (pre-hotfix bug signature)', typeof q0?.question_body === 'string' && !q0.question_body.includes(''), `got ${JSON.stringify(q0?.question_body)}`)
  check('options[0] is \\( \\frac{3}{2} \\)', q0?.options?.[0] === '\\( \\frac{3}{2} \\)', `got ${JSON.stringify(q0?.options?.[0])}`)
}

console.log('# 5. Truly malformed JSON rethrows the ORIGINAL error')
{
  let threw = false
  let err
  try {
    lenientJsonParse('{"q":')
  } catch (e) {
    threw = true
    err = e
  }
  check('throws', threw)
  check('error is a SyntaxError (the original)', err instanceof SyntaxError, `got ${err?.constructor?.name}`)
}

console.log('')
if (failures === 0) {
  console.log('all 5 scenarios pass')
  process.exit(0)
} else {
  console.log(`${failures} assertion(s) failed`)
  process.exit(1)
}
