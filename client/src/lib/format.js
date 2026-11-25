export const money = (paise = 0) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(paise / 100);

export const quantity = (value, fractionDigits = 2) => new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: fractionDigits,
}).format(value ?? 0);

export const date = (value) => value ? new Date(value).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—';

export const roleLabel = (role = '') => role.charAt(0).toUpperCase() + role.slice(1);
