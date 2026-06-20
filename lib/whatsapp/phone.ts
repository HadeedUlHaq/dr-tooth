// Reduce any Pakistani phone format to its canonical 10-digit local form so
// lookups match regardless of how the number was typed/stored:
//   "+92 324 0010884", "0092-324-0010884", "923240010884", "03240010884" -> "3240010884"
// Non-PK numbers (e.g. a UK "447774067432") are returned as their bare digits.
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "")
  if (d.startsWith("0092")) d = d.slice(4)
  else if (d.startsWith("92")) d = d.slice(2)
  else if (d.startsWith("0")) d = d.slice(1)
  return d
}

// True when two numbers refer to the same line, tolerant of country-code/format
// differences (compares the normalised value, with a last-9-digit fallback).
export function samePhone(a: unknown, b: unknown): boolean {
  const x = normalizePhone(a)
  const y = normalizePhone(b)
  if (!x || !y) return false
  if (x === y) return true
  return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9)
}
