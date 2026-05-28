// Lenient JSON parse for Gemini Vision responses. Gemini's
// responseMimeType:'application/json' mode sometimes emits LaTeX strings
// with unescaped backslashes (e.g. "\(x = t^3\)" instead of
// "\\(x = t^3\\)"), which breaks strict JSON.parse — `\(` is not a valid
// JSON escape, and `\frac` would decode `\f` as form-feed.
//
// Even worse, Gemini sometimes MIXES escape styles in the same payload:
// `"\(  \\frac{a}{b}  \)"` — broken `\(` next to properly-escaped `\\frac`.
// A naive `\\(?![\\u]) -> \\\\` regex doubles the SECOND backslash of the
// valid `\\` pair (it's followed by a letter), turning `\\frac` into
// `\\\frac` — JSON.parse then decodes that as `\` + `<form-feed>` + `rac`.
//
// Strategy (protect-restore):
//   1. Try strict JSON.parse first. Zero overhead when Gemini escapes
//      correctly.
//   2. On failure, protect every existing `\\` pair with a placeholder
//      so the doubler can't touch it. Then double every lone `\` that
//      isn't a valid JSON escape (\", \/, \u — kept verbatim). Then
//      restore the protected pairs as the JSON-valid `\\`.
//   3. Re-parse; if still failing, rethrow the ORIGINAL error — the
//      post-repair error message would be confusing.

export function lenientJsonParse<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (originalErr) {
    const PROTECT = 'XBSPAIRX'
    const repaired = raw
      .replace(/\\\\/g, PROTECT)
      .replace(/\\(?!["\/u])/g, '\\\\')
      .replace(new RegExp(PROTECT, 'g'), '\\\\')
    try {
      return JSON.parse(repaired) as T
    } catch {
      throw originalErr
    }
  }
}
