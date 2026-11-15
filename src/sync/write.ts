import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { fs } from '../firebase';
import type { CollectionMap, CollectionName, DocData, SyncMeta } from '../types';
import { fromFirestore } from './engine';
import { table } from './localDb';

export class OfflineError extends Error {
  constructor() {
    super('目前沒有網路，無法修改資料');
  }
}

export class ConflictError extends Error {
  constructor(public readonly items: { col: CollectionName; id: string; deleted: boolean }[]) {
    const deleted = items.some((i) => i.deleted);
    super(deleted ? '這筆資料已在其他裝置刪除' : '這筆資料已在其他裝置修改，已為你更新成最新版本');
  }
}

export type WriteOp = {
  [K in CollectionName]: {
    col: K;
    id: string;
    /** null = 刪除（寫入刪除標記） */
    data: DocData<CollectionMap[K]> | null;
    /** 本機目前的版本號；新建立的文件為 0 */
    expectedVersion: number;
  };
}[CollectionName];

/** Firestore 一次交易最多 500 筆，保留一點餘裕 */
export const MAX_OPS = 450;

let currentUid: string | null = null;
export function setWriteUser(uid: string | null) {
  currentUid = uid;
}

function uid(): string {
  if (!currentUid) throw new Error('尚未登入');
  return currentUid;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

/**
 * 樂觀鎖寫入：在同一個交易裡確認每份文件的雲端版本和本機一致，才一起寫入（版本 +1）。
 * 任何一份不一致 → 全部不寫，從雲端抓最新版本更新本機，並丟出 ConflictError。
 */
export async function commit(ops: WriteOp[]): Promise<void> {
  if (ops.length === 0) return;
  if (ops.length > MAX_OPS) throw new Error(`一次最多修改 ${MAX_OPS} 筆資料`);
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new OfflineError();
  const u = uid();
  const refs = ops.map((op) => doc(fs(), 'users', u, op.col, op.id));

  // 每份文件實際寫入的版本號（交易可能重試，所以每次重算）
  let versions: number[] = [];
  try {
    await runTransaction(fs(), async (tx) => {
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const conflicts: { col: CollectionName; id: string; deleted: boolean }[] = [];
      versions = snaps.map((s, i) => {
        const op = ops[i];
        const cloud = s.exists() ? (s.data().version as number) : 0;
        const tombstone = s.exists() && s.data().deleted === true;
        // 用固定 id 的文件（例如預算的 id 就是分類 id）刪除後，雲端還留著刪除標記。
        // 重新建立時本機已經沒有這份文件（預期版本 0），要接在刪除標記的版本後面，不算衝突。
        if (op.expectedVersion === 0 && op.data !== null && tombstone) return cloud + 1;
        if (cloud !== op.expectedVersion) conflicts.push({ col: op.col, id: op.id, deleted: tombstone });
        return op.expectedVersion + 1;
      });
      if (conflicts.length) throw new ConflictError(conflicts);
      ops.forEach((op, i) => {
        const body = op.data === null ? { deleted: true } : { ...op.data, deleted: false };
        tx.set(refs[i], { ...body, version: versions[i], updatedAt: serverTimestamp() });
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) await refreshFromCloud(e.items);
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'unavailable') throw new OfflineError();
    throw e;
  }

  // 寫入成功 → 先更新本機，稍後即時監聽收到的雲端版本會再覆蓋一次
  for (const [i, op] of ops.entries()) {
    const t = table(op.col);
    if (op.data === null) await t.delete(op.id);
    else await t.put({ ...op.data, id: op.id, version: versions[i], updatedAt: Date.now(), deleted: false } as never);
  }
}

/** 超過一次交易上限的大量修改（例如分類轉移），分批寫入；每一批各自是原子的 */
export async function commitInChunks(ops: WriteOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_OPS) await commit(ops.slice(i, i + MAX_OPS));
}

async function refreshFromCloud(items: { col: CollectionName; id: string }[]) {
  const u = uid();
  for (const { col, id } of items) {
    const s = await getDoc(doc(fs(), 'users', u, col, id));
    const t = table(col);
    if (!s.exists() || s.data().deleted) await t.delete(id);
    else await t.put(fromFirestore<SyncMeta>(id, s.data()) as never);
  }
}

/** 方便的包裝：新增 */
export function createOp<K extends CollectionName>(col: K, data: DocData<CollectionMap[K]>, id = newId()): WriteOp {
  return { col, id, data, expectedVersion: 0 } as WriteOp;
}

/** 方便的包裝：修改（以本機文件的版本號作為預期版本） */
export function updateOp<K extends CollectionName>(col: K, current: CollectionMap[K], patch: Partial<DocData<CollectionMap[K]>>): WriteOp {
  const { id, version, updatedAt: _u, deleted: _d, ...rest } = current as CollectionMap[K] & SyncMeta;
  return { col, id, data: { ...rest, ...patch }, expectedVersion: version } as unknown as WriteOp;
}

/** 方便的包裝：刪除 */
export function deleteOp<K extends CollectionName>(col: K, current: CollectionMap[K]): WriteOp {
  return { col, id: current.id, data: null, expectedVersion: current.version } as WriteOp;
}
