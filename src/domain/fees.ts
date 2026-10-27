export const FEE_RATE = 0.001425;
export const TAX_STOCK = 0.003;
export const TAX_ETF = 0.001;
export const TAX_DAY_TRADE = 0.0015;

export interface BrokerFee {
  feeDiscount: number;
  minFee: number;
  minFeeOddLot: number;
}

/** 成交價金：股數 × 價格，算到元為止，元以下無條件捨去（零股可能出現 0.5 元，例如 5 股 × 174.5） */
export function tradeValue(shares: number, price: number): number {
  return Math.floor(shares * price + 1e-9);
}

export function isOddLot(shares: number): boolean {
  return shares % 1000 !== 0;
}

/** 手續費 = 成交金額 × 0.1425% × 折扣，無條件捨去到整數，再套用最低手續費 */
export function brokerFee(tradeValue: number, shares: number, broker: BrokerFee): number {
  if (tradeValue <= 0) return 0;
  const raw = Math.floor(tradeValue * FEE_RATE * broker.feeDiscount);
  const min = isOddLot(shares) ? broker.minFeeOddLot : broker.minFee;
  return Math.max(raw, min);
}

/** 債券 ETF 證交稅停徵期限 */
export const BOND_ETF_TAX_FREE_UNTIL = '2026-12-31';

/** 證交稅（賣出時課徵），無條件捨去到整數；ETF 一律 0.1%，股票當沖減半為 0.15%；債券 ETF 停徵期間為 0 */
export function transactionTax(sellValue: number, isETF: boolean, dayTrade = false, symbol = '', date = ''): number {
  if (sellValue <= 0) return 0;
  if (isBondETF(symbol) && date && date <= BOND_ETF_TAX_FREE_UNTIL) return 0;
  const rate = isETF ? TAX_ETF : dayTrade ? TAX_DAY_TRADE : TAX_STOCK;
  return Math.floor(sellValue * rate);
}

/** 台灣 ETF 代號以 00 開頭 */
export function looksLikeETF(symbol: string): boolean {
  return symbol.startsWith('00');
}

/** 債券 ETF：00 開頭、B 結尾，例如 00679B */
export function isBondETF(symbol: string): boolean {
  return /^00\d+B$/.test(symbol);
}
