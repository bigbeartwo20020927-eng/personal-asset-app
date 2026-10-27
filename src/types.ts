/** 日期一律用 'yyyy-MM-dd' 字串，避免時區問題 */
export type ISODate = string;

/** 每份同步文件都有的欄位 */
export interface SyncMeta {
  id: string;
  version: number;
  /** 伺服器時間（毫秒） */
  updatedAt: number;
  deleted: boolean;
}

export type AccountType = 'cash' | 'bank' | 'ewallet';

export interface Account extends SyncMeta {
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  initialDate: ISODate;
  /** 銀行帳戶可以勾選「同時為券商」 */
  isBroker: boolean;
  /** 手續費折扣，1 = 不打折，0.28 = 2.8 折 */
  feeDiscount: number;
  minFee: number;
  minFeeOddLot: number;
  /** 交割用的子帳戶，null = 未分配 */
  settleSubAccountId: string | null;
  archived: boolean;
  order: number;
}

export interface SubAccount extends SyncMeta {
  accountId: string;
  name: string;
  goalAmount: number | null;
  goalDate: ISODate | null;
  order: number;
}

/** 劃撥：null 代表「未分配」 */
export interface Allocation extends SyncMeta {
  accountId: string;
  fromSubId: string | null;
  toSubId: string | null;
  amount: number;
  date: ISODate;
  note: string;
}

export type CategoryKind = 'income' | 'expense';

export interface Category extends SyncMeta {
  name: string;
  kind: CategoryKind;
  /** null = 大類 */
  parentId: string | null;
  order: number;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'debtPayment';

export interface Transaction extends SyncMeta {
  type: TransactionType;
  accountId: string;
  subAccountId: string | null;
  toAccountId: string | null;
  toSubAccountId: string | null;
  debtId: string | null;
  amount: number;
  /** 跨幣別轉帳時，轉入帳戶收到的金額 */
  toAmount: number | null;
  /** 只能是小類 */
  categoryId: string | null;
  /** 負債還款中的利息部分（負債餘額只扣本金 = amount − interest） */
  interest?: number | null;
  /** 轉帳手續費，由轉出帳戶負擔（轉出帳戶扣 amount + fee，轉入帳戶收到 amount 或 toAmount） */
  fee?: number | null;
  tags: string[];
  date: ISODate;
  note: string;
}

/** id = categoryId */
export interface Budget extends SyncMeta {
  amount: number;
}

export interface Template extends SyncMeta {
  name: string;
  type: TransactionType;
  accountId: string;
  subAccountId: string | null;
  categoryId: string | null;
  amount: number;
  tags: string[];
  note: string;
}

export type TradeKind = 'buy' | 'sell' | 'dayTrade' | 'cashDividend' | 'stockDividend';

export interface Trade extends SyncMeta {
  kind: TradeKind;
  symbol: string;
  shares: number;
  /** 買進價（當沖為買進價） */
  price: number;
  /** 當沖的賣出價 */
  sellPrice: number | null;
  /** 買或賣的手續費（當沖為買進手續費；現金股利為入帳時被扣的手續費／匯費） */
  fee: number;
  /** 當沖的賣出手續費 */
  sellFee: number;
  tax: number;
  tradeDate: ISODate;
  settleDate: ISODate;
  accountId: string;
  /** 交割從哪個子帳戶，null = 未分配；建立時依帳戶設定帶入 */
  subAccountId: string | null;
  /** 現金股利金額 */
  amount: number | null;
  /** 現金股利的除息日（舊紀錄沒有 → 以入帳日代替） */
  exDate?: ISODate | null;
  /** 建立時間（毫秒），同一天多筆時的排序依據 */
  createdAt: number;
  note: string;
}

export interface Debt extends SyncMeta {
  name: string;
  principal: number;
  rate: number;
  monthlyPayment: number;
  initialBalance: number;
  startDate: ISODate;
}

export type CostMethod = 'avg' | 'fifo';

/** id = 'main' */
export interface Settings extends SyncMeta {
  costMethod: CostMethod;
  /** 現金股利扣減成本（含息成本）；舊文件沒有此欄位視為 false */
  dividendReducesCost?: boolean;
  /** 已經自動補過「理財 › 手續費退佣」小類，之後不再自動補 */
  addedRebateCategory?: boolean;
}

export interface CostOptions {
  method: CostMethod;
  dividendReducesCost: boolean;
}

export interface CollectionMap {
  accounts: Account;
  subAccounts: SubAccount;
  allocations: Allocation;
  categories: Category;
  transactions: Transaction;
  budgets: Budget;
  templates: Template;
  trades: Trade;
  debts: Debt;
  settings: Settings;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = [
  'accounts',
  'subAccounts',
  'allocations',
  'categories',
  'transactions',
  'budgets',
  'templates',
  'trades',
  'debts',
  'settings',
];

/** 去掉同步欄位後，使用者實際編輯的內容 */
export type DocData<T extends SyncMeta> = Omit<T, keyof SyncMeta>;
