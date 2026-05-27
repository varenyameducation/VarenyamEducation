// Lenient JSON parse for Gemini Vision responses. Gemini's
// responseMimeType:'application/json' mode sometimes emits LaTeX strings
// with unescaped backslashes (e.g. "\(x = t^3\)" instead of
// "\\(x = t^3\\)"), which breaks strict JSON.parse — `\(` is not a valid
// JSON escape, and `\frac` would decode `\f` as form-feed.
//
// Strategy:
//   1. Try strict JSON.parse first. Zero overhead when Gemini escapes correctly.
//   2. On failure, double any backslash that isn't already followed by another
//      backslash or by `u` (the only escape we preserve verbatim — \uXXXX
//      unicode). This intentionally doubles control-char escapes (\n, \t, \f)
//      too: Gemini never intends real control bytes in math output — those
//      are always LaTeX command starts.
//   3. Re-parse; if still failing, rethrow the ORIGINAL error — the
//      post-repair error message would be confusing.

export function lenientJsonParse<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (originalErr) {
    const repaired = raw.replace(/\\(?![\\u])/g, '\\\\')
    try {
      return JSON.parse(repaired) as T
    } catch {
      throw originalErr
    }
  }
}
