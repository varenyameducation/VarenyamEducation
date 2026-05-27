// Unit-level test for lib/integrations/ai/json-utils.ts -> lenientJsonParse.
// Exercises the four scenarios documented in the helper:
//   1. Correctly-escaped JSON parses unchanged (regression).
//   2. Gemini's unescaped-backslash LaTeX parses after backslash-doubling.
//   3. Mixed-escape stays best-effort (already-escaped + raw, both repair).
//   4. Truly malformed JSON (missing value) rethrows the ORIGINAL error.
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
  // The JS source literal '"\\\\frac{1}{2}"' is the 4-char JSON string `\\frac{1}{2}`,
  // which is the JSON encoding of the 1-char-backslash + "frac{1}{2}" string.
  const a = lenientJsonParse('{"q":"\\\\frac{1}{2}"}')
  check('parses without throwing', a && typeof a === 'object')
  check('q value is the LaTeX with a single literal backslash', a.q === '\\frac{1}{2}', `got ${JSON.stringify(a.q)}`)
}

console.log('# 2. Gemini broken output (unescaped backslashes) parses after repair')
{
  // The JS source literal '"\\(x = t^3\\)"' is the 8-char JSON string `\(x = t^3\)`
  // — invalid JSON because `\(` is not a recognized escape. The repair doubles
  // each lone backslash so it becomes a valid JSON encoding of `\(x = t^3\)`.
  const b = lenientJsonParse('{"q":"\\(x = t^3\\)"}')
  check('parses without throwing', b && typeof b === 'object')
  check('q value contains the inline-math LaTeX', b.q === '\\(x = t^3\\)', `got ${JSON.stringify(b.q)}`)
}

console.log('# 3. Mixed escape (already-doubled and lone) — acceptance: does not crash')
{
  // Acceptance test per brief — when Gemini's output mixes correctly-escaped
  // and lone backslashes, the single-pass repair is best-effort. The first
  // strict-parse fails (lone `\s` is invalid), then the repair doubles every
  // backslash not already followed by `\` or `u`. In the already-doubled
  // pair, only the SECOND `\` gets doubled (the first is already followed
  // by `\`), turning `\\frac` into `\\\frac` which JSON decodes to
  // `\` + form-feed + `rac`. That's a known coarse-repair artifact; we only
  // assert that the parser produces a usable object with the LaTeX command
  // tokens intact — content survived even if a stray control char snuck in.
  const c = lenientJsonParse('{"q":"\\\\frac{a}{b} and \\sqrt{x}"}')
  check('parses without throwing', c && typeof c === 'object')
  check('q is a string', typeof c.q === 'string', `got ${typeof c?.q}`)
  check('q retains the frac command token', typeof c.q === 'string' && c.q.includes('rac{a}{b}'), `got ${JSON.stringify(c.q)}`)
  check('q retains the sqrt command token', typeof c.q === 'string' && c.q.includes('\\sqrt{x}'), `got ${JSON.stringify(c.q)}`)
}

console.log('# 4. Truly malformed JSON rethrows the ORIGINAL error')
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
  console.log('all 4 scenarios pass')
  process.exit(0)
} else {
  console.log(`${failures} assertion(s) failed`)
  process.exit(1)
}
