export function indiaDateString(value) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = Object.fromEntries(parts.map(({ type, value: text }) => [type, text]));
  return `${part.year}-${part.month}-${part.day}`;
}

export function indiaDateStart(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw Object.assign(new Error('Date must use YYYY-MM-DD format.'), { status: 400 });
  }
  const date = new Date(`${dateString}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime()) || indiaDateString(date) !== dateString) {
    throw Object.assign(new Error('Date must use YYYY-MM-DD format.'), { status: 400 });
  }
  return date;
}

export function indiaDateEnd(dateString) {
  const start = indiaDateStart(dateString);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function indiaTodayStart(value = new Date()) {
  return indiaDateStart(indiaDateString(value));
}
