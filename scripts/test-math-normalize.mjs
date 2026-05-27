// Quick `console.assert`-style smoke tests for the math normalizer.
//
// Run:  npx tsx scripts/test-math-normalize.mjs
//
// No framework dependency — keeps the harness usable on any worker shell.

import { normalizeMathToLatex } from '../lib/integrations/document/normalize-math-to-latex.ts'

let pass = 0
let fail = 0

function expect(label, input, expected) {
  const actual = normalizeMathToLatex(input)
  if (actual === expected) {
    pass += 1
    console.log(`  ok   ${label}`)
  } else {
    fail += 1
    console.log(`  FAIL ${label}`)
    console.log(`        input    : ${JSON.stringify(input)}`)
    console.log(`        expected : ${JSON.stringify(expected)}`)
    console.log(`        actual   : ${JSON.stringify(actual)}`)
  }
}

function expectContains(label, input, substr) {
  const actual = normalizeMathToLatex(input)
  if (actual.includes(substr)) {
    pass += 1
    console.log(`  ok   ${label}  →  ${actual}`)
  } else {
    fail += 1
    console.log(`  FAIL ${label}`)
    console.log(`        input    : ${JSON.stringify(input)}`)
    console.log(`        wants    : ${JSON.stringify(substr)}`)
    console.log(`        actual   : ${JSON.stringify(actual)}`)
  }
}

console.log('# Symbol substitution')
expectContains('greek pi via unicode', 'area = π × r²', '\\pi')
expectContains('greek pi via unicode → squared', 'area = π × r²', 'r^{2}')
expectContains('greek pi via unicode → times', 'area = π × r²', '\\times')
expectContains('integral symbol', '∫ sin x dx', '\\int')
expectContains('le/ge unicode', 'x ≤ 3', '\\le')
expectContains('infinity unicode', 'as x → ∞', '\\infty')
expectContains('to arrow', 'limit x → 0', '\\to')

console.log('# ASCII shortcuts')
expectContains('ascii pi word', 'compute 2*pi*r', '\\pi')
expectContains('ascii leq', 'x <= 5', '\\le')
expectContains('ascii neq', 'x != 0', '\\ne')
expectContains('ascii to', 'limit x -> 0', '\\to')
expectContains('sqrt with parens', 'compute sqrt(x^2 + 1)', '\\sqrt{x^{2} + 1}')
expectContains('sqrt bare token', 'value is sqrt 2', '\\sqrt{2}')

console.log('# Sup/sub scripts')
expectContains('unicode superscript 2', 'x² + 1', 'x^{2}')
expectContains('unicode superscript 234', 'x²³⁴', 'x^{234}')
expectContains('unicode subscript', 'h₂o', 'h_{2}')
expectContains('ascii caret single', 'e^x', 'e^{x}')
expectContains('ascii caret paren', 'e^(2x+1)', 'e^{2x+1}')
expectContains('ascii underscore', 'a_n', 'a_{n}')

console.log('# Fractions')
expectContains('paren fraction', '(a + b)/(c - d)', '\\frac{a + b}{c - d}')
expectContains('command-adjacent fraction', 'value is \\pi /2 radians', '\\frac{\\pi}{2}')

console.log('# False-positive guards')
expect('plain prose unchanged', 'Find the value of x', 'Find the value of x')
expect('url unchanged', 'see http://example.com', 'see http://example.com')
expect('and/or unchanged', 'true and/or false', 'true and/or false')
expect('mid-prose fraction stays', '2/3 of the class scored well', '2/3 of the class scored well')

console.log('# Idempotency')
{
  const cases = [
    'x^2 + 2x + 1 = 0',
    '(a + b)/(c - d)',
    'area = π × r²',
    'plain prose with no math at all',
    'see http://example.com',
    '\\(\\frac{1}{2}\\)',
    '\\(x^{2}\\) + something',
  ]
  for (const c of cases) {
    const once = normalizeMathToLatex(c)
    const twice = normalizeMathToLatex(once)
    if (once === twice) {
      pass += 1
      console.log(`  ok   idempotent on ${JSON.stringify(c)}  →  ${JSON.stringify(once)}`)
    } else {
      fail += 1
      console.log(`  FAIL idempotent on ${JSON.stringify(c)}`)
      console.log(`        once  : ${JSON.stringify(once)}`)
      console.log(`        twice : ${JSON.stringify(twice)}`)
    }
  }
}

console.log('# Already-wrapped passthrough')
expect('already-wrapped frac stays', '\\(\\frac{1}{2}\\)', '\\(\\frac{1}{2}\\)')

console.log('# Composite case')
expectContains('composite x² + 2x + 1', 'x² + 2x + 1 = 0', 'x^{2}')

console.log('')
console.log(`# Result: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
