import type { ISODate } from '../types';
import { addDays, endOfMonth, endOfQuarter, endOfYear, minDate } from './dates';

/** 曲線時間單位：每個點分別代表一天、月底、季底、年底 */
export type Granularity = '1D' | '1M' | '3M' | '1Y';

export interface SeriesPoint {
  date: ISODate;
  value: number;
}

/**
 * 取樣日期：第一個點是「第一筆資料前一天」（數值為 0），
 * 之後依時間單位取每期期末，最後一點固定是 today（尚未結束的當期）。
 */
export function sampleDates(firstDate: ISODate, today: ISODate, gran: Granularity): ISODate[] {
  const start = addDays(firstDate, -1);
  const out: ISODate[] = [start];
  if (firstDate > today) return out;
  const periodEnd = gran === '1D' ? (d: ISODate) => d : gran === '1M' ? endOfMonth : gran === '3M' ? endOfQuarter : endOfYear;
  let cur = periodEnd(firstDate);
  while (cur < today) {
    out.push(cur);
    cur = periodEnd(addDays(cur, 1));
  }
  out.push(minDate(cur, today));
  return out;
}

export interface DatedAmount {
  date: ISODate;
  amount: number;
}

/** 由「每筆變動」累加成餘額曲線，從第一筆前一天的 0 開始 */
export function cumulativeSeries(events: DatedAmount[], today: ISODate, gran: Granularity): SeriesPoint[] {
  const sorted = events.filter((e) => e.date <= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (sorted.length === 0) return [];
  const dates = sampleDates(sorted[0].date, today, gran);
  const out: SeriesPoint[] = [];
  let i = 0;
  let sum = 0;
  for (const d of dates) {
    while (i < sorted.length && sorted[i].date <= d) {
      sum += sorted[i].amount;
      i++;
    }
    out.push({ date: d, value: round2(sum) });
  }
  return out;
}

/** 在指定的一串日期（已排序）上，取「到那天為止」的累計值 */
export function valuesAt(events: DatedAmount[], dates: ISODate[]): number[] {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: number[] = [];
  let i = 0;
  let sum = 0;
  for (const d of dates) {
    while (i < sorted.length && sorted[i].date <= d) sum += sorted[i++].amount;
    out.push(round2(sum));
  }
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
