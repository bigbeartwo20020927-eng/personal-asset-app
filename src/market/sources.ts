import type { ISODate } from '../types';

/**
 * 股價資料來源（都能從瀏覽器直接讀取，不需要中轉站）：
 *  - FinMind：上市、上櫃、ETF 都有，一次請求可以拿到很長一段期間
 *  - 證交所官網月報：只有上市，作為 FinMind 失敗時的備援
 */

export interface CloseRow {
  date: ISODate;
  close: number;
}

export interface SymbolInfo {
  code: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  isETF: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 檢查格式與合理範圍，丟掉怪怪的資料 */
function sane(rows: CloseRow[]): CloseRow[] {
  return rows.filter((r) => DATE_RE.test(r.date) && Number.isFinite(r.close) && r.close > 0 && r.close < 1e6);
}

export async function fetchFinMind(symbol: string, from: ISODate, to: ISODate): Promise<CloseRow[]> {
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(symbol)}&start_date=${from}&end_date=${to}`;
  const j = (await getJson(url, 20_000)) as { status?: number; msg?: string; data?: { date: string; close: number }[] };
  if (j.status !== 200 || !Array.isArray(j.data)) throw new Error(`FinMind：${j.msg ?? '回應格式不正確'}`);
  return sane(j.data.map((d) => ({ date: d.date, close: Number(d.close) })));
}

/** 民國日期 '115/09/01' → '2026-09-01' */
function rocToIso(s: string): ISODate {
  const [y, m, d] = s.trim().split('/');
  return `${Number(y) + 1911}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** 證交所個股月報（只有上市） */
export async function fetchTwseMonth(symbol: string, year: number, month: number): Promise<CloseRow[]> {
  const date = `${year}${String(month).padStart(2, '0')}01`;
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${date}&stockNo=${encodeURIComponent(symbol)}&response=json`;
  const j = (await getJson(url, 15_000)) as { stat?: string; fields?: string[]; data?: string[][] };
  if (j.stat !== 'OK' || !Array.isArray(j.data)) return [];
  const idx = j.fields?.indexOf('收盤價') ?? 6;
  return sane(j.data.map((row) => ({ date: rocToIso(row[0]), close: Number(String(row[idx]).replace(/,/g, '')) })));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 用證交所月報補一段期間；放慢速度避免被擋，最多補 24 個月 */
export async function fetchTwseRange(symbol: string, from: ISODate, to: ISODate): Promise<CloseRow[]> {
  const out: CloseRow[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const yEnd = Number(to.slice(0, 4));
  const mEnd = Number(to.slice(5, 7));
  let count = 0;
  while ((y < yEnd || (y === yEnd && m <= mEnd)) && count < 24) {
    if (count > 0) await sleep(1200);
    out.push(...(await fetchTwseMonth(symbol, y, m)));
    count++;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.filter((r) => r.date >= from && r.date <= to);
}

export interface DividendInfo {
  exDate: ISODate;
  /** 每股現金股利 */
  perShare: number;
  payDate: ISODate | null;
}

/** 某支股票的現金股利除息紀錄（新到舊） */
export async function fetchDividends(symbol: string): Promise<DividendInfo[]> {
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${encodeURIComponent(symbol)}&start_date=2000-01-01`;
  const j = (await getJson(url, 20_000)) as {
    status?: number;
    data?: { CashExDividendTradingDate?: string; CashEarningsDistribution?: number; CashStatutorySurplus?: number; CashDividendPaymentDate?: string }[];
  };
  if (j.status !== 200 || !Array.isArray(j.data)) throw new Error('無法取得除息資料');
  return j.data
    .map((d) => ({
      exDate: d.CashExDividendTradingDate ?? '',
      perShare: Math.round(((Number(d.CashEarningsDistribution) || 0) + (Number(d.CashStatutorySurplus) || 0)) * 1e6) / 1e6,
      payDate: d.CashDividendPaymentDate && DATE_RE.test(d.CashDividendPaymentDate) ? d.CashDividendPaymentDate : null,
    }))
    .filter((d) => DATE_RE.test(d.exDate) && d.perShare > 0)
    .sort((a, b) => (a.exDate < b.exDate ? 1 : -1));
}

/** 上市、上櫃的股票與 ETF 清單 */
export async function fetchSymbols(): Promise<SymbolInfo[]> {
  const j = (await getJson('https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo', 30_000)) as {
    status?: number;
    data?: { stock_id: string; stock_name: string; type: string; industry_category: string }[];
  };
  if (j.status !== 200 || !Array.isArray(j.data)) throw new Error('無法取得股票清單');
  const map = new Map<string, SymbolInfo>();
  for (const d of j.data) {
    if (d.type !== 'twse' && d.type !== 'tpex') continue;
    const prev = map.get(d.stock_id);
    const isETF = d.stock_id.startsWith('00') || d.industry_category.includes('ETF') || (prev?.isETF ?? false);
    map.set(d.stock_id, { code: d.stock_id, name: d.stock_name, market: d.type === 'twse' ? 'TWSE' : 'TPEx', isETF });
  }
  return [...map.values()];
}
