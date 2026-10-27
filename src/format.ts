export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'TWD', name: '新台幣' },
  { code: 'USD', name: '美元' },
  { code: 'JPY', name: '日圓' },
  { code: 'EUR', name: '歐元' },
  { code: 'CNY', name: '人民幣' },
  { code: 'HKD', name: '港幣' },
  { code: 'GBP', name: '英鎊' },
  { code: 'AUD', name: '澳幣' },
  { code: 'SGD', name: '新加坡幣' },
  { code: 'KRW', name: '韓元' },
];

/** 新台幣、日圓、韓元顯示到整數，其他外幣到小數 2 位 */
export function decimalsOf(currency: string): number {
  return currency === 'TWD' || currency === 'JPY' || currency === 'KRW' ? 0 : 2;
}

export function fmt(n: number, currency = 'TWD'): string {
  const d = decimalsOf(currency);
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtMoney(n: number, currency = 'TWD'): string {
  return currency === 'TWD' ? `$${fmt(n, currency)}` : `${currency} ${fmt(n, currency)}`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

/** 依幣別的小數位數四捨五入 */
export function roundTo(n: number, currency: string): number {
  const f = Math.pow(10, decimalsOf(currency));
  return Math.round(n * f) / f;
}

export const ACCOUNT_TYPE_LABEL = { cash: '現金', bank: '銀行', ewallet: '電子支付／儲值' } as const;

export function weekdayLabel(d: string): string {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(`${d}T00:00:00`).getDay()];
}
