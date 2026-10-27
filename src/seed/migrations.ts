import { table } from '../sync/localDb';
import { commit, createOp, updateOp, type WriteOp } from '../sync/write';

const REBATE = '手續費退佣';

/**
 * 既有使用者補上「理財 › 手續費退佣」小類（只補一次）。
 * 用 settings.addedRebateCategory 記錄已經補過，之後使用者刪掉也不會再自動加回來。
 * 兩台裝置同時執行時，版本檢查會讓其中一台失敗，不會重複新增。
 */
export async function ensureRebateCategory(): Promise<void> {
  const settings = await table('settings').get('main');
  if (!settings || settings.addedRebateCategory) return;
  const cats = await table('categories').toArray();
  const parent = cats.find((c) => c.kind === 'income' && c.parentId === null && c.name === '理財');
  const ops: WriteOp[] = [updateOp('settings', settings, { addedRebateCategory: true })];
  if (parent && !cats.some((c) => c.parentId === parent.id && c.name === REBATE)) {
    const order = cats.filter((c) => c.parentId === parent.id).length;
    ops.push(createOp('categories', { name: REBATE, kind: 'income', parentId: parent.id, order }));
  }
  await commit(ops);
}
