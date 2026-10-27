import type { CategoryKind } from '../types';
import { createOp, newId, type WriteOp } from '../sync/write';

const EXPENSE: [string, string[]][] = [
  ['餐飲', ['早餐', '午餐', '晚餐', '飲料', '點心', '聚餐']],
  ['交通', ['大眾運輸', '計程車', '油費', '停車', '保養']],
  ['居住', ['房租', '水電瓦斯', '網路電信', '管理費', '家具用品']],
  ['購物', ['服飾', '日用品', '電子產品', '美妝保養']],
  ['娛樂', ['電影展覽', '遊戲', '旅遊', '訂閱服務']],
  ['醫療', ['看診', '藥品', '保健']],
  ['學習', ['書籍', '課程']],
  ['人際', ['禮物', '紅白包', '孝親']],
  ['保險', ['壽險', '醫療險', '產險']],
  ['稅費', ['所得稅', '牌照稅', '戶政規費']],
  ['其他', ['手續費', '雜項']],
];

const INCOME: [string, string[]][] = [
  ['薪資', ['本薪', '加班費']],
  ['獎金', ['年終', '績效', '三節獎金']],
  ['副業', ['接案', '兼職']],
  ['理財', ['利息', '手續費退佣']],
  ['其他', ['紅包', '中獎', '退款', '雜項']],
];

export function defaultCategoryOps(): WriteOp[] {
  const ops: WriteOp[] = [];
  const add = (kind: CategoryKind, groups: [string, string[]][]) => {
    groups.forEach(([parent, children], i) => {
      const pid = newId();
      ops.push(createOp('categories', { name: parent, kind, parentId: null, order: i }, pid));
      children.forEach((name, j) => ops.push(createOp('categories', { name, kind, parentId: pid, order: j })));
    });
  };
  add('expense', EXPENSE);
  add('income', INCOME);
  return ops;
}
