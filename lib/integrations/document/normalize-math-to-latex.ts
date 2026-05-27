// Heuristic plain-text math → LaTeX normalizer for bulk-imported questions.
//
// Used by /api/questions/import on the PDF + DOCX text-extraction paths and
// on the XLSX path. Pure function, no dependencies, no Gemini calls. Runs on
// `question_body` and each MCQ option string.
//
// Two-stage pipeline:
//   1. Token substitution. Walk the input character-by-character and replace
//      single-symbol math glyphs (√, ∫, π, ≤, …) and ASCII shortcuts (sqrt,
//      pi, <=, x^2, x²) with their LaTeX equivalents. Substitution emits
//      backslash-commands and brace-wrapped sub/sup-scripts; nothing yet is
//      wrapped in \( ... \).
//   2. Math-region wrapping. After substitution, scan for contiguous runs of
//      "math content" (backslash-commands, ^{...}, _{...}, or operator-heavy
//      mini-expressions) that are NOT already inside an existing \( ... \)
//      or \[ ... \] block, and wrap each run in \( ... \).
//
// Idempotency: applying the function twice is a no-op. The stage-1 token
// substitutions are operating on plain-text matches that have no `\` already,
// and stage-2 only wraps runs that aren't already in a math delimiter — so
// previously-wrapped output passes through unchanged.
//
// Limitations:
// - Does NOT recover 2D math layouts that PDF/DOCX extraction has already
//   flattened (e.g. a fraction whose numerator and denominator landed on
//   separate lines as bare numbers). For those, the user should re-add the
//   affected questions via the single-question image upload at /questions/new.
// - Whole-word Greek letters and operator symbols are converted reliably;
//   ambiguous cases ("x/y" — fraction or division?) are left as-is rather
//   than converted incorrectly. Missed math is reviewable; mis-converted
//   math is invisible damage.

const UNICODE_SYMBOL_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/∫/g, '\\int '],
  [/∑/g, '\\sum '],
  [/∏/g, '\\prod '],
  [/≤/g, '\\le '],
  [/≥/g, '\\ge '],
  [/≠/g, '\\ne '],
  [/≈/g, '\\approx '],
  [/±/g, '\\pm '],
  [/×/g, '\\times '],
  [/÷/g, '\\div '],
  [/∞/g, '\\infty '],
  [/°/g, '^\\circ '],
  [/∂/g, '\\partial '],
  [/∇/g, '\\nabla '],
  [/⇒/g, '\\Rightarrow '],
  [/⇔/g, '\\Leftrightarrow '],
  [/→/g, '\\to '],
  [/∈/g, '\\in '],
  [/∉/g, '\\notin '],
  [/⊂/g, '\\subset '],
  [/⊆/g, '\\subseteq '],
  [/∩/g, '\\cap '],
  [/∪/g, '\\cup '],
  [/∅/g, '\\emptyset '],
  // Lower-case Greek
  [/α/g, '\\alpha '],
  [/β/g, '\\beta '],
  [/γ/g, '\\gamma '],
  [/δ/g, '\\delta '],
  [/ε/g, '\\epsilon '],
  [/ζ/g, '\\zeta '],
  [/η/g, '\\eta '],
  [/θ/g, '\\theta '],
  [/ι/g, '\\iota '],
  [/κ/g, '\\kappa '],
  [/λ/g, '\\lambda '],
  [/μ/g, '\\mu '],
  [/ν/g, '\\nu '],
  [/ξ/g, '\\xi '],
  [/π/g, '\\pi '],
  [/ρ/g, '\\rho '],
  [/σ/g, '\\sigma '],
  [/τ/g, '\\tau '],
  [/φ/g, '\\phi '],
  [/χ/g, '\\chi '],
  [/ψ/g, '\\psi '],
  [/ω/g, '\\omega '],
  // Upper-case Greek
  [/Γ/g, '\\Gamma '],
  [/Δ/g, '\\Delta '],
  [/Θ/g, '\\Theta '],
  [/Λ/g, '\\Lambda '],
  [/Ξ/g, '\\Xi '],
  [/Π/g, '\\Pi '],
  [/Σ/g, '\\Sigma '],
  [/Φ/g, '\\Phi '],
  [/Ψ/g, '\\Psi '],
  [/Ω/g, '\\Omega '],
]

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
}
const SUBSCRIPT_DIGITS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
}

// Tokens that mark a position as already inside a math region — we do NOT
// re-wrap them, so the wrapping pass stays idempotent.
const MATH_BACKSLASH_COMMAND = /\\[a-zA-Z]+/

