export const TIMEZONE = 'Asia/Ho_Chi_Minh';

export function dateParts(iso) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

export function displayDate(iso) {
  const { day, month, year } = dateParts(iso);
  return `${day}/${month}/${year}`;
}

export function eventTime(iso) {
  const p = dateParts(iso);
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: TIMEZONE }).format(new Date(iso));
  return `${p.hour}H${p.minute} ${weekday.toLocaleUpperCase('vi-VN')}`;
}

export function countdown(iso, now = Date.now()) {
  let seconds = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  return [days, hours, Math.floor(seconds / 60), seconds % 60];
}

export function calendar(iso) {
  const p = dateParts(iso);
  const year = Number(p.year), month = Number(p.month), selected = Number(p.day);
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, selected, cells: [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] };
}
