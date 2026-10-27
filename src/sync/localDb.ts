import Dexie, { type Table } from 'dexie';
import type { PriceYearDoc } from '../domain/prices';
import type { CollectionMap, CollectionName } from '../types';

/** 本機資料格式版本；格式改變時調高，裝置會自動清空並從雲端重新下載 */
export const LOCAL_FORMAT = 1;

interface MetaRow {
  key: string;
  value: unknown;
}

type Tables = { [K in CollectionName]: Table<CollectionMap[K], string> };

class LocalDb extends Dexie {
  meta!: Table<MetaRow, string>;
  /** 共用股價的本機快取（不屬於個人同步資料） */
  prices!: Table<PriceYearDoc, string>;
  constructor() {
    super('personal-asset-app');
    this.version(1).stores({
      meta: 'key',
      accounts: 'id',
      subAccounts: 'id, accountId',
      allocations: 'id, accountId',
      categories: 'id',
      transactions: 'id, date, accountId',
      budgets: 'id',
      templates: 'id',
      trades: 'id, symbol',
      debts: 'id',
      settings: 'id',
    });
    this.version(2).stores({ prices: 'id, symbol' });
  }
}

export const db = new LocalDb() as LocalDb & Tables;

export function table<K extends CollectionName>(col: K): Table<CollectionMap[K], string> {
  return db.table(col);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** 清空本機所有資料（登出、換帳號、格式改變時） */
export async function clearLocal(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