function applyUnicodeSymbolMap(input: string): string {
  let out = input
  for (const [re, target] of UNICODE_SYMBOL_MAP) out = out.replace(re, target)
  return out
}

// Convert ²³⁴ runs to ^{234}, and ₂₃₄ runs to _{234}. Greedy: consumes the
// longest contiguous run of super/subscript characters and emits a single
// ^{...} / _{...}. Idempotent because the input is Unicode chars, the output
// is ASCII — second pass finds no Unicode super/subscripts to convert.
function convertUnicodeSuperSubScripts(input: string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if (c in SUPERSCRIPT_DIGITS) {
      let run = ''
      while (i < input.length && input[i] in SUPERSCRIPT_DIGITS) {
        run += SUPERSCRIPT_DIGITS[input[i]]
        i += 1
      }
      out += `^{${run}}`
      continue
    }
    if (c in SUBSCRIPT_DIGITS) {
      let run = ''
      while (i < input.length && input[i] in SUBSCRIPT_DIGITS) {
        run += SUBSCRIPT_DIGITS[input[i]]
        i += 1
      }
      out += `_{${run}}`
      continue
    }
    out += c
    i += 1
  }
  return out
}

// ASCII caret/underscore superscripts:
//   x^2     → x^{2}
//   x^abc   → x^{a} (single char only; bare multi-char runs are too ambiguous)
//   x^(...) → x^{...} (balanced parens)
//   x^{...} → unchanged (already brace-wrapped)
function convertAsciiSuperSubScripts(input: string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if ((c === '^' || c === '_') && i + 1 < input.length) {
      const next = input[i + 1]
      // Already wrapped — pass through to keep idempotency.
      if (next === '{') {
        out += c
        i += 1
        continue
      }
      // Parenthesised — convert ( ... ) to { ... }, balancing nested parens.
      if (next === '(') {
        let depth = 0
        let j = i + 1
        let inner = ''
        for (; j < input.length; j++) {
          const ch = input[j]
          if (ch === '(') {
            depth += 1
            if (depth > 1) inner += ch
            continue
          }
          if (ch === ')') {
            depth -= 1
            if (depth === 0) break
            inner += ch
            continue
          }
          inner += ch
        }
        if (j < input.length && depth === 0) {
          out += `${c}{${inner}}`
          i = j + 1
          continue
        }
        // Unbalanced — leave as-is.
        out += c
        i += 1
        continue
      }
      // Single character (digit, letter, +/-). KaTeX-safe brace wrap.
      if (/[A-Za-z0-9+\-]/.test(next)) {
        out += `${c}{${next}}`
        i += 2
        continue
      }
    }
    out += c
    i += 1
  }
  return out
}

