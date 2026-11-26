const DAY = 86400000;

export function daysFrom(ms, days) {
  return ms + days * DAY;
}

export function hoursFrom(ms, hours) {
  return ms + hours * 3600000;
}

export function iso(ms) {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

export function stampUtc(ms) {
  if (!ms) return '-';
  const isoStr = new Date(ms).toISOString();
  return `${isoStr.slice(0, 10)} ${isoStr.slice(11, 16)} UTC`;
}

export function dayUtc(ms) {
  if (!ms) return '-';
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseDayUtc(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
  const ms = Date.parse(raw + 'T23:59:59Z');
  return Number.isFinite(ms) ? ms : NaN;
}

export function toMysqlDate(ms) {
  if (!ms) return null;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function fromMysqlDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).replace(' ', 'T');
  const ms = Date.parse(raw.endsWith('Z') ? raw : raw + 'Z');
  return Number.isFinite(ms) ? ms : null;
}
