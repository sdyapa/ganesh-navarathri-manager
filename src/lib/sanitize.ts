// Defense in depth for free-text fields (notes, donor names, descriptions) coming either from
// a form or an imported backup file. React already escapes text children automatically, so
// this is not what prevents XSS in normal rendering — it exists for the few places that build
// raw strings (PDF text, clipboard text, any future HTML string) so control characters in
// imported data can't do anything unexpected there either.

// Matches C0 control characters except \t (0x09), \n (0x0A), \r (0x0D), plus DEL (0x7F).
// Built with String.fromCharCode ranges rather than a literal control-char regex so the
// source file itself never contains raw control bytes.
const CONTROL_CHARS = new RegExp(
  '[' +
    String.fromCharCode(0) + '-' + String.fromCharCode(8) +
    String.fromCharCode(11) + String.fromCharCode(12) +
    String.fromCharCode(14) + '-' + String.fromCharCode(31) +
    String.fromCharCode(127) +
  ']',
  'g',
)

export function sanitizeText(value: unknown, maxLength = 2000): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(CONTROL_CHARS, '')
  return cleaned.slice(0, maxLength)
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