// ASCII shortcut substitutions. Operates on word-boundary-anchored patterns
// so prose like "spi" doesn't become "s\pi".
//
// `sqrt(<expr>)` and `sqrt <token>` → \sqrt{...}.
//   Balances parens for the parenthesised form. The bare form swallows a
//   single non-whitespace token (digits, letters, dots, minus) — enough for
//   common cases like "sqrt 2" or "sqrt -3", but conservatively skips
//   anything weirder.
function convertSqrt(input: string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const rest = input.slice(i)
    const m = /^sqrt\s*\(/i.exec(rest)
    if (m) {
      // Balance parens starting at the `(`.
      let depth = 0
      let j = i + m[0].length - 1
      const start = j + 1
      for (; j < input.length; j++) {
        const ch = input[j]
        if (ch === '(') depth += 1
        else if (ch === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      if (j < input.length && depth === 0) {
        out += `\\sqrt{${input.slice(start, j)}}`
        i = j + 1
        continue
      }
    }
    const bareSqrt = /^sqrt\s+(-?[0-9.]+|[A-Za-z])/i.exec(rest)
    if (bareSqrt) {
      out += `\\sqrt{${bareSqrt[1]}}`
      i += bareSqrt[0].length
      continue
    }
    out += input[i]
    i += 1
  }
  return out
}

// Word-boundary ASCII shortcuts: pi/PI, infty, infinity, <=/>=/!=, +-/-+,
// ->, =>, <=>. We require a word boundary on both sides so "spinning" stays
// "spinning" not "s\pi nning". `(?<!\\)` keeps idempotency — if `\pi` is
// already in the string from an earlier Unicode-substitution pass, we don't
// re-add another backslash.
function applyAsciiTokenShortcuts(input: string): string {
  // Order matters — multi-char `<=>` must be handled before `<=`.
  return input
    .replace(/(?<!\\)\b(infinity|infty)\b/g, '\\infty')
    .replace(/(?<!\\)\b(PI|pi)\b/g, '\\pi')
    .replace(/<=>/g, '\\Leftrightarrow')
    .replace(/=>/g, '\\Rightarrow')
    .replace(/->/g, '\\to')
    .replace(/<=/g, '\\le')
    .replace(/>=/g, '\\ge')
    .replace(/!=/g, '\\ne')
    .replace(/\+-/g, '\\pm')
    .replace(/-\+/g, '\\mp')
}

// √ takes a different code path than the rest of the symbol map because it
// has post-fix grammar (followed by an operand). Done in its own pass after
// `sqrt(...)` conversion so both notations end up as `\sqrt{...}`.
function convertSquareRoot(input: string): string {
  // √(expr) — balance parens.
  let out = ''
  let i = 0
  while (i < input.length) {
    if (input[i] === '√') {
      const after = input.slice(i + 1)
      const parenMatch = /^\s*\(/.exec(after)
      if (parenMatch) {
        let depth = 0
        let j = i + 1 + parenMatch[0].length - 1
        const start = j + 1
        for (; j < input.length; j++) {
          const ch = input[j]
          if (ch === '(') depth += 1
          else if (ch === ')') {
            depth -= 1
            if (depth === 0) break
          }
        }
        if (j < input.length && depth === 0) {
          out += `\\sqrt{${input.slice(start, j)}}`
          i = j + 1
          continue
        }
      }
      const bare = /^\s*([A-Za-z]|-?[0-9.]+)/.exec(after)
      if (bare) {
        out += `\\sqrt{${bare[1]}}`
        i += 1 + bare[0].length
        continue
      }
      // √ with nothing parseable after — emit \sqrt and move on, KaTeX will
      // complain visibly which is what we want for human review.
      out += '\\sqrt '
      i += 1
      continue
    }
    out += input[i]
    i += 1
  }
  return out
}

// Parenthesised fractions: (a)/(b) → \frac{a}{b}. Conservative — both sides
// must be parenthesised so we don't false-positive on "2/3 of the class".
function convertParenFractions(input: string): string {
  // Match balanced parens on either side. Using a simple non-nested match
  // here is acceptable because nested parens in fraction notation are rare
  // in this corpus and would over-complicate the heuristic.
  return input.replace(
    /\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g,
    (_full, num: string, den: string) => `\\frac{${num.trim()}}{${den.trim()}}`,
  )
}

// Inside math regions (already wrapped or detected) we additionally convert
// `<lhs>/<rhs>` where one side contains a backslash command. This catches
// "\pi /2" → "\frac{\pi}{2}" without touching prose "2/3 of the class".
function convertCommandAdjacentFractions(input: string): string {
  // a / b where a contains a backslash-command. Lazy match.
  return input.replace(
    /(\\[a-zA-Z]+(?:\{[^}]*\})?)\s*\/\s*([0-9]+|\\[a-zA-Z]+(?:\{[^}]*\})?|[A-Za-z])/g,
    (_full, a: string, b: string) => `\\frac{${a}}{${b}}`,
  )
}

// Identify math runs in the substituted text. A run is "math content" if it
// contains a `\command`, a `^{...}` / `_{...}` group, or is bordered on at
// least one side by such markers and is sufficiently operator-heavy.
//
// Strategy: split the input by existing math delimiters `\( ... \)` and
// `\[ ... \]` so we never re-wrap. Within each non-delimited segment, find
// contiguous runs of math-content and wrap them.
function wrapMathRegions(input: string): string {
  // Split into [outside, inside, outside, inside, ...] segments. Inside
  // segments include their delimiters and are passed through unchanged.
  const tokens: { text: string; inside: boolean }[] = []
  let i = 0
  while (i < input.length) {
    const rest = input.slice(i)
    const startMatch = /\\\(|\\\[/.exec(rest)
    if (!startMatch || startMatch.index === undefined) {
      tokens.push({ text: rest, inside: false })
      break
    }
    if (startMatch.index > 0) {
      tokens.push({ text: rest.slice(0, startMatch.index), inside: false })
    }
    const opener = startMatch[0]
    const closer = opener === '\\(' ? '\\)' : '\\]'
    const closerIdx = rest.indexOf(closer, startMatch.index + opener.length)
    if (closerIdx < 0) {
      // Unclosed math region — treat the rest as inside so we don't double-wrap.
      tokens.push({ text: rest.slice(startMatch.index), inside: true })
      break
    }
    tokens.push({
      text: rest.slice(startMatch.index, closerIdx + closer.length),
      inside: true,
    })
    i += closerIdx + closer.length
  }

  return tokens.map((t) => (t.inside ? t.text : wrapMathRunsInOutsideText(t.text))).join('')
}

// Within a non-delimited segment, locate maximal contiguous runs that count
// as math content and wrap each in \( ... \). A character belongs to a math
// run if it is part of:
//   - a `\command` sequence + its brace-balanced `{...}` argument (if any)
//   - a `^{...}` or `_{...}` group
//   - a binary operator (+, -, *, /, =, <, >) sandwiched between two
//     math-friendly tokens (letters or digits)
// We greedily expand runs across whitespace to keep "x^{2} + 2x + 1 = 0" as
// a single wrapped region rather than three.
function wrapMathRunsInOutsideText(segment: string): string {
  if (!segment) return segment

  // Mark every character as math-y or not. Then merge adjacent runs across
  // whitespace if both flanks are math-y.
  const flags = new Array<boolean>(segment.length).fill(false)

  // Backslash commands. After a `\foo` token, walk forward and balance any
  // immediately-following `{...}` (allowing nested braces — critical for
  // `\sqrt{x^{2} + 1}` where the inner `{2}` would break a simple regex).
  const cmdHeadRe = /\\[a-zA-Z]+/g
  let m: RegExpExecArray | null
  while ((m = cmdHeadRe.exec(segment))) {
    let end = m.index + m[0].length
    // Skip zero-or-more balanced `{...}` (and `[...]`) suffix groups.
    while (end < segment.length && (segment[end] === '{' || segment[end] === '[')) {
      const opener = segment[end]
      const closer = opener === '{' ? '}' : ']'
      let depth = 0
      let j = end
      for (; j < segment.length; j++) {
        const ch = segment[j]
        if (ch === opener) depth += 1
        else if (ch === closer) {
          depth -= 1
          if (depth === 0) {
            j += 1
            break
          }
        }
      }
      if (depth !== 0) break // unbalanced — bail and keep what we have
      end = j
    }
    for (let k = m.index; k < end; k++) flags[k] = true
    cmdHeadRe.lastIndex = end
  }

  // Bare ^{...} / _{...} (where a backslash command isn't the operand).
  const supSubRe = /[A-Za-z0-9)\]][\^_]\{[^{}]*\}/g
  while ((m = supSubRe.exec(segment))) {
    for (let k = m.index; k < m.index + m[0].length; k++) flags[k] = true
  }

  // Now extend math-y flags across simple operator expressions like
  //   "<var-or-num> <op> <var-or-num>"
  // where at least one side touches an already-math-y region. This is the
  // step that pulls "+ 2x" into the run started by "x^{2}".
  //
  // Critical guard: the unflagged operand must be at a word boundary on its
  // outer edge. Without this, "area = \pi" extends backward into the `a` of
  // `area`, producing "are\(a = \pi\)" — visually wrong.
  function isWordChar(idx: number): boolean {
    if (idx < 0 || idx >= segment.length) return false
    return /[A-Za-z0-9]/.test(segment[idx])
  }
  let changed = true
  while (changed) {
    changed = false
    const expandRe = /([A-Za-z0-9}])\s*([+\-*/=<>])\s*([A-Za-z0-9{\\])/g
    while ((m = expandRe.exec(segment))) {
      const left = m.index
      const right = m.index + m[0].length - 1
      const leftFlagged = flags[left]
      const rightFlagged = flags[right]
      if (!leftFlagged && !rightFlagged) continue
      // If extending into a previously-unflagged side, that side must be at
      // a word boundary on its outer edge (not mid-word).
      if (!leftFlagged && isWordChar(left - 1)) continue
      if (!rightFlagged && isWordChar(right + 1)) continue
      for (let k = left; k <= right; k++) {
        if (!flags[k]) {
          flags[k] = true
          changed = true
        }
      }
    }
  }

  // Adjacent coefficient pull-in: a flagged digit followed by an unflagged
  // letter (or vice-versa) with no whitespace between is a single math token
  // (e.g. "2x"). Pull the letter into the run.
  let coalesced = true
  while (coalesced) {
    coalesced = false
    for (let k = 0; k < segment.length - 1; k++) {
      const here = segment[k]
      const next = segment[k + 1]
      const hereIsAlnum = /[A-Za-z0-9]/.test(here)
      const nextIsAlnum = /[A-Za-z0-9]/.test(next)
      if (!hereIsAlnum || !nextIsAlnum) continue
      if (flags[k] && !flags[k + 1]) {
        // Only pull in if the run continues to a word boundary on the right.
        let end = k + 1
        while (end < segment.length && /[A-Za-z0-9]/.test(segment[end])) end += 1
        if (end >= segment.length || !/[A-Za-z0-9]/.test(segment[end])) {
          for (let kk = k + 1; kk < end; kk++) flags[kk] = true
          coalesced = true
        }
      } else if (!flags[k] && flags[k + 1]) {
        let start = k
        while (start > 0 && /[A-Za-z0-9]/.test(segment[start - 1])) start -= 1
        if (start === 0 || !/[A-Za-z0-9]/.test(segment[start - 1])) {
          for (let kk = start; kk <= k; kk++) flags[kk] = true
          coalesced = true
        }
      }
    }
  }

  // Materialise the runs.
  let out = ''
  let k = 0
  while (k < segment.length) {
    if (!flags[k]) {
      out += segment[k]
      k += 1
      continue
    }
    let end = k
    while (end < segment.length && flags[end]) end += 1
    // Trim trailing whitespace inside the run — `\( x \)` is fine but
    // `\(x\)` reads cleaner.
    let runStart = k
    let runEnd = end
    while (runStart < runEnd && /\s/.test(segment[runStart])) runStart += 1
    while (runEnd > runStart && /\s/.test(segment[runEnd - 1])) runEnd -= 1
    if (runStart < runEnd) {
      // Preserve the original surrounding whitespace.
      out += segment.slice(k, runStart)
      out += `\\(${segment.slice(runStart, runEnd)}\\)`
      out += segment.slice(runEnd, end)
    } else {
      out += segment.slice(k, end)
    }
    k = end
  }
  return out
}

// Bail out if the input is already saturated with math delimiters AND nothing
// new would be substituted. Avoids spending cycles on already-LaTeX content.
function isAlreadyAllInsideMath(input: string): boolean {
  const stripped = input.replace(/\\\([^]*?\\\)/g, '').replace(/\\\[[^]*?\\\]/g, '').trim()
  return stripped.length === 0
}

/**
 * Normalize plain-text math notation into KaTeX-compatible LaTeX, wrapping
 * recognized math regions in `\( ... \)` inline-math delimiters.
 *
 * Idempotent — applying twice is a no-op for already-wrapped content.
 *
 * Limitations:
 * - Does NOT recover 2D math layouts that PDF/DOCX extraction has already
 *   flattened (e.g. fractions where numerator and denominator landed on
 *   separate lines as bare numbers). For those cases the user should
 *   re-add the affected questions via the single-question image upload at
 *   `/questions/new`.
 * - Whole-word Greek letters and operator symbols are converted reliably;
 *   ambiguous cases (e.g. "x/y" — is it a fraction or just a division
 *   expression?) are left as-is rather than converted incorrectly.
 */
export function normalizeMathToLatex(input: string): string {
  if (!input) return input
  if (isAlreadyAllInsideMath(input)) return input

  let s = input
  s = applyUnicodeSymbolMap(s)
  s = convertSquareRoot(s)
  s = convertSqrt(s)
  s = convertUnicodeSuperSubScripts(s)
  s = convertAsciiSuperSubScripts(s)
  s = applyAsciiTokenShortcuts(s)
  s = convertParenFractions(s)
  s = convertCommandAdjacentFractions(s)
  s = wrapMathRegions(s)
  // Tidy redundant whitespace introduced by the symbol map.
  s = s.replace(/\\\(\s+/g, '\\(').replace(/\s+\\\)/g, '\\)')
  s = s.replace(/  +/g, ' ').trim()
  // If a backslash-command got trailing space stripped against a closing
  // paren, ensure `\pi)` becomes `\pi )` so KaTeX parses the command name
  // correctly. (Standard KaTeX practice; safer than relying on lookahead.)
  s = s.replace(/(\\[a-zA-Z]+)([^a-zA-Z\s{}\\(),^_+\-*/=<>])/g, '$1 $2')
  // Used to mark `\command` followed by `[` for KaTeX optional arg parsing,
  // but `[` in question text is more often punctuation; leave alone.
  return s
}

// Re-export private helpers behind a debug namespace for unit tests; not for
// production use.
export const __debug = {
  applyUnicodeSymbolMap,
  convertSquareRoot,
  convertSqrt,
  convertUnicodeSuperSubScripts,
  convertAsciiSuperSubScripts,
  applyAsciiTokenShortcuts,
  convertParenFractions,
  convertCommandAdjacentFractions,
  wrapMathRegions,
  MATH_BACKSLASH_COMMAND,
}
