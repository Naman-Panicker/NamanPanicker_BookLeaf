// Shown for a value that doesn't apply yet, such as the sales of a Book still in production.
const NOT_APPLICABLE = '—';

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-IN');
// The API sends plain calendar dates. Reading them in UTC stops the browser's time zone shifting the day.
const calendarDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatRupees(amount: number | null) {
  return amount === null ? NOT_APPLICABLE : rupees.format(amount);
}

export function formatCount(value: number | null) {
  return value === null ? NOT_APPLICABLE : count.format(value);
}

export function formatDate(date: string | null) {
  return date === null ? NOT_APPLICABLE : calendarDate.format(new Date(date));
}
