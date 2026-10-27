import type { ISODate } from '../types';
import { addDays } from './dates';

/** Firestore prices/{symbol}_{year}：一支股票一年一份文件，所有使用者共用 */
export interface PriceYearDoc {
  id: string;
  symbol: string;
  year: number;
  /** 'MM-DD' → 收盤價 */
  closes: Record<string, number>;
  /** 這一年已經向資料來源查詢過的日期範圍（包含沒有交易的日子） */
  coveredFrom: ISODate;
  coveredTo: ISODate;
  updatedAt: number;
}

export function priceDocId(symbol: string, year: number): string {
  return `${symbol}_${year}`;
}

/** 某支股票按日期排序的收盤價，用二分搜尋找「某天（含）之前最近一個收盤價」 */
export class PriceSeries {
  readonly dates: ISODate[] = [];
  readonly closes: number[] = [];

  constructor(docs: PriceYearDoc[]) {
    const pairs: [ISODate, number][] = [];
    for (const d of docs) for (const [md, c] of Object.entries(d.closes)) pairs.push([`${d.year}-${md}`, c]);
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (const [d, c] of pairs) {
      this.dates.push(d);
      this.closes.push(c);
    }
  }

  closeOn(date: ISODate): number | null {
    let lo = 0;
    let hi = this.dates.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid] <= date) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans < 0 ? null : this.closes[ans];
  }

  get latest(): { date: ISODate; close: number } | null {
    const n = this.dates.length;
    return n ? { date: this.dates[n - 1], close: this.closes[n - 1] } : null;
  }
}

/**
 * 需要向資料來源查詢的日期範圍：從 need.from 到 need.to 之間，第一個還沒查過的日子起算，一路查到 need.to。
 * 回傳 null 代表資料已經齊全。
 */
export function missingRange(docs: PriceYearDoc[], need: { from: ISODate; to: ISODate }): { from: ISODate; to: ISODate } | null {
  if (need.from > need.to) return null;
  const byYear = new Map(docs.map((d) => [d.year, d]));
  const y0 = Number(need.from.slice(0, 4));
  const y1 = Number(need.to.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    const from = y === y0 ? need.from : `${y}-01-01`;
    const to = y === y1 ? need.to : `${y}-12-31`;
    const doc = byYear.get(y);
    if (!doc || doc.coveredFrom > from) return { from, to: need.to };
    if (doc.coveredTo < to) return { from: addDays(doc.coveredTo, 1), to: need.to };
  }
  return null;
}

/**
 * 把查到的收盤價合併進各年度文件。
 * coveredTo 只延伸到「實際拿到資料的最後一天」，避免當天收盤價還沒公布就被標記成已查詢。
 */
export function mergeCloses(
  symbol: string,
  existing: PriceYearDoc[],
  range: { from: ISODate; to: ISODate },
  rows: { date: ISODate; close: number }[],
): PriceYearDoc[] {
  const byYear = new Map(existing.map((d) => [d.year, { ...d, closes: { ...d.closes } }]));
  const changed = new Set<number>();
  const touch = (y: number): PriceYearDoc => {
    let d = byYear.get(y);
    if (!d) {
      // 新文件的查詢範圍先設成「空」，下面再延伸
      d = { id: priceDocId(symbol, y), symbol, year: y, closes: {}, coveredFrom: '9999-12-31', coveredTo: '0000-01-01', updatedAt: 0 };
      byYear.set(y, d);
    }
    changed.add(y);
    return d;
  };

  let lastData: ISODate | null = null;
  for (const r of rows) {
    if (!(r.close > 0) || r.date < range.from || r.date > range.to) continue;
    touch(Number(r.date.slice(0, 4))).closes[r.date.slice(5)] = r.close;
    if (lastData === null || r.date > lastData) lastData = r.date;
  }
  if (lastData === null) return [...changed].map((y) => byYear.get(y)!);

  // 已查詢範圍 = [range.from, 拿到資料的最後一天]，依年度切開後併入
  const y0 = Number(range.from.slice(0, 4));
  const y1 = Number(lastData.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    const d = touch(y);
    const from = y === y0 ? range.from : `${y}-01-01`;
    const to = y === y1 ? lastData : `${y}-12-31`;
    if (from < d.coveredFrom) d.coveredFrom = from;
    if (to > d.coveredTo) d.coveredTo = to;
  }
  return [...changed].map((y) => byYear.get(y)!);
}
