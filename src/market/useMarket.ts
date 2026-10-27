import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { looksLikeETF } from '../domain/fees';
import { PriceSeries, type PriceYearDoc } from '../domain/prices';
import { useCol } from '../hooks';
import { db } from '../sync/localDb';
import type { ISODate, Trade } from '../types';
import { ensurePrices, onFillStatus, type FillStatus } from './priceStore';
import { fetchSymbols, type SymbolInfo } from './sources';

const SYMBOLS_KEY = 'symbols:v1';
const SYMBOLS_TTL = 7 * 86_400_000;

let symbolsCache: Map<string, SymbolInfo> | null = null;
let symbolsLoading: Promise<Map<string, SymbolInfo>> | null = null;

function readCachedSymbols(): { at: number; list: SymbolInfo[] } | null {
  try {
    const raw = localStorage.getItem(SYMBOLS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 股票清單：本機快取 7 天，過期才重新下載 */
function loadSymbols(): Promise<Map<string, SymbolInfo>> {
  if (symbolsCache) return Promise.resolve(symbolsCache);
  if (symbolsLoading) return symbolsLoading;
  const cached = readCachedSymbols();
  if (cached && Date.now() - cached.at < SYMBOLS_TTL) {
    symbolsCache = new Map(cached.list.map((s) => [s.code, s]));
    return Promise.resolve(symbolsCache);
  }
  symbolsLoading = fetchSymbols()
    .then((list) => {
      try {
        localStorage.setItem(SYMBOLS_KEY, JSON.stringify({ at: Date.now(), list }));
      } catch {
        // 存不了就算了
      }
      symbolsCache = new Map(list.map((s) => [s.code, s]));
      return symbolsCache;
    })
    .catch(() => {
      // 下載失敗時先用過期的快取
      symbolsCache = new Map((cached?.list ?? []).map((s) => [s.code, s]));
      return symbolsCache;
    })
    .finally(() => {
      symbolsLoading = null;
    });
  return symbolsLoading;
}

export function useSymbols(): Map<string, SymbolInfo> {
  const [map, setMap] = useState<Map<string, SymbolInfo>>(symbolsCache ?? new Map());
  useEffect(() => {
    let alive = true;
    loadSymbols().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

export function isETFOf(symbols: Map<string, SymbolInfo>, code: string): boolean {
  return symbols.get(code)?.isETF ?? looksLikeETF(code);
}

/** 每支股票第一筆紀錄的日期（從這天開始需要股價） */
export function priceNeeds(trades: Trade[]): Map<string, ISODate> {
  const m = new Map<string, ISODate>();
  for (const t of trades) {
    const cur = m.get(t.symbol);
    if (!cur || t.tradeDate < cur) m.set(t.symbol, t.tradeDate);
  }
  return m;
}

/** 本機快取的股價，資料變動時自動更新 */
export function usePrices(): Map<string, PriceSeries> {
  const docs = useLiveQuery(() => db.prices.toArray(), [], [] as PriceYearDoc[]);
  return useMemo(() => {
    const bySymbol = new Map<string, PriceYearDoc[]>();
    for (const d of docs) {
      const list = bySymbol.get(d.symbol) ?? [];
      list.push(d);
      bySymbol.set(d.symbol, list);
    }
    return new Map([...bySymbol.entries()].map(([s, list]) => [s, new PriceSeries(list)]));
  }, [docs]);
}

export function useFillStatus(): FillStatus {
  const [s, setS] = useState<FillStatus>({ running: false, done: 0, total: 0, error: null, failed: [] });
  useEffect(() => onFillStatus(setS), []);
  return s;
}

/** 放在 APP 最外層：開啟時、以及買賣紀錄變動時，在背景自動補齊股價 */
export function useAutoFillPrices(): void {
  const trades = useCol('trades');
  const symbols = useSymbols();
  // 只有「股票清單」或「每支股票的起始日」改變時才需要重新檢查
  const key = useMemo(() => [...priceNeeds(trades).entries()].sort().map((e) => e.join(':')).join('|'), [trades]);
  useEffect(() => {
    if (!key) return;
    const needs = new Map(key.split('|').map((s) => s.split(':') as [string, string]));
    const timer = setTimeout(() => {
      ensurePrices(needs, (code) => (symbols.get(code)?.market ?? 'TWSE') === 'TWSE');
    }, 800);
    return () => clearTimeout(timer);
  }, [key, symbols]);
}

/** 刷新按鈕 */
export function refreshPrices(trades: Trade[], symbols: Map<string, SymbolInfo>): Promise<void> {
  return ensurePrices(priceNeeds(trades), (code) => (symbols.get(code)?.market ?? 'TWSE') === 'TWSE', true);
}
