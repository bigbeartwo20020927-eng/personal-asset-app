import { useMemo } from 'react';
import type { Category, CategoryKind } from '../types';

/** 以大類分區列出小類，整個區塊可以滑動；只有小類可以點選 */
export default function CategoryPicker({
  categories,
  kind,
  value,
  onChange,
}: {
  categories: Category[];
  kind: CategoryKind;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const parents = categories.filter((c) => c.kind === kind && c.parentId === null).sort((a, b) => a.order - b.order);
    return parents
      .map((p) => ({ parent: p, children: categories.filter((c) => c.parentId === p.id).sort((a, b) => a.order - b.order) }))
      .filter((g) => g.children.length > 0);
  }, [categories, kind]);

  if (groups.length === 0) return <p className="text-sm text-slate-500">還沒有分類，請先到「設定 → 分類管理」新增。</p>;

  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-2">
      {groups.map(({ parent, children }) => (
        <div key={parent.id} className="mb-2 last:mb-0">
          <div className="sticky top-0 bg-white px-1 py-1 text-xs font-medium text-slate-400">{parent.name}</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.id)}
                className={`truncate rounded-lg px-2 py-2 text-sm ${
                  value === c.id ? 'bg-teal-700 font-medium text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
