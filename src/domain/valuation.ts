import { brokerFee, tradeValue, transactionTax, type BrokerFee } from './fees';
import { looseDividends, type Lot, type PositionState } from './holdings';

export interface Valuation {
  marketValue: number;
  /** 如果現在全部賣出，預估要付的手續費 */
  estSellFee: number;
  estTax: number;
  /** 淨未實現損益 = 市值 − 預估賣出手續費 − 預估證交稅 − 投入成本 */
  netUnrealized: number;
  /** 當下報酬率（淨） */
  returnPct: number;
  /** 含息報酬率 = (淨未實現 + 已實現 + 未扣進成本的股利) / 歷來買進總成本 */
  totalReturnPct: number;
  avgPrice: number;
}

/** 一批持股的現值（扣掉預估賣出手續費與證交稅）與損益，比照券商的逐筆明細 */
export interface LotValuation {
  lot: Lot;
  /** 成本單價 */
  unitCost: number;
  netValue: number;
  pnl: number;
}

function sellCosts(value: number, shares: number, broker: BrokerFee, isETF: boolean, symbol: string, date: string) {
  return { fee: brokerFee(value, shares, broker), tax: transactionTax(value, isETF, false, symbol, date) };
}

export function valueLot(lot: Lot, close: number, broker: BrokerFee, isETF: boolean, symbol: string, date: string): LotValuation {
  const value = tradeValue(lot.shares, close);
  const c = sellCosts(value, lot.shares, broker, isETF, symbol, date);
  const netValue = value - c.fee - c.tax;
  return { lot, unitCost: lot.shares > 0 ? lot.cost / lot.shares : 0, netValue, pnl: netValue - lot.cost };
}

/**
 * perLot = true（先進先出）：每一批各自估算賣出手續費與證交稅再加總（各自捨去、零股最低手續費逐批套用），和券商逐筆顯示一致；
 * perLot = false（平均成本法）：整體一次估算。
 */
export function valuePosition(p: PositionState, close: number | null, broker: BrokerFee, isETF: boolean, date = '', perLot = false): Valuation {
  let marketValue = close == null ? 0 : tradeValue(p.shares, close);
  let estSellFee = 0;
  let estTax = 0;
  if (p.shares > 0 && close != null) {
    if (perLot && p.lots.length > 0) {
      // 逐筆：每一批的價金各自捨去，市值也用各批加總，和券商逐筆明細一致
      marketValue = 0;
      for (const lot of p.lots) {
        const value = tradeValue(lot.shares, close);
        const c = sellCosts(value, lot.shares, broker, isETF, p.symbol, date);
        marketValue += value;
        estSellFee += c.fee;
        estTax += c.tax;
      }
    } else {
      const c = sellCosts(marketValue, p.shares, broker, isETF, p.symbol, date);
      estSellFee = c.fee;
      estTax = c.tax;
    }
  }
  const netUnrealized = p.shares > 0 && close != null ? marketValue - estSellFee - estTax - p.cost : 0;
  const returnPct = p.cost > 0 ? netUnrealized / p.cost : 0;
  const totalReturnPct = p.totalBought > 0 ? (netUnrealized + p.realized + looseDividends(p)) / p.totalBought : 0;
  const avgPrice = p.shares > 0 ? p.cost / p.shares : 0;
  return { marketValue, estSellFee, estTax, netUnrealized, returnPct, totalReturnPct, avgPrice };
}
