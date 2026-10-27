import type { ISODate } from '../types';

/** 'yyyy-MM-dd' ↔ UTC 毫秒，所有日期運算都在 UTC 進行，避免時區與夏令時間誤差 */
const DAY = 86_400_000;

export function toUtc(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtc(toUtc(d) + n * DAY);
}

/** 0 = 週日 … 6 = 週六 */
export function weekday(d: ISODate): number {
  return new Date(toUtc(d)).getUTCDay();
}

/** 往後數 n 個營業日（只跳過週六日） */
export function addBusinessDays(d: ISODate, n: number): ISODate {
  let cur = d;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    const w = weekday(cur);
    if (w !== 0 && w !== 6) left--;
  }
  return cur;
}

/** 本機今天的日期 */
export function today(): ISODate {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthOf(d: ISODate): string {
  return d.slice(0, 7);
}

export function yearOf(d: ISODate): string {
  return d.slice(0, 4);
}

export function endOfMonth(d: ISODate): ISODate {
  const [y, m] = d.split('-').map(Number);
  return fromUtc(Date.UTC(y, m, 0));
}

export function endOfQuarter(d: ISODate): ISODate {
  const [y, m] = d.split('-').map(Number);
  const qEndMonth = Math.ceil(m / 3) * 3;
  return fromUtc(Date.UTC(y, qEndMonth, 0));
}

export function endOfYear(d: ISODate): ISODate {
  return `${d.slice(0, 4)}-12-31`;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
