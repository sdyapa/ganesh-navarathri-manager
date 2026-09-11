// Replaces hardcoded "donation(s)"-style bracket notation throughout the app with a real
// singular/plural word computed from the count — e.g. pluralize(1, 'donation') -> "1 donation",
// pluralize(5, 'donation') -> "5 donations". English-only (this app has no i18n), and only
// needs the irregular forms actually used in the UI (entry/entries) — everything else is a
// plain trailing "s".
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
