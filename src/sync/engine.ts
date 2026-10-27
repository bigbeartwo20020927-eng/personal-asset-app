import { collection, onSnapshot, query, Timestamp, where, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { fs } from '../firebase';
import { COLLECTIONS, type CollectionName, type SyncMeta } from '../types';
import { clearLocal, getMeta, LOCAL_FORMAT, setMeta, table } from './localDb';

/** 每次同步往回多查的重疊區間，避免幾乎同時寫入的資料被漏掉 */
const OVERLAP_MS = 60_000;
/** 超過這麼久沒同步，就清空本機重新下載（確保刪除標記一定會被收到） */
const STALE_MS = 90 * 86_400_000;

export function fromFirestore<T extends SyncMeta>(id: string, data: DocumentData): T {
  const ts = data.updatedAt as Timestamp | null | undefined;
  return { ...data, id, updatedAt: ts ? ts.toMillis() : Date.now() } as T;
}

export interface SyncStatus {
  /** 每個集合都完成第一次與雲端對齊 */
  ready: boolean;
  error: string | null;
}

type Listener = (s: SyncStatus) => void;

/**
 * 增量同步：
 *  - 開啟時只查詢 updatedAt 比上次同步更新的文件
 *  - 開著時持續監聽，其他裝置的修改會即時進來
 *  - 收到刪除標記就把本機那一筆移除
 */
export class SyncEngine {
  private unsubs: Unsubscribe[] = [];
  private pending = new Set<CollectionName>(COLLECTIONS);
  private status: SyncStatus = { ready: false, error: null };
  private listeners = new Set<Listener>();

  constructor(private readonly uid: string) {}

  onStatus(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }

  async start(): Promise<void> {
    // 換了帳號，或本機格式改變 → 清空重來
    const [owner, format] = await Promise.all([getMeta<string>('uid'), getMeta<number>('format')]);
    if (owner !== this.uid || format !== LOCAL_FORMAT) {
      await clearLocal();
      await setMeta('uid', this.uid);
      await setMeta('format', LOCAL_FORMAT);
    }
    try {
      await navigator.storage?.persist?.();
    } catch {
      // 瀏覽器不支援就算了
    }
    for (const col of COLLECTIONS) await this.subscribe(col);
  }

  stop(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  private async subscribe(col: CollectionName): Promise<void> {
    const metaKey = `lastSync:${col}`;
    let lastSync = (await getMeta<number>(metaKey)) ?? 0;
    if (lastSync > 0 && Date.now() - lastSync > STALE_MS) {
      await table(col).clear();
      lastSync = 0;
    }
    const since = Timestamp.fromMillis(Math.max(0, lastSync - OVERLAP_MS));
    const q = query(collection(fs(), 'users', this.uid, col), where('updatedAt', '>', since));

    // includeMetadataChanges：快取先回應、伺服器確認時沒有資料變動，也要收到通知，否則會一直停在「同步中」
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      async (snap) => {
        const t = table(col);
        let maxUpdated = lastSync;
        const puts: SyncMeta[] = [];
        const dels: string[] = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue; // 只會因查詢條件變化發生，不代表被刪除
          const data = ch.doc.data({ serverTimestamps: 'estimate' });
          const item = fromFirestore<SyncMeta>(ch.doc.id, data);
          if (!ch.doc.metadata.hasPendingWrites) maxUpdated = Math.max(maxUpdated, item.updatedAt);
          if (item.deleted) dels.push(item.id);
          else puts.push(item);
        }
        await t.db.transaction('rw', t, async () => {
          if (dels.length) await t.bulkDelete(dels);
          if (puts.length) {
            // 只接受版本不比本機舊的資料（重疊區間可能收到重複的）
            const existing = await t.bulkGet(puts.map((p) => p.id));
            const fresh = puts.filter((p, i) => !existing[i] || (existing[i] as SyncMeta).version <= p.version);
            await t.bulkPut(fresh as never[]);
          }
        });
        if (!snap.metadata.fromCache) {
          if (maxUpdated > lastSync) {
            lastSync = maxUpdated;
            await setMeta(metaKey, lastSync);
          }
          if (this.pending.delete(col) && this.pending.size === 0) this.emit({ ready: true });
        }
      },
      (err) => {
        console.error(`同步 ${col} 失敗`, err);
        this.emit({ error: err.code === 'permission-denied' ? '沒有權限讀取資料' : `同步失敗：${err.message}` });
      },
    );
    this.unsubs.push(unsub);
  }
}
