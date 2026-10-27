import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { fs } from '../firebase';
import { today as todayFn } from '../domain/dates';
import { mergeCloses, missingRange, priceDocId, type PriceYearDoc } from '../domain/prices';
import { db } from '../sync/localDb';
import type { ISODate } from '../types';
import { fetchFinMind, fetchTwseRange, type CloseRow } from './sources';

export interface FillStatus {
  running: boolean;
  done: number;
  total: number;
  /** 最近一次失敗的原因 */
  error: string | null;
  /** 抓不到的股票 */
  failed: string[];
}

type Listener = (s: FillStatus) => void;
let status: FillStatus = { running: false, done: 0, total: 0, error: null, failed: [] };
const listeners = new Set<Listener>();
function emit(patch: Partial<FillStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}
export function onFillStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

/** 同一支股票一小時內最多自動查一次（按刷新按鈕不受限制） */
const THROTTLE_MS = 60 * 60 * 1000;
const lastAttempt = new Map<string, number>();
let running: Promise<void> | null = null;

function fromCloud(id: string, data: Record<string, unknown>): PriceYearDoc {
  const ts = data.updatedAt as Timestamp | undefined;
  return {
    id,
    symbol: String(data.symbol),
    year: Number(data.year),
    closes: (data.closes as Record<string, number>) ?? {},
    coveredFrom: String(data.coveredFrom ?? '9999-12-31'),
    coveredTo: String(data.coveredTo ?? '0000-01-01'),
    updatedAt: ts ? ts.toMillis() : Date.now(),
  };
}

/** 先看本機；本機沒有的年度、以及今年的文件，向雲端讀取（其他使用者可能已經抓好了） */
async function loadDocs(symbol: string, from: ISODate, to: ISODate): Promise<PriceYearDoc[]> {
  const y0 = Number(from.slice(0, 4));
  const y1 = Number(to.slice(0, 4));
  const out: PriceYearDoc[] = [];
  for (let y = y0; y <= y1; y++) {
    const id = priceDocId(symbol, y);
    const local = await db.prices.get(id);
    const needCloud = !local || y === y1 || missingRange([local], { from: y === y0 ? from : `${y}-01-01`, to: y === y1 ? to : `${y}-12-31` }) !== null;
    if (!needCloud) {
      out.push(local);
      continue;
    }
    try {
      const snap = await getDoc(doc(fs(), 'prices', id));
      if (snap.exists()) {
        const cloud = fromCloud(id, snap.data());
        await db.prices.put(cloud);
        out.push(cloud);
      } else if (local) out.push(local);
    } catch {
      if (local) out.push(local);
    }
  }
  return out;
}

async function fetchRange(symbol: string, from: ISODate, to: ISODate, listed: boolean): Promise<CloseRow[]> {
  try {
    return await fetchFinMind(symbol, from, to);
  } catch (e) {
    if (!listed) throw e;
    // FinMind 失敗時，上市股票改用證交所官網
    return await fetchTwseRange(symbol, from, to);
  }
}

async function fillOne(symbol: string, from: ISODate, to: ISODate, listed: boolean, force: boolean): Promise<void> {
  const docs = await loadDocs(symbol, from, to);
  const gap = missingRange(docs, { from, to });
  if (!gap) return;
  const last = lastAttempt.get(symbol) ?? 0;
  if (!force && Date.now() - last < THROTTLE_MS) return;
  lastAttempt.set(symbol, Date.now());

  const rows = await fetchRange(symbol, gap.from, gap.to, listed);
  const changed = mergeCloses(symbol, docs, gap, rows);
  for (const d of changed) {
    // 寫回雲端共用；closes 用 merge 合併，不會蓋掉別人已經寫入的日期
    await setDoc(
      doc(fs(), 'prices', d.id),
      { symbol, year: d.year, closes: d.closes, coveredFrom: d.coveredFrom, coveredTo: d.coveredTo, updatedAt: serverTimestamp() },
      { merge: true },
    );
    await db.prices.put({ ...d, updatedAt: Date.now() });
  }
}

/**
 * 確保每支股票從「需要的第一天」到今天的收盤價都已經抓好。
 * needs：股票代號 → 第一筆紀錄的日期；listed：是否為上市股票（決定能否用證交所備援）
 */
export function ensurePrices(needs: Map<string, ISODate>, listed: (symbol: string) => boolean, force = false): Promise<void> {
  if (running) return running;
  const to = todayFn();
  const list = [...needs.entries()];
  if (list.length === 0) return Promise.resolve();
  running = (async () => {
    emit({ running: true, done: 0, total: list.length, error: null, failed: [] });
    const failed: string[] = [];
    let error: string | null = null;
    for (let i = 0; i < list.length; i++) {
      const [symbol, from] = list[i];
      try {
        await fillOne(symbol, from, to, listed(symbol), force);
      } catch (e) {
        failed.push(symbol);
        error = e instanceof Error ? e.message : String(e);
      }
      emit({ done: i + 1 });
    }
    emit({ running: false, failed, error });
  })().finally(() => {
    running = null;
  });
  return running;
}

/** 手動輸入某天的收盤價（所有資料來源都失敗時的保底） */
export async function setManualClose(symbol: string, date: ISODate, close: number): Promise<void> {
  const y = Number(date.slice(0, 4));
  const id = priceDocId(symbol, y);
  const local = (await db.prices.get(id)) ?? { id, symbol, year: y, closes: {}, coveredFrom: '9999-12-31', coveredTo: '0000-01-01', updatedAt: 0 };
  const next: PriceYearDoc = { ...local, closes: { ...local.closes, [date.slice(5)]: close }, updatedAt: Date.now() };
  await setDoc(doc(fs(), 'prices', id), { symbol, year: y, closes: { [date.slice(5)]: close }, coveredFrom: local.coveredFrom, coveredTo: local.coveredTo, updatedAt: serverTimestamp() }, { merge: true });
  await db.prices.put(next);
}
