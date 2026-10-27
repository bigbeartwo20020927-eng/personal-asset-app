import type { ISODate } from '../types';
import { toUtc } from './dates';

export interface CashFlow {
  date: ISODate;
  /** 投入為負、取回為正 */
  amount: number;
}

/** 年化報酬率（XIRR）。資料不足或無解時回傳 null */
export function xirr(flows: CashFlow[]): number | null {
  const cf = flows.filter((f) => f.amount !== 0);
  if (cf.length < 2 || !cf.some((f) => f.amount > 0) || !cf.some((f) => f.amount < 0)) return null;
  const t0 = Math.min(...cf.map((f) => toUtc(f.date)));
  const years = cf.map((f) => (toUtc(f.date) - t0) / (365 * 86_400_000));
  const npv = (r: number) => cf.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);

  // 先用二分法找到符號變化的區間，再收斂；比牛頓法穩定
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-10) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
