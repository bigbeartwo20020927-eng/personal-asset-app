import { useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { useAction } from '../components/Toast';
import { useCol } from '../hooks';
import { commit, commitInChunks, createOp, deleteOp, updateOp, type WriteOp } from '../sync/write';
import type { Category, CategoryKind } from '../types';
import { canAutoFocus } from '../touchFocus';

type Editing =
  | { mode: 'addParent' }
  | { mode: 'addChild'; parent: Category }
  | { mode: 'edit'; cat: Category }
  | null;

export default function CategoryManager() {
  const categories = useCol('categories');
  const transactions = useCol('transactions');
  const templates = useCol('templates');
  const budgets = useCol('budgets');
  const act = useAction();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [moveTo, setMoveTo] = useState('');

  const groups = useMemo(() => {
    const parents = categories.filter((c) => c.kind === kind && c.parentId === null).sort((a, b) => a.order - b.order);
    return parents.map((p) => ({
      parent: p,
      children: categories.filter((c) => c.parentId === p.id).sort((a, b) => a.order - b.order),
    }));
  }, [categories, kind]);

  const usage = (catId: string) =>
    transactions.filter((t) => t.categoryId === catId).length + templates.filter((t) => t.categoryId === catId).length;

  const open = (e: Editing) => {
    setEditing(e);
    setName(e?.mode === 'edit' ? e.cat.name : '');
    setMoveTo('');
  };
  const close = () => setEditing(null);

  const save = async () => {
    const n = name.trim();
    if (!n || !editing) return;
    let op: WriteOp;
    if (editing.mode === 'addParent') {
      op = createOp('categories', { name: n, kind, parentId: null, order: groups.length });
    } else if (editing.mode === 'addChild') {
      const siblings = categories.filter((c) => c.parentId === editing.parent.id);
      op = createOp('categories', { name: n, kind, parentId: editing.parent.id, order: siblings.length });
    } else {
      op = updateOp('categories', editing.cat, { name: n });
    }
    if (await act(() => commit([op]))) close();
  };

  const remove = async (cat: Category) => {
    if (cat.parentId === null) {
      if (categories.some((c) => c.parentId === cat.id)) {
        alert('請先刪除這個大類底下的所有小類');
        return;
      }
      if (await act(() => commit([deleteOp('categories', cat), ...budgetDeleteOps(cat.id)]), '已刪除')) close();
      return;
    }
    const used = usage(cat.id);
    if (used > 0 && !moveTo) {
      alert('這個小類還有紀錄在使用，請先選擇要轉移到哪個小類');
      return;
    }
    const ops: WriteOp[] = [];
    if (used > 0) {
      for (const t of transactions.filter((t) => t.categoryId === cat.id)) ops.push(updateOp('transactions', t, { categoryId: moveTo }));
      for (const t of templates.filter((t) => t.categoryId === cat.id)) ops.push(updateOp('templates', t, { categoryId: moveTo }));
    }
    // 先轉移紀錄，最後才刪除分類，中途失敗也不會留下沒有分類的紀錄
    const ok = await act(async () => {
      await commitInChunks(ops);
      await commit([deleteOp('categories', cat), ...budgetDeleteOps(cat.id)]);
    }, '已刪除');
    if (ok) close();
  };

  const budgetDeleteOps = (catId: string) => budgets.filter((b) => b.id === catId).map((b) => deleteOp('budgets', b));

  const editingCat = editing?.mode === 'edit' ? editing.cat : null;
  const moveTargets = editingCat
    ? categories.filter((c) => c.kind === editingCat.kind && c.parentId !== null && c.id !== editingCat.id)
    : [];
  const parentName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">分類管理</h2>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 ${kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}
            >
              {k === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {groups.map(({ parent, children }) => (
          <div key={parent.id}>
            <div className="mb-2 flex items-center justify-between">
              <button className="font-medium text-slate-700 hover:text-teal-700" onClick={() => open({ mode: 'edit', cat: parent })}>
                {parent.name}
              </button>
              <button className="text-sm text-teal-700 hover:underline" onClick={() => open({ mode: 'addChild', parent })}>
                ＋小類
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {children.map((c) => (
                <button key={c.id} onClick={() => open({ mode: 'edit', cat: c })} className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200">
                  {c.name}
                </button>
              ))}
              {children.length === 0 && <span className="text-sm text-slate-400">還沒有小類</span>}
            </div>
          </div>
        ))}
      </div>

      <button className="btn mt-4 w-full" onClick={() => open({ mode: 'addParent' })}>
        ＋ 新增大類
      </button>

      <Modal
        open={editing !== null}
        onClose={close}
        title={
          editing?.mode === 'addParent'
            ? '新增大類'
            : editing?.mode === 'addChild'
              ? `新增小類到「${editing.parent.name}」`
              : editingCat?.parentId
                ? `編輯小類（${parentName(editingCat.parentId)}）`
                : '編輯大類'
        }
      >
        <label className="label">名稱</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={canAutoFocus} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn-primary mt-3 w-full" onClick={save}>
          儲存
        </button>

        {editingCat && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            {editingCat.parentId && usage(editingCat.id) > 0 && (
              <>
                <p className="mb-2 text-sm text-slate-600">有 {usage(editingCat.id)} 筆紀錄使用這個小類，刪除前請選擇要轉移到：</p>
                <select className="input mb-3" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">請選擇…</option>
                  {moveTargets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {parentName(c.parentId)} › {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="btn-danger w-full" onClick={() => editingCat && remove(editingCat)}>
              刪除{editingCat.parentId ? '小類' : '大類'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
