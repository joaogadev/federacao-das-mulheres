const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortMonthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'UTC',
});

export const parseDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const formatDate = (date: string) =>
  longDateFormatter.format(parseDate(date));
export const formatShortMonth = (date: string) =>
  shortMonthFormatter.format(parseDate(date));

export function upcomingEvents<T extends { date: string }>(
  items: T[],
  now = new Date(),
): T[] {
  // Fortaleza calendar date: avoid dropping today's events because the build runs in UTC.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return items
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}
