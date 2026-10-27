import { useAccountsData } from '../data/useData';
import { tradeTitle } from '../data/useInvestments';
import { today } from '../domain/dates';
import { useSymbols } from '../market/useMarket';
import { table } from '../sync/localDb';
import { COLLECTIONS, type SyncMeta } from '../types';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV 欄位跳脫；開頭加 BOM，Excel 開啟中文才不會亂碼 */
function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

const TYPE_LABEL = { income: '收入', expense: '支出', transfer: '轉帳', debtPayment: '負債還款' } as const;

export default function ExportCard() {
  const data = useAccountsData();
  const symbols = useSymbols();
  const stamp = today();

  const exportJson = async () => {
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), format: 'personal-asset-app/1' };
    for (const col of COLLECTIONS) {
      // 只匯出資料本身，去掉同步用的欄位
      out[col] = (await table(col).toArray()).map((d) => {
        const { version: _v, updatedAt: _u, deleted: _d, ...rest } = d as SyncMeta;
        return rest;
      });
    }
    download(`個人資產備份-${stamp}.json`, JSON.stringify(out, null, 2), 'application/json');
  };

  const acc = (id: string | null) => (id ? (data.accountById.get(id)?.name ?? '') : '');
  const sub = (id: string | null) => (id ? (data.subById.get(id)?.name ?? '') : '');
  const cat = (id: string | null) => (id ? data.catById.get(id) : undefined);

  const exportTransactions = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['日期', '類型', '帳戶', '子帳戶', '轉入帳戶', '轉入子帳戶', '大類', '小類', '金額', '轉入金額', '轉帳手續費', '利息', '負債', '標籤', '備註'],
    ];
    for (const t of [...data.transactions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const c = cat(t.categoryId);
      rows.push([
        t.date,
        TYPE_LABEL[t.type],
        acc(t.accountId),
        sub(t.subAccountId),
        acc(t.toAccountId),
        sub(t.toSubAccountId),
        c?.parentId ? cat(c.parentId)?.name : '',
        c?.name ?? '',
        t.amount,
        t.toAmount,
        t.fee,
        t.interest,
        t.debtId ? data.debtById.get(t.debtId)?.name : '',
        t.tags.join(' '),
        t.note,
      ]);
    }
    download(`收支紀錄-${stamp}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  const exportTrades = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['成交日', '交割日', '除息日', '類別', '代號', '名稱', '股數', '價格', '賣出價', '手續費', '賣出手續費', '證交稅', '股利金額', '券商帳戶', '備註'],
    ];
    for (const t of [...data.trades].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : 1))) {
      rows.push([t.tradeDate, t.settleDate, t.exDate ?? '', tradeTitle(t), t.symbol, symbols.get(t.symbol)?.name, t.shares, t.price, t.sellPrice, t.fee, t.sellFee, t.tax, t.amount, acc(t.accountId), t.note]);
    }
    download(`股票交易-${stamp}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold">匯出資料</h2>
      <p className="mb-3 text-sm text-slate-500">JSON 是完整備份；CSV 可以用 Excel 開啟。</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <button className="btn" onClick={exportJson}>
          完整備份（JSON）
        </button>
        <button className="btn" onClick={exportTransactions}>
          收支紀錄（CSV）
        </button>
        <button className="btn" onClick={exportTrades}>
          股票交易（CSV）
        </button>
      </div>
    </div>
  );
}
