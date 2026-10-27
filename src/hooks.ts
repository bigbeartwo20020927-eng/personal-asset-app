import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { table } from './sync/localDb';
import type { CollectionMap, CollectionName } from './types';

/** 讀取本機某個集合的全部資料，資料變動時自動更新畫面 */
export function useCol<K extends CollectionName>(col: K): CollectionMap[K][] {
  return useLiveQuery(() => table(col).toArray(), [col], []) as CollectionMap[K][];
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
